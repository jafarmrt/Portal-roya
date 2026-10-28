import { expect, test, type Browser } from '@playwright/test';

const TITLE = 'قطعی اتوماسیون اداری در پنجشنبه ۸ آبان';

const asRole = async (browser: Browser, role: 'admin' | 'employee') => {
  const context = await browser.newContext({ storageState: `e2e/.auth/${role}.json` });
  return { context, page: await context.newPage() };
};

const openItem = async (page: Awaited<ReturnType<typeof asRole>>['page'], title: string) => {
  await page.goto('/#news');
  await page.getByRole('main').getByRole('button', { name: title, exact: true }).click();
  return page.getByRole('dialog', { name: title });
};

// A notice started from the outage template, kept as a draft, published; a colleague asks the
// publisher a question, the answer is shared with everyone, and the later fix shows in the history.
test.describe('publisher tools', () => {
  test.describe.configure({ mode: 'serial' });

  test('the publisher fills a template, keeps it as a draft and publishes it later', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'admin');
    await page.goto('/#news');
    await page.getByRole('button', { name: 'انتشار خبر یا بخشنامه' }).click();
    const dialog = page.getByRole('dialog', { name: 'انتشار خبر یا اطلاعیهٔ جدید' });
    await dialog.getByRole('region', { name: 'شروع از قالب آماده' }).getByRole('button', { name: 'قطعی سامانه' }).click();
    await expect(dialog.locator('#news-title')).toHaveValue('قطعی [نام سامانه] در [روز و تاریخ]');
    await expect(dialog.getByRole('checkbox', { name: /فوری/ })).toBeChecked();

    const blanks = dialog.getByRole('group', { name: 'جاهای خالی را پر کنید' });
    await blanks.getByLabel('نام سامانه').fill('اتوماسیون اداری');
    await blanks.getByLabel('روز و تاریخ').fill('پنجشنبه ۸ آبان');
    await blanks.getByLabel('ساعت شروع').fill('۱۰');
    await blanks.getByLabel('ساعت پایان').fill('۱۲');
    await blanks.getByLabel('دلیل قطعی').fill('به‌روزرسانی سرور');
    await blanks.getByRole('button', { name: 'جای‌گذاری در متن' }).click();
    await expect(dialog.locator('#news-title')).toHaveValue(TITLE);
    await expect(dialog.getByRole('textbox', { name: 'متن کامل' })).toContainText('به دلیل به‌روزرسانی سرور، اتوماسیون اداری پنجشنبه ۸ آبان');
    // One blank is left for later.
    await expect(blanks.getByLabel('نام و داخلی پشتیبان')).toBeVisible();

    await dialog.getByRole('button', { name: 'ذخیرهٔ پیش‌نویس' }).click();
    await expect(page.getByText('پیش‌نویس ذخیره شد.')).toBeVisible();
    await expect(page.getByRole('main').getByRole('button', { name: TITLE })).toHaveCount(0);

    await page.getByRole('tab', { name: /پیش‌نویس‌ها/ }).click();
    const draft = page.getByRole('main').getByRole('article').filter({ hasText: TITLE });
    await expect(draft).toContainText('پیش‌نویس');
    await draft.getByRole('button', { name: 'ادامهٔ نوشتن' }).click();
    const editor = page.getByRole('dialog', { name: 'ادامهٔ پیش‌نویس' });
    await editor.getByRole('group', { name: 'جاهای خالی را پر کنید' }).getByLabel('نام و داخلی پشتیبان').fill('واحد فناوری، داخلی ۱۱۰');
    await editor.getByRole('button', { name: 'جای‌گذاری در متن' }).click();
    await expect(editor.getByRole('group', { name: 'جاهای خالی را پر کنید' })).toHaveCount(0);
    await editor.getByRole('button', { name: 'انتشار', exact: true }).click();
    await expect(page.getByText('خبر منتشر شد.')).toBeVisible();
    await expect(page.getByRole('tab', { name: /پیش‌نویس‌ها/ })).toHaveText('پیش‌نویس‌ها (۰)');
    await context.close();
  });

  test('a colleague asks the publisher a question', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'employee');
    const dialog = await openItem(page, TITLE);
    await dialog.getByLabel(/پرسشی دربارهٔ این خبر دارید؟/).fill('ایمیل‌ها در این مدت می‌رسند؟ من ساعت ۱۱ جلسه با مشتری دارم.');
    await dialog.getByRole('button', { name: 'ارسال پرسش' }).click();
    await expect(page.getByText('پرسش شما برای ناشر فرستاده شد.')).toBeVisible();
    await expect(dialog.getByRole('list', { name: 'پرسش‌های شما' })).toContainText('منتظر پاسخ');
    await context.close();
  });

  test('the publisher answers for everyone and fixes the title', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'admin');
    await page.goto('/#dashboard');
    await page.getByRole('region', { name: 'منتظر اقدام شما', exact: true }).getByRole('button', { name: new RegExp(TITLE) }).click();
    const dialog = page.getByRole('dialog', { name: TITLE });
    const question = dialog.getByRole('listitem', { name: 'پرسش سارا احمدی، فروش' });
    await question.getByLabel('پاسخ شما').fill('بله، ایمیل‌ها بعد از وصل شدن دوباره می‌رسند.');
    await question.getByRole('checkbox', { name: /پرسش و پاسخ/ }).check();
    await question.getByLabel(/متن پرسش برای نمایش به همه/).fill('ایمیل‌ها در این مدت می‌رسند؟');
    await question.getByRole('button', { name: 'ثبت پاسخ' }).click();
    await expect(page.getByText('پاسخ برای پرسنده فرستاده شد.')).toBeVisible();
    await expect(question).toContainText('در «پرسش و پاسخ» این خبر برای همه نمایش داده می‌شود');

    // Fix the title; the edit shows in the history with the earlier wording.
    await dialog.getByRole('button', { name: 'بستن' }).last().click();
    const card = page.getByRole('main').getByRole('article').filter({ hasText: TITLE });
    await card.getByRole('button', { name: 'ویرایش' }).click();
    const editor = page.getByRole('dialog', { name: 'ویرایش خبر یا اطلاعیه' });
    await expect(editor.getByRole('button', { name: 'ذخیرهٔ پیش‌نویس' })).toHaveCount(0);
    await editor.locator('#news-title').fill(`${TITLE} (ساعت ۱۰ تا ۱۳)`);
    await editor.getByRole('button', { name: 'ذخیرهٔ تغییرات' }).click();
    await expect(page.getByText('تغییرات ذخیره شد.')).toBeVisible();

    const fixed = await openItem(page, `${TITLE} (ساعت ۱۰ تا ۱۳)`);
    await expect(fixed).toContainText('آخرین ویرایش بعد از انتشار');
    await fixed.getByRole('button', { name: 'تاریخچهٔ ویرایش' }).click();
    const history = page.getByRole('dialog', { name: 'تاریخچهٔ ویرایش' });
    const entries = history.getByRole('list', { name: 'تغییرات خبر' });
    await expect(entries).toContainText('مدیر سیستم ویرایش کرد: عنوان');
    await expect(entries).toContainText('مدیر سیستم پیش‌نویس را منتشر کرد');
    await history.getByRole('button', { name: 'پیش از این ویرایش چه بود؟' }).click();
    await expect(entries).toContainText(`عنوان: ${TITLE}`);
    await context.close();
  });

  test('the colleague reads the answer, shared without their name', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'employee');
    await page.goto('/#notifications');
    await expect(page.getByRole('main')).toContainText('پاسخ پرسش شما 💬');
    const dialog = await openItem(page, `${TITLE} (ساعت ۱۰ تا ۱۳)`);
    await expect(dialog.getByRole('list', { name: 'پرسش‌های شما' })).toContainText('بله، ایمیل‌ها بعد از وصل شدن دوباره می‌رسند.');
    await expect(dialog.getByRole('list', { name: 'پرسش‌های شما' })).toContainText('پاسخ داده شد و برای همه هم آمد');
    await context.close();

    // A visitor sees the shared question and answer, without the asker's name or own details.
    const guest = await browser.newContext();
    const visitor = await guest.newPage();
    const item = await openItem(visitor, `${TITLE} (ساعت ۱۰ تا ۱۳)`);
    const shared = item.getByRole('list', { name: 'پرسش‌ها و پاسخ‌های ناشر' });
    await expect(shared).toContainText('پرسش: ایمیل‌ها در این مدت می‌رسند؟');
    await expect(shared).not.toContainText('جلسه با مشتری');
    await expect(item).not.toContainText('سارا احمدی');
    await guest.close();
  });
});
