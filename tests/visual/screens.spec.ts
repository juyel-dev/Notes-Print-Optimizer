import path from 'node:path';
import { test, type Page } from '@playwright/test';
import {
  isPageSelected,
  SELECTED_PAGE_IDS,
  THEMES,
  VIEWPORTS,
  viewportSize,
} from './selection';

const PDF = path.resolve(__dirname, '../fixtures/pdf/mixed.pdf');

async function shot(
  page: Page,
  theme: string,
  viewport: string,
  name: string,
  fullPage = false,
): Promise<void> {
  await page.screenshot({
    path: `visual-output/dark-print/${theme}-${viewport}/${name}.png`,
    fullPage,
  });
}

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    if (isPageSelected('home')) {
      test(`screenshot home (${theme}, ${viewport.name})`, async ({ page }) => {
        await page.setViewportSize(viewportSize(viewport));
        await page.addInitScript((selectedTheme: string) => {
          localStorage.setItem('po:theme', selectedTheme);
        }, theme);

        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await page.screenshot({
          path: `visual-output/home/${theme}-${viewport.name}/home.png`,
          fullPage: true,
        });
      });
    }

    if (isPageSelected('dark-print')) {
      test(`screenshot dark-print flow (${theme}, ${viewport.name})`, async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize(viewportSize(viewport));
        await page.addInitScript((selectedTheme: string) => {
          localStorage.setItem('po:theme', selectedTheme);
        }, theme);

        await page.goto('/tools/dark-print/');
        await page.waitForLoadState('networkidle');
        await shot(page, theme, viewport.name, '01-upload');

        const cdp = await page.context().newCDPSession(page);
        try {
          // Slow the CPU so the processing dialog remains visible long enough to capture.
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });

          await page.locator('input[type="file"]').first().setInputFiles(PDF);
          const whiten = page.getByRole('button', { name: /Whiten PDF/i });
          await whiten.waitFor({ state: 'visible', timeout: 60_000 });
          await page.waitForFunction(
            () => !Array.from(document.querySelectorAll('button')).find(
              (button) => /Whiten PDF/i.test(button.textContent ?? ''),
            )?.hasAttribute('disabled'),
            undefined,
            { timeout: 60_000 },
          );
          await shot(page, theme, viewport.name, '02-loaded');

          await whiten.click();
          try {
            await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 15_000 });
            await page.waitForTimeout(1_200);
            await shot(page, theme, viewport.name, '03-processing');
          } catch {
            // Processing can finish before the dialog becomes visible.
          }

          await page.getByText(/Processed \d+ pages/i).waitFor({ timeout: 90_000 });
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
          await page.waitForTimeout(500);
          await shot(page, theme, viewport.name, '04-whitened');
          await shot(page, theme, viewport.name, 'full-04-whitened', true);

          await page.getByRole('button', { name: /Choose Layout/i }).click();
          const generate = page.getByRole('button', { name: /Generate .*PDF|Download original PDF/i });
          await generate.waitFor({ timeout: 60_000 });
          await page.waitForTimeout(800);
          await shot(page, theme, viewport.name, '05-layout');

          await generate.click();
          await page.getByText(/File size/i).waitFor({ timeout: 90_000 });
          await page.waitForTimeout(500);
          await shot(page, theme, viewport.name, '06-done');
        } catch (error) {
          console.log(
            `[dark-print/${theme}-${viewport.name}] flow stopped early: ${(error as Error).message.split('\n')[0]}`,
          );
          await shot(page, theme, viewport.name, '99-stopped-here');
        } finally {
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => undefined);
          await cdp.detach().catch(() => undefined);
        }

        // Capture the file-validation state only when dark-print was explicitly selected.
        try {
          await page.goto('/tools/dark-print/');
          await page.waitForLoadState('networkidle');
          await page.locator('input[type="file"]').first().setInputFiles({
            name: 'notes.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('not a pdf'),
          });
          await page.waitForTimeout(1_200);
          await shot(page, theme, viewport.name, '07-upload-error');
        } catch (error) {
          console.log(
            `[dark-print/${theme}-${viewport.name}] upload-error capture skipped: ${(error as Error).message.split('\n')[0]}`,
          );
        }
      });
    }
  }
}

if (SELECTED_PAGE_IDS.length === 0) {
  throw new Error('No screenshot pages were selected. Refusing to run an empty capture suite.');
}
