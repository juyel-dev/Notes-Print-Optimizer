import { defineConfig } from '@playwright/test';

/**
 * Visual capture (NOT assertions): drives the real app through the main
 * screens and saves PNGs so a reviewer can look at a PR's UI without running
 * it locally. CI uploads `visual-output/` as an artifact. Chromium only.
 */
export default defineConfig({
  testDir: './tests/visual',
  outputDir: './visual-output/.pw',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3000', headless: true },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run start',
    port: 3000,
    timeout: 30_000,
    reuseExistingServer: true,
  },
});
