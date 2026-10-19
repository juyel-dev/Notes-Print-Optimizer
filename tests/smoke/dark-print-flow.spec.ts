import path from 'node:path';
import { test, expect } from '@playwright/test';

const PDF = path.resolve(__dirname, '../fixtures/pdf/text.pdf'); // 6 pages: light + dark mix

test('Dark Print: upload → whiten → layout → print-ready download', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/tools/dark-print/');
  await page.locator('input[type="file"]').first().setInputFiles(PDF);
  await page.locator('button', { hasText: /^Whiten PDF/ }).click({ timeout: 60_000 });

  const chooseLayout = page.locator('button', { hasText: /Choose Layout/ });
  await expect(chooseLayout).toBeVisible({ timeout: 120_000 });
  await chooseLayout.click();

  await page.locator('button', { hasText: /^4-up/ }).click({ timeout: 30_000 });
  await page.locator('button', { hasText: /^Generate 4-up PDF/ }).click();
  await expect(page.getByText('Your PDF is Print-Ready!')).toBeVisible({ timeout: 120_000 });

  // Generating does not download by itself; the result screen has the first
  // download action, and it must not claim to be a repeat ("Again").
  const downloadButton = page.locator('button', { hasText: /^Download Print PDF$/ });
  await expect(downloadButton).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), downloadButton.click()]);
  expect(download.suggestedFilename()).toMatch(/PrintReady\.pdf$/);
});
