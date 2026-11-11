import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Op } from '@weft/crdt';
import { SyncClient } from './SyncClient';
import { FakeSocket } from './testing';

const op = (i: number, text = 'x'): Op => ({ type: 'insert', opId: { replica: 'a', counter: i }, parent: null, side: 'R', text });
let clients: SyncClient[];
beforeEach(() => { vi.useFakeTimers(); clients = []; });
afterEach(() => { clients.forEach(c => c.stop()); vi.useRealTimers(); });

function setup(pending: Op[] = [], lastSeq = 0) {
  const sockets: FakeSocket[] = [];
  const remote = vi.fn(), ack = vi.fn(), status = vi.fn();
  const client = new SyncClient({ url: 'ws://test', doc: 'doc', replica: 'a', lastSeq, pending,
    socketFactory: () => { const s = new FakeSocket(); sockets.push(s); return s; },
    onRemote: remote, onAck: ack, onStatus: status, random: () => 0,
  });
  clients.push(client); client.start(); vi.advanceTimersByTime(0);
  const done = () => sockets.at(-1)!.receive({ t: 'catchup', ops: [], headSeq: lastSeq, done: true });
  return { client, sockets, remote, ack, status, done };
}

test('sends hello with lastSeq on open', () => {
  const s = setup([], 8);
  expect(JSON.parse(s.sockets[0].sent[0])).toEqual({ t: 'hello', doc: 'doc', replica: 'a', lastSeq: 8 });
});
test('applies catchup and becomes connected after done', () => {
  const s = setup();
  s.sockets[0].receive({ t: 'catchup', ops: [{ seq: 1, op: op(0) }], headSeq: 1, done: false });
  expect(s.remote).toHaveBeenCalledWith([{ seq: 1, op: op(0) }]);
  expect(s.status).toHaveBeenLastCalledWith('syncing');
  s.done(); expect(s.status).toHaveBeenLastCalledWith('connected');
});
test('resends pending after reconnect', () => {
  const s = setup([op(0)]); s.done(); s.sockets[0].close();
  vi.advanceTimersByTime(126); s.done();
  expect(s.sockets).toHaveLength(2);
  expect(s.sockets[1].sent.map(raw => JSON.parse(raw).t)).toEqual(['hello', 'ops']);
});
test('drops pending on ack', () => {
  const s = setup([op(0)]); s.done();
  s.sockets[0].receive({ t: 'ack', opIds: [op(0).opId] });
  expect(s.client.pendingCount).toBe(0); expect(s.ack).toHaveBeenCalledWith([op(0).opId]);
});
test('broadcast received during catchup is delivered', () => {
  const s = setup(); s.sockets[0].receive({ t: 'ops', ops: [{ seq: 2, op: op(1) }] });
  expect(s.remote).toHaveBeenCalledWith([{ seq: 2, op: op(1) }]);
});
test('lastSeq tracks max seq received', () => {
  const s = setup();
  s.sockets[0].receive({ t: 'ops', ops: [{ seq: 8, op: op(1) }] });
  s.sockets[0].receive({ t: 'ops', ops: [{ seq: 3, op: op(2) }] });
  expect(s.client.lastSeq).toBe(8);
});
test('flush splits pending into batches under limits', () => {
  const s = setup(Array.from({ length: 1200 }, (_, i) => op(i))); s.done();
  expect(s.sockets[0].sent.slice(1).map(raw => JSON.parse(raw).ops.length)).toEqual([500, 500, 200]);
  const large = setup(Array.from({ length: 100 }, (_, i) => op(i, 'x'.repeat(1024)))); large.done();
  const batches = large.sockets[0].sent.slice(1);
  expect(batches.length).toBeGreaterThan(1);
  expect(batches.every(raw => new TextEncoder().encode(raw).byteLength <= 60000)).toBe(true);
  expect(batches.flatMap(raw => JSON.parse(raw).ops)).toHaveLength(100);
});
test('paused does not reconnect', () => {
  const s = setup(); s.client.setPaused(true); vi.advanceTimersByTime(30_000);
  expect(s.sockets).toHaveLength(1); expect(s.status).toHaveBeenLastCalledWith('offline');
  s.client.setPaused(false); vi.advanceTimersByTime(0); expect(s.sockets).toHaveLength(2);
});
test('backoff grows and caps at 10s', () => {
  const s = setup();
  for (const delay of [125, 250, 500, 1000, 2000, 4000, 5000, 5000]) {
    const count = s.sockets.length; s.sockets.at(-1)!.close();
    vi.advanceTimersByTime(delay - 1); expect(s.sockets).toHaveLength(count);
    vi.advanceTimersByTime(1); vi.advanceTimersByTime(0); expect(s.sockets).toHaveLength(count + 1);
  }
});
