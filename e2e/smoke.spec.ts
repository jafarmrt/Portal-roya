import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

type Role = 'admin' | 'employee' | 'guest';

const COMMON_TABS = [
  'dashboard', 'news', 'polls', 'colleagues', 'orgchart', 'departments', 'departments/فروش', 'search', 'documents', 'guides', 'training', 'calendar', 'systems',
];
const TABS: Record<Role, string[]> = {
  admin: [...COMMON_TABS, 'notifications', 'todos', 'suggestions', 'suggestions/management', 'suggestions/hr', 'reports', 'people', 'admin', 'audit'],
  employee: [...COMMON_TABS, 'notifications', 'todos', 'suggestions', 'suggestions/mine', 'suggestions/track'],
  guest: [...COMMON_TABS, 'notifications'],
};

const CRASH_TEXT = /نمایش این بخش با خطا|خطا در بارگذاری پرتال|پرتال به‌روزرسانی شده است/;

const data = () => JSON.parse(readFileSync('e2e/.auth/data.json', 'utf8')) as { newsId: string };

function useRole(role: Role) {
  test.use({ storageState: role === 'guest' ? { cookies: [], origins: [] } : `e2e/.auth/${role}.json` });
}

/** Records uncaught errors, console errors and failed server calls while a page is open. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`page error: ${err.message}`));
  page.on('console', (msg) => {
    // A guest is expected to get 401 for some signed-in-only calls; the browser logs those itself.
    if (msg.type() === 'error' && !/status of 401/.test(msg.text())) errors.push(`console: ${msg.text()}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 500) errors.push(`server ${res.status()}: ${res.url()}`);
  });
  return errors;
}

/** Opens a page and checks that it rendered real content, not a blank or crashed screen. */
async function expectPageWorks(page: Page, hash: string) {
  const errors = watchErrors(page);
  await page.goto(`/#${hash}`);
  const main = page.locator('#main');
  await expect(main).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#main .animate-spin')).toHaveCount(0);
  await expect(page.getByText(CRASH_TEXT)).toHaveCount(0);
  expect((await main.innerText()).trim().length, 'page content is empty').toBeGreaterThan(20);
  expect(errors).toEqual([]);
}

for (const role of ['admin', 'employee', 'guest'] as const) {
  test.describe(`${role}`, () => {
    useRole(role);

    for (const tab of TABS[role]) {
      test(`opens ${tab}`, async ({ page }) => {
        await expectPageWorks(page, tab);
      });
    }

    test('opens a news article', async ({ page }) => {
      await expectPageWorks(page, `news/${data().newsId}`);
      await expect(page.getByRole('dialog')).toContainText('متن کامل خبر');
    });

    test('dashboard and news work on a phone @mobile', async ({ page }) => {
      await expectPageWorks(page, 'dashboard');
      await expectPageWorks(page, 'news');
    });
  });
}

test.describe('after an update', () => {
  useRole('employee');

  test('a page opened before the update reloads instead of going blank', async ({ page }) => {
    // The first request for the news code fails, as when the old file was removed by an update.
    let failed = false;
    await page.route('**/assets/NewsModule-*.js', (route) => {
      if (failed) return route.continue();
      failed = true;
      return route.fulfill({ status: 404, body: '' });
    });
    await page.goto('/#dashboard');
    await expect(page.locator('#main')).toBeVisible();
    await page.goto('/#news');
    await expect(page.getByRole('heading', { name: 'اخبار و اطلاعیه‌ها' })).toBeVisible();
    expect(failed).toBe(true);
  });

  test('a missing code file is a 404, not the portal page', async ({ request }) => {
    const res = await request.get('/assets/NewsModule-old.js');
    expect(res.status()).toBe(404);
  });
});
