import { expect, test, type Page } from '@playwright/test';

/** Number of pending (unacknowledged) ops already written to the page's IndexedDB. */
function savedPending(page: Page): Promise<number> {
  return page.evaluate(async () => {
    let total = 0;
    for (const entry of await indexedDB.databases()) {
      if (!entry.name?.startsWith('weft-v1')) continue;
      total += await new Promise<number>((resolve, reject) => {
        const open = indexedDB.open(entry.name!);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result, tx = db.transaction('ops'), all = tx.objectStore('ops').getAll();
          tx.oncomplete = () => { db.close(); resolve(all.result.filter((e: { pending: boolean }) => e.pending).length); };
        };
      });
    }
    return total;
  });
}

test('opener tabs allocate independent operations', async ({ browser, request, baseURL }) => {
  const { id } = await (await request.post('/api/docs')).json() as { id: string };
  const context = await browser.newContext({ baseURL });
  try {
    const a = await context.newPage(); await a.goto(`/d/${id}`);
    await expect(a.getByText('Conectado', { exact: true })).toBeVisible();
    const popup = a.waitForEvent('popup');
    await a.evaluate(() => { window.open(location.href); });
    const b = await popup;
    await expect(b.getByText('Conectado', { exact: true })).toBeVisible();
    await context.setOffline(true);
    await a.getByRole('textbox').pressSequentially('A'); await b.getByRole('textbox').pressSequentially('B');
    await context.setOffline(false);
    await expect(a.getByText('0 ops pendientes', { exact: true })).toBeVisible();
    await expect(b.getByText('0 ops pendientes', { exact: true })).toBeVisible();
    await expect.poll(async () => (await a.getByRole('textbox').innerText()) === (await b.getByRole('textbox').innerText())).toBe(true);
    expect(await a.getByRole('textbox').innerText()).toContain('A'); expect(await a.getByRole('textbox').innerText()).toContain('B');
  } finally { await context.close(); }
});

test('fresh tab recovers closed offline tab edits', async ({ browser, request, baseURL }) => {
  const { id } = await (await request.post('/api/docs')).json() as { id: string };
  const context = await browser.newContext({ baseURL });
  try {
    const old = await context.newPage(); await old.goto(`/d/${id}`);
    await expect(old.getByText('Conectado', { exact: true })).toBeVisible();
    await expect(old.getByText('Listo para trabajar sin conexión', { exact: true })).toBeVisible();
    await context.setOffline(true); await old.getByRole('textbox').pressSequentially('recover me');
    await expect.poll(() => savedPending(old)).toBeGreaterThanOrEqual('recover me'.length);
    await old.close();
    const fresh = await context.newPage(); await fresh.goto(`/d/${id}`);
    await expect(fresh.getByRole('textbox')).toContainText('recover me');
    await context.setOffline(false);
    await expect(fresh.getByText('0 ops pendientes', { exact: true })).toBeVisible();
    const observer = await browser.newContext({ baseURL });
    try { const page = await observer.newPage(); await page.goto(`/d/${id}`); await expect(page.getByRole('textbox')).toContainText('recover me'); }
    finally { await observer.close(); }
  } finally { await context.close(); }
});

test('two browsers converge after offline edits', async ({ browser, request, baseURL }) => {
  const response = await request.post('/api/docs'); const { id } = await response.json() as { id: string };
  const a = await browser.newContext({ baseURL }), b = await browser.newContext({ baseURL });
  try {
    const pa = await a.newPage(), pb = await b.newPage();
    await pa.goto(`/d/${id}`); await pb.goto(`/d/${id}`);
    await expect(pa.getByText('Conectado', { exact: true })).toBeVisible(); await expect(pb.getByText('Conectado', { exact: true })).toBeVisible();
    await a.setOffline(true);
    await pa.getByRole('textbox').pressSequentially('hola ');
    await pb.getByRole('textbox').pressSequentially('adiós ');
    await a.setOffline(false);
    await expect.poll(async () => ({ a: await pa.getByRole('textbox').innerText(), b: await pb.getByRole('textbox').innerText() }))
      .toEqual(expect.objectContaining({ a: expect.stringContaining('hola '), b: expect.stringContaining('hola ') }));
    await expect.poll(async () => (await pa.getByRole('textbox').innerText()) === (await pb.getByRole('textbox').innerText())).toBe(true);
    expect(await pa.getByRole('textbox').innerText()).toContain('adiós ');
  } finally { await a.close(); await b.close(); }
});

test('offline reload keeps edits', async ({ browser, request, baseURL }) => {
  const response = await request.post('/api/docs'); const { id } = await response.json() as { id: string };
  const a = await browser.newContext({ baseURL }), b = await browser.newContext({ baseURL });
  try {
    const pa = await a.newPage(); await pa.goto(`/d/${id}`);
    await expect(pa.getByText('Conectado', { exact: true })).toBeVisible();
    await expect(pa.getByText('Listo para trabajar sin conexión', { exact: true })).toBeVisible();
    await a.setOffline(true); await pa.getByRole('textbox').pressSequentially('sin red ');
    // Writes to IndexedDB are asynchronous: reload once the keystrokes are durable,
    // as a person would, rather than racing the last write.
    await expect.poll(() => savedPending(pa)).toBeGreaterThanOrEqual('sin red '.length);
    await pa.reload({ waitUntil: 'domcontentloaded' });
    await expect(pa.getByRole('textbox')).toContainText('sin red');
    await pa.getByRole('textbox').press('ControlOrMeta+End');
    await pa.getByRole('textbox').pressSequentially('y después');
    await a.setOffline(false);
    await expect(pa.getByText('0 ops pendientes', { exact: true })).toBeVisible();
    const pb = await b.newPage(); await pb.goto(`/d/${id}`);
    await expect(pb.getByRole('textbox')).toContainText('sin red y después');
  } finally { await a.close(); await b.close(); }
});
