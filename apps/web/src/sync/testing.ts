import type { Op } from '@weft/crdt';
import type { SocketFactory, SocketLike } from './SyncClient';
import type { ClientMsg, ServerMsg } from './protocol';

export class FakeSocket implements SocketLike {
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  sent: string[] = [];
  closed = false;
  onSend?: (msg: ClientMsg) => void;
  onClose?: () => void;
  constructor() { setTimeout(() => { if (!this.closed) this.onopen?.(new Event('open')); }, 0); }
  send(raw: string): void {
    if (this.closed) throw new Error('Closed socket');
    this.sent.push(raw); this.onSend?.(JSON.parse(raw) as ClientMsg);
  }
  receive(msg: ServerMsg): void {
    if (!this.closed) this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(msg) }));
  }
  close(): void {
    if (this.closed) return;
    this.closed = true; this.onClose?.(); this.onclose?.(new CloseEvent('close'));
  }
}

export class FakeServer {
  readonly ops: { seq: number; op: Op }[] = [];
  readonly sockets: FakeSocket[] = [];
  readonly factory: SocketFactory = () => {
    const socket = new FakeSocket(); this.sockets.push(socket);
    socket.onSend = msg => {
      if (msg.t === 'hello') {
        socket.receive({ t: 'catchup', ops: this.ops.filter(o => o.seq > msg.lastSeq), headSeq: this.ops.length, done: true });
      } else {
        const fresh = msg.ops.filter(op => !this.ops.some(stored => stored.op.opId.replica === op.opId.replica && stored.op.opId.counter === op.opId.counter))
          .map(op => { const stored = { seq: this.ops.length + 1, op }; this.ops.push(stored); return stored; });
        socket.receive({ t: 'ack', opIds: msg.ops.map(op => op.opId) });
        if (fresh.length) for (const other of this.sockets) if (other !== socket) other.receive({ t: 'ops', ops: fresh });
      }
    };
    return socket;
  };
}
