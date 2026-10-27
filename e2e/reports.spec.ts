import { readFileSync } from 'node:fs';
import { expect, test, type Browser } from '@playwright/test';

const TITLE = 'گزارش فروش پاییز برای واحد فروش';

const asRole = async (browser: Browser, role: 'admin' | 'employee') => {
  const context = await browser.newContext({ storageState: `e2e/.auth/${role}.json` });
  return { context, page: await context.newPage() };
};

// The admin sends a notice to the sales department, the colleague there reads it, and the report
// shows who read it; the admin then finds the notice in the change history, which colleagues cannot open.
test.describe('reports and the change history', () => {
  test.describe.configure({ mode: 'serial' });

  test('the report shows how a notice was read, the polls, the Excel file and a custom range', async ({ browser }) => {
    const admin = await asRole(browser, 'admin');
    const created = await admin.page.request.post('/api/news', {
      data: { title: TITLE, summary: 'فروش فصل پاییز', content: '<p>متن گزارش</p>', contentFormat: 'html', category: 'اخبار', targetDepartments: ['فروش'] },
    });
    expect(created.ok()).toBe(true);
    const { id } = (await created.json()) as { id: string };

    const employee = await asRole(browser, 'employee');
    expect((await employee.page.request.post(`/api/news/${id}/read`)).ok()).toBe(true);
    await employee.context.close();

    const { page } = admin;
    await page.goto('/#reports');
    await expect(page.getByRole('region', { name: 'به تفکیک واحد' })).toContainText('فروش');
    const row = page.getByRole('region', { name: /همهٔ اطلاعیه‌های این بازه/ }).getByRole('row').filter({ hasText: TITLE });
    await expect(row).toContainText('(۱ از');
    await expect(page.getByRole('region', { name: 'خلاصه‌های ماهانه' })).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'خروجی اکسل' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^roya-report-.*\.csv$/);
    expect(readFileSync((await download.path())!, 'utf8')).toContain(TITLE);

    await page.getByRole('tab', { name: 'مشارکت همکاران' }).click();
    await expect(page.getByRole('region', { name: /نظرسنجی‌ها/ })).toContainText('ناهار جمعه');

    await page.getByRole('button', { name: 'بازهٔ دلخواه' }).click();
    await page.locator('#report-from').fill('1400/01/01');
    await page.locator('#report-to').fill('1400/01/10');
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'اثربخشی اطلاع‌رسانی' }).click();
    await page.getByRole('button', { name: 'نمایش', exact: true }).click();
    await expect(page.getByText('در این بازه اطلاعیه‌ای منتشر نشده است.')).toBeVisible();
    await admin.context.close();
  });

  test('the admin finds the notice in the change history; a colleague cannot open it', async ({ browser }) => {
    const admin = await asRole(browser, 'admin');
    await admin.page.goto('/#audit');
    await expect(admin.page.getByRole('heading', { name: 'تاریخچهٔ تغییرات' })).toBeVisible();
    await admin.page.getByLabel('جستجو در تاریخچهٔ تغییرات').fill(TITLE);
    const entry = admin.page.getByRole('list', { name: 'تغییرها' }).getByRole('listitem');
    await expect(entry).toHaveCount(1);
    await expect(entry).toContainText('ساخت');
    await expect(entry).toContainText('مدیر سیستم');
    await entry.getByRole('button', { name: TITLE }).click();
    await expect(admin.page.getByRole('dialog')).toContainText(TITLE);
    await admin.context.close();

    const employee = await asRole(browser, 'employee');
    await employee.page.goto('/#audit');
    await expect(employee.page.locator('#main')).toBeVisible();
    await expect(employee.page.getByRole('heading', { name: 'تاریخچهٔ تغییرات' })).toHaveCount(0);
    expect((await employee.page.request.get('/api/audit-log')).status()).toBe(403);
    await employee.context.close();
  });
});

test.describe('reports on a phone', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('the report fits the screen @mobile', async ({ page }) => {
    await page.goto('/#reports');
    await expect(page.getByRole('region', { name: 'به تفکیک واحد' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
