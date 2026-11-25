import { devices, expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import moment from 'moment-jalaali';
import { WEEK_END_DAY } from '../shared/dayStep';
import { previousWeek } from '../shared/dayWeek';
import { MOOD_REPLIES } from '../shared/mood';

// «شروع روز»: the daily mood waits right under the welcome until it is answered; then the card says
// how the organisation is today («حال‌وهوای ما», never with fewer than five answers) and shows the
// colleague's own month («ماه من»). Each test has colleagues of its own, so nobody else's dashboard changes.

type Colleague = { id: string; page: Page; close: () => Promise<void> };

async function colleague(browser: Browser, username: string, firstName: string, context: BrowserContextOptions = {}, role = 'employee'): Promise<Colleague> {
  const admin = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
  const added = await admin.request.post('/api/employees', {
    // Not «تولید»: e2e/departments.spec.ts counts on nobody working there yet.
    data: { username, firstName, lastName: 'روزبه', position: 'کارشناس', department: 'فناوری اطلاعات', role },
  });
  expect(added.ok(), await added.text()).toBe(true);
  const { temporaryPassword, employee } = await added.json();
  await admin.close();
  const ctx = await browser.newContext(context);
  await ctx.request.post('/api/auth/login', { data: { username, password: temporaryPassword } });
  await ctx.request.post('/api/auth/change-password', { data: { currentPassword: temporaryPassword, newPassword: `${username}-Pass-123` } });
  return { id: employee.id as string, page: await ctx.newPage(), close: () => ctx.close() };
}

/** Confirms the circular every colleague finds waiting, so the day's step is about something else. */
async function confirmCirculars(who: Colleague) {
  const list = (await (await who.page.request.get('/api/news')).json()) as { items: { id: string; requiresAck: boolean; acknowledgedAt: string | null }[] };
  for (const item of list.items.filter((n) => n.requiresAck && !n.acknowledgedAt)) expect((await who.page.request.post(`/api/news/${item.id}/ack`)).ok()).toBe(true);
}

/**
 * The colleague's mood is answered by the test, not the server, here and after a reload: the tests of
 * «حال‌وهوای ما» above count today's real answers. The clock is set to `hour` today (the same day as the server's).
 */
async function pretendMood(page: Page, hour: number) {
  const today = moment().format('jYYYY/jMM/jDD');
  let mine: { id: string; userId: string; date: string; mood: string }[] = [];
  await page.route('**/api/moods', (route) => {
    mine = [{ id: '1', userId: 'me', date: today, mood: route.request().postDataJSON().mood }];
    return route.fulfill({ json: { mood: mine[0] } });
  });
  await page.route('**/api/moods/me', (route) => route.fulfill({ json: mine }));
  // No question that day: these tests are about the step that follows it.
  await page.route('**/api/moods/question', (route) => route.fulfill({ json: { date: today, question: null, mine: null, results: null } }));
  await page.clock.setFixedTime(moment().hour(hour).minute(0).second(0).toDate());
}

const step = (page: Page) => page.getByTestId('day-step');
const choose = (page: Page, mood: string) => card(page).getByRole('button', { name: mood, exact: true }).click();

const answer = async (who: Colleague, mood: string) => expect((await who.page.request.post('/api/moods', { data: { mood } })).ok()).toBe(true);
const card = (page: Page) => page.getByTestId('day-start');
const fa = (n: number) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

// The tests that write real answers to today's mood and count them run one after another, in this
// order: «حال‌وهوای ما» is exact about how many colleagues have answered, so nothing else may answer
// beside it. Every other test in this file answers through pretendMood() and leaves the day's count alone.
test.describe('with real answers to the day’s mood', () => {
  test.describe.configure({ mode: 'serial' });

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
      await card(page).getByRole('button', { name: 'تغییر', exact: true }).click();
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

  // «پرسش روز»: after the mood (and what affected it, if the colleague says), one question that is new
  // every day. What everyone answered is shown after answering, never with fewer than five answers; then
  // comes the day's step.
  test.describe('«پرسش روز»', () => {
    test.describe.configure({ mode: 'serial' });

    const others: Colleague[] = [];
    test.afterAll(async () => {
      for (const o of others) await o.close();
    });
    let asked = '';

    test('reasons with one tap, the question, what everyone said, and then the day’s step', async ({ browser }) => {
      const lead = await colleague(browser, 'ask.lead', 'لیلا');
      others.push(lead);
      const today = (await (await lead.page.request.get('/api/moods/question')).json()) as { question: { text: string; options: string[] } };
      asked = today.question.text;
      // Four colleagues answered before her.
      for (let i = 0; i < 4; i++) {
        const one = await colleague(browser, `ask.other${i}`, 'همکار');
        others.push(one);
        expect((await one.page.request.post('/api/moods/question', { data: { option: i % 2 } })).ok()).toBe(true);
        // Their mood with a reason and a step shown, for the managers' report below.
        await answer(one, i < 2 ? 'عالی' : 'بد');
        expect((await one.page.request.put('/api/moods/reasons', { data: { reasons: ['load'] } })).ok()).toBe(true);
        expect((await one.page.request.post('/api/moods/steps', { data: { kind: 'plan', outcome: 'shown' } })).ok()).toBe(true);
      }
      expect((await lead.page.request.post('/api/moods/steps', { data: { kind: 'plan', outcome: 'shown' } })).ok()).toBe(true);
      const page = lead.page;
      await page.goto('/#dashboard');
      await choose(page, 'خوب');

      // What affected the day: optional, one tap each.
      const reasons = page.getByTestId('mood-reasons');
      await reasons.getByRole('button', { name: 'حجم کار' }).click();
      await expect(reasons.getByRole('button', { name: 'حجم کار' })).toHaveAttribute('aria-pressed', 'true');
      await expect(reasons.getByRole('button', { name: 'یک خبر خوب' })).toBeVisible();

      // The question waits; the step does not come before it.
      const question = page.getByTestId('day-question');
      await expect(question).toContainText(asked);
      await expect(step(page)).toHaveCount(0);
      await expect(page.getByTestId('day-question-results')).toHaveCount(0);
      await question.getByRole('button', { name: today.question.options[0], exact: true }).click();

      // She is the fifth: shares appear, with her own answer marked.
      const results = page.getByTestId('day-question-results');
      await expect(results).toContainText(asked);
      await expect(results).toContainText('۵ پاسخ تا این لحظه');
      await expect(results).toContainText('٪');
      await expect(results.getByLabel('پاسخ شما')).toHaveCount(1);
      await expect(question).toHaveCount(0);
      // Now the day's step: every new colleague finds the circular waiting.
      await expect(step(page)).toBeVisible();

      // Another answer is counted once.
      await results.getByRole('button', { name: 'تغییر پاسخ' }).click();
      await page.getByTestId('day-question').getByRole('button', { name: today.question.options[1], exact: true }).click();
      await expect(page.getByTestId('day-question-results')).toContainText('۵ پاسخ تا این لحظه');

      // On the next visit the answers are there and the reasons are not offered again.
      await page.reload();
      await expect(page.getByTestId('day-question-results')).toContainText(asked);
      await expect(page.getByTestId('mood-reasons')).toHaveCount(0);
      await expect(page.getByTestId('day-question')).toHaveCount(0);
      const mine = (await (await page.request.get('/api/moods/me')).json()) as { reasons: string[] }[];
      expect(mine[0].reasons).toEqual(['load']);
    });

    test('the question can be passed over, and taken up again', async ({ browser }) => {
      const who = await colleague(browser, 'ask.skip', 'سینا');
      others.push(who);
      const page = who.page;
      await page.goto('/#dashboard');
      await choose(page, 'معمولی');
      await page.getByTestId('day-question').getByRole('button', { name: 'رد شدن' }).click();
      await expect(page.getByTestId('day-question')).toHaveCount(0);
      await expect(step(page)).toBeVisible();
      // Nothing of what others said is shown to someone who did not answer.
      await expect(page.getByTestId('day-question-results')).toHaveCount(0);
      await page.reload();
      await expect(page.getByTestId('day-question')).toHaveCount(0);
      await page.getByTestId('day-question-skipped').getByRole('button', { name: 'پاسخ می‌دهم' }).click();
      await expect(page.getByTestId('day-question')).toContainText(asked);
    });

    test('the managers’ report shows the day’s question with its totals', async ({ browser }) => {
      const admin = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
      const page = await admin.newPage();
      await page.goto('/#reports');
      await page.getByRole('tab', { name: 'حال‌وهوای سازمان' }).click();
      const report = page.getByTestId('day-questions-report');
      await expect(report).toContainText(asked);
      await expect(report).toContainText('۵ پاسخ');
      await expect(report).not.toContainText('لیلا');
      await admin.close();
    });

    test('the managers’ report: the trend, the units, what affected the days, the steps, Excel and a «شنیدیم» draft', async ({ browser }) => {
      const admin = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
      const page = await admin.newPage();
      await page.goto('/#reports');
      await page.getByRole('tab', { name: 'حال‌وهوای سازمان' }).click();
      const insights = page.getByTestId('mood-insights');
      await expect(insights.getByRole('heading', { name: 'روند حال‌وهوا' })).toBeVisible();
      await expect(insights).toContainText('میانگین حال');
      await expect(insights).toContainText('مشارکت روزانه');
      await expect(insights).toContainText('۱ روز');
      await expect(page.getByTestId('mood-trend')).toBeVisible();
      // Every colleague of these tests works in one unit; it has more than five of them.
      await expect(page.getByTestId('mood-units')).toContainText('فناوری اطلاعات');
      await expect(page.getByTestId('mood-reasons-report')).toContainText('حجم کار');
      await expect(page.getByTestId('mood-steps')).toContainText('سه کار امروز');
      await expect(insights).not.toContainText('لیلا');
      // The other ranges read the same day.
      await insights.getByRole('button', { name: '۱۲ ماه' }).click();
      await expect(insights.getByRole('button', { name: '۱۲ ماه' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('mood-units')).toContainText('فناوری اطلاعات');

      const download = page.waitForEvent('download');
      await insights.getByRole('button', { name: 'خروجی Excel' }).click();
      expect((await download).suggestedFilename()).toMatch(/^mood-.*\.csv$/);

      // «شنیدیم»: a draft for whoever publishes news; removed again so the other tests' news stay as they are.
      const drafted = page.waitForResponse((res) => res.url().endsWith('/api/moods/report/heard'));
      await insights.getByRole('button', { name: /پیش‌نویس خبر «شنیدیم»/ }).click();
      const { draftId } = (await (await drafted).json()) as { draftId: string };
      await expect(page.getByText('پیش‌نویس خبر «شنیدیم» ساخته شد.')).toBeVisible();
      expect((await page.request.delete(`/api/news/${draftId}`)).ok()).toBe(true);
      await admin.close();
    });

    test('whoever looks after «شروع روز» adds, switches off and deletes a question, and orders the steps', async ({ browser }) => {
      const admin = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
      const page = await admin.newPage();
      await page.goto('/#day-admin');
      await expect(page.getByRole('heading', { name: 'برنامهٔ شروع روز' })).toBeVisible();
      await expect(page.getByTestId('question-bank').getByRole('listitem').first()).toBeVisible();
      await expect(page.getByTestId('questions-low')).toHaveCount(0);

      // A question for a day next month.
      const day = moment().add(40, 'days').format('jYYYY/jMM/jDD');
      const text = 'آزمون مرورگر: جشن چطور بود؟';
      await page.getByRole('button', { name: 'پرسش تازه' }).click();
      const form = page.getByRole('dialog');
      await form.getByLabel('متن پرسش').fill(text);
      await form.getByLabel('گزینهٔ ۱', { exact: true }).fill('عالی بود');
      await form.getByLabel('گزینهٔ ۲', { exact: true }).fill('خوب بود');
      await form.getByRole('button', { name: 'گزینهٔ دیگر' }).click();
      await form.getByLabel('گزینهٔ ۳', { exact: true }).fill('نبودم');
      await form.getByLabel('موضوع').selectOption('occasion');
      // Without a day an occasion question cannot be saved.
      await expect(form.getByRole('button', { name: 'ذخیره' })).toBeDisabled();
      await form.getByLabel(/برای یک روز مشخص/).fill(day);
      await form.getByRole('button', { name: 'ذخیره' }).click();
      await expect(form).toHaveCount(0);

      const row = page.getByTestId('question-bank').getByRole('listitem').filter({ hasText: text });
      await expect(row).toContainText('عالی بود · خوب بود · نبودم');
      await expect(row).toContainText(`برای ${day.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])}`);
      await row.getByRole('button', { name: /^خاموش کردن/ }).click();
      await expect(row).toContainText('خاموش');
      page.once('dialog', (dialog) => void dialog.accept());
      await row.getByRole('button', { name: /^حذف/ }).click();
      await expect(row).toHaveCount(0);

      // The order of the steps: the last two change places, are saved, and are put back.
      await page.getByRole('tab', { name: 'ترتیب پیشنهادها' }).click();
      const order = page.getByTestId('step-order').getByRole('listitem');
      await expect(order).toHaveCount(7);
      await expect(order.last()).toContainText('سکه‌های مانده');
      await page.getByRole('button', { name: '«سکه‌های مانده» بالاتر' }).click();
      await expect(order.last()).toContainText('دورهٔ این هفته');
      await page.getByRole('button', { name: 'ذخیره' }).click();
      await expect.poll(async () => ((await (await page.request.get('/api/settings')).json()) as { dayStepOrder: string[] }).dayStepOrder.slice(-2)).toEqual(['coins', 'training']);
      await page.getByRole('button', { name: 'ترتیب پیش‌فرض' }).click();
      await page.getByRole('button', { name: 'ذخیره' }).click();
      await expect.poll(async () => ((await (await page.request.get('/api/settings')).json()) as { dayStepOrder: string[] }).dayStepOrder).toEqual([]);
      await admin.close();
    });
  });
});

// «یک قدم برای امروز»: after the mood, one step from what really waits for the colleague. The rows of
// the table are tested one by one in tests/dayStep.test.ts; here the steps are taken on the page.
// With too few answers the card keeps to one line each: no week of empty bars, and the day's question
// without its options again (the two answers are faked, so the day's real count is left alone).
test('with too few answers, «حال‌وهوای ما» and the question keep to one line each', async ({ browser }) => {
  const who = await colleague(browser, 'few.lines', 'پریا');
  const page = who.page;
  await pretendMood(page, 10);
  const today = moment().format('jYYYY/jMM/jDD');
  const days = Array.from({ length: 7 }, (_, i) => ({ date: moment().subtract(6 - i, 'days').format('jYYYY/jMM/jDD'), good: i === 2 ? 60 : null }));
  await page.route('**/api/moods/team', (route) => route.fulfill({ json: { date: today, answers: null, good: null, days } }));
  const question = { id: 'q1', text: 'این هفته چطور گذشت؟', options: ['عالی', 'خوب', 'معمولی', 'سخت'], theme: 'week' };
  await page.route('**/api/moods/question', (route) => route.fulfill({ json: { date: today, question, mine: 1, results: null } }));
  await page.goto('/#dashboard');
  await choose(page, 'خوب');

  const team = page.getByTestId('team-mood');
  await expect(team).toContainText('هنوز پاسخ کافی نرسیده؛ بعداً سر بزنید.');
  await expect(team.getByRole('list')).toHaveCount(0);
  const results = page.getByTestId('day-question-results');
  await expect(results).toContainText('این هفته چطور گذشت؟');
  await expect(page.getByTestId('day-question-few')).toContainText('پاسخ شما: خوب');
  await expect(page.getByTestId('day-question-few')).toContainText('دست‌کم ۵ نفر');
  await expect(results.getByRole('listitem')).toHaveCount(0);
  await expect(results).not.toContainText('معمولی');
  await expect(results.getByRole('button', { name: 'تغییر پاسخ' })).toBeVisible();
  await who.close();
});

test.describe('«یک قدم برای امروز»', () => {
  test('«سه کار امروز» writes the notes without leaving the dashboard, and that is the day’s one step', async ({ browser }) => {
    const who = await colleague(browser, 'step.plan', 'پریا');
    await confirmCirculars(who);
    const page = who.page;
    await pretendMood(page, 9);
    await page.goto('/#dashboard');
    await choose(page, 'معمولی');

    await expect(step(page)).toHaveAttribute('data-step', 'plan');
    await expect(step(page)).toContainText('سه کار مهم امروزتان چیست؟');
    // Nothing to save yet.
    await expect(step(page).getByRole('button', { name: 'ثبت' })).toBeDisabled();
    await step(page).getByRole('textbox', { name: 'کار اول' }).fill('بستن گزارش فروش هفته');
    await step(page).getByRole('textbox', { name: 'کار سوم' }).fill('تماس با تأمین‌کننده');
    await step(page).getByRole('button', { name: 'ثبت' }).click();

    await expect(page.getByTestId('day-step-done')).toContainText('۲ کار برای امروز در «یادداشت‌های من» ثبت شد.');
    expect(page.url()).toContain('#dashboard');
    // Both are in «یادداشت‌های من», due today.
    const notes = page.getByRole('region', { name: 'یادداشت‌های من' }).getByRole('group', { name: 'امروز' });
    await expect(notes).toContainText('بستن گزارش فروش هفته');
    await expect(notes).toContainText('تماس با تأمین‌کننده');
    // «کارهای ارجاعی» is still in preview for this colleague: nothing about handing work over.
    await expect(step(page).getByRole('button', { name: /سپردن/ })).toHaveCount(0);

    // Later the same day: the mood and «حال‌وهوای ما» are there, and no second step (a survey is open).
    await page.reload();
    await expect(card(page).getByRole('heading', { name: 'حال امروز شما: معمولی' })).toBeVisible();
    await expect(page.getByTestId('team-mood')).toBeVisible();
    await expect(step(page)).toHaveCount(0);
    await who.close();
  });

  test('a note just written can be handed to a colleague, with its title', async ({ browser }) => {
    // An administrator sees «کارهای ارجاعی» while it is in preview.
    const who = await colleague(browser, 'step.boss', 'کاوه', {}, 'admin');
    await confirmCirculars(who);
    const page = who.page;
    await pretendMood(page, 8);
    await page.goto('/#dashboard');
    await choose(page, 'معمولی');
    await step(page).getByRole('textbox', { name: 'کار اول' }).fill('آماده‌سازی جلسهٔ فردا');
    await step(page).getByRole('button', { name: 'ثبت' }).click();
    await step(page).getByRole('button', { name: 'سپردن «آماده‌سازی جلسهٔ فردا» به یک همکار' }).click();
    const form = page.getByRole('dialog', { name: 'سپردن کار به همکار' });
    await expect(form.getByLabel('چه کاری؟')).toHaveValue('آماده‌سازی جلسهٔ فردا');
    await who.close();
  });

  test('a waiting circular comes first; «امروز نه» closes the step for the day', async ({ browser }) => {
    const who = await colleague(browser, 'step.acks', 'هومن');
    const page = who.page;
    await pretendMood(page, 9);
    await page.goto('/#dashboard');
    await choose(page, 'خوب');
    await expect(step(page)).toHaveAttribute('data-step', 'acks');
    await expect(step(page)).toContainText('۱ بخشنامه منتظر تأیید شماست.');
    await expect(step(page)).toContainText('بخشنامهٔ ایمنی');
    await step(page).getByRole('button', { name: 'امروز نه' }).click();
    await expect(step(page)).toHaveCount(0);
    await page.reload();
    await expect(card(page).getByRole('heading', { name: 'حال امروز شما: خوب' })).toBeVisible();
    await expect(page.getByTestId('team-mood')).toBeVisible();
    await expect(step(page)).toHaveCount(0);
    await who.close();
  });

  test('on a hard day no work is suggested, only a quiet way to be heard', async ({ browser }) => {
    // A circular and a survey wait for this colleague too.
    const who = await colleague(browser, 'step.care', 'ژیلا');
    const page = who.page;
    await pretendMood(page, 9);
    await page.goto('/#dashboard');
    await choose(page, 'خیلی بد');
    await expect(step(page)).toHaveAttribute('data-step', 'care');
    await expect(step(page)).toContainText('می‌توانید آن را ناشناس بنویسید');
    await expect(step(page)).not.toContainText('بخشنامه');
    await expect(step(page).getByRole('button', { name: 'ثبت' })).toHaveCount(0);
    await step(page).getByRole('button', { name: 'نوشتن پیام ناشناس' }).click();
    await expect(page).toHaveURL(/#suggestions/);
    await who.close();
  });

  test('a kind switched off stays off on the following days', async ({ browser }) => {
    const who = await colleague(browser, 'step.mute', 'بهار');
    await confirmCirculars(who);
    const page = who.page;
    // The afternoon, so not «سه کار امروز»; a middling mood, so not a recognition: the open survey.
    await pretendMood(page, 15);
    await page.goto('/#dashboard');
    await choose(page, 'معمولی');
    await expect(step(page)).toHaveAttribute('data-step', 'poll');
    await expect(step(page)).toContainText('ناهار جمعه');
    await step(page).getByRole('button', { name: 'این را دیگر پیشنهاد نده' }).click();
    await expect(step(page)).toHaveCount(0);

    // The next day (the browser's memory moved a day back): the survey is still open, and not offered.
    await page.evaluate((id) => {
      const key = `roya.dayStep.${id}`;
      const memory = JSON.parse(window.localStorage.getItem(key)!);
      memory.last.date = '1400/01/01';
      window.localStorage.setItem(key, JSON.stringify(memory));
    }, who.id);
    await page.reload();
    await expect(page.getByTestId('team-mood')).toBeVisible();
    // On the last working day of the week the coins left are offered next (this colleague has them); on other days nothing is.
    // Either way, never the survey. The weekday is counted as the card counts it: Saturday is 0.
    if ((moment().day() + 1) % 7 === WEEK_END_DAY) await expect(step(page)).toHaveAttribute('data-step', 'coins');
    else await expect(step(page)).toHaveCount(0);
    expect(await page.evaluate((id) => JSON.parse(window.localStorage.getItem(`roya.dayStep.${id}`)!).muted, who.id)).toEqual(['poll']);
    await who.close();
  });

  test('work handed over is accepted from the card', async ({ browser }) => {
    const who = await colleague(browser, 'step.task', 'آرش', {}, 'admin');
    await confirmCirculars(who);
    const admin = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const handed = await admin.request.post('/api/tasks', {
      data: { title: 'بازبینی فهرست قیمت', note: '', dueDate: moment().add(2, 'day').format('jYYYY/jMM/jDD'), assigneeIds: [who.id] },
    });
    expect(handed.ok(), await handed.text()).toBe(true);
    await admin.close();
    const page = who.page;
    await pretendMood(page, 9);
    await page.goto('/#dashboard');
    await choose(page, 'خوب');
    await expect(step(page)).toHaveAttribute('data-step', 'tasksWaiting');
    await expect(step(page)).toContainText('۱ کار منتظر پاسخ شماست؛ می‌پذیرید؟');
    await step(page).getByRole('button', { name: 'پذیرفتن بازبینی فهرست قیمت' }).click();
    await expect(page.getByTestId('day-step-done')).toContainText('پذیرفتید؛ به همکارتان خبر داده شد.');
    const mine = (await (await page.request.get('/api/tasks')).json()) as { mine: { title: string; status: string }[] };
    expect(mine.mine.find((t) => t.title === 'بازبینی فهرست قیمت')?.status).toBe('accepted');
    await who.close();
  });

  test('a good mood with coins left opens the recognition form', async ({ browser }) => {
    const who = await colleague(browser, 'step.thanks', 'مهسا');
    await confirmCirculars(who);
    const page = who.page;
    // The afternoon, so «سه کار امروز» is not asked.
    await pretendMood(page, 15);
    await page.goto('/#dashboard');
    await choose(page, 'عالی');
    await expect(step(page)).toHaveAttribute('data-step', 'thanks');
    await step(page).getByRole('button', { name: 'قدردانی کن' }).click();
    await expect(page.getByRole('dialog', { name: 'قدردانی از یک همکار' })).toBeVisible();
    await who.close();
  });
});

// The other end of the day and of the week: the afternoon wrap-up of the day's notes, «هفتهٔ من»,
// and the morning reminder a colleague may switch on for themselves.
test.describe('«جمع‌بندی روز» و «هفتهٔ من»', () => {
  test('in the afternoon the open notes of the day go to tomorrow in one tap, once', async ({ browser }) => {
    const who = await colleague(browser, 'wrap.one', 'ترانه');
    await confirmCirculars(who);
    const today = moment().format('jYYYY/jMM/jDD');
    const tomorrow = moment().add(1, 'day').format('jYYYY/jMM/jDD');
    const add = async (title: string) => (await (await who.page.request.post('/api/todos', { data: { title, dueDate: today } })).json()) as { id: string };
    const done = await add('گزارش هفتگی');
    await add('تماس با تأمین‌کننده');
    expect((await who.page.request.patch(`/api/todos/${done.id}`, { data: { done: true } })).ok()).toBe(true);
    const page = who.page;
    await pretendMood(page, 16);
    await page.goto('/#dashboard');
    await choose(page, 'خوب');

    // The wrap-up takes the place of the day's step.
    const wrap = page.getByTestId('day-wrap');
    await expect(wrap).toContainText('از ۲ کار امروز ۱ تا انجام شد. آن یکی را به فردا ببرم؟');
    await expect(wrap).toContainText('تماس با تأمین‌کننده');
    await expect(step(page)).toHaveCount(0);
    await wrap.getByRole('button', { name: 'ببر به فردا' }).click();
    await expect(page.getByText('یادداشت به فردا رفت.')).toBeVisible();
    await expect(wrap).toHaveCount(0);
    const notes = (await (await page.request.get('/api/todos')).json()) as { title: string; dueDate: string }[];
    expect(notes.find((n) => n.title === 'تماس با تأمین‌کننده')!.dueDate).toBe(tomorrow);
    // Once a day: it does not come back.
    await page.reload();
    await expect(card(page).getByRole('heading', { name: 'حال امروز شما: خوب' })).toBeVisible();
    await expect(page.getByTestId('day-wrap')).toHaveCount(0);
    await who.close();
  });

  test('in the morning, and on a hard day, the notes of the day are not asked about', async ({ browser }) => {
    const who = await colleague(browser, 'wrap.two', 'کاوه');
    await confirmCirculars(who);
    const today = moment().format('jYYYY/jMM/jDD');
    expect((await who.page.request.post('/api/todos', { data: { title: 'بازبینی سند', dueDate: today } })).ok()).toBe(true);
    const page = who.page;
    await pretendMood(page, 10);
    await page.goto('/#dashboard');
    await choose(page, 'خوب');
    await expect(card(page).getByRole('heading', { name: 'حال امروز شما: خوب' })).toBeVisible();
    await expect(page.getByTestId('team-mood')).toBeVisible();
    await expect(page.getByTestId('day-wrap')).toHaveCount(0);
    // The afternoon, and the day has turned hard: the quiet line takes the place of the step chosen
    // in the morning, and the notes are not asked about.
    await page.clock.setFixedTime(moment().hour(16).minute(0).second(0).toDate());
    await page.reload();
    await card(page).getByRole('button', { name: 'تغییر', exact: true }).click();
    await choose(page, 'خیلی بد');
    await expect(step(page)).toHaveAttribute('data-step', 'care');
    await expect(page.getByTestId('day-wrap')).toHaveCount(0);
    await who.close();
  });

  test('«هفتهٔ من» shows the colleague’s own last week until they close it', async ({ browser }) => {
    const who = await colleague(browser, 'week.one', 'نسیم');
    const page = who.page;
    // Nothing happened last week for a colleague made a moment ago: no card, and the week is not asked about again.
    const empty = page.waitForResponse((res) => res.url().endsWith('/api/moods/week'));
    await page.goto('/#dashboard');
    expect(await (await empty).json()).toEqual({ week: null });
    await expect(card(page)).toBeVisible();
    await expect(page.getByTestId('my-week')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('roya.daySeen.week.')))).toBe(true);

    // A week with something in it (the counting itself is tested against the database in tests/dayWeek.test.ts).
    const last = previousWeek(moment().format('jYYYY/jMM/jDD'));
    let asked = 0;
    await page.route('**/api/moods/week', (route) => {
      asked += 1;
      return route.fulfill({ json: { week: { ...last, notesDone: 4, tasksDone: 1, given: 2, received: 1, moods: ['خوب', 'عالی', null, 'بد', 'خوب'] } } });
    });
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('roya.daySeen.week.')).forEach((k) => localStorage.removeItem(k)));
    await page.reload();
    const week = page.getByTestId('my-week');
    await expect(week).toContainText('هفتهٔ گذشتهٔ شما');
    await expect(week).toContainText('۴ یادداشت را بستید');
    await expect(week).toContainText('۱ کار ارجاعی را تمام کردید');
    await expect(week).toContainText('۲ قدردانی دادید و ۱ قدردانی گرفتید');
    await expect(week.getByLabel('شنبه: خوب', { exact: true })).toBeVisible();
    await expect(week.getByLabel('دوشنبه: ثبت نشده', { exact: true })).toBeVisible();
    await expect(week).toContainText('فقط خودتان این را می‌بینید.');
    // It sits above the organisation's apps, with the day's start.
    const box = await week.boundingBox();
    const systems = await page.getByRole('region', { name: 'سامانه‌های سازمان' }).boundingBox();
    expect(box!.y).toBeLessThan(systems!.y);

    await week.getByRole('button', { name: 'بستن هفتهٔ گذشتهٔ شما' }).click();
    await expect(week).toHaveCount(0);
    const before = asked;
    await page.reload();
    await expect(card(page)).toBeVisible();
    await expect(page.getByTestId('my-week')).toHaveCount(0);
    // Closed for this week: not even asked for again.
    expect(asked).toBe(before);
    await who.close();
  });

  test('the morning reminder is off until the colleague switches it on', async ({ browser }) => {
    const who = await colleague(browser, 'remind.one', 'آرش');
    const page = who.page;
    const wants = async () => ((await (await page.request.get('/api/settings')).json()) as { dayStartReminder: boolean }).dayStartReminder;
    await pretendMood(page, 9);
    await page.goto('/#dashboard');
    await choose(page, 'خوب');
    const box = page.getByTestId('day-reminder').getByRole('checkbox');
    await expect(box).not.toBeChecked();
    expect(await wants()).toBe(false);
    await box.check();
    await expect(page.getByText('هر صبح کاری «شروع روز» را به شما یادآوری می‌کنیم.')).toBeVisible();
    expect(await wants()).toBe(true);
    await box.uncheck();
    await expect(page.getByText('یادآوری صبح خاموش شد.')).toBeVisible();
    expect(await wants()).toBe(false);
    await who.close();
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
