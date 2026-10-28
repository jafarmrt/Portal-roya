import { expect, test, type Browser } from '@playwright/test';

const TITLE = 'جلسهٔ هماهنگی فروش';

const asRole = async (browser: Browser, role: 'admin' | 'employee') => {
  const context = await browser.newContext({ storageState: `e2e/.auth/${role}.json` });
  return { context, page: await context.newPage() };
};

// A calendar manager adds a meeting for the sales department that asks who will attend; the
// colleague in sales is told, finds it under "my tasks", answers and can add it to Outlook; the
// manager sees the answer by name and cancels the meeting.
test.describe('calendar events with an audience and attendance', () => {
  test.describe.configure({ mode: 'serial' });

  test('a calendar manager adds a meeting for one department', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'admin');
    await page.goto('/#calendar');
    await page.getByRole('button', { name: 'افزودن رویداد جدید' }).click();
    const dialog = page.getByRole('dialog', { name: 'افزودن رویداد جدید به تقویم' });
    await dialog.locator('#event-title').fill(TITLE);
    await expect(dialog.locator('#event-end-time')).toBeDisabled();
    await dialog.locator('#event-time').fill('10:00');
    await dialog.locator('#event-end-time').fill('11:30');
    await dialog.locator('#event-location').fill('اتاق جلسات');
    await dialog.getByRole('button', { name: 'گروه یا افراد مشخص' }).click();
    await dialog.getByRole('button', { name: 'فروش', exact: true }).click();
    await expect(dialog.getByRole('checkbox', { name: /اعلان بده/ })).toBeChecked();
    await dialog.getByRole('checkbox', { name: /شرکت می‌کنم \/ نمی‌کنم/ }).check();
    await dialog.getByRole('button', { name: 'ذخیره رویداد' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: new RegExp(TITLE) }).first().click();
    const details = page.getByRole('dialog', { name: TITLE });
    await expect(details).toContainText('ساعت ۱۰:۰۰ تا ۱۱:۳۰');
    await expect(details).toContainText('برای: فروش');
    await expect(details).toContainText('۱ نفر هنوز پاسخ نداده‌اند');
    // The admin is not in sales, so it is not theirs to answer.
    await expect(details.getByRole('button', { name: 'شرکت می‌کنم' })).toHaveCount(0);
    await context.close();
  });

  test('the colleague is told, answers from “my tasks” and adds it to Outlook', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'employee');
    await page.goto('/#notifications');
    const inbox = page.getByRole('main');
    await inbox.getByRole('button', { name: 'تقویم', exact: true }).click();
    await expect(inbox.getByRole('heading', { name: 'جلسه در تقویم 📅' }).first()).toBeVisible();
    await expect(inbox).toContainText(`${TITLE}، `);
    await expect(inbox).toContainText('ساعت ۱۰:۰۰ تا ۱۱:۳۰، اتاق جلسات — شرکت می‌کنید؟');

    await page.goto('/#dashboard');
    const tasks = page.getByRole('region', { name: 'منتظر اقدام شما', exact: true });
    await expect(tasks).toContainText('شرکت می‌کنید؟');
    await tasks.getByRole('button', { name: new RegExp(TITLE) }).click();
    const details = page.getByRole('dialog', { name: TITLE });
    await expect(details).toContainText('شما شرکت می‌کنید؟');
    await details.getByRole('button', { name: 'شرکت می‌کنم' }).click();
    await expect(details.getByRole('button', { name: 'شرکت می‌کنم' })).toHaveAttribute('aria-pressed', 'true');
    await expect(details).toContainText('۱ نفر شرکت می‌کنند');

    const outlook = details.getByRole('link', { name: 'افزودن به Outlook' });
    const ics = await page.request.get((await outlook.getAttribute('href'))!);
    expect(ics.headers()['content-type']).toContain('text/calendar');
    expect((await ics.text()).replace(/\r\n /g, '')).toContain(`SUMMARY:${TITLE}`);
    await details.getByRole('button', { name: 'بستن' }).first().click();

    // The week list shows the answer next to the meeting.
    await page.getByRole('button', { name: 'هفته', exact: true }).click();
    const week = page.getByRole('list', { name: 'برنامهٔ هفته' });
    await expect(week.locator('[aria-current="date"]')).toContainText(TITLE);
    await expect(week.locator('[aria-current="date"]')).toContainText('شرکت می‌کنید');
    await context.close();
  });

  test('the manager sees who is coming and cancels the meeting', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'admin');
    await page.goto('/#calendar');
    await page.getByRole('button', { name: new RegExp(TITLE) }).first().click();
    const details = page.getByRole('dialog', { name: TITLE });
    await details.getByRole('button', { name: 'فهرست نام‌ها' }).click();
    const names = details.getByRole('list', { name: 'پاسخ همکاران' });
    await expect(names.getByRole('listitem').filter({ hasText: 'سارا احمدی' })).toContainText('شرکت می‌کند');

    page.once('dialog', (confirm) => confirm.accept());
    await details.getByRole('button', { name: 'حذف این رویداد' }).click();
    await expect(details).toBeHidden();
    await expect(page.getByRole('button', { name: new RegExp(TITLE) })).toHaveCount(0);
    await context.close();
  });
});

test.describe('calendar on a phone', () => {
  test.use({ storageState: 'e2e/.auth/employee.json' });

  test('opens on this week’s list @mobile', async ({ page }) => {
    await page.goto('/#calendar');
    await expect(page.getByRole('button', { name: 'هفته', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: /^این هفته/ })).toBeVisible();
    await expect(page.getByRole('list', { name: 'برنامهٔ هفته' }).locator('[aria-current="date"]')).toContainText('امروز');
  });
});
