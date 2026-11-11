import { idKey, type Op } from '@weft/crdt';
import { cloneState, emptyState, type Store, type StoredState } from './Store';

export class MemoryStore implements Store {
  private readonly docs = new Map<string, StoredState>();
  async load(doc: string): Promise<StoredState> { return cloneState(this.docs.get(doc) ?? emptyState()); }
  async saveState(doc: string, state: StoredState): Promise<void> { this.docs.set(doc, cloneState(state)); }
  private update(doc: string, fn: (state: StoredState) => void): void {
    const state = cloneState(this.docs.get(doc) ?? emptyState()); fn(state); this.docs.set(doc, state);
  }
  async saveReplicaId(doc: string, id: string): Promise<void> { this.update(doc, s => { s.replicaId = id; }); }
  async appendOps(doc: string, ops: Op[]): Promise<void> {
    this.update(doc, s => { s.ops = [...new Map([...s.ops, ...ops].map(op => [idKey(op.opId), op])).values()]; });
  }
  async setPending(doc: string, ops: Op[]): Promise<void> { this.update(doc, s => { s.pending = cloneState({ ...s, pending: ops }).pending; }); }
  async setLastSeq(doc: string, seq: number): Promise<void> { this.update(doc, s => { s.lastSeq = seq; }); }
}
