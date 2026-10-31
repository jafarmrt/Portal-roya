import { expect, test, type Browser } from '@playwright/test';

const asRole = async (browser: Browser, role: 'admin' | 'employee') => {
  const context = await browser.newContext({ storageState: `e2e/.auth/${role}.json` });
  return { context, page: await context.newPage() };
};

const TEXT = 'سلام به همه همکاران عزیز 🌿\n\nلطفاً اگر سرما خورده‌اید در محیط کار ماسک بزنید. 😷\n\nممنون از توجهتون!';

// «تابلوی اعلانات»: a publisher puts a short notice (not news) on the board from the dashboard; a
// colleague reads the whole text there, folds it away with «دیدم» and opens it again.
test.describe('notice board', () => {
  test.describe.configure({ mode: 'serial' });

  test('a publisher puts a notice on the board and a colleague folds it away', async ({ browser }) => {
    const admin = await asRole(browser, 'admin');
    await admin.page.goto('/#dashboard');
    const board = admin.page.getByRole('region', { name: 'تابلوی اعلانات' });
    await board.getByRole('button', { name: 'اطلاعیهٔ جدید' }).click();
    const form = admin.page.getByRole('dialog', { name: 'اطلاعیهٔ جدید برای تابلوی اعلانات' });
    await form.getByLabel('متن اطلاعیه *').fill(TEXT);
    await form.getByLabel('از طرف (اختیاری)').fill('واحد اداری');
    await form.getByRole('button', { name: 'سه روز' }).click();
    await expect(form).toContainText('۳ روز روی تابلو می‌ماند');
    await form.getByRole('button', { name: 'گذاشتن روی تابلو' }).click();
    await expect(form).toBeHidden();
    await expect(board).toContainText('لطفاً اگر سرما خورده‌اید');
    await expect(board).toContainText('واحد اداری');
    await admin.context.close();

    const { context, page } = await asRole(browser, 'employee');
    await page.goto('/#dashboard');
    const myBoard = page.getByRole('region', { name: 'تابلوی اعلانات' });
    await expect(myBoard.getByText('لطفاً اگر سرما خورده‌اید', { exact: false })).toBeVisible();
    await expect(myBoard.getByRole('button', { name: 'اطلاعیهٔ جدید' })).toHaveCount(0);
    // Not a news item.
    await page.goto('/#news');
    await expect(page.getByText('لطفاً اگر سرما خورده‌اید', { exact: false })).toHaveCount(0);
    await page.goto('/#dashboard');
    await myBoard.getByRole('button', { name: 'دیدم' }).click();
    await expect(myBoard).toContainText('همه را دیده‌اید');
    await expect(myBoard.getByText('لطفاً اگر سرما خورده‌اید', { exact: false })).toBeHidden();
    // Still folded after a reload; opened again on request.
    await page.reload();
    await myBoard.getByRole('button', { name: /همه را دیده‌اید/ }).click();
    await myBoard.getByRole('button', { name: 'باز کردن دوباره' }).click();
    await expect(myBoard.getByRole('button', { name: 'دیدم' })).toBeVisible();
    await context.close();
  });

  test('the publisher sees how many colleagues saw it', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'admin');
    await page.goto('/#dashboard');
    await page.getByRole('region', { name: 'تابلوی اعلانات' }).getByRole('button', { name: 'مدیریت اطلاعیه‌ها' }).click();
    const manage = page.getByRole('dialog', { name: 'مدیریت اطلاعیه‌ها' });
    await expect(manage).toContainText('روی تابلو');
    await expect(manage).toContainText(/نفر دیدند/);
    await context.close();
  });
});
