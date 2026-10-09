import path from 'node:path';
import { test, type Page } from '@playwright/test';

/**
 * Captures the main screens in light/dark x desktop/mobile. It never asserts
 * on pixels; each step is best-effort so one missing control cannot hide the
 * screenshots that did work. Output: visual-output/<theme>-<viewport>/NN-name.png
 */
const PDF = path.resolve(__dirname, '../fixtures/pdf/mixed.pdf');
const THEMES = ['dark', 'light'] as const;
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

async function shot(page: Page, dir: string, name: string): Promise<void> {
  await page.screenshot({ path: `visual-output/${dir}/${name}.png`, fullPage: name.startsWith('full') });
}

for (const theme of THEMES) {
  for (const vp of VIEWPORTS) {
    const dir = `${theme}-${vp.name}`;
    test(`screens ${dir}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.addInitScript((t) => localStorage.setItem('po:theme', t), theme);

      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await shot(page, dir, '01-home');

      await page.goto('/tools/dark-print/');
      await page.waitForLoadState('networkidle');
      await shot(page, dir, '02-upload');

      // Slow the CPU so the processing dialog is on screen long enough to capture.
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });

      try {
        await page.locator('input[type="file"]').first().setInputFiles(PDF);
        const whiten = page.getByRole('button', { name: /Whiten PDF/i });
        await whiten.waitFor({ state: 'visible', timeout: 60_000 });
        await page.waitForFunction(
          () => !Array.from(document.querySelectorAll('button')).find((b) => /Whiten PDF/i.test(b.textContent ?? ''))?.hasAttribute('disabled'),
          undefined,
          { timeout: 60_000 },
        );
        await shot(page, dir, '03-loaded');

        await whiten.click();
        try {
          await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 15_000 });
          await page.waitForTimeout(1200);
          await shot(page, dir, '04-processing');
        } catch {
          /* finished before the dialog could be captured */
        }

        await page.getByText(/Processed \d+ pages/i).waitFor({ timeout: 90_000 });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        await page.waitForTimeout(500);
        await shot(page, dir, '05-whitened');
        await shot(page, dir, 'full-05-whitened');

        await page.getByRole('button', { name: /Choose Layout/i }).click();
        await page.getByRole('button', { name: /Generate .*PDF|Download original PDF/i }).waitFor({ timeout: 60_000 });
        await page.waitForTimeout(800);
        await shot(page, dir, '06-layout');

        await page.getByRole('button', { name: /Generate .*PDF|Download original PDF/i }).click();
        await page.getByText(/File size/i).waitFor({ timeout: 90_000 });
        await page.waitForTimeout(500);
        await shot(page, dir, '07-done');
      } catch (err) {
        await shot(page, dir, '99-stopped-here');
        console.log(`[${dir}] flow stopped early: ${(err as Error).message.split('\n')[0]}`);
      }
    });
  }
}
