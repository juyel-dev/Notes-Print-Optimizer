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
    const compressButton = page.getByRole('button', { name: /^Compress PDF$/ });
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

  test('keeps the desktop Compress bar clear of the sticky size dial at the bottom of the page', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/tools/compress-pdf/');

    await page.locator('input[type="file"]').first().setInputFiles(PDF);
    await expect(page.getByRole('heading', { name: 'Compression mode' })).toBeVisible({ timeout: 90_000 });

    const compressButton = page.getByRole('button', { name: /^Compress PDF$/ });
    const dialCard = page.locator('section[aria-label="Estimated result"]');
    await expect(compressButton).toBeVisible({ timeout: 90_000 });
    await expect(dialCard).toBeVisible();

    const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(maxScroll).toBeGreaterThan(250);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(maxScroll);

    const buttonBox = await compressButton.boundingBox();
    const dialBox = await dialCard.boundingBox();
    expect(buttonBox, 'Compress button should remain rendered at the end of the page').not.toBeNull();
    expect(dialBox, 'Estimated result card should remain rendered').not.toBeNull();

    const overlaps = buttonBox!.x < dialBox!.x + dialBox!.width
      && buttonBox!.x + buttonBox!.width > dialBox!.x
      && buttonBox!.y < dialBox!.y + dialBox!.height
      && buttonBox!.y + buttonBox!.height > dialBox!.y;
    expect(overlaps, 'Compress bar must not cover the sticky Estimated result / size dial card').toBe(false);
  });
  });
});
