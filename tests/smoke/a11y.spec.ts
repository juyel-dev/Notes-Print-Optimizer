import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility regression guard (audit phase 6 left every tool page and the
 * main post-upload screens free of axe violations; this keeps it that way).
 * Rules: WCAG 2.0/2.1/2.2 A+AA and axe best-practices, in light and dark.
 * The tool list is read from the registry so new tools are covered automatically.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const PDF = path.resolve(__dirname, '../fixtures/pdf/text.pdf');

const registry = readFileSync(path.resolve(__dirname, '../../lib/tools/registry.ts'), 'utf8');
const SLUGS = [...registry.matchAll(/slug:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);

async function expectNoViolations(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = violations
    .map((v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}`)
    .join('\n');
  expect(violations, `${label}\n${summary}`).toEqual([]);
}

test.describe('a11y: no axe violations', () => {
  test('tool list was read from the registry', () => {
    expect(SLUGS.length).toBeGreaterThanOrEqual(14);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test.describe(scheme, () => {
      test.use({ colorScheme: scheme, viewport: { width: 1280, height: 900 } });

      test(`home page (${scheme})`, async ({ page }) => {
        await page.goto('/');
        await page.locator('h1').first().waitFor();
        await expectNoViolations(page, `/ [${scheme}]`);
      });

      for (const slug of SLUGS) {
        test(`/tools/${slug}/ (${scheme})`, async ({ page }) => {
          await page.goto(`/tools/${slug}/`);
          await page.locator('input[type="file"], textarea, input').first().waitFor({ state: 'attached', timeout: 30_000 });
          await expectNoViolations(page, `/tools/${slug}/ [${scheme}]`);
        });
      }
    });
  }

  test('Dark Print review screen after upload (light + mobile)', async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/tools/dark-print/');
    await page.locator('input[type="file"]').first().setInputFiles(PDF);
    await page.locator('button', { hasText: /^Whiten PDF/ }).click({ timeout: 60_000 });
    await page.locator('button', { hasText: /Choose Layout/ }).waitFor({ timeout: 120_000 });
    await page.waitForTimeout(2000);
    await expectNoViolations(page, 'dark-print whiten step [mobile]');
  });

  test('N-up layout screen after upload (dark)', async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/tools/n-up/');
    await page.locator('input[type="file"]').first().setInputFiles(PDF);
    await page.locator('button', { hasText: /Continue to layout/ }).click({ timeout: 60_000 });
    await page.locator('button', { hasText: /^4-up/ }).waitFor({ timeout: 30_000 });
    await expectNoViolations(page, 'n-up layout step [dark]');
  });
});
