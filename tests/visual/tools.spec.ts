import { test, type Page } from '@playwright/test';

/**
 * Second capture pass: every tool's landing screen, the home page in full, and
 * the upload-error state. Best-effort, no assertions. Output:
 * visual-output/tools-<theme>-<viewport>/<name>.png
 */
const SLUGS = [
  'dark-print', 'enhance-light-pdf', 'protect-pdf', 'pdf-to-images', 'merge-pdf', 'split-pdf',
  'image-to-pdf', 'password-generator', 'qr-generator', 'word-counter', 'case-converter', 'n-up',
];
const MODES = [
  { theme: 'dark', vp: 'desktop', width: 1280, height: 800 },
  { theme: 'light', vp: 'desktop', width: 1280, height: 800 },
  { theme: 'dark', vp: 'mobile', width: 390, height: 844 },
] as const;

async function shot(page: Page, dir: string, name: string, full = false): Promise<void> {
  await page.screenshot({ path: `visual-output/${dir}/${name}.png`, fullPage: full });
}

for (const m of MODES) {
  const dir = `tools-${m.theme}-${m.vp}`;
  test(`tools ${dir}`, async ({ page }) => {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.addInitScript((t) => localStorage.setItem('po:theme', t), m.theme);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await shot(page, dir, '00-home-full', true);

    for (const slug of SLUGS) {
      try {
        await page.goto(`/tools/${slug}/`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(300);
        await shot(page, dir, slug);
      } catch (err) {
        console.log(`[${dir}] ${slug}: ${(err as Error).message.split('\n')[0]}`);
      }
    }

    // Upload-error state: a non-PDF file into the dark-print dropzone.
    try {
      await page.goto('/tools/dark-print/');
      await page.waitForLoadState('networkidle');
      await page
        .locator('input[type="file"]')
        .first()
        .setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a pdf') });
      await page.waitForTimeout(1200);
      await shot(page, dir, 'z-upload-error');
    } catch (err) {
      console.log(`[${dir}] upload-error: ${(err as Error).message.split('\n')[0]}`);
    }
  });
}
