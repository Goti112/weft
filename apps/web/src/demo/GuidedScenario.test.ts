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
