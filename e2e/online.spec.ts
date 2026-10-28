import { expect, test, type Browser } from '@playwright/test';

const asRole = async (browser: Browser, role: 'admin' | 'employee') => {
  const context = await browser.newContext({ storageState: `e2e/.auth/${role}.json` });
  return { context, page: await context.newPage() };
};

// «همکاران آنلاین» is on from the start: a small card in the dashboard's side column with everyone
// who has the portal open. Sara sends the administrator a flower; it waits in a small banner in the
// corner of his page (not in the notifications) until he closes it; he answers with one emoji, and that
// is where the exchange ends. There is nowhere to type.
test.describe('online colleagues and ready-made emoji', () => {
  test('a colleague sends a flower and gets one emoji back', async ({ browser }) => {
    const admin = await asRole(browser, 'admin');
    const sara = await asRole(browser, 'employee');
    await admin.page.goto('/#dashboard');
    await sara.page.goto('/#dashboard');

    const card = sara.page.getByRole('region', { name: /همکار آنلاین/ });
    const adminPhoto = card.getByRole('button', { name: /^مدیر سیستم،/ });
    await expect(adminPhoto).toBeVisible();
    // Narrow, in the side column next to the news.
    const box = await card.boundingBox();
    const news = await sara.page.getByRole('heading', { name: 'آخرین اخبار و اطلاعیه‌ها' }).boundingBox();
    expect(box!.x).toBeLessThan(news!.x);
    await expect(card.getByRole('textbox')).toHaveCount(0);

    await adminPhoto.click();
    await card.getByRole('button', { name: 'فرستادن تقدیم با گل' }).click();
    await expect(sara.page.getByText('🌹 برای مدیر سیستم فرستاده شد.')).toBeVisible();
    // The same colleague only once every few minutes.
    await adminPhoto.click();
    await expect(card).toContainText('دقیقهٔ دیگر می‌توانید دوباره بفرستید');

    const banner = admin.page.getByRole('region', { name: 'ایموجی‌های همکاران' });
    await expect(banner).toContainText('سارا احمدی برایتان 🌹 «تقدیم با گل» فرستاد.');
    // It stays: still there after a reload.
    await admin.page.reload();
    await expect(banner).toContainText('سارا احمدی برایتان 🌹 «تقدیم با گل» فرستاد.');
    await banner.getByRole('button', { name: 'پاسخ با تشکر به سارا احمدی' }).click();
    await expect(banner).toBeHidden();

    const reply = sara.page.getByRole('region', { name: 'ایموجی‌های همکاران' });
    await expect(reply).toContainText('مدیر سیستم در پاسخ برایتان 🙏 «تشکر» فرستاد.');
    // An answer cannot be answered; × closes it.
    await expect(reply.getByRole('button', { name: /^پاسخ با/ })).toHaveCount(0);
    await reply.getByRole('button', { name: 'بستن ایموجی مدیر سیستم' }).click();
    await expect(reply).toBeHidden();
    await sara.page.reload();
    await expect(sara.page.getByRole('heading', { name: 'آخرین اخبار و اطلاعیه‌ها' })).toBeVisible();
    await expect(reply).toBeHidden();

    await admin.context.close();
    await sara.context.close();
  });

  test('on a phone it is a thin bar that opens on tap @mobile', async ({ browser }) => {
    const admin = await asRole(browser, 'admin');
    const sara = await browser.newContext({ storageState: 'e2e/.auth/employee.json', ...test.info().project.use });
    const page = await sara.newPage();
    await admin.page.goto('/#dashboard');
    await page.goto('/#dashboard');
    const card = page.getByRole('region', { name: /همکار آنلاین/ });
    await expect(card).toBeVisible();
    expect((await card.boundingBox())!.height).toBeLessThan(80);
    await expect(card.getByRole('button', { name: /^مدیر سیستم،/ })).toBeHidden();
    await card.getByRole('button', { name: /همکار آنلاین/ }).click();
    await expect(card.getByRole('button', { name: /^مدیر سیستم،/ })).toBeVisible();
    await admin.context.close();
    await sara.close();
  });
});
