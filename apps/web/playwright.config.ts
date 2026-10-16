import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:4179',
    browserName: 'chromium',
    channel: 'chrome',
    serviceWorkers: 'block',
    hasTouch: true,
    isMobile: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    { name: 'mobile-320', use: { viewport: { width: 320, height: 740 } } },
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'pnpm exec vite --config vite.browser.config.ts',
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
