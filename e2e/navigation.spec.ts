import { expect, test, type Page } from '@playwright/test';

// The desktop menu measures itself: what does not fit goes into «بیشتر», and «مدیریت» stays at the end.
test.use({ storageState: 'e2e/.auth/admin.json' });

const mainMenu = (page: Page) => page.getByRole('navigation', { name: 'منوی اصلی' });

test.describe('desktop menu of an administrator', () => {
  for (const width of [1024, 1280, 1366, 1440]) {
    test(`fits a ${width}px screen without scrolling sideways`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/#dashboard');
      await expect(mainMenu(page).getByRole('button', { name: /داشبورد/ })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      for (const box of await mainMenu(page).getByRole('button').evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().toJSON()))) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width);
      }
      await mainMenu(page).getByRole('button', { name: /مدیریت/ }).click();
      await page.getByRole('menuitem', { name: 'تنظیمات' }).click();
      await expect(page).toHaveURL(/#admin/);
    });
  }

  test('opens the pages that did not fit from «بیشتر»', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/#dashboard');
    await mainMenu(page).getByRole('button', { name: /بیشتر/ }).click();
    await page.getByRole('menuitem', { name: 'یادداشت‌های من' }).click();
    await expect(page).toHaveURL(/#todos/);
    // «بیشتر» keeps its name and shows that the open page is inside it.
    await expect(mainMenu(page).getByRole('button', { name: /بیشتر/ })).toHaveAttribute('aria-current', 'page');
  });

  test('has no «بیشتر» when everything fits', async ({ page }) => {
    // The bar is as wide as the page content; here it is widened to show that it then holds every page.
    await page.setViewportSize({ width: 1920, height: 800 });
    await page.goto('/#dashboard');
    await expect(mainMenu(page).getByRole('button', { name: /بیشتر/ })).toBeVisible();
    await page.evaluate(() => document.querySelector('nav[aria-label="منوی اصلی"] .max-w-7xl')?.classList.replace('max-w-7xl', 'max-w-none'));
    await expect(mainMenu(page).getByRole('button', { name: /بیشتر/ })).toHaveCount(0);
    await expect(mainMenu(page).getByRole('button', { name: 'یادداشت‌های من' })).toBeVisible();
  });
});
