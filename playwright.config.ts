import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/smoke',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    // Real Next.js server (hybrid mode) — out/ no longer exists once
    // output:'export' is removed. See docs/hybrid-architecture-migration.md.
    command: 'npm run start',
    port: 3000,
    timeout: 30000,
    reuseExistingServer: true,
  },
});
