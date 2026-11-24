import { expect, test } from 'vitest';
import { Replica } from '../replica/Replica';
import { MemoryStore } from '../storage/MemoryStore';
import { FakeServer } from '../sync/testing';
import { runGuidedScenario } from './GuidedScenario';

test('guided scenario converges without interleaving', async () => {
  const server = new FakeServer();
  const create = (name: string) => Replica.create({ doc: 'demo', name, store: new MemoryStore(), socketFactory: server.factory, url: 'ws://test' });
  const ana = await create('Ana'), bea = await create('Bea'), carles = await create('Carles');
  try {
    carles.insert(0, 'Escribid aquí: []');
    await runGuidedScenario({ ana, bea, carles }, { stepDelayMs: 0 });
    expect(ana.doc.text()).toBe(bea.doc.text()); expect(ana.doc.text()).toBe(carles.doc.text());
    expect(ana.doc.text()).toContain('hola '); expect(ana.doc.text()).toContain('adiós ');
  } finally { ana.destroy(); bea.destroy(); carles.destroy(); }
});

test('guided scenario reconnects panels that were cut by hand before it started', async () => {
  const server = new FakeServer();
  const create = (name: string) => Replica.create({ doc: 'demo', name, store: new MemoryStore(), socketFactory: server.factory, url: 'ws://test' });
  const ana = await create('Ana'), bea = await create('Bea'), carles = await create('Carles');
  try {
    carles.insert(0, 'Escribid aquí: []');
    carles.setPaused(true); ana.setPaused(true);
    await runGuidedScenario({ ana, bea, carles }, { stepDelayMs: 0 });
    expect(new Set([ana, bea, carles].map(r => r.doc.text())).size).toBe(1);
    expect([ana, bea, carles].map(r => r.status)).toEqual(['connected', 'connected', 'connected']);
  } finally { ana.destroy(); bea.destroy(); carles.destroy(); }
}, 10_000);
