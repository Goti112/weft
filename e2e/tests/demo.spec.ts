import { expect, test } from '@playwright/test';

test('guided scenario converges', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: '▶ Escenario guiado', exact: true });
  await expect(button).toBeEnabled(); await button.click();
  await expect(page.getByText('✓ Los tres documentos coinciden. Ningún cambio se ha perdido.', { exact: true })).toBeVisible();
  const editors = page.getByRole('textbox');
  await expect(editors).toHaveCount(3);
  const texts = await editors.allInnerTexts(); expect(new Set(texts).size).toBe(1);
  expect(texts[0]).toContain('hola '); expect(texts[0]).toContain('adiós ');
});
