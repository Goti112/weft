import { expect, test } from 'vitest';
import { EventLog, summarize } from './eventLog';
import type { Op } from '@weft/crdt';

const op: Op = { type: 'insert', opId: { replica: 'a', counter: 0 }, parent: null, side: 'R', text: 'x' };
test('summarize formats each message type', () => {
  expect(summarize({ t: 'hello', doc: 'd', replica: 'a', lastSeq: 2 })).toBe('hello lastSeq=2');
  expect(summarize({ t: 'ops', ops: [op] })).toBe('ops ×1');
  expect(summarize({ t: 'ops', ops: [4, 5, 6].map(seq => ({ seq, op })) })).toBe('ops ×3 (seq 4–6)');
  expect(summarize({ t: 'ack', opIds: [op.opId, op.opId, op.opId] })).toBe('ack ×3');
  expect(summarize({ t: 'catchup', ops: [{ seq: 1, op }], headSeq: 1, done: true })).toBe('catchup ×1 (seq 1–1), headSeq=1, done=true');
  expect(summarize({ t: 'error', code: 'BAD_MESSAGE', message: 'invalid' })).toBe('error BAD_MESSAGE: invalid');
});
test('EventLog caps at 500', () => {
  const log = new EventLog(); let notifications = 0;
  const unsubscribe = log.subscribe(() => { notifications++; });
  for (let i = 0; i < 501; i++) log.push({ at: i, replica: 'Ana', dir: 'out', t: 'hello', summary: String(i) });
  expect(log.list()).toHaveLength(500); expect(log.list()[0].at).toBe(1);
  expect(log.list().at(-1)?.at).toBe(500); expect(notifications).toBe(501);
  unsubscribe(); log.push({ at: 502, replica: 'Ana', dir: 'out', t: 'ack', summary: 'ack' });
  expect(notifications).toBe(501);
});
