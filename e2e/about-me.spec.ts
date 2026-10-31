import { expect, test } from '@playwright/test';

// The private reminder on one's dashboard opens the profile form; the colleague answers two of the
// «دربارهٔ من» questions, and colleagues see the answers on their card in the phone book.
test('a colleague fills in «دربارهٔ من» from the reminder and colleagues see it', async ({ browser }) => {
  const context = await browser.newContext({ storageState: 'e2e/.auth/employee.json' });
  const page = await context.newPage();
  await page.goto('/#dashboard');
  const nudge = page.getByRole('region', { name: /کارت/ });
  await expect(nudge).toContainText('فقط خودتان این را می‌بینید');
  await expect(nudge).toContainText('«دربارهٔ من»');
  await nudge.getByRole('button', { name: 'تکمیل کارت من' }).click();

  const form = page.getByRole('dialog', { name: 'ویرایش پروفایل' });
  await form.getByLabel('در وقت آزاد چه کاری را دوست دارید؟').fill('کوه‌نوردی');
  await form.getByLabel('چیزی که با کمال میل به همکاران یاد می‌دهید؟').fill('میان‌برهای اکسل');
  await form.getByRole('button', { name: 'ذخیرهٔ تغییرات' }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('region', { name: /کارت/ })).not.toContainText('«دربارهٔ من»');
  const { user: me } = await (await context.request.get('/api/auth/me')).json();
  await context.close();

  const admin = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
  const other = await admin.newPage();
  await other.goto(`/#colleagues/${me.id}`);
  const card = other.getByRole('dialog').getByRole('definition').filter({ hasText: 'کوه‌نوردی' });
  await expect(card).toBeVisible();
  await expect(other.getByRole('dialog')).toContainText('میان‌برهای اکسل');
  await admin.close();
});
