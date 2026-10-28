import { expect, test } from '@playwright/test';

// The unit head is set in the colleague's own form, and the phone book shows it instead of an access level.
test.use({ storageState: 'e2e/.auth/admin.json' });

test('staff management makes a colleague the head of their unit', async ({ page }) => {
  await page.goto('/#people');
  await page.getByRole('listitem').filter({ hasText: 'سارا احمدی' }).getByRole('button', { name: 'ویرایش' }).click();
  const dialog = page.getByRole('dialog');
  // Others may already have made her the head (the sales page test does the same).
  await dialog.getByRole('checkbox', { name: /مسئول این واحد است/ }).check();
  await dialog.getByRole('button', { name: /ذخیرهٔ تغییرات/ }).click();
  await expect(dialog).toBeHidden();

  await page.goto('/#colleagues');
  const card = page.locator('[role="button"]', { hasText: 'سارا احمدی' }).first();
  await expect(card).toContainText('مسئول واحد');
});
