import { expect, test, type Browser } from '@playwright/test';

const asRole = async (browser: Browser, role: 'admin' | 'employee') => {
  const context = await browser.newContext({ storageState: `e2e/.auth/${role}.json` });
  return { context, page: await context.newPage() };
};

// «کارهای ارجاعی»: the administrator hands a task to a colleague in the pilot group; she accepts it
// from the dashboard, finishes it on the page, and the administrator sees it done.
test.describe('assigned tasks', () => {
  test('a task goes to a colleague, who accepts and finishes it', async ({ browser }) => {
    const admin = await asRole(browser, 'admin');
    // It starts in preview: Sara joins the pilot group first.
    const people = (await (await admin.page.request.get('/api/employees')).json()) as { id: string; username: string }[];
    const sara = people.find((p) => p.username === 'sara')!;
    expect((await admin.page.request.put('/api/settings/pilot', { data: { roles: [], userIds: [sara.id] } })).ok()).toBe(true);

    await admin.page.goto('/#tasks');
    await expect(admin.page.getByRole('heading', { name: 'کارهای ارجاعی' })).toBeVisible();
    await admin.page.getByRole('button', { name: 'سپردن کار' }).first().click();
    const form = admin.page.getByRole('dialog', { name: 'سپردن کار به همکار' });
    await form.getByLabel(/به چه کسی/).fill('سارا');
    await form.getByRole('button', { name: /سارا احمدی/ }).click();
    await form.getByLabel('چه کاری؟').fill('گزارش فروش آبان');
    await form.getByRole('button', { name: 'فردا' }).click();
    await form.getByLabel('توضیح (اختیاری)').fill('نسخهٔ اکسل لازم است');
    await form.getByRole('button', { name: 'سپردن کار' }).click();
    await expect(form).toBeHidden();
    await admin.page.getByRole('tab', { name: /سپرده‌ام/ }).click();
    const given = admin.page.getByRole('article', { name: 'گزارش فروش آبان' });
    await expect(given).toContainText('منتظر پاسخ');

    const { context, page } = await asRole(browser, 'employee');
    await page.goto('/#dashboard');
    const strip = page.getByRole('group', { name: 'کارهای ارجاعی به من' });
    await expect(strip).toContainText('گزارش فروش آبان');
    await expect(strip).toContainText('ارجاعی');
    await strip.getByRole('button', { name: 'پذیرفتن گزارش فروش آبان' }).click();
    await expect(strip.getByRole('checkbox', { name: 'انجام شد: گزارش فروش آبان' })).toBeVisible();

    await page.goto('/#tasks');
    const mine = page.getByRole('article', { name: 'گزارش فروش آبان' });
    await expect(mine).toContainText('نسخهٔ اکسل لازم است');
    await expect(mine).toContainText('پذیرفته شد');
    await mine.getByRole('button', { name: 'انجام شد' }).click();
    await mine.getByLabel('توضیح کوتاه').fill('فایل را ایمیل کردم');
    await mine.getByRole('button', { name: 'ثبت «انجام شد»' }).click();
    await expect(mine).toContainText('انجام شد');
    await context.close();

    await expect(given).toContainText('انجام شد');
    await expect(given).toContainText('فایل را ایمیل کردم');
    await admin.context.close();
  });
});
