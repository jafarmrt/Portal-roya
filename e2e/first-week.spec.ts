import { expect, test } from '@playwright/test';

// A colleague introduced as new sees «هفتهٔ اول من» on their dashboard: the steps the portal ticks
// itself, one opened from its link, and the administrator's own step ticked by hand.
test('a new colleague works through «هفتهٔ اول من»', async ({ browser }) => {
  const admin = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
  await admin.request.put('/api/settings', { data: { firstWeekSteps: ['فرم‌های اداری را از منابع انسانی بگیرید'] } });
  const created = await admin.request.post('/api/employees', {
    data: { username: 'mina.first', firstName: 'مینا', lastName: 'تازه', position: 'کارشناس', department: 'تولید', isNewColleague: true },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { temporaryPassword, employee } = await created.json();
  await admin.close();

  const context = await browser.newContext();
  await context.request.post('/api/auth/login', { data: { username: 'mina.first', password: temporaryPassword } });
  await context.request.post('/api/auth/change-password', { data: { currentPassword: temporaryPassword, newPassword: 'Mina-first-123' } });
  const page = await context.newPage();
  await page.goto('/#dashboard');

  const card = page.getByRole('region', { name: 'هفتهٔ اول من' });
  await expect(card).toBeVisible();
  const step = (name: string | RegExp) => card.getByRole('checkbox', { name });
  await expect(step('کارت همکاری‌تان را کامل کنید')).toHaveAttribute('aria-checked', 'false');
  await expect(step('فرم‌های اداری را از منابع انسانی بگیرید')).toBeVisible();

  // Opening the apps from the list ticks that step.
  await card.getByRole('button', { name: 'سامانه‌ها' }).click();
  await expect(page).toHaveURL(/#systems/);
  await page.goto('/#dashboard');
  await expect(step('سامانه‌های سازمان را ببینید')).toHaveAttribute('aria-checked', 'true');

  // The administrator's step is ticked by hand, and stays after a reload.
  await step('فرم‌های اداری را از منابع انسانی بگیرید').click();
  await expect(step('فرم‌های اداری را از منابع انسانی بگیرید')).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(step('فرم‌های اداری را از منابع انسانی بگیرید')).toHaveAttribute('aria-checked', 'true');

  // Closing it puts it away for good (after the few seconds to take it back).
  await card.getByRole('button', { name: 'بستن فهرست هفتهٔ اول' }).click();
  await expect(card).toBeHidden();
  await page.waitForTimeout(5500);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'آخرین اخبار و اطلاعیه‌ها' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'هفتهٔ اول من' })).toHaveCount(0);
  await context.close();

  // Leaves the other tests' audiences as they were.
  const cleanup = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
  await cleanup.request.put('/api/settings', { data: { firstWeekSteps: [] } });
  await cleanup.request.patch(`/api/employees/${employee.id}`, { data: { isActive: false } });
  await cleanup.close();
});
