import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 4173);

// Browser smoke tests: open every page of the built portal as admin, employee and guest.
// Run with `npm run test:e2e` after `npm run build`; needs a PostgreSQL database (E2E_DATABASE_URL).
export default defineConfig({
  testDir: '.',
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    trace: 'retain-on-failure',
    // The portal's service worker would hide requests from page.route(); e2e/pwa.spec.ts allows it.
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    // GitHub's runners already have Chrome, so CI does not need to download a browser.
    ...(process.env.CI ? { channel: 'chrome' } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, grepInvert: /@mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: {
    command: 'node e2e/server.mjs',
    cwd: process.cwd(),
    url: `http://127.0.0.1:${port}/healthz`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
