import { expect, test, type Browser } from '@playwright/test';
import moment from 'moment-jalaali';

const asRole = async (browser: Browser, role: 'admin' | 'employee') => {
  const context = await browser.newContext({ storageState: `e2e/.auth/${role}.json` });
  return { context, page: await context.newPage() };
};

// «یادداشت کارهای من» is on from the start and sits in the dashboard's side column under «کارهای من».
// A colleague writes a note with a one-tap due date, adds a circular from the news page (a date is
// required), ticks a note off and takes it back with «برگردان», and finds the note in the calendar.
test.describe('personal to-do notes', () => {
  test.describe.configure({ mode: 'serial' });

  test('a colleague writes notes, adds a circular and ticks a note off', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'employee');
    await page.goto('/#dashboard');
    const card = page.getByRole('region', { name: 'یادداشت کارهای من' });
    await expect(card).toContainText('فقط خودتان می‌بینید');

    // The apps come first; the two to-do cards head the narrow side column, next to the news.
    const systems = await page.getByRole('region', { name: 'سامانه‌های سازمان' }).boundingBox();
    const tasks = await page.getByRole('region', { name: 'کارهای من', exact: true }).boundingBox();
    const notes = await card.boundingBox();
    const news = await page.getByRole('heading', { name: 'آخرین اخبار و اطلاعیه‌ها' }).boundingBox();
    expect(systems!.y).toBeLessThan(tasks!.y);
    expect(tasks!.y).toBeLessThan(notes!.y);
    expect(notes!.width).toBeLessThan(systems!.width / 2);
    expect(notes!.x).toBeLessThan(news!.x);

    await card.getByRole('button', { name: 'کار تازه' }).click();
    await card.getByRole('textbox', { name: 'عنوان کار تازه' }).fill('تمدید بیمهٔ تکمیلی');
    // No due date, no note.
    await expect(card.getByRole('button', { name: 'افزودن' })).toBeDisabled();
    await card.getByRole('button', { name: 'امروز' }).click();
    await card.getByRole('button', { name: 'افزودن' }).click();
    const row = card.getByRole('checkbox', { name: 'انجام شد: تمدید بیمهٔ تکمیلی' });
    await expect(row).toBeVisible();
    await expect(card.getByRole('group', { name: 'امروز' })).toContainText('تمدید بیمهٔ تکمیلی');
    // Due today: counted next to «داشبورد» in the menu.
    await expect(page.getByRole('navigation', { name: 'منوی اصلی' }).getByRole('button', { name: /داشبورد/ })).toContainText('۱ کار');

    // Starred, then postponed to tomorrow.
    await card.getByRole('button', { name: 'مهم: تمدید بیمهٔ تکمیلی' }).click();
    await expect(card.getByRole('button', { name: 'برداشتن ستارهٔ تمدید بیمهٔ تکمیلی' })).toBeVisible();
    await card.getByRole('button', { name: 'به تعویق انداختن تمدید بیمهٔ تکمیلی' }).click();
    await card.getByRole('button', { name: 'فردا' }).click();
    await expect(card.getByRole('group', { name: /این هفته|بعداً/ })).toContainText('تمدید بیمهٔ تکمیلی');

    await page.goto('/#news');
    await page.getByRole('button', { name: 'بخشنامهٔ ایمنی' }).first().click();
    const article = page.getByRole('dialog', { name: 'بخشنامهٔ ایمنی' });
    await article.getByRole('button', { name: 'افزودن به یادداشت کارهای من' }).click();
    const form = page.getByRole('dialog', { name: 'افزودن به یادداشت کارهای من' });
    await expect(form.getByLabel('چه کاری؟')).toHaveValue('مطالعه و تأیید: بخشنامهٔ ایمنی');
    await expect(form.getByRole('button', { name: 'افزودن', exact: true })).toBeDisabled();
    await form.getByRole('button', { name: 'امروز' }).click();
    await form.getByRole('button', { name: 'افزودن', exact: true }).click();
    await expect(form).toBeHidden();
    await expect(article.getByRole('button', { name: 'در یادداشت کارهای من' })).toBeVisible();
    await article.getByRole('button', { name: 'بستن' }).last().click();

    // Ticked off by mistake and taken back, then ticked off for real.
    await page.goto('/#dashboard');
    await card.getByRole('checkbox', { name: 'انجام شد: تمدید بیمهٔ تکمیلی' }).click();
    await page.getByRole('button', { name: 'برگردان' }).click();
    await expect(card.getByRole('checkbox', { name: 'انجام شد: تمدید بیمهٔ تکمیلی' })).toBeVisible();
    await card.getByRole('checkbox', { name: 'انجام شد: تمدید بیمهٔ تکمیلی' }).click();
    await expect(card.getByRole('button', { name: /انجام‌شده‌ها/ })).toContainText('۱');
    await card.getByRole('button', { name: 'رفتن به خبر' }).click();
    await expect(page.getByRole('dialog', { name: 'بخشنامهٔ ایمنی' })).toBeVisible();

    // The circular's note shows in the calendar, for this person only.
    await page.goto('/#calendar');
    await page.getByRole('button', { name: 'هفته', exact: true }).click();
    await expect(page.getByRole('list', { name: 'برنامهٔ هفته' })).toContainText('مطالعه و تأیید: بخشنامهٔ ایمنی');
    await context.close();
  });

  test('the «یادداشت‌های من» page shows every note as a card, with search, steps and the history', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'employee');
    const dueDate = moment().format('jYYYY/jMM/jDD');
    await page.goto('/#dashboard');
    for (let i = 1; i <= 7; i++) {
      const res = await page.request.post('/api/todos', {
        data: { title: `کار شمارهٔ ${i}`, dueDate, ...(i === 1 ? { steps: [{ text: 'گام اول' }, { text: 'گام دوم' }] } : {}) },
      });
      expect(res.ok()).toBe(true);
    }
    await page.reload();
    // The dashboard card stays short and opens the page.
    const card = page.getByRole('region', { name: 'یادداشت کارهای من' });
    await expect(card.getByRole('button', { name: /نمایش همه/ })).toBeVisible();
    await card.getByRole('button', { name: 'صفحهٔ یادداشت‌های من' }).click();
    await expect(page).toHaveURL(/#todos/);
    await expect(page.getByRole('heading', { name: 'یادداشت‌های من' })).toBeVisible();
    for (let i = 1; i <= 7; i++) await expect(page.getByRole('listitem', { name: `کار شمارهٔ ${i}` })).toBeVisible();

    // Steps are ticked on the card itself.
    const first = page.getByRole('listitem', { name: 'کار شمارهٔ 1', exact: true });
    await first.getByRole('checkbox', { name: 'گام اول' }).click();
    await expect(first.getByRole('checkbox', { name: 'گام اول' })).toBeChecked();
    await expect(first).toContainText('۱ از ۲ گام');

    await page.getByRole('searchbox', { name: 'جستجو در یادداشت‌ها' }).fill('گام دوم');
    await expect(page.getByRole('listitem', { name: /کار شمارهٔ/ })).toHaveCount(1);
    await page.getByRole('searchbox', { name: 'جستجو در یادداشت‌ها' }).fill('');

    // Done notes move to the history and can be brought back.
    await page.getByRole('listitem', { name: 'کار شمارهٔ 7' }).getByRole('checkbox', { name: 'انجام شد: کار شمارهٔ 7' }).click();
    await page.getByRole('button', { name: /انجام‌شده‌ها/ }).click();
    const history = page.getByRole('region', { name: 'سوابق انجام‌شده‌ها' });
    await expect(history.getByRole('listitem', { name: 'کار شمارهٔ 7' })).toContainText('انجام شد');
    await history.getByRole('button', { name: 'برگرداندن کار شمارهٔ 7' }).click();
    await expect(history.getByRole('listitem', { name: 'کار شمارهٔ 7' })).toHaveCount(0);
    await context.close();
  });

  test('is gone everywhere once the administrator switches it off', async ({ browser }) => {
    const admin = await asRole(browser, 'admin');
    expect((await admin.page.request.put('/api/settings/features/todos', { data: { state: 'off' } })).ok()).toBe(true);
    const { context, page } = await asRole(browser, 'employee');
    await page.goto('/#dashboard');
    await expect(page.getByRole('region', { name: 'کارهای من', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'یادداشت کارهای من' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'منوی اصلی' }).getByRole('button', { name: 'یادداشت‌های من' })).toHaveCount(0);
    await page.goto('/#todos');
    await expect(page.getByRole('heading', { name: 'یادداشت‌های من' })).toHaveCount(0);
    await context.close();
    expect((await admin.page.request.put('/api/settings/features/todos', { data: { state: 'on' } })).ok()).toBe(true);
    await admin.context.close();
  });
});
