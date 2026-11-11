import { afterEach, expect, test } from 'vitest';
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

test('pending ops survive reopen', async () => {
  const server = new FakeServer(); const store = new MemoryStore();
  const old = await create(server, store); old.setPaused(true); old.insert(0, 'offline'); old.destroy();
  const reopened = await create(server, store);
  expect(reopened.doc.text()).toBe('offline'); expect(reopened.pendingCount).toBeGreaterThan(0);
  expect(reopened.replicaId).toBe(old.replicaId);
  reopened.setPaused(false);
  await waitFor(() => expect(server.ops).toHaveLength(1));
  await waitFor(() => expect(reopened.pendingCount).toBe(0));
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
