import { test, expect } from '@playwright/test';

test.describe('mobile-only landing hero carousel', () => {
  test('mobile shows the feature carousel in place of the hero copy', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await expect(page.getByRole('region', { name: 'Featured tools' })).toBeVisible();
    await expect(page.getByText(/Private by default · 100% on-device/)).toBeHidden();
    await expect(
      page.getByRole('region', { name: 'Featured tools' }).getByRole('link', { name: /Dark Notes → Print/ })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next banner' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Show banner 1/ })).toBeVisible();

    // Keep the original SEO heading in the DOM, but remove its visual block
    // and supporting paragraph from the phone layout.
    await expect(page.locator('h1')).toHaveClass(/sr-only/);
    await expect(page.getByText(/Whiten dark slides, clean up scans, arrange pages/)).toBeHidden();

    // Existing actions and before/after demo remain in the mobile hero.
    await expect(page.getByRole('link', { name: /Whiten a dark PDF/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Browse all tools/ })).toBeVisible();
    await expect(page.getByText('Free · No account · No login')).toBeVisible();

    const whitenButton = page.getByRole('link', { name: /Whiten a dark PDF/ });
    const browseButton = page.getByRole('link', { name: /Browse all tools/ });
    const whitenBox = await whitenButton.boundingBox();
    const browseBox = await browseButton.boundingBox();
    expect(whitenBox).not.toBeNull();
    expect(browseBox).not.toBeNull();
    expect(Math.abs(whitenBox!.y - browseBox!.y)).toBeLessThan(1);

    await expect(page.getByRole('slider', { name: /Compare the original dark slide/ })).toBeVisible();
  });

  test('install action appears only on the mobile landing page and becomes theme toggle after install', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const installButton = page.getByRole('button', { name: 'Install Print Optimizer' });
    await expect(installButton).toBeVisible();

    // Dispatch only after the PWA hook has mounted and registered its listener.
    await page.evaluate(() => {
      const installEvent = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: 'accepted'; platform: string }>;
      };
      installEvent.prompt = async () => {};
      installEvent.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
      window.dispatchEvent(installEvent);
    });

    await installButton.click();
    await expect(page.getByRole('button', { name: /Switch to (dark|light) theme/ })).toBeVisible();

    await page.goto('/tools/merge-pdf/');
    await expect(page.getByRole('button', { name: 'Install Print Optimizer' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Switch to (dark|light) theme/ })).toBeVisible();
  });

  test('desktop keeps the original heading and hides the mobile carousel', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');

    await expect(page.getByRole('region', { name: 'Featured tools' })).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/Private by default · 100% on-device/)).toBeVisible();
    await expect(page.getByText(/Whiten dark slides, clean up scans, arrange pages/)).toBeVisible();
    await expect(page.getByText('Free · No account · No upload')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Install Print Optimizer' })).toHaveCount(0);
  });
});
