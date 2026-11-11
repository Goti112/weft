import 'fake-indexeddb/auto';
import { afterEach, expect, test, vi } from 'vitest';
import { FugueDoc } from '@weft/crdt';
import { IdbStore, openStore } from './IdbStore';

afterEach(() => vi.unstubAllGlobals());
test('IdbStore round-trips ops, pending, lastSeq, replicaId', async () => {
  const store = new IdbStore(`test-${crypto.randomUUID()}`);
  const ops = new FugueDoc('a').insert(0, 'hola');
  await store.saveReplicaId('doc', 'a'); await store.appendOps('doc', ops);
  await store.setPending('doc', ops); await store.setLastSeq('doc', 7);
  expect(await store.load('doc')).toEqual({ replicaId: 'a', ops, pending: ops, lastSeq: 7 });
});
test('openStore falls back to memory when indexedDB missing', async () => {
  vi.stubGlobal('indexedDB', undefined);
  const { store, persistent } = await openStore();
  expect(persistent).toBe(false);
  await store.saveReplicaId('doc', 'a'); expect((await store.load('doc')).replicaId).toBe('a');
});

test('shared document survives stale concurrent snapshots and a fresh tab', async () => {
  const name = `test-${crypto.randomUUID()}`;
  const a = new IdbStore(name), b = new IdbStore(name);
  const aOps = new FugueDoc('a').insert(0, 'A'), bOps = new FugueDoc('b').insert(0, 'B');
  await a.saveState('doc', { replicaId: 'a', ops: aOps, pending: aOps, lastSeq: 0 });
  await b.saveState('doc', { replicaId: 'b', ops: bOps, pending: bOps, lastSeq: 0 });
  let recovered = await new IdbStore(name).load('doc');
  expect(recovered.ops).toHaveLength(2); expect(recovered.pending).toHaveLength(2);
  await a.saveState('doc', { replicaId: 'a', ops: aOps, pending: [], lastSeq: 0 });
  await b.saveState('doc', { replicaId: 'b', ops: bOps, pending: bOps, lastSeq: 0 });
  recovered = await new IdbStore(name).load('doc');
  expect(recovered.ops).toHaveLength(2); expect(recovered.pending).toEqual(bOps);
});
