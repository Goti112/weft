import { FugueDoc, idKey, type Op } from '@weft/crdt';
import type { Store, StoredState } from '../storage/Store';
import { SyncClient, type SocketFactory, type SyncStatus } from '../sync/SyncClient';
import type { ClientMsg, ServerMsg } from '../sync/protocol';

export type ReplicaEvents = {
  status: SyncStatus; change: undefined; pending: number;
  message: { dir: 'in' | 'out'; msg: ClientMsg | ServerMsg };
  error: Error;
};
type Options = { doc: string; name?: string; store: Store; socketFactory: SocketFactory; url: string };

export class Replica {
  readonly doc: FugueDoc;
  readonly replicaId: string;
  readonly name: string;
  status: SyncStatus = 'offline';
  error: Error | null = null;
  private readonly ops = new Map<string, Op>();
  private readonly pending = new Map<string, Op>();
  private readonly listeners = new Map<keyof ReplicaEvents, Set<(payload: never) => void>>();
  private readonly client: SyncClient;
  private destroyed = false;

  private constructor(private readonly opts: Options, state: StoredState) {
    this.replicaId = state.replicaId!; this.name = opts.name ?? this.replicaId;
    this.doc = new FugueDoc(this.replicaId);
    for (const op of state.ops) { this.doc.apply(op); this.ops.set(idKey(op.opId), op); }
    for (const op of state.pending) this.pending.set(idKey(op.opId), op);
    this.client = new SyncClient({ ...opts, replica: this.replicaId, lastSeq: 0, pending: state.pending,
      onRemote: incoming => {
        for (const { op } of incoming) { this.doc.apply(op); this.ops.set(idKey(op.opId), op); }
        this.persist(); this.emit('change', undefined);
      },
      onAck: ids => {
        for (const id of ids) this.pending.delete(idKey(id));
        this.persist(); this.emit('pending', this.pendingCount);
      },
      onStatus: status => { this.status = status; this.emit('status', status); },
      onMessage: (dir, msg) => this.emit('message', { dir, msg }),
    });
  }

  static async create(opts: Options): Promise<Replica> {
    const state = await opts.store.load(opts.doc);
    // A persisted identity may already have a live writer in another tab.
    // Replayed operations retain their original IDs; new edits get a fresh writer.
    state.replicaId = crypto.randomUUID();
    await opts.store.saveReplicaId(opts.doc, state.replicaId);
    const replica = new Replica(opts, state); replica.client.start(); return replica;
  }

  get pendingCount(): number { return this.pending.size; }
  get lastSeq(): number { return this.client.lastSeq; }
  insert(index: number, text: string): void { this.local(this.doc.insert(index, text)); }
  delete(index: number, length: number): void { this.local(this.doc.delete(index, length)); }
  setPaused(paused: boolean): void { this.client.setPaused(paused); }

  private local(ops: Op[]): void {
    if (this.destroyed) throw new Error('Replica is destroyed');
    for (const op of ops) { this.ops.set(idKey(op.opId), op); this.pending.set(idKey(op.opId), op); }
    const saved = this.persist();
    this.emit('change', undefined); this.emit('pending', this.pendingCount);
    void saved.then(ok => { if (ok && !this.destroyed) this.client.submit(ops.filter(op => this.pending.has(idKey(op.opId)))); });
  }

  private persist(): Promise<boolean> {
    return this.opts.store.saveState(this.opts.doc, {
      replicaId: this.replicaId, ops: [...this.ops.values()], pending: [...this.pending.values()], lastSeq: 0,
    }).then(() => true, error => {
      this.error = error instanceof Error ? error : new Error(String(error));
      this.client.setPaused(true); this.emit('error', this.error); return false;
    });
  }

  on<K extends keyof ReplicaEvents>(event: K, cb: (payload: ReplicaEvents[K]) => void): () => void {
    let listeners = this.listeners.get(event);
    if (!listeners) { listeners = new Set(); this.listeners.set(event, listeners); }
    const listener = cb as (payload: never) => void;
    listeners.add(listener); return () => { listeners.delete(listener); };
  }

  private emit<K extends keyof ReplicaEvents>(event: K, value: ReplicaEvents[K]): void {
    for (const cb of this.listeners.get(event) ?? []) cb(value as never);
  }
  destroy(): void { this.destroyed = true; this.client.stop(); this.listeners.clear(); }
}
