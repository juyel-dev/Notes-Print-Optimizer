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

  for (const width of [320, 360, 390]) {
    test(`no horizontal overflow and nothing clipped at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      await expect(page.getByRole('region', { name: 'Featured tools' })).toBeVisible();

      // Regression: the carousel's shrink-0 slides used to blow the hero grid column wide.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);

      // Both hero buttons sit fully inside the viewport.
      for (const name of [/Whiten a dark PDF/, /Browse all tools/]) {
        const box = await page.getByRole('link', { name }).boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5);
      }

      // The before/after demo is not wider than the viewport.
      const demo = await page.getByRole('slider', { name: /Compare the original dark slide/ }).boundingBox();
      expect(demo).not.toBeNull();
      expect(demo!.x + demo!.width).toBeLessThanOrEqual(width + 0.5);

      // The first slide's CTA is not cut off by the card's overflow clipping.
      const card = page.getByRole('region', { name: 'Featured tools' }).getByRole('link').first();
      const cardBox = await card.boundingBox();
      const ctaBox = await card.getByText('Explore tool').boundingBox();
      expect(cardBox).not.toBeNull();
      expect(ctaBox).not.toBeNull();
      expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(cardBox!.y + cardBox!.height);
    });
  }

  test('install instructions open as a full-screen dialog, not clipped inside the header', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await page.getByRole('button', { name: 'Install Print Optimizer' }).click();
    const dialog = page.getByRole('dialog', { name: 'Install Print Optimizer' });
    await expect(dialog).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(180); // would be <= 56px if trapped by the header's backdrop-filter
    await expect(page.getByRole('button', { name: 'Got it' })).toBeInViewport();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('landing-only header chrome is scoped to the home route', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/tools/dark-print/');
    await expect(page.getByText('Smart PDF & Document Tools')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Install Print Optimizer' })).toHaveCount(0);
  });

  test('carousel dots follow the selected slide without flicker', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await page.getByRole('button', { name: 'Pause automatic rotation' }).click();
    await page.getByRole('button', { name: 'Next banner' }).click();
    await expect(page.getByRole('button', { name: /Show banner 2/ })).toHaveAttribute('aria-pressed', 'true');
    // Hold through the smooth-scroll animation: the pressed dot must not revert.
    await page.waitForTimeout(900);
    await expect(page.getByRole('button', { name: /Show banner 2/ })).toHaveAttribute('aria-pressed', 'true');
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
