import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Download, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

/**
 * End-to-end contracts for the PDF tools that were verified by hand in the audit
 * (Merge, Split, Protect, PDF to Images, Image to PDF): real upload, real
 * processing in the browser, real download, then the downloaded file is inspected.
 * Fixtures: text.pdf = 6 pages, mixed.pdf = 4 pages.
 */
const FX = (name: string) => path.resolve(__dirname, '../fixtures/pdf', name);
const btn = (page: Page, text: RegExp) => page.locator('button', { hasText: text }).first();

async function saved(download: Download): Promise<Buffer> {
  const p = await download.path();
  expect(p).toBeTruthy();
  return readFileSync(p as string);
}

async function openTool(page: Page, slug: string, files: string[] | { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.goto(`/tools/${slug}/`);
  await page.locator('input[type="file"]').first().waitFor({ state: 'attached', timeout: 30_000 });
  await page.locator('input[type="file"]').first().setInputFiles(files as string[]);
}

/** Number of entries in a ZIP, read from its end-of-central-directory record. */
function zipEntryCount(buf: Buffer): number {
  const sig = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const i = buf.lastIndexOf(sig);
  expect(i, 'ZIP end-of-central-directory record').toBeGreaterThanOrEqual(0);
  return buf.readUInt16LE(i + 10);
}

// 1x1 transparent PNG
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('PDF tools: upload → process → download → inspect output', () => {
  test.setTimeout(120_000);

  test('Merge: 6 + 4 pages become one 10-page PDF', async ({ page }) => {
    await openTool(page, 'merge-pdf', [FX('text.pdf'), FX('mixed.pdf')]);
    await btn(page, /^Merge 2 PDFs/).click({ timeout: 60_000 });
    const [dl] = await Promise.all([page.waitForEvent('download'), btn(page, /^Download Merged/).click({ timeout: 60_000 })]);
    const doc = await PDFDocument.load(await saved(dl));
    expect(doc.getPageCount()).toBe(10);
  });

  test('Split (page range 2–4) yields exactly 3 pages', async ({ page }) => {
    await openTool(page, 'split-pdf', [FX('text.pdf')]);
    await page.locator('input:not([type="file"])').nth(0).fill('2');
    await page.locator('input:not([type="file"])').nth(1).fill('4');
    await btn(page, /^Extract Pages/).click({ timeout: 30_000 });
    const [dl] = await Promise.all([page.waitForEvent('download'), btn(page, /^Download Extracted/).click({ timeout: 60_000 })]);
    const doc = await PDFDocument.load(await saved(dl));
    expect(doc.getPageCount()).toBe(3);
  });

  test('Split every 4 pages: 6 pages become parts of 4 and 2', async ({ page }) => {
    await openTool(page, 'split-pdf', [FX('text.pdf')]);
    await btn(page, /^Split Every N/).click({ timeout: 30_000 });
    await page.locator('input:not([type="file"])').first().fill('4');
    await btn(page, /^Split PDF$/).click({ timeout: 30_000 });
    await expect(page.getByText('text-part01.pdf')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('text-part02.pdf')).toBeVisible();
    await expect(page.getByText('text-part03.pdf')).toHaveCount(0);
  });

  test('Protect: output is encrypted and refuses to open without the password', async ({ page }) => {
    await openTool(page, 'protect-pdf', [FX('text.pdf')]);
    await page.locator('input[aria-label*="Password to open"]').first().fill('Test#1234');
    await btn(page, /^Protect PDF/).click({ timeout: 30_000 });
    const [dl] = await Promise.all([page.waitForEvent('download'), btn(page, /^Download Protected/).click({ timeout: 60_000 })]);
    const bytes = await saved(dl);
    expect(bytes.toString('latin1')).toContain('/Encrypt');
    await expect(PDFDocument.load(bytes)).rejects.toThrow(/encrypted/i);
  });

  test('PDF to Images: 6 pages become a ZIP of 6 images', async ({ page }) => {
    await openTool(page, 'pdf-to-images', [FX('text.pdf')]);
    await btn(page, /^Convert to JPG/).click({ timeout: 30_000 });
    const [dl] = await Promise.all([page.waitForEvent('download'), btn(page, /^Download/).click({ timeout: 90_000 })]);
    expect(dl.suggestedFilename()).toMatch(/\.zip$/i);
    expect(zipEntryCount(await saved(dl))).toBe(6);
  });

  test('Image to PDF: 3 images become a 3-page PDF', async ({ page }) => {
    const imgs = [1, 2, 3].map((n) => ({ name: `img${n}.png`, mimeType: 'image/png', buffer: PNG_1X1 }));
    await openTool(page, 'image-to-pdf', imgs);
    await btn(page, /^Create PDF/).click({ timeout: 30_000 });
    const [dl] = await Promise.all([page.waitForEvent('download'), btn(page, /^Download/).click({ timeout: 60_000 })]);
    const doc = await PDFDocument.load(await saved(dl));
    expect(doc.getPageCount()).toBe(3);
  });
});
