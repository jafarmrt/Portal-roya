import { expect, test } from '@playwright/test';

// The page keeps a live connection for updates. When it drops (Wi-Fi, a laptop waking up, an
// update restarting the server) the browser reconnects; whatever changed meanwhile must show up too.
test('a page catches up on what was published while its connection was down', async ({ browser }) => {
  const reader = await browser.newContext({ storageState: 'e2e/.auth/employee.json' });
  const page = await reader.newPage();
  const connected = page.waitForResponse((r) => r.url().endsWith('/api/events'));
  await page.goto('/#news');
  await connected;
  await expect(page.locator('article').first()).toBeVisible();

  await reader.setOffline(true);
  const admin = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
  const title = 'خبر هنگام قطعی اتصال';
  const res = await admin.request.post('/api/news', { data: { title, summary: 'خلاصه', content: 'متن', category: 'اخبار' } });
  expect(res.ok()).toBe(true);
  await page.waitForTimeout(1000);
  await reader.setOffline(false);

  await expect(page.locator('article', { hasText: title })).toBeVisible({ timeout: 20_000 });
  await admin.close();
  await reader.close();
});
