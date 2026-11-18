import { afterEach, expect, test, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { Replica } from './Replica';
import { MemoryStore } from '../storage/MemoryStore';
import { FakeServer } from '../sync/testing';

const replicas: Replica[] = [];
afterEach(() => { replicas.splice(0).forEach(r => r.destroy()); });
async function create(server: FakeServer, store = new MemoryStore()) {
  const r = await Replica.create({ doc: 'doc', store, socketFactory: server.factory, url: 'ws://test' });
  replicas.push(r); return r;
}

test('a keystroke commits only the new op, not the whole log', async () => {
  const server = new FakeServer(), store = new MemoryStore();
  const r = await create(server, store); r.setPaused(true);
  for (let i = 0; i < 200; i++) r.insert(i, 'x');
  await waitFor(async () => expect((await store.load('doc')).ops).toHaveLength(200));
  const commit = vi.spyOn(store, 'commit');
  r.insert(200, 'y');
  await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
  expect(commit.mock.calls[0][1]).toEqual({ local: [expect.objectContaining({ text: 'y' })] });
});
test('a catch-up page is committed with its watermark in one write', async () => {
  const server = new FakeServer(), store = new MemoryStore();
  const { FugueDoc } = await import('@weft/crdt');
  const remote = new FugueDoc('remote');
  for (let i = 0; i < 50; i++) server.ops.push({ seq: i + 1, op: remote.insert(i, 'x')[0] });
  const commit = vi.spyOn(store, 'commit');
  const r = await create(server, store);
  await waitFor(() => expect(r.status).toBe('connected'));
  await waitFor(async () => expect((await store.load('doc')).lastSeq).toBe(50));
  expect(commit.mock.calls.filter(([, change]) => change.remote)).toEqual([['doc', { remote: server.ops.map(s => s.op), lastSeq: 50 }]]);
  expect(r.doc.text()).toBe('x'.repeat(50));
});
test('pending ops survive reopen', async () => {
  const server = new FakeServer(); const store = new MemoryStore();
  const old = await create(server, store); old.setPaused(true); old.insert(0, 'offline'); old.destroy();
  const reopened = await create(server, store);
  expect(reopened.doc.text()).toBe('offline'); expect(reopened.pendingCount).toBeGreaterThan(0);
  expect(reopened.replicaId).not.toBe(old.replicaId);
  reopened.setPaused(false);
  await waitFor(() => expect(server.ops).toHaveLength(1));
  await waitFor(() => expect(reopened.pendingCount).toBe(0));
});

test('cloned stored identity cannot allocate duplicate operation ids', async () => {
  const server = new FakeServer();
  const aStore = new MemoryStore(), bStore = new MemoryStore();
  await aStore.saveReplicaId('doc', 'cloned'); await bStore.saveReplicaId('doc', 'cloned');
  const a = await create(server, aStore), b = await create(server, bStore);
  await waitFor(() => expect(b.status).toBe('connected'));
  a.setPaused(true); b.setPaused(true); a.insert(0, 'A'); b.insert(0, 'B');
  a.setPaused(false); b.setPaused(false);
  await waitFor(() => expect(a.pendingCount + b.pendingCount).toBe(0));
  expect(a.doc.text()).toBe(b.doc.text());
  expect(a.doc.text()).toContain('A'); expect(a.doc.text()).toContain('B');
});

test('reopen recovers an operation missed before a higher sequence', async () => {
  const server = new FakeServer(), store = new MemoryStore();
  const old = await create(server, store);
  await waitFor(() => expect(old.status).toBe('connected'));
  const { FugueDoc } = await import('@weft/crdt');
  const remote = new FugueDoc('remote');
  server.ops.push({ seq: 1, op: remote.insert(0, 'a')[0] }, { seq: 2, op: remote.insert(1, 'b')[0] });
  server.sockets[0].receive({ t: 'ops', ops: [server.ops[1]] });
  await Promise.resolve(); old.destroy();
  const reopened = await create(server, store);
  await waitFor(() => expect(reopened.doc.text()).toBe('ab'));
});
test('reopen resumes catch-up from the persisted watermark', async () => {
  const server = new FakeServer(), store = new MemoryStore();
  const old = await create(server, store);
  await waitFor(() => expect(old.status).toBe('connected'));
  const { FugueDoc } = await import('@weft/crdt');
  const remote = new FugueDoc('remote');
  server.ops.push({ seq: 1, op: remote.insert(0, 'a')[0] }, { seq: 2, op: remote.insert(1, 'b')[0] });
  server.sockets[0].receive({ t: 'ops', ops: server.ops.slice() });
  await waitFor(async () => expect((await store.load('doc')).lastSeq).toBe(2));
  old.destroy();
  const reopened = await create(server, store);
  await waitFor(() => expect(reopened.status).toBe('connected'));
  expect(JSON.parse(server.sockets.at(-1)!.sent[0]).lastSeq).toBe(2);
  expect(reopened.doc.text()).toBe('ab');
});
test('two replicas converge through FakeServer', async () => {
  const server = new FakeServer(); const a = await create(server), b = await create(server);
  await waitFor(() => expect(a.status).toBe('connected'));
  await waitFor(() => expect(b.status).toBe('connected'));
  a.setPaused(true); b.setPaused(true); a.insert(0, 'hola'); b.insert(0, 'adiós');
  a.setPaused(false); b.setPaused(false);
  await waitFor(() => expect(a.doc.text()).toBe(b.doc.text()));
  expect(a.doc.text()).toContain('hola'); expect(a.doc.text()).toContain('adiós');
});
