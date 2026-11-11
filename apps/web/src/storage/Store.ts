import type { Op } from '@weft/crdt';

export type StoredState = { replicaId: string | null; ops: Op[]; pending: Op[]; lastSeq: number };
export const emptyState = (): StoredState => ({ replicaId: null, ops: [], pending: [], lastSeq: 0 });
export const cloneState = (state: StoredState): StoredState => JSON.parse(JSON.stringify(state)) as StoredState;
export interface Store {
  load(doc: string): Promise<StoredState>;
  saveReplicaId(doc: string, id: string): Promise<void>;
  appendOps(doc: string, ops: Op[]): Promise<void>;
  setPending(doc: string, ops: Op[]): Promise<void>;
  setLastSeq(doc: string, seq: number): Promise<void>;
  saveState(doc: string, state: StoredState): Promise<void>;
}
