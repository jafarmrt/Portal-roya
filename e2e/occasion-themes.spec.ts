import { expect, test, type Page } from '@playwright/test';

// Yalda 1405 (30 Azar = 21 December 2026): the dashboard gets its banner everywhere, and the
// effect plays only on a computer, once a day. The part is in preview, so only the admin sees it.

const YALDA = new Date('2026-12-21T09:00:00+03:30');
const ORDINARY_DAY = new Date('2026-10-29T09:00:00+03:30');

test.use({ storageState: 'e2e/.auth/admin.json' });

async function preview(page: Page) {
  const res = await page.request.put('/api/settings/features/occasionThemes', { data: { state: 'preview' } });
  expect(res.ok()).toBe(true);
}

test('Yalda brings its banner and a one-minute effect on a computer, once a day', async ({ page }) => {
  await preview(page);
  await page.clock.setFixedTime(YALDA);
  await page.goto('/#dashboard');
  const banner = page.getByTestId('day-theme-banner');
  await expect(banner).toContainText('یلدا مبارک');
  await expect(page.getByTestId('theme-effect')).toBeVisible();
  // The effect does not catch the mouse: the page under it still answers clicks.
  await page.getByRole('button', { name: 'مشاهده همه اخبار' }).click();
  await expect(page).toHaveURL(/#news/);
  // Leaving the dashboard ends it.
  await expect(page.getByTestId('theme-effect')).toHaveCount(0);

  // The next visit that day shows the banner only; it can be played again by hand and stopped.
  await page.goto('/#dashboard');
  await expect(banner).toBeVisible();
  await expect(page.getByTestId('theme-effect')).toHaveCount(0);
  await banner.getByRole('button', { name: 'دوباره ببینم' }).click();
  await expect(page.getByTestId('theme-effect')).toBeVisible();
  await page.getByRole('button', { name: 'توقف افکت' }).click();
  await expect(page.getByTestId('theme-effect')).toHaveCount(0);
});

test('an ordinary day has no banner', async ({ page }) => {
  await preview(page);
  await page.clock.setFixedTime(ORDINARY_DAY);
  await page.goto('/#dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByTestId('day-theme-banner')).toHaveCount(0);
});

test('a phone gets the banner without any effect @mobile', async ({ page }) => {
  await preview(page);
  await page.clock.setFixedTime(YALDA);
  await page.goto('/#dashboard');
  await expect(page.getByTestId('day-theme-banner')).toContainText('یلدا مبارک');
  await expect(page.getByRole('button', { name: 'دوباره ببینم' })).toHaveCount(0);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('theme-effect')).toHaveCount(0);
});
