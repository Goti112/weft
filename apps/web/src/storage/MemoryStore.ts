import { idKey, type Op } from '@weft/crdt';
import { cloneState, emptyState, type Commit, type Store, type StoredState } from './Store';

type DocState = { replicaId: string | null; lastSeq: number; ops: Map<string, { op: Op; pending: boolean }> };
const clone = (op: Op): Op => JSON.parse(JSON.stringify(op)) as Op;

export class MemoryStore implements Store {
  private readonly docs = new Map<string, DocState>();

  private state(doc: string): DocState {
    let state = this.docs.get(doc);
    if (!state) { state = { replicaId: null, lastSeq: 0, ops: new Map() }; this.docs.set(doc, state); }
    return state;
  }

  async load(doc: string): Promise<StoredState> {
    const state = this.docs.get(doc);
    if (!state) return emptyState();
    const entries = [...state.ops.values()];
    return cloneState({
      replicaId: state.replicaId, lastSeq: state.lastSeq,
      ops: entries.map(e => e.op), pending: entries.filter(e => e.pending).map(e => e.op),
    });
  }

  async saveReplicaId(doc: string, id: string): Promise<void> { this.state(doc).replicaId = id; }

  async commit(doc: string, change: Commit): Promise<void> {
    const state = this.state(doc);
    for (const op of change.local ?? []) if (!state.ops.has(idKey(op.opId))) state.ops.set(idKey(op.opId), { op: clone(op), pending: true });
    for (const op of change.remote ?? []) state.ops.set(idKey(op.opId), { op: clone(op), pending: false });
    for (const id of change.acked ?? []) { const entry = state.ops.get(idKey(id)); if (entry) entry.pending = false; }
    if (change.lastSeq !== undefined) state.lastSeq = Math.max(state.lastSeq, change.lastSeq);
  }
}
