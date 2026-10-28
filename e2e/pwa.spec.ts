import { expect, test } from '@playwright/test';

// Installing the portal as an app: the manifest, its icons and the service worker. The other tests
// block service workers (playwright.config.ts); these let it run, as on a phone over HTTPS.
test.use({ storageState: 'e2e/.auth/employee.json', serviceWorkers: 'allow' });

test('the app manifest and its icons are served', async ({ page, request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/manifest+json');
  expect(res.headers()['cache-control']).toBe('no-cache');
  const manifest = await res.json();
  expect(manifest).toMatchObject({ short_name: 'پرتال رویا', dir: 'rtl', lang: 'fa', start_url: '/', display: 'standalone' });
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  }
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
});

test('the service worker shows the offline page and never answers /api', async ({ page, context }) => {
  const sw = await page.request.get('/sw.js');
  expect(sw.headers()['cache-control']).toBe('no-cache');

  await page.goto('/#dashboard');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The first page was loaded before the worker existed; from the next load on, it handles pages.
  await page.reload();
  await expect(page.locator('#main')).toBeVisible();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  const api = page.waitForResponse((res) => res.url().includes('/api/'));
  await page.reload();
  expect((await api).fromServiceWorker()).toBe(false);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'پرتال در دسترس نیست' })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('link', { name: 'دوباره امتحان کنید' }).click();
  await expect(page.locator('#main')).toBeVisible();
});

test('the footer explains how to install the portal on a phone', async ({ page }) => {
  await page.goto('/#dashboard');
  await page.getByRole('button', { name: 'نصب پرتال روی گوشی' }).click();
  const dialog = page.getByRole('dialog');
  // A computer sees the steps for both phones and for itself.
  await expect(dialog.getByRole('heading', { name: 'آیفون و آیپد' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'اندروید' })).toBeVisible();
  await dialog.getByRole('button', { name: 'متوجه شدم' }).click();
  await expect(dialog).toHaveCount(0);
});

test('an Android phone sees only its own steps @mobile', async ({ page }) => {
  await page.goto('/#dashboard');
  await page.getByRole('button', { name: 'نصب پرتال روی گوشی' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'اندروید' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'آیفون و آیپد' })).toHaveCount(0);
});
