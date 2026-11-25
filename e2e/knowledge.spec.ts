import { expect, test, type Browser } from '@playwright/test';

const GUIDE = 'چطور گواهی اشتغال بگیرم؟';

const asRole = async (browser: Browser, role: 'admin' | 'employee') => {
  const context = await browser.newContext({ storageState: `e2e/.auth/${role}.json` });
  return { context, page: await context.newPage() };
};

// A guide written by a document manager is found by a colleague, who asks its owner when the
// answer is missing; the sales department gets a page with its head, people and that guide; search
// looks inside an uploaded file and records what nobody could find.
test.describe('guides, department pages and search', () => {
  test.describe.configure({ mode: 'serial' });

  test('a document manager writes a guide for the sales department', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'admin');
    await page.goto('/#guides');
    await page.getByRole('button', { name: 'نوشتن راهنما' }).click();
    const dialog = page.getByRole('dialog', { name: 'نوشتن راهنما' });
    await dialog.locator('#guide-title').fill(GUIDE);
    await dialog.locator('#guide-category').fill('پرسش‌های رایج');
    await dialog.locator('#guide-department').click();
    await page.getByRole('option', { name: 'فروش', exact: true }).click();
    await dialog.locator('#guide-owner').click();
    await page.getByRole('option', { name: 'مدیر سیستم · مدیر فناوری' }).click();
    await dialog.locator('#guide-summary').fill('درخواست را در سامانهٔ اتوماسیون ثبت کنید.');
    await dialog.getByRole('textbox', { name: 'متن کامل' }).fill('ابتدا فرم درخواست گواهی را پر کنید و برای امور اداری بفرستید.');
    await dialog.getByRole('button', { name: 'انتشار راهنما' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: new RegExp(GUIDE) })).toContainText('مسئول: مدیر سیستم');
    await context.close();
  });

  test('a colleague finds it by a word in its text and asks the owner a question', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'employee');
    await page.goto('/#guides');
    await page.getByRole('searchbox', { name: 'جستجو در راهنماها' }).fill('امور اداری');
    await page.getByRole('button', { name: new RegExp(GUIDE) }).click();
    const view = page.getByRole('dialog', { name: GUIDE });
    await expect(view).toContainText('فرم درخواست گواهی');
    await expect(view).toContainText('مسئول: مدیر سیستم');
    await view.getByRole('button', { name: 'جوابم را پیدا نکردم' }).click();
    await view.getByLabel(/چه چیزی را پیدا نکردید/).fill('گواهی به زبان انگلیسی هم صادر می‌شود؟');
    await view.getByRole('button', { name: 'فرستادن پرسش' }).click();
    await expect(view).toContainText('پرسش شما برای مدیر سیستم فرستاده شد');
    await context.close();

    const admin = await asRole(browser, 'admin');
    await admin.page.goto('/#notifications');
    await expect(admin.page.getByText(`پرسش دربارهٔ راهنمای «${GUIDE}»`)).toBeVisible();
    await admin.context.close();
  });

  test('the sales department page shows its head, people and guide', async ({ browser }) => {
    const admin = await asRole(browser, 'admin');
    await admin.page.goto('/#departments');
    await admin.page.getByRole('button', { name: /^فروش/ }).click();
    await admin.page.getByRole('button', { name: 'ویرایش صفحه' }).click();
    const dialog = admin.page.getByRole('dialog', { name: 'صفحهٔ واحد فروش' });
    await dialog.locator('#department-head').click();
    await admin.page.getByRole('option', { name: 'سارا احمدی · کارشناس' }).click();
    await dialog.getByRole('textbox', { name: 'متن کامل' }).fill('پیش‌فاکتور، تخفیف و پیگیری سفارش مشتریان.');
    await dialog.getByRole('button', { name: 'ذخیره' }).click();
    await expect(dialog).toBeHidden();
    await admin.context.close();

    const { context, page } = await asRole(browser, 'employee');
    await page.goto('/#departments');
    await page.getByRole('button', { name: /^فروش/ }).click();
    await expect(page.getByRole('heading', { name: 'فروش', level: 2 })).toBeVisible();
    await expect(page.getByText('پیش‌فاکتور، تخفیف و پیگیری سفارش مشتریان.')).toBeVisible();
    await expect(page.getByRole('button', { name: /مسئول واحد سارا احمدی/ })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(GUIDE) })).toBeVisible();
    // The head keeps the page current without being a portal admin.
    await expect(page.getByRole('button', { name: 'ویرایش صفحه' })).toBeVisible();
    await context.close();
  });

  test('search finds words inside a file and records searches that found nothing', async ({ browser }) => {
    const admin = await asRole(browser, 'admin');
    await admin.page.goto('/#documents');
    await admin.page.getByRole('button', { name: 'افزودن سند' }).click();
    const dialog = admin.page.getByRole('dialog', { name: 'افزودن سند یا فرم' });
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'mission.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('هزینهٔ مأموریت شهرستان روزانه با فرم ۱۲ پرداخت می‌شود.'),
    });
    await dialog.locator('#doc-title').fill('آیین‌نامهٔ سفر');
    await dialog.getByRole('button', { name: 'افزودن به کتابخانه' }).click();
    await expect(dialog).toBeHidden();
    await admin.context.close();

    const { context, page } = await asRole(browser, 'employee');
    await page.goto('/#search');
    const box = page.getByRole('textbox', { name: 'جستجو در پرتال' });
    await box.fill('مأموریت شهرستان');
    const result = page.getByRole('button', { name: /آیین‌نامهٔ سفر/ });
    await expect(result).toContainText('یافته در متن فایل');
    await expect(result).toContainText('فرم ۱۲');

    await box.fill('بیمه تکمیلی دندان');
    await expect(page.getByText('هیچ نتیجه مرتبطی')).toBeVisible();
    await expect(page.getByText(/جستجوهای بی‌نتیجه .* ثبت می‌شوند/)).toBeVisible();
    // Recorded once typing has stopped for a moment.
    await page.waitForResponse((res) => res.url().endsWith('/api/search/misses') && res.request().method() === 'POST');
    await context.close();

    const reports = await asRole(browser, 'admin');
    await reports.page.goto('/#reports');
    await reports.page.getByRole('tab', { name: 'مشارکت همکاران' }).click();
    await expect(reports.page.getByRole('region', { name: 'جستجوهای بی‌نتیجه' })).toContainText('بیمه تکمیلی دندان');
    await reports.context.close();
  });

  test('a document manager brings in questions and answers from an Excel file', async ({ browser }) => {
    const csv = [
      'پرسش,دسته,پاسخ کوتاه,متن کامل,واحد,مسئول',
      'برای ازدواج چه مرخصی‌ای دارم؟,مرخصی,۳ روز مرخصی با مزد.,"این مرخصی برای این موارد است:\n- ازدواج دائم\n- فوت همسر، پدر، مادر و فرزندان",فروش,مدیر سیستم',
      'مرخصی ساعتی چطور حساب می‌شود؟,مرخصی,از مرخصی سالانه کم می‌شود.,"۱. درخواست را ثبت کنید.\n۲. تأیید سرپرست را بگیرید.",,',
      'ساعت کاری چقدر است؟,حضور و غیاب,,۴۴ ساعت در هفته.,واحدی که نیست,',
    ].join('\r\n');
    const file = { name: 'guides.csv', mimeType: 'text/csv', buffer: Buffer.from(`\uFEFF${csv}`) };

    const { context, page } = await asRole(browser, 'admin');
    await page.goto('/#guides');
    await page.getByRole('button', { name: 'ورود از اکسل' }).click();
    const dialog = page.getByRole('dialog', { name: 'ورود راهنماها از اکسل' });
    await dialog.locator('input[type="file"]').setInputFiles(file);
    await expect(dialog.getByText('۲ راهنمای جدید')).toBeVisible();
    await expect(dialog.getByText('۱ ردیف با خطا (ثبت نمی‌شود)')).toBeVisible();
    await expect(dialog.getByRole('row', { name: /ساعت کاری چقدر است/ })).toContainText('«واحدی که نیست» در فهرست واحدهای پرتال نیست');
    await dialog.getByRole('button', { name: 'ثبت ۲ راهنما' }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByRole('heading', { name: /^مرخصی/, level: 3 })).toContainText('(۲)');
    await page.getByRole('button', { name: /برای ازدواج چه مرخصی‌ای دارم/ }).click();
    const view = page.getByRole('dialog', { name: 'برای ازدواج چه مرخصی‌ای دارم؟' });
    await expect(view.getByRole('listitem')).toHaveText(['ازدواج دائم', 'فوت همسر، پدر، مادر و فرزندان']);
    await expect(view).toContainText('مسئول: مدیر سیستم');
    await view.getByRole('button', { name: 'بستن' }).first().click();

    // The same file again writes nothing twice.
    await page.getByRole('button', { name: 'ورود از اکسل' }).click();
    await dialog.locator('input[type="file"]').setInputFiles(file);
    await expect(dialog.getByText('۲ راهنما بدون تغییر')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'ثبت ۰ راهنما' })).toBeDisabled();
    await context.close();

    const employee = await asRole(browser, 'employee');
    await employee.page.goto('/#guides');
    await expect(employee.page.getByRole('button', { name: /مرخصی ساعتی چطور حساب می‌شود/ })).toBeVisible();
    await expect(employee.page.getByRole('button', { name: 'ورود از اکسل' })).toHaveCount(0);
    await employee.context.close();
  });
});
