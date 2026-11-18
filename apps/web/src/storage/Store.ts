import type { Id, Op } from '@weft/crdt';

export type StoredState = { replicaId: string | null; ops: Op[]; pending: Op[]; lastSeq: number };
export const emptyState = (): StoredState => ({ replicaId: null, ops: [], pending: [], lastSeq: 0 });
export const cloneState = (state: StoredState): StoredState => JSON.parse(JSON.stringify(state)) as StoredState;

/**
 * One atomic change to a document's local log. Only the ops that changed are
 * written, so the cost of a keystroke does not grow with the document.
 */
export type Commit = {
  /** New local edits: stored as pending unless already acknowledged. */
  local?: Op[];
  /** Ops received from the server: the server has them, so they are acknowledged. */
  remote?: Op[];
  /** Local ops the server has acknowledged. */
  acked?: Id[];
  /** Delivery watermark. The stored value only grows, which is safe because logs only grow. */
  lastSeq?: number;
};

export interface Store {
  load(doc: string): Promise<StoredState>;
  saveReplicaId(doc: string, id: string): Promise<void>;
  commit(doc: string, change: Commit): Promise<void>;
}
