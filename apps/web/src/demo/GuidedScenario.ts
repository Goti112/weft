import type { Replica } from '../replica/Replica';

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function until(predicate: () => boolean, signal?: AbortSignal): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('La sincronización está tardando demasiado. Prueba a reconectar.');
    await delay(20, signal);
  }
  signal?.throwIfAborted();
}

export async function runGuidedScenario(panels: { ana: Replica; bea: Replica; carles: Replica }, opts: { stepDelayMs?: number; signal?: AbortSignal } = {}): Promise<void> {
  const { ana, bea, carles } = panels;
  const same = () => ana.doc.text() === bea.doc.text() && ana.doc.text() === carles.doc.text();
  // The scenario sets its own stage: panels cut by hand beforehand are reconnected first.
  for (const replica of [ana, bea, carles]) replica.setPaused(false);
  await until(() => same() && ana.doc.text().includes('[') && [ana, bea, carles].every(r => r.status === 'connected'), opts.signal);
  const position = ana.doc.text().indexOf('[') + 1;
  ana.setPaused(true); bea.setPaused(true);
  try {
    const a = 'hola ', b = 'adiós ';
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      opts.signal?.throwIfAborted();
      if (i < a.length) ana.insert(position + i, a[i]);
      if (i < b.length) bea.insert(position + i, b[i]);
      await delay(opts.stepDelayMs ?? 100, opts.signal);
    }
  } finally { ana.setPaused(false); bea.setPaused(false); }
  await until(() => same() && ana.pendingCount === 0 && bea.pendingCount === 0 && carles.doc.text().includes('hola ') && carles.doc.text().includes('adiós '), opts.signal);
}
