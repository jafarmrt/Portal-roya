import { expect, test } from '@playwright/test';

// «رویداد ویژه»: the administrator builds a draft event (only managers, organizers and jurors see a
// draft, so the other tests are not affected), adds a competition, signs up himself and a colleague,
// draws and publishes the bracket, enters the final's result, and drives a big screen paired by code.
test.describe('special event', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('a competition from signup to champion, shown on the big screen', async ({ page, browser }) => {
    page.on('dialog', (dialog) => void dialog.accept());
    await page.goto('/#event');
    await expect(page.getByRole('heading', { name: 'رویداد ویژهٔ تازه' })).toBeVisible();
    await page.getByRole('button', { name: 'ساختن پیش‌نویس' }).click();
    await expect(page.getByText('پیش‌نویس؛ همکاران هنوز نمی‌بینند')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'الان چه کنم؟' })).toBeVisible();

    // A competition from the form.
    await page.getByRole('button', { name: 'مسابقهٔ تازه' }).click();
    const form = page.getByRole('dialog', { name: 'مسابقهٔ تازه' });
    await form.getByLabel('نام مسابقه').fill('پینگ‌پنگ');
    await form.getByRole('button', { name: 'ذخیره' }).click();
    await expect(form).toBeHidden();
    const card = page.locator('article', { has: page.getByRole('heading', { name: 'پینگ‌پنگ' }) });

    // He signs up, then signs up Sara for her.
    await card.getByRole('button', { name: 'ثبت‌نام می‌کنم' }).click();
    await expect(card.getByText('شما ثبت‌نام کرده‌اید')).toBeVisible();
    await card.getByRole('button', { name: /به‌جای دیگران/ }).click();
    const others = page.getByRole('dialog', { name: /ثبت‌نام همکار/ });
    await others.getByLabel(/همکار/).fill('سارا');
    await others.getByRole('button', { name: /سارا احمدی/ }).click();
    await others.getByRole('button', { name: 'ثبت‌نام', exact: true }).click();
    await expect(others).toBeHidden();
    await expect(card).toContainText('۲ از ۸ نفر');

    // The organizer's desk: draw, publish, and the final waits for its result.
    await page.getByRole('tab', { name: 'میز برگزارکننده' }).click();
    await page.getByRole('button', { name: 'قرعه‌کشی' }).click();
    await page.getByRole('button', { name: 'انتشار جدول' }).click();
    await expect(page.getByText('جدول منتشر شده')).toBeVisible();

    // A big screen in the hall: no account, a code, paired from the remote.
    const tv = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 720 } });
    const screen = await tv.newPage();
    await screen.goto('/#screen');
    const code = page.getByLabel('کد صفحهٔ بزرگ');
    const shown = screen.getByText(/^[۰-۹]{4}$/);
    await expect(shown).toBeVisible();
    const digits = (await shown.innerText()).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    await page.getByRole('tab', { name: 'ریموت صفحهٔ بزرگ' }).click();
    await code.fill(digits);
    await page.getByRole('button', { name: 'وصل کن' }).click();
    await expect(screen.getByRole('heading', { name: /شب یلدا/ })).toBeVisible();

    // The final on stage: the score moves on the screen as the remote taps.
    await page.getByRole('button', { name: /^فینال/ }).click();
    await page.getByRole('button', { name: 'امتیاز طرف اول: یکی بیشتر' }).click();
    await expect(screen.getByText('۱', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'پایان بازی و ثبت نتیجه' }).click();
    const result = page.getByRole('dialog', { name: 'ثبت نتیجه' });
    await expect(result).toBeVisible();
    await result.getByRole('button', { name: 'پایان بازی و ثبت' }).click();
    await expect(result).toBeHidden();

    await page.getByRole('button', { name: 'قهرمان', exact: true }).click();
    await expect(screen.getByText('قهرمان پینگ‌پنگ')).toBeVisible();
    await page.getByRole('tab', { name: 'مسابقه‌ها' }).click();
    await expect(card.getByText('قهرمان', { exact: true })).toBeVisible();
    await tv.close();

    // «انتخاب‌های یلدا»: a category, a nomination, the shortlist, the vote (organizers vote without a jury)
    // and the winner opened on stage.
    await page.getByRole('button', { name: 'بخش تازه' }).click();
    const awardForm = page.getByRole('dialog', { name: 'بخش تازهٔ انتخاب‌ها' });
    await awardForm.getByLabel('نام بخش').fill('خوش‌تیپ‌ترین');
    await awardForm.getByRole('button', { name: 'ذخیره' }).click();
    await expect(awardForm).toBeHidden();
    const award = page.getByRole('article', { name: 'خوش‌تیپ‌ترین' });
    await award.getByRole('button', { name: 'معرفی نامزد' }).click();
    const nominate = page.getByRole('dialog', { name: /خوش‌تیپ‌ترین/ });
    await nominate.getByLabel(/همکار/).fill('سارا');
    await nominate.getByRole('button', { name: /سارا احمدی/ }).click();
    await nominate.getByLabel(/یک جمله برای داوران/).fill('همیشه مرتب');
    await nominate.getByRole('button', { name: 'ثبت معرفی' }).click();
    await expect(award).toContainText('معرفی شما: سارا احمدی');

    await page.getByRole('button', { name: 'ساختن فهرست نامزدها الان' }).click();
    await expect(award).toContainText('«همیشه مرتب»');
    await page.getByRole('button', { name: 'انتشار فهرست الان' }).click();
    await award.getByRole('button', { name: 'انتخاب' }).click();
    await expect(award.getByRole('button', { name: 'رأی من' })).toBeVisible();
    await page.getByRole('button', { name: 'بستن رأی‌گیری الان' }).click();
    await award.getByRole('button', { name: 'اعلام برنده' }).click();
    await expect(award).toContainText('برنده');
    await expect(award).toContainText('سارا احمدی');
  });
});
