import { expect, test } from '@playwright/test';

// The department list in settings is the one used by the phone book filter and the Excel import.
test.describe('departments', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });
  test.describe.configure({ mode: 'serial' });

  test('the phone book filter lists the departments people are in', async ({ page }) => {
    await page.goto('/#colleagues');
    const tab = page.getByRole('button', { name: /^فروش/ });
    await expect(tab).toBeVisible();
    // «تولید» is in the list but nobody works there yet.
    await expect(page.getByRole('button', { name: /^تولید/ })).toHaveCount(0);
    await tab.click();
    await expect(tab).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('سارا احمدی')).toBeVisible();
  });

  test('settings add and rename a department, and ask where people go before removing one', async ({ page }) => {
    await page.goto('/#admin/lists');
    const section = page.locator('section[aria-labelledby="departments-title"]');
    await expect(section).toBeVisible();

    await section.getByLabel('واحد جدید').fill('انبار مرکزي');
    await section.getByRole('button', { name: 'افزودن واحد' }).click();
    // The typed Arabic «ي» is stored as the Persian «ی».
    await expect(section.getByText('انبار مرکزی', { exact: true })).toBeVisible();

    await section.getByRole('button', { name: 'تغییر نام انبار مرکزی' }).click();
    await section.getByLabel('نام تازهٔ انبار مرکزی').fill('انبار');
    await section.getByRole('button', { name: 'ذخیرهٔ نام' }).click();
    await expect(section.getByText('انبار', { exact: true })).toBeVisible();

    // «فروش» has a colleague, so removing it asks for a department to move them to.
    await expect(section.getByText(/^۱ همکار/).first()).toBeVisible();
    await section.getByRole('button', { name: 'حذف فروش' }).click();
    await expect(section.getByLabel('واحد مقصد برای فروش')).toBeVisible();
    await section.getByRole('button', { name: 'انصراف' }).click();
    await expect(section.getByText('فروش', { exact: true })).toBeVisible();
  });

  test('the Excel import asks what to do with a department the portal does not have', async ({ page }) => {
    await page.goto('/#people');
    await page.getByRole('button', { name: 'ورود یا به‌روزرسانی از اکسل' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'staff.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('نام,نام خانوادگی,سمت,واحد\nحسن,کارگری,اپراتور,کارگاه\n'),
    });
    const choice = dialog.getByLabel('واحد برای «کارگاه»');
    await expect(choice).toBeVisible();
    await expect(choice).toHaveText('ساخت واحد جدید «کارگاه»');
    await dialog.getByRole('button', { name: /ثبت ۱ ردیف/ }).click();
    await expect(page.getByText('کارکنان ثبت شدند')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('کارگاه');

    await page.goto('/#colleagues');
    await expect(page.getByRole('button', { name: /^کارگاه/ })).toBeVisible();
  });
});
