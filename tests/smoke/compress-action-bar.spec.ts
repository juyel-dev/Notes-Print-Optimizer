import path from 'node:path';
import { test, expect } from '@playwright/test';

const PDF = path.resolve(__dirname, '../fixtures/pdf/mixed.pdf');

test.describe('Compress PDF action bar', () => {
  test('keeps the Compress button pinned while scrolling below the desktop breakpoint', async ({ page }) => {
    test.setTimeout(120_000);
    // 940px is laptop-sized but below Tailwind's lg breakpoint, where the
    // action bar intentionally stays fixed at the bottom of the viewport.
    await page.setViewportSize({ width: 940, height: 760 });
    await page.goto('/tools/compress-pdf/');

    await page.locator('input[type="file"]').first().setInputFiles(PDF);
    await expect(page.getByRole('heading', { name: 'Compression mode' })).toBeVisible({ timeout: 90_000 });

    // Wait until estimates finish so the primary action has its normal label.
    const compressButton = page.getByRole('button', { name: /^Compress(?: ·|$)/ });
    await expect(compressButton).toBeVisible({ timeout: 90_000 });
    await expect(compressButton).toBeEnabled({ timeout: 90_000 });

    const initialBox = await compressButton.boundingBox();
    expect(initialBox).not.toBeNull();

    const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(maxScroll).toBeGreaterThan(250);

    for (const scrollY of [180, 420, maxScroll]) {
      await page.evaluate((y) => window.scrollTo(0, y), scrollY);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollY);

      const box = await compressButton.boundingBox();
      expect(box, 'Compress button should remain in the viewport').not.toBeNull();
      expect(
        Math.abs(box!.y - initialBox!.y),
        `Compress button moved vertically after scrolling to ${scrollY}px`,
      ).toBeLessThanOrEqual(2);
    }
  });
});
