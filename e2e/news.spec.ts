import { expect, test, type Browser } from '@playwright/test';
import moment from 'moment-jalaali';

const TITLE = 'دستورالعمل جدید فروش';

const asRole = async (browser: Browser, role: 'admin' | 'employee') => {
  const context = await browser.newContext({ storageState: `e2e/.auth/${role}.json` });
  return { context, page: await context.newPage() };
};

// A circular written in the editor, sent to one department with a deadline, followed up from the
// read report and acknowledged from the employee's dashboard.
test.describe('targeted circulars', () => {
  test.describe.configure({ mode: 'serial' });

  test('the editor publishes formatted text to one department with a deadline', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'admin');
    await page.goto('/#news');
    await page.getByRole('button', { name: 'انتشار خبر یا بخشنامه' }).click();
    const dialog = page.getByRole('dialog');

    await dialog.locator('#news-title').fill(TITLE);
    await dialog.locator('#news-summary').fill('لطفاً پیش از شروع کار مطالعه کنید.');
    const editor = dialog.getByRole('textbox', { name: 'متن کامل' });
    await editor.click();
    await dialog.getByRole('button', { name: 'تیتر', exact: true }).click();
    await page.keyboard.type('مراحل کار');
    await page.keyboard.press('Enter');
    await page.keyboard.type('ابتدا فرم را پر کنید.');

    await dialog.getByRole('checkbox', { name: /نیاز به تأیید مطالعه/ }).check();
    await dialog.locator('#news-ack-date').fill(moment().add(5, 'days').format('jYYYY/jMM/jDD'));

    const audience = dialog.getByRole('group', { name: 'مخاطبان' });
    await audience.getByRole('button', { name: 'گروه یا افراد مشخص' }).click();
    await audience.getByRole('button', { name: 'فروش', exact: true }).click();
    await expect(audience).toContainText('۱ نفر این خبر را می‌بینند');

    await dialog.getByRole('button', { name: 'پیش‌نمایش' }).click();
    await expect(dialog.getByRole('heading', { name: 'مراحل کار' })).toBeVisible();
    await dialog.getByRole('button', { name: 'بازگشت به ویرایش' }).click();

    await dialog.getByRole('button', { name: 'انتشار', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const card = page.locator('article', { hasText: TITLE });
    await expect(card).toContainText('فروش');
    await expect(card).toContainText('مهلت تأیید');
    await context.close();
  });

  test('the read report reminds the people who have not acknowledged', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'admin');
    await page.goto('/#news');
    await page.locator('article', { hasText: TITLE }).getByRole('button', { name: /خوانده:/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('سارا احمدی');
    await expect(dialog.getByRole('button', { name: 'خروجی اکسل' })).toBeVisible();
    await dialog.getByRole('button', { name: 'یادآوری به ۱ نفر' }).click();
    await expect(page.getByText('یادآوری برای ۱ نفر فرستاده شد.')).toBeVisible();
    await context.close();
  });

  test('the employee finds it under “my tasks” and acknowledges it', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'employee');
    await page.goto('/#dashboard');
    const tasks = page.getByRole('region', { name: 'کارهای من' });
    await tasks.getByRole('button', { name: new RegExp(TITLE) }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'مراحل کار' })).toBeVisible();
    await expect(dialog).toContainText('لطفاً تا پایان');
    await dialog.getByRole('button', { name: 'مطالعه کردم و آگاه هستم' }).click();
    await expect(dialog).toContainText('تأیید کرده‌اید');
    await context.close();
  });
});

test.describe('locations', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('settings list the company’s locations', async ({ page }) => {
    await page.goto('/#admin');
    const section = page.locator('section[aria-labelledby="locations-title"]');
    await expect(section.getByText('شعبه شیراز', { exact: true })).toBeVisible();
    await expect(section.getByLabel('محل استقرار جدید')).toBeVisible();
  });
});

test.describe('dashboard on a phone', () => {
  test.use({ storageState: 'e2e/.auth/employee.json' });

  test('less-used cards open on tap @mobile', async ({ page }) => {
    await page.goto('/#dashboard');
    const calendar = page.getByRole('button', { name: 'تقویم', exact: true });
    await expect(calendar).toHaveAttribute('aria-expanded', 'false');
    await calendar.click();
    await expect(calendar).toHaveAttribute('aria-expanded', 'true');
  });
});
