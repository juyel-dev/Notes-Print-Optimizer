import path from 'node:path';
import { test, expect } from '@playwright/test';

const PDF = path.resolve(__dirname, '../fixtures/pdf/mixed.pdf');

test('shows Download early on the Compress PDF result screen', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 940, height: 760 });
  await page.goto('/tools/compress-pdf/');
  await page.locator('input[type="file"]').first().setInputFiles(PDF);

  await expect(page.getByRole('heading', { name: 'Compression mode' })).toBeVisible({ timeout: 90_000 });
  const compressButton = page.getByRole('button', { name: /^Compress PDF$/ });
  await expect(compressButton).toBeEnabled({ timeout: 90_000 });
  await compressButton.click();

  const result = page.getByRole('region', { name: 'Result' });
  await expect(result).toBeVisible({ timeout: 120_000 });
  const downloadButton = result.getByRole('button', { name: /^Download PDF/ });
  await expect(downloadButton).toBeVisible();

  // The primary action should come before the size-detail bars in document flow.
  const downloadBox = await downloadButton.boundingBox();
  const beforeBox = await result.getByText('Before', { exact: true }).boundingBox();
  expect(downloadBox).not.toBeNull();
  expect(beforeBox).not.toBeNull();
  expect(downloadBox!.y + downloadBox!.height).toBeLessThan(beforeBox!.y);
});
