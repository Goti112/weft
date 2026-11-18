import 'fake-indexeddb/auto';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { FugueDoc } from '@weft/crdt';
import { IdbStore, openStore } from './IdbStore';
import { MemoryStore } from './MemoryStore';
import type { Store } from './Store';

afterEach(() => vi.unstubAllGlobals());
const dbName = () => `test-${crypto.randomUUID()}`;

describe.each<[string, () => Store]>([
  ['IdbStore', () => new IdbStore(dbName())],
  ['MemoryStore', () => new MemoryStore()],
])('%s', (_name, makeStore) => {
  test('round-trips ops, pending, lastSeq and replicaId', async () => {
    const store = makeStore(); const ops = new FugueDoc('a').insert(0, 'hola');
    await store.saveReplicaId('doc', 'a'); await store.commit('doc', { local: ops, lastSeq: 7 });
    expect(await store.load('doc')).toEqual({ replicaId: 'a', ops, pending: ops, lastSeq: 7 });
  });
  test('remote ops are stored as acknowledged', async () => {
    const store = makeStore(); const ops = new FugueDoc('b').insert(0, 'hi');
    await store.commit('doc', { remote: ops, lastSeq: 1 });
    expect(await store.load('doc')).toMatchObject({ ops, pending: [], lastSeq: 1 });
  });
  test('acked ops leave the pending queue and stale local writes cannot resurrect them', async () => {
    const store = makeStore(); const ops = new FugueDoc('a').insert(0, 'x');
    await store.commit('doc', { local: ops });
    await store.commit('doc', { acked: ops.map(op => op.opId) });
    await store.commit('doc', { local: ops });
    expect((await store.load('doc')).pending).toEqual([]);
  });
  test('lastSeq only grows', async () => {
    const store = makeStore();
    await store.commit('doc', { lastSeq: 9 }); await store.commit('doc', { lastSeq: 4 });
    expect((await store.load('doc')).lastSeq).toBe(9);
  });
  test('documents are isolated', async () => {
    const store = makeStore();
    await store.commit('one', { local: new FugueDoc('a').insert(0, 'x'), lastSeq: 3 });
    expect(await store.load('two')).toEqual({ replicaId: null, ops: [], pending: [], lastSeq: 0 });
  });
});

test('openStore falls back to memory when indexedDB missing', async () => {
  vi.stubGlobal('indexedDB', undefined);
  const { store, persistent } = await openStore();
  expect(persistent).toBe(false);
  await store.saveReplicaId('doc', 'a'); expect((await store.load('doc')).replicaId).toBe('a');
});

test('two tabs sharing a database merge their logs', async () => {
  const name = dbName(); const a = new IdbStore(name), b = new IdbStore(name);
  const aOps = new FugueDoc('a').insert(0, 'A'), bOps = new FugueDoc('b').insert(0, 'B');
  await a.commit('doc', { local: aOps }); await b.commit('doc', { local: bOps });
  let recovered = await new IdbStore(name).load('doc');
  expect(recovered.ops).toHaveLength(2); expect(recovered.pending).toHaveLength(2);
  await a.commit('doc', { acked: aOps.map(op => op.opId) });
  await b.commit('doc', { local: bOps, lastSeq: 1 });
  recovered = await new IdbStore(name).load('doc');
  expect(recovered.ops).toHaveLength(2); expect(recovered.pending).toEqual(bOps);
});

test('opening over a v1 database replaces the old snapshot store', async () => {
  const name = dbName();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('docs'); };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
  const store = new IdbStore(name); const ops = new FugueDoc('a').insert(0, 'x');
  await store.commit('doc', { local: ops });
  expect((await store.load('doc')).ops).toEqual(ops);
});
