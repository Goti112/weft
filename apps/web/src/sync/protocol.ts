import type { Id, Op } from '@weft/crdt';

export type ClientMsg = { t: 'hello'; doc: string; replica: string; lastSeq: number } | { t: 'ops'; ops: Op[] };
export type SequencedOp = { seq: number; op: Op };
export type ServerMsg =
  | { t: 'catchup'; ops: SequencedOp[]; headSeq: number; done: boolean }
  | { t: 'ops'; ops: SequencedOp[] }
  | { t: 'ack'; opIds: Id[] }
  | { t: 'error'; code: 'BAD_MESSAGE' | 'NO_HELLO' | 'LIMIT_EXCEEDED' | 'DOC_NOT_FOUND'; message: string };

export function parseServerMsg(raw: string): ServerMsg | null {
  try {
    const msg = JSON.parse(raw) as ServerMsg;
    if (!msg || typeof msg !== 'object') return null;
    const id = (value: Id) => value && typeof value.replica === 'string' && Number.isSafeInteger(value.counter) && value.counter >= 0;
    switch (msg.t) {
      case 'ack': return Array.isArray(msg.opIds) && msg.opIds.every(id) ? msg : null;
      case 'error': return ['BAD_MESSAGE', 'NO_HELLO', 'LIMIT_EXCEEDED', 'DOC_NOT_FOUND'].includes(msg.code) && typeof msg.message === 'string' ? msg : null;
      case 'catchup':
        if (!Number.isSafeInteger(msg.headSeq) || msg.headSeq < 0 || typeof msg.done !== 'boolean') return null;
        // Fall through to the shared operation validation.
      case 'ops':
        return Array.isArray(msg.ops) && msg.ops.every(({ seq, op }) => Number.isSafeInteger(seq) && seq >= 0 && op && id(op.opId)
          && (op.type === 'insert' ? typeof op.text === 'string' && (op.parent === null || id(op.parent)) && ['L', 'R'].includes(op.side)
            : op.type === 'delete' && Array.isArray(op.targets) && op.targets.every(id))) ? msg : null;
      default: return null;
    }
  } catch { return null; }
}
