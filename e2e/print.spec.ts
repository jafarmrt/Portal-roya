import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Printed pages: only the sheet is printed, never the portal around it.
test.describe('printing', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('a news item prints as an A4 notice with a QR code', async ({ page }) => {
    const { newsId } = JSON.parse(readFileSync('e2e/.auth/data.json', 'utf8')) as { newsId: string };
    await page.goto(`/#news/${newsId}`);
    await page.getByRole('dialog').getByRole('button', { name: 'چاپ برای تابلو' }).click();
    const dialog = page.getByRole('dialog', { name: 'چاپ برای تابلو اعلانات' });
    await expect(dialog.locator('.notice-title')).toHaveText('افتتاح شعبهٔ جدید');
    await expect(dialog.locator('.sheet-qr svg')).toBeVisible();

    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#root')).toBeHidden();
    await expect(page.locator('.print-sheet .notice-title')).toBeVisible();
    await expect(page.locator('.print-sheet')).toContainText('متن کامل خبر');
    await page.emulateMedia({ media: 'screen' });
    await dialog.getByRole('radio', { name: 'فقط عنوان و خلاصه' }).click();
    await expect(dialog.locator('.notice-sheet')).not.toContainText('متن کامل خبر');
  });

  test('the phone book prints by department and downloads for Excel', async ({ page }) => {
    await page.goto('/#colleagues');
    await page.getByRole('button', { name: 'چاپ دفتر تلفن' }).click();
    const dialog = page.getByRole('dialog', { name: 'چاپ دفتر تلفن' });
    await expect(dialog.locator('.phone-group h2', { hasText: 'فروش' })).toBeVisible();

    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#root')).toBeHidden();
    await expect(page.locator('.print-sheet')).toContainText('سارا احمدی');
    await page.emulateMedia({ media: 'screen' });
    await dialog.getByRole('button', { name: 'انصراف' }).click();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'خروجی اکسل' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^roya-phone-book-.*\.csv$/);
    const text = readFileSync(await file.path(), 'utf8');
    expect(text).toContain('سارا');
    expect(text.split('\r\n')[0]).toContain('داخلی');
  });
});
