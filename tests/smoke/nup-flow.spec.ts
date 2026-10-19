import path from 'node:path';
import { test, expect } from '@playwright/test';

const PDF = path.resolve(__dirname, '../fixtures/pdf/text.pdf'); // 6 pages

test('N-up: upload → 4-up layout → downloadable PDF with 2 sheets', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/tools/n-up/');
  await page.locator('input[type="file"]').first().setInputFiles(PDF);
  await page.locator('button', { hasText: /Continue to layout/ }).click({ timeout: 60_000 });

  await page.locator('button', { hasText: /^4-up/ }).click({ timeout: 30_000 });
  await page.locator('button', { hasText: /^Generate 4-up PDF/ }).click();

  // Result copy: 6 pages → 2 sheets (plural), and a single sheet must read "1 sheet".
  await expect(page.getByText(/6 pages → 2 sheets/)).toBeVisible({ timeout: 60_000 });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button', { hasText: /Download PDF/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^n-up-2x2-a4-portrait\.pdf$/);
});

test('N-up: a single output sheet uses singular wording ("1 sheet")', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/tools/n-up/');
  await page.locator('input[type="file"]').first().setInputFiles(PDF);
  await page.locator('button', { hasText: /Continue to layout/ }).click({ timeout: 60_000 });
  await page.locator('button', { hasText: /^9-up/ }).click({ timeout: 30_000 });
  await page.locator('button', { hasText: /^Generate 9-up PDF/ }).click();
  await expect(page.getByText(/6 pages → 1 sheet\b(?!s)/)).toBeVisible({ timeout: 60_000 });
});
