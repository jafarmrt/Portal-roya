import { expect, test, type Browser } from '@playwright/test';

const TITLE = 'رضایت از سرویس ایاب و ذهاب';

const asRole = async (browser: Browser, role: 'admin' | 'employee') => {
  const context = await browser.newContext({ storageState: `e2e/.auth/${role}.json` });
  return { context, page: await context.newPage() };
};

// A poll manager builds a named form for the sales department with a choice, a multi-select, a
// rating and an optional written question; a colleague answers it and sees the summary but not the
// written answers, which stay with the people who run the poll, along with each answer sheet.
test.describe('polls with several questions', () => {
  test.describe.configure({ mode: 'serial' });

  test('a poll manager builds a form with several kinds of questions', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'admin');
    await page.goto('/#polls');
    await page.getByRole('button', { name: 'نظرسنجی جدید' }).click();
    const dialog = page.getByRole('dialog', { name: 'نظرسنجی جدید' });
    await dialog.locator('#poll-title').fill(TITLE);
    await dialog.locator('#poll-description').fill('برای قرارداد سال بعد با شرکت سرویس');

    await dialog.getByRole('textbox', { name: 'متن سؤال ۱', exact: true }).fill('کدام سرویس را استفاده می‌کنید؟');
    await dialog.getByRole('textbox', { name: 'گزینهٔ ۱ سؤال ۱', exact: true }).fill('سرویس صبح');
    await dialog.getByRole('textbox', { name: 'گزینهٔ ۲ سؤال ۱', exact: true }).fill('سرویس عصر');

    await dialog.getByRole('button', { name: 'چندگزینه‌ای', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'متن سؤال ۲', exact: true }).fill('چه چیزهایی بهتر شود؟');
    await dialog.getByRole('textbox', { name: 'گزینهٔ ۱ سؤال ۲', exact: true }).fill('دقت در زمان');
    await dialog.getByRole('textbox', { name: 'گزینهٔ ۲ سؤال ۲', exact: true }).fill('تمیزی');
    await dialog.getByRole('button', { name: 'افزودن گزینه' }).nth(1).click();
    await dialog.getByRole('textbox', { name: 'گزینهٔ ۳ سؤال ۲', exact: true }).fill('مسیر');

    await dialog.getByRole('button', { name: 'امتیاز ۱ تا ۵', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'متن سؤال ۳', exact: true }).fill('به راننده‌ها چه امتیازی می‌دهید؟');
    await dialog.getByRole('button', { name: 'تشریحی', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'متن سؤال ۴', exact: true }).fill('پیشنهاد دیگری دارید؟');
    // A written question starts out optional.
    await expect(dialog.getByRole('checkbox', { name: 'اجباری' }).nth(3)).not.toBeChecked();

    await dialog.getByRole('radio', { name: /^با نام/ }).check();
    await dialog.getByRole('button', { name: 'گروه یا افراد مشخص' }).click();
    await dialog.getByRole('button', { name: 'فروش', exact: true }).click();
    await dialog.getByRole('button', { name: 'انتشار نظرسنجی' }).click();
    await expect(dialog).toBeHidden();

    const card = page.getByRole('article', { name: TITLE });
    await expect(card).toContainText('با نام');
    await expect(card).toContainText('فروش');
    await expect(card).toContainText('۴ سؤال');
    // The admin is not in sales, so the poll is not theirs to answer.
    await expect(card.getByRole('button', { name: 'پاسخ دادن' })).toHaveCount(0);
    await context.close();
  });

  test('a colleague answers every kind of question', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'employee');
    await page.goto('/#polls');
    const card = page.getByRole('article', { name: TITLE });
    await expect(card).toContainText('نتایج بعد از پاسخ دادن');
    await card.getByRole('button', { name: 'پاسخ دادن' }).click();

    const dialog = page.getByRole('dialog', { name: TITLE });
    await expect(dialog).toContainText('این نظرسنجی با نام است');
    await dialog.getByRole('button', { name: 'ثبت پاسخ' }).click();
    await expect(dialog.getByRole('alert')).toContainText('۳ سؤال اجباری');

    await dialog.getByRole('group', { name: 'کدام سرویس را استفاده می‌کنید؟' }).getByLabel('سرویس عصر').check();
    const better = dialog.getByRole('group', { name: 'چه چیزهایی بهتر شود؟' });
    await better.getByLabel('دقت در زمان').check();
    await better.getByLabel('مسیر').check();
    await dialog.getByRole('group', { name: 'به راننده‌ها چه امتیازی می‌دهید؟' }).getByText('زیاد', { exact: true }).click();
    await dialog.getByRole('group', { name: 'پیشنهاد دیگری دارید؟' }).getByRole('textbox').fill('سرویس جمعه‌ها هم باشد');
    await dialog.getByRole('button', { name: 'ثبت پاسخ' }).click();
    await expect(dialog).toBeHidden();

    await expect(card).toContainText('پاسخ شما ثبت شده است');
    await card.getByRole('button', { name: 'نتایج' }).click();
    const results = page.getByRole('dialog', { name: `نتایج: ${TITLE}` });
    await expect(results.getByRole('region', { name: 'کدام سرویس را استفاده می‌کنید؟' })).toContainText('۱۰۰٪');
    await expect(results.getByRole('region', { name: 'به راننده‌ها چه امتیازی می‌دهید؟' })).toContainText('میانگین از ۵');
    // Written answers stay with the people who run the poll unless they chose to share them.
    await expect(results).toContainText('متن پاسخ‌ها فقط برای طراح نظرسنجی و مدیران');
    await expect(results).not.toContainText('سرویس جمعه‌ها هم باشد');
    await expect(results.getByRole('button', { name: 'خروجی اکسل' })).toHaveCount(0);
    await context.close();
  });

  test('the poll manager sees each answer sheet and exports them', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'admin');
    await page.goto('/#polls');
    await page.getByRole('article', { name: TITLE }).getByRole('button', { name: 'نتایج' }).click();
    const results = page.getByRole('dialog', { name: `نتایج: ${TITLE}` });
    await expect(results).toContainText('سرویس جمعه‌ها هم باشد');

    await results.getByRole('button', { name: 'پاسخ هر نفر' }).click();
    const row = results.getByRole('row', { name: /سارا احمدی/ });
    await expect(row).toContainText('دقت در زمان، مسیر');

    const [download] = await Promise.all([page.waitForEvent('download'), results.getByRole('button', { name: 'خروجی اکسل' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^roya-poll-.*\.csv$/);
    await context.close();
  });
});
