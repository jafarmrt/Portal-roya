import { expect, test } from '@playwright/test';

// «رویداد ویژه»: the administrator builds a draft event (only managers, organizers and jurors see a
// draft, so the other tests are not affected), adds a competition, signs up himself and a colleague,
// draws and publishes the bracket, enters the final's result, and drives a big screen paired by code.
test.describe('special event', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });
  // The second test uses the draft event the first one builds.
  test.describe.configure({ mode: 'serial' });

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

    // «رتبه‌بندی» with the pantomime's word card: each performs alone; a shared first place is picked.
    await page.getByRole('button', { name: 'مسابقهٔ تازه' }).click();
    const rankForm = page.getByRole('dialog', { name: 'مسابقهٔ تازه' });
    await rankForm.getByLabel('نام مسابقه').fill('پانتومیم');
    await rankForm.getByRole('button', { name: 'رتبه‌بندی' }).click();
    await expect(rankForm.getByRole('button', { name: 'فقط فینال روی صحنه' })).toHaveCount(0);
    await rankForm.getByLabel(/کلمه‌های کارت/).fill('کرسی\nانار');
    await rankForm.getByRole('button', { name: 'ذخیره' }).click();
    await expect(rankForm).toBeHidden();
    const panto = page.locator('article', { has: page.getByRole('heading', { name: 'پانتومیم' }) });
    await expect(panto).toContainText('رتبه‌بندی (امتیاز بیشتر)');
    await panto.getByRole('button', { name: 'ثبت‌نام می‌کنم' }).click();
    await panto.getByRole('button', { name: /به‌جای دیگران/ }).click();
    const others2 = page.getByRole('dialog', { name: /ثبت‌نام همکار/ });
    await others2.getByLabel(/همکار/).fill('سارا');
    await others2.getByRole('button', { name: /سارا احمدی/ }).click();
    await others2.getByRole('button', { name: 'ثبت‌نام', exact: true }).click();
    await expect(others2).toBeHidden();

    await page.getByRole('tab', { name: 'میز برگزارکننده' }).click();
    const controls = page.locator('li', { has: page.getByText('پانتومیم', { exact: true }) });
    await controls.getByRole('button', { name: 'قرعه‌کشی' }).click();
    await controls.getByRole('button', { name: 'انتشار جدول' }).click();
    await expect(controls.getByText('جدول منتشر شده')).toBeVisible();

    // On the remote: the admin's turn on stage, a word on the phone, «حدس زدند» adds a point.
    await page.getByRole('tab', { name: 'ریموت صفحهٔ بزرگ' }).click();
    await page.getByLabel('مسابقه (برای جدول، بازی و قهرمان)').selectOption({ label: '🎮 پانتومیم' });
    await page.getByRole('button', { name: /مدیر سیستم/ }).click();
    const words = page.getByLabel('کارت کلمه');
    await words.getByRole('button', { name: 'کلمهٔ بعدی' }).click();
    await expect(words.getByText(/^(کرسی|انار)$/)).toBeVisible();
    await expect(words).toContainText('۱ کلمه مانده');
    await words.getByRole('button', { name: /حدس زدند/ }).click();
    await expect(words).toContainText('۰ کلمه مانده');
    await page.getByRole('button', { name: 'پایان اجرا و ثبت نتیجه' }).click();
    const perf = page.getByRole('dialog', { name: 'ثبت نتیجه' });
    await expect(perf.getByLabel('امتیاز به عدد')).toHaveValue('1');
    await perf.getByRole('button', { name: 'ثبت نتیجه' }).click();
    await expect(perf).toBeHidden();

    // Sara also scores 1: first place is shared, and the organizer (no jury) picks the champion.
    await page.getByRole('tab', { name: 'مسابقه‌ها' }).click();
    await panto.getByRole('button', { name: /سارا احمدی: ثبت یا اصلاح نتیجه/ }).click();
    const perf2 = page.getByRole('dialog', { name: 'ثبت نتیجه' });
    await perf2.getByLabel('امتیاز به عدد').fill('1');
    await perf2.getByRole('button', { name: 'ثبت نتیجه' }).click();
    await expect(perf2).toBeHidden();
    await expect(panto).toContainText('رتبهٔ اول مساوی شد');
    await panto.getByRole('button', { name: 'سارا احمدی', exact: true }).click();
    await expect(panto.getByText('قهرمان', { exact: true })).toBeVisible();
    await expect(panto).not.toContainText('رتبهٔ اول مساوی شد');
  });

  test('a points table: everyone against everyone, a draw counts', async ({ page }) => {
    page.on('dialog', (dialog) => void dialog.accept());
    await page.goto('/#event');
    await expect(page.getByRole('heading', { name: 'الان چه کنم؟' })).toBeVisible();
    await page.getByRole('button', { name: 'مسابقهٔ تازه' }).click();
    const form = page.getByRole('dialog', { name: 'مسابقهٔ تازه' });
    await form.getByLabel('نام مسابقه').fill('شطرنج');
    await form.getByRole('button', { name: 'جدول امتیازی' }).click();
    await expect(form.getByText(/همه با همه یک بار بازی می‌کنند/)).toBeVisible();
    await form.getByRole('button', { name: 'ذخیره' }).click();
    await expect(form).toBeHidden();
    const chess = page.locator('article', { has: page.getByRole('heading', { name: 'شطرنج' }) });
    await chess.getByRole('button', { name: 'ثبت‌نام می‌کنم' }).click();
    await chess.getByRole('button', { name: /به‌جای دیگران/ }).click();
    const others = page.getByRole('dialog', { name: /ثبت‌نام همکار/ });
    await others.getByLabel(/همکار/).fill('سارا');
    await others.getByRole('button', { name: /سارا احمدی/ }).click();
    await others.getByRole('button', { name: 'ثبت‌نام', exact: true }).click();
    await expect(others).toBeHidden();

    await page.getByRole('tab', { name: 'میز برگزارکننده' }).click();
    const controls = page.locator('li', { has: page.getByText('شطرنج', { exact: true }) });
    await controls.getByRole('button', { name: 'قرعه‌کشی' }).click();
    await controls.getByRole('button', { name: 'انتشار جدول' }).click();
    await page.getByRole('tab', { name: 'مسابقه‌ها' }).click();
    await expect(chess.getByRole('table', { name: /جدول امتیازی شطرنج/ })).toBeVisible();
    await chess.getByRole('button', { name: /همهٔ بازی‌ها/ }).click();
    await chess.getByRole('button', { name: 'دور ۱: ثبت یا اصلاح نتیجه' }).click();
    const result = page.getByRole('dialog', { name: 'ثبت نتیجه' });
    await expect(result).toContainText('مساوی؛ در جدول امتیازی هر طرف ۱ امتیاز می‌گیرد.');
    await result.getByRole('button', { name: 'پایان بازی و ثبت' }).click();
    await expect(result).toBeHidden();
    // Both on one point and level on everything: they share first place.
    const rows = chess.getByRole('table').getByRole('row');
    await expect(rows.nth(1)).toContainText('۱');
    await expect(chess).toContainText('رتبهٔ اول مساوی شد');
  });

  test('songs for the night and ideas for the program', async ({ page }) => {
    page.on('dialog', (dialog) => void dialog.accept());
    await page.goto('/#event');
    await page.getByRole('tab', { name: 'آهنگ‌ها و ایده‌ها' }).click();
    await page.getByLabel('نام آهنگ').fill('گل سنگم');
    await page.getByLabel('خواننده').fill('بنان');
    await page.getByRole('button', { name: 'پیشنهاد آهنگ' }).click();
    const songs = page.getByRole('list', { name: /فهرست آهنگ‌ها/ });
    await expect(songs).toContainText('گل سنگم');
    // The same song written another way is caught.
    await page.getByLabel('نام آهنگ').fill('گلِ‌سنگم');
    await page.getByLabel('خواننده').fill('بنان');
    await page.getByRole('button', { name: 'پیشنهاد آهنگ' }).click();
    await expect(page.getByText(/قبلاً پیشنهاد شده است/)).toBeVisible();
    await expect(songs.getByRole('listitem')).toHaveCount(1);

    await page.getByRole('button', { name: /خوراکی/ }).click();
    await page.getByLabel('ایدهٔ شما').fill('آش رشته برای همه');
    await page.getByRole('button', { name: 'ثبت ایده' }).click();
    await expect(page.getByText('آش رشته برای همه')).toBeVisible();
    await page.getByRole('button', { name: 'پاسخ برگزارکننده' }).click();
    await page.getByLabel('پاسخ به ایده').fill('از ساعت ۱۶');
    await page.getByRole('button', { name: 'انجام می‌دهیم' }).click();
    await expect(page.getByText(/انجام می‌دهیم: از ساعت ۱۶/)).toBeVisible();

    // The music lead puts it on the big screen as playing now.
    await page.getByRole('tab', { name: 'ریموت صفحهٔ بزرگ' }).click();
    await page.getByRole('button', { name: 'پخش گل سنگم' }).click();
    const playing = page.getByRole('region', { name: 'در حال پخش' });
    await expect(playing).toContainText('🎵 گل سنگم');
    await playing.getByRole('button', { name: 'قطع' }).click();
    await expect(playing).toContainText('آهنگی روی صفحهٔ بزرگ نیست');
  });
});
