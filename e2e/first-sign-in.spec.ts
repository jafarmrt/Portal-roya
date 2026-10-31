import { expect, test } from '@playwright/test';

// Someone imported with a portal account but no unit or position picks them on first sign-in, and
// whoever manages staff sees them under «نیاز به تکمیل» until then.
test.describe('first sign-in without a unit', () => {
  test.describe.configure({ mode: 'serial' });
  let temporaryPassword = '';

  test('staff management lists the new colleague as needing completion', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const page = await context.newPage();
    const res = await page.request.post('/api/employees/import', {
      data: { rows: [{ firstName: 'نوید', lastName: 'تازه‌وارد', username: 'navid.new', position: '', department: '' }] },
    });
    expect(res.ok()).toBe(true);
    temporaryPassword = (await res.json()).created[0].temporaryPassword;

    await page.goto('/#people');
    await page.getByRole('tab', { name: /نیاز به تکمیل/ }).click();
    const row = page.getByRole('listitem').filter({ hasText: 'نوید تازه‌وارد' });
    await expect(row).toContainText('سمت تعیین نشده · واحد تعیین نشده');
    await context.close();
  });

  test('the colleague picks a unit and position before using the portal', async ({ page }) => {
    await page.goto('/');
    // Guests may look around, so signing in starts from the header.
    await page.getByRole('button', { name: 'ورود', exact: true }).first().click();
    await page.getByLabel('نام کاربری').fill('navid.new');
    await page.getByLabel('رمز عبور', { exact: true }).fill(temporaryPassword);
    await page.getByLabel('رمز عبور', { exact: true }).press('Enter');

    await page.getByLabel('رمز عبور فعلی').fill(temporaryPassword);
    await page.getByLabel(/^رمز عبور جدید/).fill('Navid-pass-12345');
    await page.getByLabel('تکرار رمز عبور جدید').fill('Navid-pass-12345');
    await page.getByRole('button', { name: 'تغییر رمز عبور' }).click();

    await expect(page.getByRole('heading', { name: 'به پرتال سازمانی خوش آمدید' })).toBeVisible();
    // A local account already has a name, so only the place in the organisation is asked.
    await expect(page.getByLabel('نام', { exact: true })).toHaveCount(0);
    // Not «فروش»: other tests count the people there.
    await page.getByLabel('واحد').click();
    await page.getByRole('option', { name: 'فناوری اطلاعات' }).click();
    await page.getByLabel('سمت').fill('پشتیبان شبکه');
    await page.getByRole('button', { name: 'ذخیره و ورود به پرتال' }).click();

    await expect(page.getByRole('button', { name: 'منوی حساب کاربری' })).toContainText('پشتیبان شبکه · فناوری اطلاعات');
  });
});
