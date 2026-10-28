import { expect, test } from '@playwright/test';

// The settings page in tabs (each at its own address), its search box, the warning before unsaved
// edits are lost, and the suggestion boxes switched one by one.
test.use({ storageState: 'e2e/.auth/admin.json' });
test.describe.configure({ mode: 'serial' });

test('each tab has its own address and the last one opens again', async ({ page }) => {
  await page.goto('/#admin/server');
  await expect(page.getByRole('heading', { name: 'وضعیت سرور و پشتیبان‌ها' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'لوگوی شرکت' })).toHaveCount(0);

  await page.getByRole('navigation', { name: 'بخش‌های تنظیمات' }).getByRole('button', { name: /^فهرست‌ها/ }).click();
  await expect(page).toHaveURL(/#admin\/lists$/);
  await expect(page.locator('section[aria-labelledby="departments-title"]')).toBeVisible();

  // Coming back to the settings without a tab opens the one used last.
  await page.goto('/#dashboard');
  await page.goto('/#admin');
  await expect(page.locator('section[aria-labelledby="departments-title"]')).toBeVisible();
});

test('the search box opens the section in its tab', async ({ page }) => {
  await page.goto('/#admin/lists');
  await page.getByLabel('جستجو در تنظیمات').fill('لوگو');
  await page.getByRole('button', { name: 'لوگوی شرکت · عمومی' }).click();
  await expect(page).toHaveURL(/#admin\/general$/);
  await expect(page.locator('#settings-logo')).toBeInViewport();

  await page.getByLabel('جستجو در تنظیمات').fill('مدیرعامل');
  await page.getByLabel('جستجو در تنظیمات').press('Enter');
  await expect(page).toHaveURL(/#admin\/features$/);
  await expect(page.locator('#settings-suggestion-boxes')).toBeInViewport();
});

test('asks before leaving a tab with unsaved edits', async ({ page }) => {
  await page.goto('/#admin/general');
  await page.getByLabel('متن پیام (اختیاری)').fill('سالگرد مبارک');
  const nav = page.getByRole('navigation', { name: 'بخش‌های تنظیمات' });

  page.once('dialog', (d) => void d.dismiss());
  await nav.getByRole('button', { name: /^سرور/ }).click();
  await expect(page).toHaveURL(/#admin\/general$/);
  await expect(page.getByLabel('متن پیام (اختیاری)')).toHaveValue('سالگرد مبارک');

  page.once('dialog', (d) => void d.accept());
  await nav.getByRole('button', { name: /^سرور/ }).click();
  await expect(page).toHaveURL(/#admin\/server$/);
});

test('with only one box open the form does not ask which box', async ({ page }) => {
  const set = async (key: string, state: string) => expect((await page.request.put(`/api/settings/features/${key}`, { data: { state } })).ok()).toBe(true);
  await set('suggestionsHr', 'off');
  try {
    await page.goto('/#suggestions');
    await expect(page.getByText('پیام برای چه کسی است؟')).toHaveCount(0);
    await expect(page.getByText(/پیام شما به مدیریت شرکت می‌رسد/)).toBeVisible();
    // The admin reads HR's box, which now says it takes nothing new.
    await page.getByRole('tab', { name: /صندوق منابع انسانی \(خاموش\)/ }).click();
    await expect(page.getByText('این صندوق خاموش است و پیام تازه نمی‌پذیرد.', { exact: false })).toBeVisible();
  } finally {
    await set('suggestionsHr', 'on');
  }
});
