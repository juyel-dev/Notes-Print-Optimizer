import { test, expect } from '@playwright/test';

test.describe('mobile-only landing hero carousel', () => {
  test('mobile shows the feature carousel in place of the hero copy', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await expect(page.getByRole('region', { name: 'Featured tools' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Dark Notes → Print/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next banner' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Show banner 1/ })).toBeVisible();

    // Keep the original SEO heading in the DOM, but remove its visual block
    // and supporting paragraph from the phone layout.
    await expect(page.locator('h1')).toHaveClass(/sr-only/);
    await expect(page.getByText(/Whiten dark slides, clean up scans, arrange pages/)).toBeHidden();

    // Existing actions and before/after demo remain in the mobile hero.
    await expect(page.getByRole('link', { name: /Whiten a dark PDF/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Browse all 14 tools/ })).toBeVisible();
    await expect(page.getByRole('slider', { name: /Compare the original dark slide/ })).toBeVisible();
  });

  test('desktop keeps the original heading and hides the mobile carousel', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');

    await expect(page.getByRole('region', { name: 'Featured tools' })).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/Whiten dark slides, clean up scans, arrange pages/)).toBeVisible();
  });
});
