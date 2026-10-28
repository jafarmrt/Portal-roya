import { expect, test, type Browser } from '@playwright/test';

const asRole = async (browser: Browser, role: 'admin' | 'employee') => {
  const context = await browser.newContext({ storageState: `e2e/.auth/${role}.json` });
  return { context, page: await context.newPage() };
};

// «یادداشت کارهای من» ships switched off; once the administrator switches it on, a colleague writes
// a note on the dashboard, adds a circular to the list from the news page, ticks a note off and
// goes back to the circular from its note.
test.describe('personal to-do notes', () => {
  test.describe.configure({ mode: 'serial' });

  test('is hidden until the administrator switches it on', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'employee');
    await page.goto('/#dashboard');
    await expect(page.getByRole('region', { name: 'کارهای من' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'یادداشت کارهای من' })).toHaveCount(0);
    await context.close();

    const admin = await asRole(browser, 'admin');
    const res = await admin.page.request.put('/api/settings/features/todos', { data: { state: 'on' } });
    expect(res.ok()).toBe(true);
    await admin.context.close();
  });

  test('a colleague writes notes, adds a circular and ticks a note off', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'employee');
    await page.goto('/#dashboard');
    const card = page.getByRole('region', { name: 'یادداشت کارهای من' });
    await expect(card).toContainText('فقط خودتان می‌بینید');
    await card.getByRole('textbox', { name: 'کار تازه' }).fill('تمدید بیمهٔ تکمیلی');
    await card.getByRole('button', { name: 'افزودن' }).click();
    await expect(card.getByRole('checkbox', { name: 'انجام شد: تمدید بیمهٔ تکمیلی' })).toBeVisible();

    await page.goto('/#news');
    await page.getByRole('button', { name: 'بخشنامهٔ ایمنی' }).first().click();
    const article = page.getByRole('dialog', { name: 'بخشنامهٔ ایمنی' });
    await article.getByRole('button', { name: 'افزودن به یادداشت کارهای من' }).click();
    const form = page.getByRole('dialog', { name: 'افزودن به یادداشت کارهای من' });
    await expect(form.getByLabel('چه کاری؟')).toHaveValue('مطالعه و تأیید: بخشنامهٔ ایمنی');
    await form.getByRole('button', { name: 'افزودن', exact: true }).click();
    await expect(form).toBeHidden();
    await expect(article.getByRole('button', { name: 'در یادداشت کارهای من' })).toBeVisible();
    await article.getByRole('button', { name: 'بستن' }).last().click();

    await page.goto('/#dashboard');
    await card.getByRole('checkbox', { name: 'انجام شد: تمدید بیمهٔ تکمیلی' }).click();
    await expect(card.getByRole('button', { name: /انجام‌شده‌ها/ })).toContainText('۱');
    await card.getByRole('button', { name: 'رفتن به خبر' }).click();
    await expect(page.getByRole('dialog', { name: 'بخشنامهٔ ایمنی' })).toBeVisible();
    await context.close();
  });

  test('switched off again so the other browser tests see the portal as shipped', async ({ browser }) => {
    const admin = await asRole(browser, 'admin');
    const res = await admin.page.request.put('/api/settings/features/todos', { data: { state: 'off' } });
    expect(res.ok()).toBe(true);
    await admin.context.close();
  });
});
