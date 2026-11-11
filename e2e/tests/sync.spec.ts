import { expect, test } from '@playwright/test';

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
    await expect(pa.getByText('✓ Listo para trabajar sin conexión', { exact: true })).toBeVisible();
    await a.setOffline(true); await pa.getByRole('textbox').pressSequentially('sin red ');
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
