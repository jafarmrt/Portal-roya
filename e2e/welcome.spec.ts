import { expect, test } from '@playwright/test';

// A new colleague introduced by the administrator: a big photo on the dashboard card, and a click
// opens the introduction large with their details.
test('a new colleague’s introduction opens large from the dashboard', async ({ browser }) => {
  const admin = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
  const res = await admin.request.post('/api/employees', {
    data: {
      username: 'reza.new',
      firstName: 'رضا',
      lastName: 'تازه‌وارد',
      position: 'تکنسین',
      department: 'تولید',
      extension: '245',
      isNewColleague: true,
      newColleagueMessage: 'رضا از امروز در تولید کنار ماست.',
    },
  });
  expect(res.ok(), await res.text()).toBe(true);
  await admin.close();

  const context = await browser.newContext({ storageState: 'e2e/.auth/employee.json' });
  const page = await context.newPage();
  await page.goto('/#dashboard');
  await expect(page.getByRole('heading', { name: 'معرفی همکاران جدید', exact: true })).toBeVisible();
  await expect(page.getByText('با تصویر')).toHaveCount(0);

  await page.getByRole('button', { name: 'نمایش بزرگ معرفی رضا تازه‌وارد' }).click();
  const dialog = page.getByRole('dialog', { name: 'خوش آمدید، رضا تازه‌وارد' });
  await expect(dialog).toContainText('تکنسین | تولید');
  await expect(dialog).toContainText('۲۴۵');
  await expect(dialog).toContainText('رضا از امروز در تولید کنار ماست.');
  await dialog.getByRole('textbox', { name: 'پیام خوش‌آمد برای رضا' }).fill('خوش آمدی!');
  await dialog.getByRole('button', { name: 'ارسال' }).click();
  await expect(dialog).toContainText('خوش آمدی!');
  // An emoji for the introduction, with its count.
  await dialog.getByRole('button', { name: 'واکنش با ایموجی (واکنش به معرفی رضا تازه‌وارد)' }).click();
  await dialog.getByRole('button', { name: 'واکنش ❤️' }).click();
  await expect(dialog.getByRole('group', { name: 'واکنش به معرفی رضا تازه‌وارد' }).getByRole('button', { name: '❤️ ۱، شما هم' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await context.close();
});
