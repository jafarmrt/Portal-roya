import { expect, test, type Page } from '@playwright/test';

// Phones: every page fits the screen, forms do not pop the keyboard up by themselves, and the
// small buttons are big enough for a finger. Runs in the "mobile" project (a touch-screen phone).

const COMMON_TABS = [
  'dashboard', 'news', 'polls', 'colleagues', 'orgchart', 'departments', 'departments/فروش', 'search', 'documents', 'guides', 'training', 'calendar', 'systems', 'notifications',
];
const TABS = {
  admin: [...COMMON_TABS, 'suggestions', 'suggestions/management', 'suggestions/hr', 'reports', 'people', 'admin', 'audit'],
  employee: [...COMMON_TABS, 'suggestions', 'suggestions/mine', 'suggestions/track'],
  guest: COMMON_TABS,
};

/** How many pixels the page can be scrolled sideways; 0 when it fits the screen. */
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const role of ['admin', 'employee', 'guest'] as const) {
  test.describe(`${role} on a small phone`, () => {
    // 360px is the narrowest common Android phone.
    test.use({
      storageState: role === 'guest' ? { cookies: [], origins: [] } : `e2e/.auth/${role}.json`,
      viewport: { width: 360, height: 740 },
    });

    test(`every page fits the screen @mobile`, async ({ page }) => {
      for (const tab of TABS[role]) {
        await page.goto(`/#${tab}`);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#main .animate-spin')).toHaveCount(0);
        expect(await sideways(page), `#${tab} scrolls sideways`).toBeLessThanOrEqual(1);
        await expect(page.locator('header')).toBeInViewport({ ratio: 1 });
      }
    });
  });
}

test.describe('on a phone', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('the header fits even a 320px screen @mobile', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/#dashboard');
    await expect(page.getByRole('button', { name: 'منوی حساب کاربری' })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'تغییر منوی همراه' })).toBeInViewport({ ratio: 1 });
    expect(await sideways(page)).toBeLessThanOrEqual(1);
  });

  test('a form opens without popping up the keyboard @mobile', async ({ page }) => {
    await page.goto('/#news');
    await page.getByRole('button', { name: /انتشار خبر/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();
    expect(await sideways(page)).toBeLessThanOrEqual(1);
  });

  test('icon buttons are big enough for a finger @mobile', async ({ page }) => {
    await page.goto('/#news');
    const remove = page.locator('#main').getByRole('button', { name: 'حذف' }).first();
    await expect(remove).toBeVisible();
    const box = (await remove.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(36);
    expect(box.height).toBeGreaterThanOrEqual(36);
  });

  test('the bottom bar shows the current page @mobile', async ({ page }) => {
    await page.goto('/#news');
    const bar = page.locator('#mobile-bottom-nav');
    await expect(bar.getByRole('button', { name: 'اخبار' })).toHaveAttribute('aria-current', 'page');
    await bar.getByRole('button', { name: 'داشبورد' }).click();
    await expect(bar.getByRole('button', { name: 'داشبورد' })).toHaveAttribute('aria-current', 'page');
  });

  test('settings open a tab from the drop-down @mobile', async ({ page }) => {
    await page.goto('/#admin/general');
    await page.getByLabel('بخش تنظیمات').selectOption({ label: 'فهرست‌ها' });
    await expect(page).toHaveURL(/#admin\/lists$/);
    await expect(page.locator('section[aria-labelledby="locations-title"]')).toBeVisible();
  });
});
