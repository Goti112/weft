// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, test, vi } from 'vitest';

const source = readFileSync(new URL('./worker.js', import.meta.url), 'utf8').replace('"__WEFT_MANIFEST__"', JSON.stringify(['/', '/index.html', '/assets/app.js']));
function worker() {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  const cached = new Map([['/index.html', new Response('<main>Weft</main>')], ['/assets/app.js', new Response('app')]]);
  const addAll = vi.fn(async () => {}), skipWaiting = vi.fn(async () => {});
  const cache = { addAll, match: async (request: string | { url: string; headers?: Headers }) => {
    // Spring static resources vary on Origin. Precache requests omit Origin,
    // while script/link crossorigin requests carry it, so a raw match misses.
    if (typeof request !== 'string' && request.headers?.has('Origin')) return undefined;
    return cached.get(typeof request === 'string' ? request : new URL(request.url).pathname);
  } };
  runInNewContext(source, {
    self: { location: { origin: 'https://weft.test' }, addEventListener: (name: string, handler: (event: Record<string, unknown>) => void) => listeners.set(name, handler), skipWaiting, clients: { claim: async () => {} } },
    caches: { open: async () => cache, match: cache.match, keys: async () => [], delete: async () => true },
    fetch: async () => { throw new TypeError('offline'); }, URL, Response,
  });
  return { listeners, addAll, skipWaiting };
}

test('offline navigation serves the cached application shell', async () => {
  const { listeners } = worker(); let response: Promise<Response> | undefined;
  listeners.get('fetch')!({ request: { url: 'https://weft.test/d/shared', method: 'GET', mode: 'navigate' }, respondWith: (r: Promise<Response>) => { response = r; } });
  expect(await (await response)!.text()).toBe('<main>Weft</main>');
});
test('API requests bypass the offline cache', () => {
  const { listeners } = worker(); const respondWith = vi.fn();
  listeners.get('fetch')!({ request: { url: 'https://weft.test/api/docs', method: 'POST', mode: 'cors' }, respondWith });
  expect(respondWith).not.toHaveBeenCalled();
});
test('installation caches built assets before activation', async () => {
  const { listeners, addAll, skipWaiting } = worker(); let installed: Promise<unknown> | undefined;
  listeners.get('install')!({ waitUntil: (promise: Promise<unknown>) => { installed = promise; } });
  await installed;
  expect(addAll).toHaveBeenCalledWith(['/', '/index.html', '/assets/app.js']);
  expect(skipWaiting).toHaveBeenCalledOnce();
});

test('offline module requests match canonical precached URLs despite Vary Origin', async () => {
  const { listeners } = worker(); let response: Promise<Response> | undefined;
  listeners.get('fetch')!({ request: { url: 'https://weft.test/assets/app.js', method: 'GET', mode: 'cors', headers: new Headers({ Origin: 'https://weft.test' }) }, respondWith: (r: Promise<Response>) => { response = r; } });
  expect(await (await response)!.text()).toBe('app');
});
