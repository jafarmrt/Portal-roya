import moment from 'moment-jalaali';
import { expect, test, type Browser, type Page } from '@playwright/test';
import pg from 'pg';

// «سپاس», phase 2, 2.1 and 2.2: how a colleague would rather be thanked sets the form's default, and
// «قدردانی کن» shows beside the work itself: a referral task done, a course held, an online colleague.
// Everyone here is new (and has seen the tutorials), so no other test's lists change.

async function sql(text: string, values: unknown[] = []) {
  const client = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL ?? 'postgresql://portal:portal@localhost:5432/portal_e2e' });
  await client.connect();
  const result = await client.query(text, values);
  await client.end();
  return result.rows;
}

type Colleague = { id: string; name: string; page: Page; close: () => Promise<void> };

async function colleague(browser: Browser, username: string, firstName: string, lastName: string, role = 'employee'): Promise<Colleague> {
  const admin = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
  const added = await admin.request.post('/api/employees', { data: { username, firstName, lastName, position: 'کارشناس', department: 'تولید', role } });
  expect(added.ok(), await added.text()).toBe(true);
  const { temporaryPassword, employee } = await added.json();
  await admin.close();
  // Here for long: a whole month's coins.
  await sql(`update employees set created_at = '2024-01-01', recognition_since = '2024-01-01' where id = $1`, [employee.id]);
  const context = await browser.newContext();
  await context.request.post('/api/auth/login', { data: { username, password: temporaryPassword } });
  await context.request.post('/api/auth/change-password', { data: { currentPassword: temporaryPassword, newPassword: `${username}-Pass-123` } });
  await context.request.put('/api/recognitions/tutorial', { data: { main: { state: 'done', step: 12 }, received: 'done', owner: 'done', missions: { hidden: true } } });
  return { id: employee.id as string, name: `${firstName} ${lastName}`, page: await context.newPage(), close: () => context.close() };
}

const form = (page: Page) => page.getByRole('dialog', { name: 'قدردانی از یک همکار' });

test.describe('«سپاس», phase 2: preference and entry points', () => {
  test.describe.configure({ mode: 'serial' });

  let yasi: Colleague;
  let parsa: Colleague;
  test.beforeAll(async ({ browser }) => {
    yasi = await colleague(browser, 'p2.yasi', 'یاسمن', 'خصوصی');
    parsa = await colleague(browser, 'p2.parsa', 'پارسا', 'قدردان');
  });
  test.afterAll(async () => {
    await yasi.close();
    await parsa.close();
  });

  test('a colleague who would rather be thanked privately: the form starts private and says so; the sender still chooses', async () => {
    await yasi.page.goto('/#thanks');
    const preference = yasi.page.getByRole('combobox', { name: /قدردانی از من را/ });
    await expect(preference).toHaveValue('any');
    await preference.selectOption('private');
    await expect(yasi.page.getByText('ذخیره شد. همکاران این را موقع قدردانی از شما می‌بینند.')).toBeVisible();
    await yasi.page.reload();
    await expect(yasi.page.getByRole('combobox', { name: /قدردانی از من را/ })).toHaveValue('private');

    // Online, Parsa picks Yasaman's photo: beside the emoji, a recognition with coins.
    await yasi.page.goto('/#dashboard');
    await parsa.page.goto('/#dashboard');
    const card = parsa.page.getByRole('region', { name: /همکار آنلاین/ });
    await card.getByRole('button', { name: /^یاسمن خصوصی،/ }).click();
    await card.getByRole('button', { name: 'قدردانی از یاسمن خصوصی' }).click();
    const dialog = form(parsa.page);
    await expect(dialog.getByRole('button', { name: /فقط ما دو نفر/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('note')).toHaveText('یاسمن خصوصی ترجیح می‌دهد قدردانی‌اش خصوصی بماند.');
    await dialog.getByRole('button', { name: /همه ببینند/ }).click();
    await expect(dialog.getByRole('button', { name: /همه ببینند/ })).toHaveAttribute('aria-pressed', 'true');
    await parsa.page.keyboard.press('Escape');
  });

  test('the one who asked for a task thanks the one who did it, with «مسئولیت‌پذیری» suggested', async ({ browser }) => {
    // Someone who sees «کارهای ارجاعی» (in preview, the administrators do).
    const reyhan = await colleague(browser, 'p2.reyhan', 'ریحانه', 'سپارنده', 'admin');
    await sql(
      `insert into assigned_tasks (id, group_id, assigner_id, assignee_id, title, due_date, status, status_at) values ($1, $1, $2, $3, 'تکمیل جدول موجودی انبار', '1405/09/10', 'done', now())`,
      [`p2-task-${Date.now()}`, reyhan.id, yasi.id],
    );
    await reyhan.page.goto('/#tasks');
    await reyhan.page.getByRole('tab', { name: 'سپرده‌ام' }).click();
    const task = reyhan.page.getByRole('article', { name: 'تکمیل جدول موجودی انبار' });
    await task.getByRole('button', { name: 'قدردانی از یاسمن خصوصی' }).click();
    const dialog = form(reyhan.page);
    await expect(dialog.getByRole('button', { name: 'مسئولیت‌پذیری' })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.locator('#thanks-message')).toHaveValue('');
    await reyhan.page.keyboard.press('Escape');

    // With this month's coins all given, the button is not offered.
    const wallet = await (await reyhan.page.request.get('/api/recognitions/wallet')).json();
    await sql(
      `insert into recognitions (id, from_id, to_id, amount, month, value_id, value_label, value_tone, message, is_public, deliver_at, delivered_at, created_at)
       values ($1, $2, $3, $4, $5, 'learning', 'یادگیری', 'sky', 'ممنون بابت کمک دیروز در جلسهٔ برنامه‌ریزی.', false, now(), now(), now())`,
      [`p2-spent-${Date.now()}`, reyhan.id, parsa.id, wallet.left, wallet.month],
    );
    await reyhan.page.reload();
    await reyhan.page.getByRole('tab', { name: 'سپرده‌ام' }).click();
    await expect(task).toBeVisible();
    await expect(task.getByRole('button', { name: 'قدردانی از یاسمن خصوصی' })).toHaveCount(0);
    await reyhan.close();
  });

  test('those who took part in a course thank its trainer, with «یادگیری» suggested', async ({ browser }) => {
    const admin = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const today = moment().utcOffset(210).format('jYYYY/jMM/jDD');
    const created = await admin.request.post('/api/trainings', {
      data: { title: 'کارگاه گزارش‌نویسی سپاس', instructor: 'یاسمن خصوصی', instructorId: yasi.id, date: today, time: '۱۰ تا ۱۲', capacity: 10, description: 'گزارش کوتاه و روشن', category: 'عمومی' },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const training = await created.json();
    await admin.close();
    expect((await parsa.page.request.post(`/api/trainings/${training.id}/enroll`)).ok()).toBe(true);

    await parsa.page.goto('/#training');
    const card = parsa.page.getByRole('article', { name: 'کارگاه گزارش‌نویسی سپاس' });
    await card.getByRole('button', { name: 'قدردانی از یاسمن خصوصی' }).click();
    const dialog = form(parsa.page);
    await expect(dialog.getByRole('button', { name: 'یادگیری' })).toHaveAttribute('aria-pressed', 'true');
    // Her preference is still the form's default.
    await expect(dialog.getByRole('button', { name: /فقط ما دو نفر/ })).toHaveAttribute('aria-pressed', 'true');
    await parsa.page.keyboard.press('Escape');

    // The trainer is not offered a button to thank herself.
    await yasi.page.goto('/#training');
    await expect(yasi.page.getByRole('button', { name: 'قدردانی از یاسمن خصوصی' })).toHaveCount(0);
  });

  test('last month’s recap opens once, the first time the page is seen in the new month', async () => {
    const last = moment().utcOffset(210).subtract(1, 'jMonth').format('jYYYY/jMM');
    const at = moment().utcOffset(210).subtract(1, 'jMonth').toDate();
    const row = (id: string, from: string, to: string, extra = '') =>
      sql(
        `insert into recognitions (id, from_id, to_id, amount, month, value_id, value_label, value_tone, message, is_public, deliver_at, delivered_at, created_at${extra ? ', opened_at' : ''})
         values ($1, $2, $3, 5, $4, 'learning', 'یادگیری', 'sky', $5, false, $6, $6, $6${extra ? ', $6' : ''})`,
        [id, from, to, last, `ممنون بابت جلسهٔ مرور گزارش، ${id}.`, at],
      );
    await row(`p2-recap-1-${Date.now()}`, parsa.id, yasi.id);
    await row(`p2-recap-2-${Date.now()}`, yasi.id, parsa.id, 'opened');

    await parsa.page.goto('/#thanks');
    const recap = parsa.page.getByRole('dialog', { name: /^کارنامهٔ سپاس/ });
    await expect(recap).toContainText('این ماه از ۱ همکار قدردانی کردید');
    await expect(recap).toContainText('ارزشی که بیشتر برایش از شما تشکر شد');
    await expect(recap).toContainText('یاسمن خصوصی');
    await recap.getByRole('button', { name: 'ممنون' }).click();
    await expect(recap).toBeHidden();
    await parsa.page.reload();
    await expect(parsa.page.getByRole('region', { name: 'کیف این ماه' })).toBeVisible();
    await expect(recap).toHaveCount(0);
  });

  test('«گنجینهٔ من»: what came in, a new badge said once, and shown in the profile only by choice', async ({ browser }) => {
    // Five colleagues in three units that Parsa thanked earlier this month.
    const admin = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const ids: string[] = [];
    for (const [i, department] of ['تولید', 'فروش', 'فناوری اطلاعات', 'تولید'].entries()) {
      const added = await admin.request.post('/api/employees', { data: { username: `p2.b${i}`, firstName: 'همکار', lastName: `شمارهٔ ${i + 1}`, position: 'کارشناس', department, role: 'employee' } });
      expect(added.ok(), await added.text()).toBe(true);
      ids.push((await added.json()).employee.id);
    }
    await admin.close();
    const month = moment().utcOffset(210).format('jYYYY/jMM');
    for (const [i, to] of [yasi.id, ...ids].entries()) {
      await sql(
        `insert into recognitions (id, from_id, to_id, amount, month, value_id, value_label, value_tone, message, is_public, deliver_at, delivered_at, created_at, opened_at)
         values ($1, $2, $3, 1, $4, 'teamwork', 'همکاری', 'sage', 'ممنون بابت همراهی در جلسهٔ دیروز.', false, now(), now(), now(), now())`,
        [`p2-badge-${i}-${Date.now()}`, parsa.id, to, month],
      );
    }

    await parsa.page.goto('/#thanks');
    await parsa.page.getByRole('tab', { name: 'گنجینهٔ من' }).click();
    await expect(parsa.page.getByText('این صفحه را فقط خودتان می‌بینید.')).toBeVisible();
    // Yasaman's recognition last month (the recap test) is in.
    await expect(parsa.page.getByRole('heading', { name: '۵ سکه' })).toBeVisible();
    await expect(parsa.page.getByRole('status').filter({ hasText: 'نشان تازه' })).toContainText('«پل» مسی');
    await expect(parsa.page.getByRole('status').filter({ hasText: 'نشان تازه' })).toContainText('«چشم باز» مسی');
    const badges = parsa.page.getByRole('region', { name: 'نشان‌ها' });
    await expect(badges).toContainText('۲ واحد دیگر تا نقره‌ای');
    // Said once.
    await parsa.page.reload();
    await parsa.page.getByRole('tab', { name: 'گنجینهٔ من' }).click();
    await expect(badges).toBeVisible();
    await expect(parsa.page.getByText('نشان تازه')).toHaveCount(0);

    // Not in the profile until Parsa chooses to show them.
    await yasi.page.goto(`/#colleagues/${parsa.id}`);
    await expect(yasi.page.getByRole('dialog').getByRole('heading', { name: 'پارسا قدردان' })).toBeVisible();
    await expect(yasi.page.getByRole('list', { name: 'نشان‌های سپاس' })).toHaveCount(0);
    await badges.getByRole('checkbox', { name: /در پروفایلم نشان بده/ }).check();
    await expect(parsa.page.getByText('نشان‌هایتان در پروفایلتان دیده می‌شود.')).toBeVisible();
    await yasi.page.reload();
    await expect(yasi.page.getByRole('list', { name: 'نشان‌های سپاس' })).toContainText('پل');
    await expect(yasi.page.getByRole('list', { name: 'نشان‌های سپاس' })).toContainText('چشم باز');
  });
});
