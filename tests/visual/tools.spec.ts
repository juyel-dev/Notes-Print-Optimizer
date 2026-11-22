import { test, type Page } from '@playwright/test';
import {
  isToolPage,
  SELECTED_PAGE_IDS,
  THEMES,
  VIEWPORTS,
  viewportSize,
} from './selection';

async function shot(
  page: Page,
  pageId: string,
  theme: string,
  viewport: string,
): Promise<void> {
  await page.screenshot({
    path: `visual-output/${pageId}/${theme}-${viewport}/landing.png`,
    fullPage: false,
  });
}

// Each selected tool gets its own test. A failing route does not prevent the
// other explicitly selected pages from being captured.
for (const pageId of SELECTED_PAGE_IDS.filter(isToolPage)) {
  for (const theme of THEMES) {
    for (const viewport of VIEWPORTS) {
      test(`screenshot ${pageId} (${theme}, ${viewport.name})`, async ({ page }) => {
        await page.setViewportSize(viewportSize(viewport));
        await page.addInitScript((selectedTheme: string) => {
          localStorage.setItem('po:theme', selectedTheme);
        }, theme);

        await page.goto(`/tools/${pageId}/`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(300);
        await shot(page, pageId, theme, viewport.name);
      });
    }
  }
}
