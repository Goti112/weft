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
