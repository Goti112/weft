import { idKey, type Id, type Op } from '@weft/crdt';
import { parseServerMsg, type ClientMsg, type ServerMsg, type SequencedOp } from './protocol';

export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: ((event: Event) => unknown) | null;
  onmessage: ((event: MessageEvent<string>) => unknown) | null;
  onclose: ((event: CloseEvent) => unknown) | null;
}
export type SocketFactory = (url: string) => SocketLike;
export type SyncStatus = 'connected' | 'offline' | 'syncing';
export type SyncOptions = {
  url: string; doc: string; replica: string; socketFactory: SocketFactory;
  lastSeq: number; pending: Op[];
  onRemote: (ops: SequencedOp[]) => void; onAck: (ids: Id[]) => void;
  onStatus: (s: SyncStatus) => void;
  onMessage?: (dir: 'in' | 'out', msg: ClientMsg | ServerMsg) => void;
  random?: () => number;
};

export class SyncClient {
  private socket?: SocketLike;
  private running = false;
  private paused = false;
  private ready = false;
  private attempt = 0;
  /** Delivery watermark: every seq in 1..seq has been received. */
  private seq: number;
  /** Received seqs above the watermark, waiting for the gap below them to fill. */
  private readonly ahead = new Set<number>();
  private readonly pending = new Map<string, Op>();
  private readonly inFlight = new Set<string>();
  private reconnect?: ReturnType<typeof setTimeout>;
  private drain?: ReturnType<typeof setTimeout>;
  private batches: Op[][] = [];
  private tokens = 19;
  private updated = 0;

  constructor(private readonly opts: SyncOptions) {
    this.seq = opts.lastSeq;
    for (const op of opts.pending) this.pending.set(idKey(op.opId), op);
  }
  get lastSeq(): number { return this.seq; }
  get pendingCount(): number { return this.pending.size; }

  start(): void { if (this.running) return; this.running = true; if (!this.paused) this.connect(); }
  stop(): void { this.running = false; this.disconnect(); this.opts.onStatus('offline'); }
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused) { this.disconnect(); this.opts.onStatus('offline'); }
    else if (this.running) this.connect();
  }

  private disconnect(): void {
    clearTimeout(this.reconnect); clearTimeout(this.drain);
    const socket = this.socket; this.socket = undefined; this.ready = false;
    this.batches = []; this.inFlight.clear(); socket?.close();
  }

  private connect(): void {
    if (!this.running || this.paused || this.socket) return;
    this.opts.onStatus('syncing');
    let socket: SocketLike;
    try { socket = this.opts.socketFactory(this.opts.url); }
    catch { this.scheduleReconnect(); return; }
    this.socket = socket; this.tokens = 19; this.updated = Date.now();
    socket.onopen = () => {
      if (this.socket === socket) {
        // The server's seqs are contiguous, so the watermark is a safe resume point
        // even when reordering lost messages just before a disconnect.
        this.send({ t: 'hello', doc: this.opts.doc, replica: this.opts.replica, lastSeq: this.seq });
      }
    };
    socket.onmessage = event => {
      if (this.socket !== socket) return;
      const msg = parseServerMsg(event.data); if (!msg) return;
      this.opts.onMessage?.('in', msg);
      if (msg.t === 'ops' || msg.t === 'catchup') {
        for (const { seq } of msg.ops) if (seq > this.seq) this.ahead.add(seq);
        while (this.ahead.delete(this.seq + 1)) this.seq++;
        this.opts.onRemote(msg.ops);
        if (msg.t === 'catchup' && msg.done) {
          this.ready = true; this.attempt = 0; this.flush(); this.opts.onStatus('connected');
        }
      } else if (msg.t === 'ack') {
        for (const id of msg.opIds) { this.pending.delete(idKey(id)); this.inFlight.delete(idKey(id)); }
        this.opts.onAck(msg.opIds);
      } else if (msg.t === 'error') {
        if (msg.code === 'DOC_NOT_FOUND') this.stop();
        else if (msg.code === 'LIMIT_EXCEEDED') {
          this.inFlight.clear(); this.batches = []; clearTimeout(this.drain);
          this.drain = setTimeout(() => this.flush(), 1000);
        }
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = undefined; this.ready = false; this.inFlight.clear(); this.batches = [];
      clearTimeout(this.drain); this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    this.opts.onStatus('offline');
    if (!this.running || this.paused) return;
    const delay = Math.min(10000, 250 * 2 ** Math.min(this.attempt++, 10)) * (0.5 + (this.opts.random ?? Math.random)() / 2);
    this.reconnect = setTimeout(() => this.connect(), delay);
  }

  private send(msg: ClientMsg): void {
    this.opts.onMessage?.('out', msg);
    this.socket?.send(JSON.stringify(msg));
  }

  submit(ops: Op[]): void {
    for (const op of ops) this.pending.set(idKey(op.opId), op);
    this.flush();
  }

  private flush(): void {
    if (!this.ready || !this.socket) return;
    let batch: Op[] = [];
    let bytes = 20;
    for (const [key, op] of this.pending) {
      if (this.inFlight.has(key)) continue;
      const size = new TextEncoder().encode(JSON.stringify(op)).length + 1;
      if (size + 20 > 60000) throw new RangeError('Operation exceeds wire budget');
      if (batch.length && (batch.length === 500 || bytes + size > 60000)) {
        this.batches.push(batch); batch = []; bytes = 20;
      }
      batch.push(op); bytes += size; this.inFlight.add(key);
    }
    if (batch.length) this.batches.push(batch);
    this.pump();
  }

  private pump(): void {
    clearTimeout(this.drain);
    const now = Date.now(); this.tokens = Math.min(19, this.tokens + (now - this.updated) / 50); this.updated = now;
    while (this.tokens >= 1 && this.batches.length && this.ready && this.socket) {
      this.tokens--; this.send({ t: 'ops', ops: this.batches.shift()! });
    }
    if (this.batches.length) this.drain = setTimeout(() => this.pump(), 50);
  }
}
