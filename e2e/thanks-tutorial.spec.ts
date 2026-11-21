import { devices, expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import pg from 'pg';

// «سپاس», stage 6b: the tutorials on the real page, the missions and the values' descriptions. Each test
// has colleagues of its own, made here, so the tutorials start as on a first visit. What they send stays
// private or comes off the wall again, so e2e/thanks.spec.ts finds the wall as it expects.

async function sql(text: string, values: unknown[] = []) {
  const client = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL ?? 'postgresql://portal:portal@localhost:5432/portal_e2e' });
  await client.connect();
  const result = await client.query(text, values);
  await client.end();
  return result.rows;
}

/** What the scheduler does once the minutes for taking a recognition back have passed. */
const handOver = (id: string) => sql(`update recognitions set deliver_at = now() - interval '1 minute', delivered_at = now() where id = $1`, [id]);

const MESSAGE = 'ممنون که دیروز گزارش را با حوصله با من مرور کردی.';

type Colleague = { id: string; page: Page; close: () => Promise<void> };

/** A new colleague, signed in; `longAgo` gives them a full month's allowance instead of a newcomer's. */
async function colleague(browser: Browser, username: string, firstName: string, lastName: string, options: { longAgo?: boolean; role?: string; context?: BrowserContextOptions } = {}): Promise<Colleague> {
  const admin = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
  const added = await admin.request.post('/api/employees', {
    data: { username, firstName, lastName, position: 'کارشناس', department: 'تولید', role: options.role ?? 'employee' },
  });
  expect(added.ok(), await added.text()).toBe(true);
  const { temporaryPassword, employee } = await added.json();
  await admin.close();
  if (options.longAgo) await sql(`update employees set created_at = '2024-01-01', recognition_since = '2024-01-01' where id = $1`, [employee.id]);
  const context = await browser.newContext(options.context ?? {});
  await context.request.post('/api/auth/login', { data: { username, password: temporaryPassword } });
  await context.request.post('/api/auth/change-password', { data: { currentPassword: temporaryPassword, newPassword: `${username}-Pass-123` } });
  return { id: employee.id as string, page: await context.newPage(), close: () => context.close() };
}

/** The tutorial's box (a non-modal dialog) by its title. */
const box = (page: Page, title: string | RegExp) => page.getByRole('dialog', { name: title });

test.describe('«سپاس»: the tutorials', () => {
  test.describe.configure({ mode: 'serial' });

  let tina: Colleague;
  test.beforeAll(async ({ browser }) => {
    // Everyone's recognitions in these tests go to Tina, so nobody else's lists change.
    tina = await colleague(browser, 'tour.tina', 'تینا', 'مقصدی', { longAgo: true });
  });
  test.afterAll(async () => tina.close());

  test('a new colleague sends their first recognition, for real, step by step', async ({ browser }) => {
    const neda = await colleague(browser, 'tour.neda', 'ندا', 'رهنما', { longAgo: true });
    const page = neda.page;
    await page.goto('/#thanks');

    // The welcome opens by itself on the first visit.
    await box(page, 'به «سپاس» خوش آمدید').getByRole('button', { name: 'شروع کنیم' }).click();
    // Numbers come from the rules in force: a full month's 50 coins.
    await expect(box(page, 'کیف سکهٔ شما')).toContainText('هر ماه ۵۰ سکه می‌گیرید');
    await expect(box(page, 'کیف سکهٔ شما')).toContainText('۱ از ۱۲');
    await box(page, 'کیف سکهٔ شما').getByRole('button', { name: 'بعدی' }).click();

    // Steps that wait for something move on when it is done.
    await expect(box(page, 'اولین قدردانی')).toBeVisible();
    await page.getByRole('button', { name: 'قدردانی کن' }).first().click();
    const form = page.getByRole('dialog', { name: 'قدردانی از یک همکار' });
    await expect(box(page, 'از چه کسی؟')).toBeVisible();
    await form.locator('#thanks-to').click();
    await page.getByRole('option', { name: /تینا مقصدی/ }).click();

    // Each value with its description, from the programme's settings.
    await expect(box(page, 'کار او به کدام ارزش نزدیک است؟')).toContainText('تینا مقصدی');
    await expect(form.getByRole('button', { name: 'همکاری' })).toContainText('کار را همراه دیگران پیش برد، نه تنها.');
    await form.getByRole('button', { name: 'همکاری' }).click();

    const message = box(page, 'دقیق بگویید چه کرد');
    await expect(message.getByRole('button', { name: 'بعدی' })).toBeDisabled();
    await form.locator('#thanks-message').fill('ممنون');
    await expect(message).toContainText('۵ از ۱۵ حرف');
    await form.locator('#thanks-message').fill(MESSAGE);
    await expect(message).toContainText('کافی است ✓');
    await message.getByRole('button', { name: 'بعدی' }).click();

    await expect(box(page, 'چند سکه؟')).toContainText('مقدار را فقط شما و تینا مقصدی می‌بینید');
    await box(page, 'چند سکه؟').getByRole('button', { name: 'بعدی' }).click();
    await form.getByRole('button', { name: /فقط ما دو نفر/ }).click();
    await box(page, 'چه کسی ببیند؟').getByRole('button', { name: 'بعدی' }).click();
    await expect(box(page, 'بفرستید')).toContainText('این قدردانی واقعی است و به دست تینا مقصدی می‌رسد');
    await form.getByRole('button', { name: 'بفرست' }).click();

    // The step on taking it back points at the card just sent, on «داده‌ها».
    const undo = box(page, 'تا ۵ دقیقه برمی‌گردد');
    await expect(undo).toBeVisible();
    await expect(page.locator('[data-tour="sent-card"]')).toContainText(MESSAGE);
    await expect(page.locator('[data-tour="sent-card"]').getByRole('button', { name: /پس گرفتن/ })).toBeVisible();
    await undo.getByRole('button', { name: 'فهمیدم' }).click();

    await expect(box(page, 'دیوار سپاس')).toBeVisible();
    await box(page, 'دیوار سپاس').getByRole('button', { name: 'بعدی' }).click();
    const join = box(page, 'شما هم همراه شوید');
    if (await join.isVisible().catch(() => false)) await join.getByRole('button', { name: 'فهمیدم' }).click();
    const end = box(page, 'اولین قدردانی شما رفت!');
    await expect(end).toBeVisible();
    // A computer gets the celebration.
    await expect(page.locator('.sp-celebration')).toHaveCount(1);
    await end.getByRole('button', { name: 'تمام' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // It really went, and the tutorial does not open again.
    expect(await sql(`select is_public, message from recognitions where from_id = $1 and to_id = $2 and withdrawn_at is null`, [neda.id, tina.id])).toEqual([{ is_public: false, message: MESSAGE }]);
    await page.reload();
    await expect(page.getByRole('region', { name: 'کیف این ماه' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await (await page.request.get('/api/recognitions/tutorial')).json()).progress.main).toEqual({ state: 'done', step: 12 });
    await neda.close();
  });

  test('skipped half way, it comes back from the same step on another device, and from «؟»', async ({ browser }) => {
    const omid = await colleague(browser, 'tour.omid', 'امید', 'پویا', { longAgo: true });
    const page = omid.page;
    await page.goto('/#thanks');
    await box(page, 'به «سپاس» خوش آمدید').getByRole('button', { name: 'شروع کنیم' }).click();
    await box(page, 'کیف سکهٔ شما').getByRole('button', { name: 'بعدی' }).click();
    await expect(box(page, 'اولین قدردانی')).toBeVisible();

    // The same colleague on another device carries on from the same step.
    const other = await browser.newContext();
    await other.request.post('/api/auth/login', { data: { username: 'tour.omid', password: 'tour.omid-Pass-123' } });
    const phone = await other.newPage();
    await phone.goto('/#thanks');
    await expect(box(phone, 'اولین قدردانی')).toBeVisible();
    await other.close();

    // Escape asks first; «ادامه بده» stays.
    await page.keyboard.press('Escape');
    const ask = box(page, 'از آموزش رد می‌شوید؟');
    await expect(ask).toContainText('از دکمهٔ «؟» برش گردانید');
    await ask.getByRole('button', { name: 'ادامه بده' }).click();
    await expect(box(page, 'اولین قدردانی')).toBeVisible();
    await box(page, 'اولین قدردانی').getByRole('button', { name: 'رد شدن از آموزش' }).click();
    await box(page, 'از آموزش رد می‌شوید؟').getByRole('button', { name: 'بله، رد شو' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('region', { name: 'کیف این ماه' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // «؟» starts it again from the beginning; «بعداً» says where to find it.
    await page.getByRole('button', { name: 'راهنمای سپاس' }).click();
    await page.getByRole('menuitem', { name: 'آموزش سپاس را دوباره ببینم' }).click();
    await box(page, 'به «سپاس» خوش آمدید').getByRole('button', { name: 'بعداً' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'از دکمهٔ «؟» بالای صفحه' })).toBeVisible();
    await omid.close();
  });

  test('without a colleague in the list, it goes on to the wall', async ({ browser }) => {
    const pari = await colleague(browser, 'tour.pari', 'پری', 'آزما', { longAgo: true });
    const page = pari.page;
    // In the pilot, before anyone else is in the group.
    await page.route('**/api/recognitions/colleagues', (route) => route.fulfill({ json: [] }));
    await page.goto('/#thanks');
    await box(page, 'به «سپاس» خوش آمدید').getByRole('button', { name: 'شروع کنیم' }).click();
    await box(page, 'کیف سکهٔ شما').getByRole('button', { name: 'بعدی' }).click();
    await page.getByRole('button', { name: 'قدردانی کن' }).first().click();
    const none = box(page, 'هنوز همکاری در فهرست نیست');
    await expect(none).toContainText('از «مأموریت‌های سپاس» ادامه دهید');
    await none.getByRole('button', { name: 'بعدی' }).click();
    await expect(page.getByRole('dialog', { name: 'قدردانی از یک همکار' })).toBeHidden();
    await expect(box(page, 'دیوار سپاس')).toBeVisible();
    await pari.close();
  });

  test('a newcomer whose coins are used up skips the form; nothing moves when motion is reduced', async ({ browser }) => {
    // Joined today: the month's allowance is a newcomer's share.
    const reza = await colleague(browser, 'tour.reza', 'رضا', 'تازه‌وارد', { context: { reducedMotion: 'reduce' } });
    const page = reza.page;
    const wallet = await (await page.request.get('/api/recognitions/wallet')).json();
    // On the month's first day a newcomer's share is the whole month's.
    const newcomer = wallet.allowance < wallet.rules.allowance;
    // Everything given already, to Tina (one row: on the month's first day it is more than one person's cap).
    await sql(
      `insert into recognitions (id, from_id, to_id, amount, month, value_id, value_label, value_tone, message, is_public, deliver_at, delivered_at, created_at)
       values ($1, $2, $3, $4, $5, 'learning', 'یادگیری', 'sky', $6, false, now(), now(), now())`,
      [`tour-spent-${Date.now()}`, reza.id, tina.id, wallet.left, wallet.month, MESSAGE],
    );
    expect((await (await page.request.get('/api/recognitions/wallet')).json()).left).toBe(0);

    await page.goto('/#thanks');
    await expect(page.locator('.sp-tour')).toHaveAttribute('data-fx', 'none');
    await box(page, 'به «سپاس» خوش آمدید').getByRole('button', { name: 'شروع کنیم' }).click();
    await expect(box(page, 'کیف سکهٔ شما')).toContainText(newcomer ? 'چون «سپاس» این ماه برای شما شروع شد' : 'هر ماه ۵۰ سکه می‌گیرید');
    await box(page, 'کیف سکهٔ شما').getByRole('button', { name: 'بعدی' }).click();
    const empty = box(page, 'سکه‌های این ماه تمام شده');
    await expect(empty).toContainText('اول ماه بعد دوباره ۵۰ سکه می‌گیرید');
    await empty.getByRole('button', { name: 'بعدی' }).click();
    await box(page, 'دیوار سپاس').getByRole('button', { name: 'بعدی' }).click();
    const join = box(page, 'شما هم همراه شوید');
    if (await join.isVisible().catch(() => false)) await join.getByRole('button', { name: 'فهمیدم' }).click();
    // Nothing was sent during the tutorial.
    const end = box(page, 'آموزش تمام شد!');
    await expect(end).toBeVisible();
    await expect(page.locator('.sp-celebration')).toHaveCount(0);
    await end.getByRole('button', { name: 'تمام' }).click();
    await reza.close();
  });

  test('taking the recognition back at the step on taking it back', async ({ browser }) => {
    const sima = await colleague(browser, 'tour.sima', 'سیما', 'برگشتی', { longAgo: true });
    const page = sima.page;
    // A draft written earlier is in the form already, and the tutorial says so.
    await page.goto('/#thanks');
    await box(page, 'به «سپاس» خوش آمدید').getByRole('button', { name: 'شروع کنیم' }).click();
    await box(page, 'کیف سکهٔ شما').getByRole('button', { name: 'بعدی' }).click();
    await page.getByRole('button', { name: 'قدردانی کن' }).first().click();
    const form = page.getByRole('dialog', { name: 'قدردانی از یک همکار' });
    await form.locator('#thanks-to').click();
    await page.getByRole('option', { name: /تینا مقصدی/ }).click();
    await form.getByRole('button', { name: 'ابتکار' }).click();
    await form.locator('#thanks-message').fill(MESSAGE);
    // Closing the form half way goes back to opening it; the message is kept.
    await form.getByRole('button', { name: 'بستن' }).first().click();
    await expect(box(page, 'اولین قدردانی')).toBeVisible();
    await page.getByRole('button', { name: 'قدردانی کن' }).first().click();
    await form.locator('#thanks-to').click();
    await page.getByRole('option', { name: /تینا مقصدی/ }).click();
    await form.getByRole('button', { name: 'ابتکار' }).click();
    await expect(box(page, 'دقیق بگویید چه کرد')).toContainText('متنی که قبلاً نوشته بودید سر جایش است');
    await expect(form.locator('#thanks-message')).toHaveValue(MESSAGE);
    await box(page, 'دقیق بگویید چه کرد').getByRole('button', { name: 'بعدی' }).click();
    await box(page, 'چند سکه؟').getByRole('button', { name: 'بعدی' }).click();
    await form.getByRole('button', { name: /فقط ما دو نفر/ }).click();
    await box(page, 'چه کسی ببیند؟').getByRole('button', { name: 'بعدی' }).click();
    await form.getByRole('button', { name: 'بفرست' }).click();

    await expect(box(page, 'تا ۵ دقیقه برمی‌گردد')).toBeVisible();
    await page.locator('[data-tour="sent-card"]').getByRole('button', { name: /پس گرفتن/ }).click();
    const back = box(page, 'پس گرفتید، اشکالی ندارد');
    await expect(back).toContainText('سکه‌ها به کیفتان برگشت');
    await back.getByRole('button', { name: 'فهمیدم' }).click();
    await box(page, 'دیوار سپاس').getByRole('button', { name: 'بعدی' }).click();
    const join = box(page, 'شما هم همراه شوید');
    if (await join.isVisible().catch(() => false)) await join.getByRole('button', { name: 'فهمیدم' }).click();
    await expect(box(page, 'آموزش تمام شد!')).toBeVisible();
    expect(await sql(`select id from recognitions where from_id = $1 and withdrawn_at is null`, [sima.id])).toHaveLength(0);
    await sima.close();
  });

  test('the first recognition received, step by step; the missions tick from what was done before', async ({ browser }) => {
    const leila = await colleague(browser, 'tour.leila', 'لیلا', 'گیرنده', { longAgo: true });
    const page = leila.page;
    // She has done some of it already, outside the tutorial: two recognitions for two values.
    for (const valueId of ['teamwork', 'learning']) {
      const sent = await page.request.post('/api/recognitions', { data: { to: tina.id, amount: 1, valueId, message: `${MESSAGE} (${valueId})`, isPublic: false } });
      expect(sent.ok(), await sent.text()).toBe(true);
      await handOver((await sent.json()).id);
    }
    await page.request.put('/api/recognitions/tutorial', { data: { main: { state: 'skipped', step: 1 } } });
    // Tina thanks her, on the wall.
    const toLeila = await tina.page.request.post('/api/recognitions', { data: { to: leila.id, amount: 2, valueId: 'customer', message: 'ممنون که مشتری ناراضی دیروز را آرام کردی.', isPublic: true } });
    expect(toLeila.ok(), await toLeila.text()).toBe(true);
    await handOver((await toLeila.json()).id);

    await page.goto('/#thanks');
    const missions = page.getByRole('region', { name: 'مأموریت‌های سپاس' });
    await expect(missions).toContainText('۲ از ۵');
    await expect(missions.getByRole('button', { name: 'اولین قدردانی را بفرستید (انجام شد)' })).toBeVisible();
    await expect(missions.getByRole('button', { name: 'برای دو ارزش مختلف قدردانی کنید (انجام شد)' })).toBeVisible();

    const seal = box(page, 'یک قدردانی برایتان رسیده!');
    await expect(seal).toBeVisible();
    await page.locator('[data-tour="sealed"] button').first().click();
    await page.getByRole('button', { name: 'باز کردن مهر' }).click();
    const opened = box(page, 'پیام و سکه‌ها مال شماست');
    await expect(opened).toContainText('این سکه‌ها مال خودتان است');
    await opened.getByRole('button', { name: 'بعدی' }).click();
    // It is on the wall: she takes it off from where the tutorial points.
    await expect(box(page, 'روی دیوار هم هست')).toBeVisible();
    await page.locator('[data-tour="reveal-wall"]').getByRole('button', { name: 'از دیوار بردار' }).click();
    await expect(page.locator('[data-tour="reveal-wall"]')).toContainText('روی دیوار نیست');
    await box(page, 'روی دیوار هم هست').getByRole('button', { name: 'بعدی' }).click();
    await box(page, 'اگر پیامی ناراحتتان کرد').getByRole('button', { name: 'فهمیدم' }).click();
    await expect(page.locator('.sp-tour')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(missions).toContainText('۳ از ۵');
    await expect(missions.getByRole('button', { name: 'یک قدردانی دریافتی را باز کنید (انجام شد)' })).toBeVisible();
    expect((await (await page.request.get('/api/recognitions/tutorial')).json()).progress.received).toBe('done');

    // The list can be hidden, and comes back from «؟».
    await missions.getByRole('button', { name: 'پنهان کردن فهرست' }).click();
    await expect(missions).toBeHidden();
    await page.getByRole('button', { name: 'راهنمای سپاس' }).click();
    await page.getByRole('menuitem', { name: 'مأموریت‌های سپاس' }).click();
    await expect(missions).toBeVisible();
    await leila.close();
  });

  test('the programme’s owner: their tour, and the values’ descriptions', async ({ browser }) => {
    const admin = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const role = await admin.request.post('/api/roles', { data: { name: 'مسئول آموزش سپاس', description: '', permissions: ['recognition.manage'] } });
    expect(role.ok(), await role.text()).toBe(true);
    const roleId = (await role.json()).id as string;
    await admin.close();
    const hoda = await colleague(browser, 'tour.hoda', 'هدی', 'مسئول', { longAgo: true, role: roleId });
    const page = hoda.page;
    await page.request.put('/api/recognitions/tutorial', { data: { main: { state: 'done', step: 12 }, missions: { hidden: true } } });

    // The first visit to «برنامهٔ سپاس» opens the owner's tour.
    await page.goto('/#thanks-admin');
    await box(page, 'برنامهٔ سپاس در دست شماست').getByRole('button', { name: 'بعدی' }).click();
    await expect(box(page, 'گزارش‌ها')).toContainText('دیدم، بماند');
    await box(page, 'گزارش‌ها').getByRole('button', { name: 'بعدی' }).click();
    await box(page, 'گزارش ماه').getByRole('button', { name: 'بعدی' }).click();
    await expect(page.getByRole('tab', { name: 'انصاف' })).toHaveAttribute('aria-selected', 'true');
    await expect(box(page, 'انصاف')).toContainText('فقط برای شماست');
    await box(page, 'انصاف').getByRole('button', { name: 'بعدی' }).click();
    await expect(page.getByRole('tab', { name: 'قواعد سکه' })).toHaveAttribute('aria-selected', 'true');
    await box(page, 'قواعد سکه').getByRole('button', { name: 'بعدی' }).click();
    await expect(page.getByRole('tab', { name: 'ارزش‌ها' })).toHaveAttribute('aria-selected', 'true');
    await box(page, 'ارزش‌ها').getByRole('button', { name: 'بعدی' }).click();
    await box(page, 'از دیوار').getByRole('button', { name: 'تمام' }).click();
    await page.reload();
    await expect(page.getByRole('tab', { name: 'ارزش‌ها' })).toBeVisible();
    await expect(page.locator('.sp-tour')).toHaveCount(0);

    // A description written here shows under the value in the form.
    await page.getByRole('tab', { name: 'ارزش‌ها' }).click();
    const first = page.getByRole('textbox', { name: 'توضیح ارزش ۱' });
    await expect(first).toHaveValue('کار را همراه دیگران پیش برد، نه تنها.');
    await first.fill('گره کار دیگران را هم باز کرد.');
    await page.getByRole('button', { name: 'ذخیرهٔ ارزش‌ها' }).click();
    await expect(page.getByText('ارزش‌ها ذخیره شد.').last()).toBeVisible();
    await page.goto('/#thanks');
    await page.getByRole('button', { name: 'قدردانی کن' }).first().click();
    const form = page.getByRole('dialog', { name: 'قدردانی از یک همکار' });
    await expect(form.getByRole('button', { name: 'همکاری' })).toContainText('گره کار دیگران را هم باز کرد.');
    // And on the wall's filter.
    await form.getByRole('button', { name: 'بستن' }).first().click();
    await page.getByRole('group', { name: 'ارزش', exact: true }).getByRole('button', { name: 'همکاری', exact: true }).click();
    await expect(page.getByText('همکاری: گره کار دیگران را هم باز کرد.')).toBeVisible();

    // «پنج ارزش نمونه» brings the samples back with their descriptions.
    await page.goto('/#thanks-admin');
    await page.getByRole('tab', { name: 'ارزش‌ها' }).click();
    await page.getByRole('button', { name: 'پنج ارزش نمونه' }).click();
    await page.getByRole('button', { name: 'ذخیرهٔ ارزش‌ها' }).click();
    await expect(page.getByText('ارزش‌ها ذخیره شد.').last()).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'توضیح ارزش ۱' })).toHaveValue('کار را همراه دیگران پیش برد، نه تنها.');

    // From «؟» on the «سپاس» page, the owner's tour again.
    await page.goto('/#thanks');
    await page.getByRole('button', { name: 'راهنمای سپاس' }).click();
    await page.getByRole('menuitem', { name: 'آموزش برنامهٔ سپاس' }).click();
    await expect(box(page, 'برنامهٔ سپاس در دست شماست')).toBeVisible();
    await hoda.close();
  });
});

// The phone runs on its own (the «mobile» project), with its own colleague.
test('on a phone the box sits at the edge of the screen, clear of what it points at @mobile', async ({ browser }) => {
  const nima = await colleague(browser, 'tour.nima', 'نیما', 'همراه', { longAgo: true, context: { ...devices['Pixel 7'] } });
  const page = nima.page;
  const clear = async () => {
    const ring = await page.locator('.sp-tour-ring').boundingBox();
    const shown = await page.locator('.sp-tour-box').boundingBox();
    expect(ring && shown).toBeTruthy();
    // Above it or below it, never over it.
    expect(shown!.y + shown!.height <= ring!.y + 1 || shown!.y >= ring!.y + ring!.height - 1).toBe(true);
  };
  await page.goto('/#thanks');
  await box(page, 'به «سپاس» خوش آمدید').getByRole('button', { name: 'شروع کنیم' }).click();
  await expect(box(page, 'کیف سکهٔ شما')).toBeVisible();
  // A phone gets the lighter effects.
  await expect(page.locator('.sp-tour')).toHaveAttribute('data-fx', 'light');
  await expect(page.locator('.sp-tour-box')).toHaveAttribute('data-placement', /^(top|bottom)$/);
  await clear();
  await box(page, 'کیف سکهٔ شما').getByRole('button', { name: 'بعدی' }).click();
  await expect(box(page, 'اولین قدردانی')).toBeVisible();
  await clear();
  await page.getByRole('button', { name: 'قدردانی کن' }).first().click();
  await expect(box(page, 'از چه کسی؟')).toBeVisible();
  await clear();
  await nima.close();
});
