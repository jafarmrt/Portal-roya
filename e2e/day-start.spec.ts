import { devices, expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import moment from 'moment-jalaali';
import { MOOD_REPLIES } from '../shared/mood';

// «شروع روز»: the daily mood waits right under the welcome until it is answered; then the card says
// how the organisation is today («حال‌وهوای ما», never with fewer than five answers) and shows the
// colleague's own month («ماه من»). Each test has colleagues of its own, so nobody else's dashboard changes.

type Colleague = { id: string; page: Page; close: () => Promise<void> };

async function colleague(browser: Browser, username: string, firstName: string, context: BrowserContextOptions = {}): Promise<Colleague> {
  const admin = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
  const added = await admin.request.post('/api/employees', {
    // Not «تولید»: e2e/departments.spec.ts counts on nobody working there yet.
    data: { username, firstName, lastName: 'روزبه', position: 'کارشناس', department: 'فناوری اطلاعات', role: 'employee' },
  });
  expect(added.ok(), await added.text()).toBe(true);
  const { temporaryPassword, employee } = await added.json();
  await admin.close();
  const ctx = await browser.newContext(context);
  await ctx.request.post('/api/auth/login', { data: { username, password: temporaryPassword } });
  await ctx.request.post('/api/auth/change-password', { data: { currentPassword: temporaryPassword, newPassword: `${username}-Pass-123` } });
  return { id: employee.id as string, page: await ctx.newPage(), close: () => ctx.close() };
}

const answer = async (who: Colleague, mood: string) => expect((await who.page.request.post('/api/moods', { data: { mood } })).ok()).toBe(true);
const card = (page: Page) => page.getByTestId('day-start');
const fa = (n: number) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

test.describe('«شروع روز»', () => {
  test.describe.configure({ mode: 'serial' });

  const others: Colleague[] = [];
  test.afterAll(async () => {
    for (const o of others) await o.close();
  });

  test('with too few answers the card shows no number', async ({ browser }) => {
    const first = await colleague(browser, 'day.first', 'نگار');
    others.push(first);
    const page = first.page;
    await page.goto('/#dashboard');

    // Unanswered: the first card after the welcome, above the organisation's apps.
    await expect(page.getByTestId('day-start-top')).toBeVisible();
    await expect(card(page)).toContainText('حال امروزتان چطور است؟');
    await expect(card(page)).toContainText('محرمانه است؛ مدیران فقط آمار کلی را می‌بینند.');
    const top = await card(page).boundingBox();
    const systems = await page.getByRole('region', { name: 'سامانه‌های سازمان' }).boundingBox();
    expect(top!.y).toBeLessThan(systems!.y);

    await card(page).getByRole('button', { name: 'خوب', exact: true }).click();
    await expect(card(page).getByRole('heading', { name: 'حال امروز شما: خوب' })).toBeVisible();
    // One of the ten sentences for «خوب».
    expect(MOOD_REPLIES['خوب']).toContain(await page.getByTestId('mood-reply').innerText());
    await expect(page.getByTestId('team-mood')).toContainText('هنوز پاسخ کافی نرسیده؛ بعداً سر بزنید.');
    await expect(page.getByTestId('team-mood')).not.toContainText('٪');
    // The answer is read where the tap was: the card has not moved away.
    await expect(page.getByTestId('day-start-top')).toBeVisible();
  });

  test('after the fifth answer: today’s share, the week, «ماه من», a changed answer, and its own place next time', async ({ browser }) => {
    // «نگار» said «خوب» above; three more colleagues answer, and «مینا» is the fifth.
    for (const [i, mood] of ['عالی', 'خوب', 'بد'].entries()) {
      const one = await colleague(browser, `day.other${i}`, 'همکار');
      others.push(one);
      await answer(one, mood);
    }
    const mina = await colleague(browser, 'day.mina', 'مینا');
    others.push(mina);
    const page = mina.page;
    await page.goto('/#dashboard');
    await card(page).getByRole('button', { name: 'عالی', exact: true }).click();

    const team = page.getByTestId('team-mood');
    await expect(team).toContainText('امروز ۸۰٪ همکاران حالشان خوب یا عالی است.');
    await expect(team).toContainText('۵ پاسخ تا این لحظه');
    // Seven days, today's with its share and the earlier ones without answers.
    const days = team.getByRole('listitem');
    await expect(days).toHaveCount(7);
    await expect(days.last()).toHaveAttribute('aria-label', /۸۰٪ خوب یا عالی/);
    await expect(days.first()).toHaveAttribute('aria-label', /پاسخ کافی نبود/);

    // «ماه من»: today carries the answer; only the colleague sees it.
    await card(page).getByRole('button', { name: 'ماه من' }).click();
    const now = moment();
    const todayLabel = `${fa(now.jDate())} ${MONTHS[now.jMonth()]}: عالی`;
    await expect(page.getByTestId('my-month').getByLabel(todayLabel)).toBeVisible();
    await expect(page.getByTestId('my-month')).toContainText('۱ روز از این ماه را ثبت کرده‌اید');
    await expect(page.getByTestId('my-month')).toContainText('فقط خودتان می‌بینید');

    // A mistaken tap is put right, and counted once.
    await card(page).getByRole('button', { name: 'تغییر' }).click();
    await card(page).getByRole('button', { name: 'بد', exact: true }).click();
    await expect(card(page).getByRole('heading', { name: 'حال امروز شما: بد' })).toBeVisible();
    await expect(team).toContainText('امروز ۶۰٪ همکاران حالشان خوب یا عالی است.');
    await expect(team).toContainText('۵ پاسخ تا این لحظه');

    // On the next visit the card is still there, answered, in the side column and no longer on top.
    // Also when the portal learns late who is signed in and shows a visitor's page for a moment first.
    await page.route('**/api/auth/me', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    await page.reload();
    await expect(card(page).getByRole('heading', { name: 'حال امروز شما: بد' })).toBeVisible();
    await expect(page.getByTestId('day-start-top')).toHaveCount(0);
    const news = await page.getByRole('heading', { name: 'آخرین اخبار و اطلاعیه‌ها' }).boundingBox();
    const side = await card(page).boundingBox();
    expect(side!.x).toBeLessThan(news!.x);
    await expect(page.getByTestId('team-mood')).toContainText('۶۰٪');
  });

  test('the managers’ report counts the day once it has five answers, without names', async ({ browser }) => {
    const admin = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const page = await admin.newPage();
    await page.goto('/#reports');
    await page.getByRole('tab', { name: 'حال‌وهوای سازمان' }).click();
    const report = page.getByRole('region', { name: 'حال‌وهوای سازمان' });
    await report.getByRole('button', { name: 'امروز' }).click();
    await expect(report).toContainText('۵ پاسخ');
    await expect(report).toContainText('روزهای با کمتر از ۵ پاسخ شمرده نمی‌شوند');
    await expect(report).not.toContainText('مینا');
    await admin.close();
  });
});

test.describe('«شروع روز» on a phone @mobile', () => {
  test('the unanswered card is the first card and fits the screen @mobile', async ({ browser }) => {
    const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7'];
    const leila = await colleague(browser, 'day.phone', 'لیلا', { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
    const page = leila.page;
    await page.goto('/#dashboard');
    await expect(page.getByTestId('day-start-top')).toBeVisible();
    const box = await card(page).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    // All five answers are within reach of a thumb, side by side.
    for (const mood of ['خیلی بد', 'بد', 'معمولی', 'خوب', 'عالی']) await expect(card(page).getByRole('button', { name: mood, exact: true })).toBeVisible();
    // The tap is answered here, not by the server: the tests above count today's real answers.
    await page.route('**/api/moods', (route) =>
      route.fulfill({ json: { mood: { id: '1', userId: leila.id, date: moment().format('jYYYY/jMM/jDD'), mood: 'معمولی' } } }),
    );
    await card(page).getByRole('button', { name: 'معمولی', exact: true }).tap();
    await expect(card(page).getByRole('heading', { name: 'حال امروز شما: معمولی' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await leila.close();
  });
});
