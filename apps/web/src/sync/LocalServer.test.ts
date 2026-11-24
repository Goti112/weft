import { afterEach, expect, test } from 'vitest';
import { waitFor } from '@testing-library/react';
import { FugueDoc, type Op } from '@weft/crdt';
import { LocalServer } from './LocalServer';
import { NetworkSim } from './NetworkSim';
import type { ClientMsg, ServerMsg } from './protocol';
import { Replica } from '../replica/Replica';
import { MemoryStore } from '../storage/MemoryStore';
import { runGuidedScenario } from '../demo/GuidedScenario';

/** A message takes several macrotasks to round-trip (client → server → client). */
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0)); };

function client(server: LocalServer) {
  const socket = server.connect('local');
  const received: ServerMsg[] = []; let closed = false;
  socket.onmessage = event => { received.push(JSON.parse(event.data) as ServerMsg); };
  socket.onclose = () => { closed = true; };
  const opened = new Promise<void>(resolve => { socket.onopen = () => resolve(); });
  return { socket, received, opened, get closed() { return closed; }, send: (msg: ClientMsg) => socket.send(JSON.stringify(msg)) };
}
const ops = (replica: string, text: string): Op[] => new FugueDoc(replica).insert(0, text);

const replicas: Replica[] = [];
afterEach(() => { replicas.splice(0).forEach(r => r.destroy()); });

test('hello on an empty document gets an empty, finished catch-up', async () => {
  const server = new LocalServer(); const doc = server.createDoc(); const a = client(server);
  await a.opened; a.send({ t: 'hello', doc, replica: 'a', lastSeq: 0 }); await flush();
  expect(a.received).toEqual([{ t: 'catchup', ops: [], headSeq: 0, done: true }]);
});

test('ops are acked to the sender and broadcast to the others only', async () => {
  const server = new LocalServer(); const doc = server.createDoc();
  const a = client(server), b = client(server); await a.opened; await b.opened;
  a.send({ t: 'hello', doc, replica: 'a', lastSeq: 0 }); b.send({ t: 'hello', doc, replica: 'b', lastSeq: 0 }); await flush();
  const batch = ops('a', 'hi'); a.send({ t: 'ops', ops: batch }); await flush();
  expect(a.received.at(-1)).toEqual({ t: 'ack', opIds: batch.map(op => op.opId) });
  expect(a.received.filter(m => m.t === 'ops')).toEqual([]);
  expect(b.received.at(-1)).toEqual({ t: 'ops', ops: [{ seq: 1, op: batch[0] }] });
});

test('duplicates are acked, not broadcast, and do not consume a seq', async () => {
  const server = new LocalServer(); const doc = server.createDoc();
  const a = client(server), b = client(server); await a.opened; await b.opened;
  a.send({ t: 'hello', doc, replica: 'a', lastSeq: 0 }); b.send({ t: 'hello', doc, replica: 'b', lastSeq: 0 }); await flush();
  const first = ops('a', 'x'); const second = ops('b', 'y');
  a.send({ t: 'ops', ops: first }); a.send({ t: 'ops', ops: [...first, ...second] }); await flush();
  expect(a.received.filter(m => m.t === 'ack')).toHaveLength(2);
  expect(b.received.filter(m => m.t === 'ops')).toEqual([
    { t: 'ops', ops: [{ seq: 1, op: first[0] }] },
    { t: 'ops', ops: [{ seq: 2, op: second[0] }] },
  ]);
});

test('reconnecting with lastSeq gets only the missing ops', async () => {
  const server = new LocalServer(); const doc = server.createDoc(); const a = client(server); await a.opened;
  a.send({ t: 'hello', doc, replica: 'a', lastSeq: 0 });
  const author = new FugueDoc('a'); const all = [...author.insert(0, 'x'), ...author.insert(1, 'y'), ...author.insert(2, 'z')];
  a.send({ t: 'ops', ops: all }); await flush();
  const b = client(server); await b.opened; b.send({ t: 'hello', doc, replica: 'b', lastSeq: 1 }); await flush();
  expect(b.received).toEqual([{ t: 'catchup', ops: [{ seq: 2, op: all[1] }, { seq: 3, op: all[2] }], headSeq: 3, done: true }]);
});

test('protocol errors match the real server', async () => {
  const server = new LocalServer(); const a = client(server), b = client(server); await a.opened; await b.opened;
  a.send({ t: 'ops', ops: [] }); b.send({ t: 'hello', doc: 'missing', replica: 'b', lastSeq: 0 }); await flush();
  expect(a.received).toEqual([expect.objectContaining({ t: 'error', code: 'NO_HELLO' })]);
  expect(b.received).toEqual([expect.objectContaining({ t: 'error', code: 'DOC_NOT_FOUND' })]);
  expect(b.closed).toBe(true);
});

test('the guided scenario converges through the in-browser server and a lossy network', async () => {
  const server = new LocalServer(); const doc = server.createDoc();
  const network = new NetworkSim(); network.latencyMs = 5; network.duplicateProb = 0.3; network.reorderProb = 0.3;
  const create = async (name: string) => {
    const r = await Replica.create({ doc, name, store: new MemoryStore(), socketFactory: network.wrap(server.connect), url: 'local' });
    replicas.push(r); return r;
  };
  const ana = await create('Ana'), bea = await create('Bea'), carles = await create('Carles');
  await waitFor(() => expect([ana, bea, carles].every(r => r.status === 'connected')).toBe(true));
  carles.insert(0, 'Escribid aquí: []');
  await runGuidedScenario({ ana, bea, carles }, { stepDelayMs: 0 });
  await waitFor(() => expect(new Set([ana, bea, carles].map(r => r.doc.text())).size).toBe(1));
  expect(ana.doc.text()).toContain('hola '); expect(ana.doc.text()).toContain('adiós ');
});
