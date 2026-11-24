import { expect, test } from '@playwright/test';

test('guided scenario converges', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Escenario guiado', exact: true });
  await expect(button).toBeEnabled(); await button.click();
  await expect(page.getByText('Los tres documentos coinciden.', { exact: true })).toBeVisible();
  const editors = page.getByRole('textbox');
  await expect(editors).toHaveCount(3);
  const texts = await editors.allInnerTexts(); expect(new Set(texts).size).toBe(1);
  expect(texts[0]).toContain('hola '); expect(texts[0]).toContain('adiós ');
});

test('reconnecting a panel resumes catch-up from its watermark', async ({ page }) => {
  await page.goto('/');
  const ana = page.getByTestId('panel-ana');
  await expect(ana.getByText('Conectado', { exact: true })).toBeVisible();
  await ana.getByRole('button', { name: 'Desconectar', exact: true }).click();
  await ana.getByRole('button', { name: 'Reconectar', exact: true }).click();
  await expect(ana.getByText('Conectado', { exact: true })).toBeVisible();
  // The seed text gives every panel a non-zero watermark before the cut.
  await expect(page.locator('.message-chip').filter({ hasText: /^hello lastSeq=[1-9]\d*$/ }).first()).toBeVisible();
});
