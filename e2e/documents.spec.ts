import { expect, test, type Browser } from '@playwright/test';

const TITLE = 'آیین‌نامهٔ تخفیف فروش';

const asRole = async (browser: Browser, role: 'admin' | 'employee') => {
  const context = await browser.newContext({ storageState: `e2e/.auth/${role}.json` });
  return { context, page: await context.newPage() };
};

const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4 ${name}`) });

// A mandatory document for one department: confirmed by the employee, then replaced by a new
// version that has to be confirmed again, with the earlier file kept in the history.
test.describe('mandatory documents', () => {
  test.describe.configure({ mode: 'serial' });

  test('a document manager adds a mandatory document for one department', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'admin');
    await page.goto('/#documents');
    await page.getByRole('button', { name: 'افزودن سند' }).click();
    const dialog = page.getByRole('dialog', { name: 'افزودن سند یا فرم' });
    await dialog.locator('input[type="file"]').setInputFiles(pdf('discounts-v1.pdf'));
    await expect(dialog).toContainText('discounts-v1.pdf');
    await dialog.locator('#doc-title').fill(TITLE);
    await dialog.getByRole('checkbox', { name: /لازم‌الاجرا/ }).check();
    const audience = dialog.getByRole('group', { name: 'مخاطبان' });
    await audience.getByRole('button', { name: 'گروه یا افراد مشخص' }).click();
    await audience.getByRole('button', { name: 'فروش', exact: true }).click();
    await expect(audience).toContainText('۱ نفر این سند را می‌بینند');
    await dialog.getByRole('button', { name: 'افزودن به کتابخانه' }).click();

    const card = page.getByRole('listitem').filter({ hasText: TITLE });
    await expect(card).toContainText('لازم‌الاجرا');
    await expect(card).toContainText('مخصوص فروش');
    await expect(card.getByRole('button', { name: '۰ از ۱ نفر تأیید کرده‌اند' })).toBeVisible();
    await context.close();
  });

  test('the employee confirms it from “my tasks”', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'employee');
    await page.goto('/#dashboard');
    await page.getByRole('region', { name: 'کارهای من' }).getByRole('button', { name: new RegExp(TITLE) }).click();
    const card = page.getByRole('listitem').filter({ hasText: TITLE });
    await card.getByRole('button', { name: 'مطالعه کردم و رعایت می‌کنم' }).click();
    await expect(card).toContainText('تأیید کرده‌اید');
    await context.close();
  });

  test('a new version asks for confirmation again and keeps the old file in the history', async ({ browser }) => {
    const admin = await asRole(browser, 'admin');
    await admin.page.goto('/#documents');
    const card = admin.page.getByRole('listitem').filter({ hasText: TITLE });
    await expect(card.getByRole('button', { name: '۱ از ۱ نفر تأیید کرده‌اند' })).toBeVisible();
    await card.getByRole('button', { name: 'نسخهٔ جدید' }).click();
    const dialog = admin.page.getByRole('dialog', { name: 'بارگذاری نسخهٔ جدید' });
    await dialog.locator('input[type="file"]').setInputFiles(pdf('discounts-v2.pdf'));
    await dialog.locator('#version-note').fill('سقف تخفیف سطح ۲ تغییر کرد');
    await expect(dialog.getByRole('checkbox', { name: /همه دوباره مطالعه و تأیید کنند/ })).toBeChecked();
    await dialog.getByRole('button', { name: 'جایگزینی با نسخهٔ ۲' }).click();
    await expect(card).toContainText('نسخهٔ ۲');
    await expect(card.getByRole('button', { name: '۰ از ۱ نفر تأیید کرده‌اند' })).toBeVisible();

    await card.getByRole('button', { name: /تاریخچه/ }).click();
    const history = admin.page.getByRole('dialog', { name: 'تاریخچهٔ نسخه‌ها' });
    await expect(history.getByRole('listitem')).toHaveCount(2);
    await expect(history.getByRole('listitem').first()).toContainText('سقف تخفیف سطح ۲ تغییر کرد');
    await admin.context.close();

    const employee = await asRole(browser, 'employee');
    await employee.page.goto('/#documents');
    const mine = employee.page.getByRole('listitem').filter({ hasText: TITLE });
    await expect(mine).toContainText('نسخهٔ جدید آمده است');
    await employee.context.close();
  });
});
