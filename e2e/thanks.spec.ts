import { expect, test, type Browser } from '@playwright/test';
import pg from 'pg';

const asRole = async (browser: Browser, role: 'admin' | 'employee', options: Parameters<Browser['newContext']>[0] = {}) => {
  const context = await browser.newContext({ storageState: `e2e/.auth/${role}.json`, ...options });
  return { context, page: await context.newPage() };
};

async function sql(text: string, values: unknown[]) {
  const client = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL ?? 'postgresql://portal:portal@localhost:5432/portal_e2e' });
  await client.connect();
  await client.query(text, values);
  await client.end();
}

/** What the scheduler does once the minutes for taking a recognition back have passed. */
const handOver = (id: string) => sql(`update recognitions set deliver_at = now() - interval '1 minute', delivered_at = now() where id = $1`, [id]);

const MESSAGE = 'ممنون که گزارش فصلی را با آن‌همه تغییر به‌موقع رساندی.';

// «سپاس» starts switched off; global-setup switches it on. Both people
// joined the portal today, so their first month's wallet is small: every recognition here is one coin.
test.describe('«سپاس»: giving, receiving and the wall', () => {
  test.describe.configure({ mode: 'serial' });

  test('a colleague gives a coin with a message and takes it back', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'admin');
    await page.goto('/#dashboard');
    const card = page.getByRole('region', { name: 'سپاس', exact: true });
    await expect(card).toContainText('سکه برای بخشیدن');
    // A computer gets the full effects.
    await expect(card).toHaveAttribute('data-fx', 'full');
    await card.getByRole('button', { name: 'قدردانی کن' }).click();

    const dialog = page.getByRole('dialog', { name: 'قدردانی از یک همکار' });
    const send = dialog.getByRole('button', { name: 'بفرست' });
    await expect(send).toBeDisabled();
    await dialog.locator('#thanks-to').click();
    await page.getByRole('option', { name: /سارا احمدی/ }).click();
    await dialog.getByRole('button', { name: '۱ سکه', exact: true }).click();
    await dialog.getByRole('button', { name: 'همکاری' }).click();
    // A message too short does not go.
    await dialog.locator('#thanks-message').fill('ممنون');
    await expect(send).toBeDisabled();
    await dialog.locator('#thanks-message').fill(MESSAGE);
    await expect(dialog).toContainText('کافی است.');
    await send.click();
    await expect(page.getByText('قدردانی برای سارا احمدی در راه است.')).toBeVisible();
    await expect(dialog).toBeHidden();

    // It waits on the «سپاس» page for a few minutes, in which it can be taken back.
    await page.goto('/#thanks');
    await page.getByRole('tab', { name: /داده‌ها/ }).click();
    await expect(page.locator('#main')).toContainText(MESSAGE);
    await page.locator('#main').getByRole('button', { name: /پس گرفتن/ }).click();
    await expect(page.getByText('قدردانی پس گرفته شد و سکه‌ها برگشت.')).toBeVisible();
    await expect(page.locator('#main')).toContainText('هنوز از کسی قدردانی نکرده‌اید');
    await context.close();
  });

  test('a recognition arrives sealed; the receiver opens it, answers and can report it', async ({ browser }) => {
    const admin = await asRole(browser, 'admin');
    const sara = await asRole(browser, 'employee');
    const me = (await (await admin.page.request.get('/api/auth/me')).json()).user.id as string;
    const sent = await sara.page.request.post('/api/recognitions', {
      data: { to: me, amount: 1, valueId: 'learning', message: 'کارگاه دیروزت خیلی به کار تیم فروش آمد. ممنون.', isPublic: false },
    });
    expect(sent.ok()).toBe(true);
    await handOver((await sent.json()).id);

    await admin.page.goto('/#dashboard');
    const card = admin.page.getByRole('region', { name: 'سپاس', exact: true });
    // Sealed: who it is from, and nothing of what it says.
    await expect(card).toContainText('سارا احمدی از شما قدردانی کرده است');
    await expect(card).not.toContainText('کارگاه دیروزت');
    await card.getByRole('button', { name: /از شما قدردانی کرده است/ }).click();

    const dialog = admin.page.getByRole('dialog', { name: 'قدردانی' });
    await expect(dialog).toContainText('از طرف سارا احمدی');
    await dialog.getByRole('button', { name: 'مهر را باز کن' }).click();
    await expect(dialog).toContainText('کارگاه دیروزت خیلی به کار تیم فروش آمد. ممنون.');
    await expect(dialog).toContainText('یادگیری');
    await expect(dialog).toContainText('فقط ما دو نفر');
    await expect(dialog.getByLabel('۱ سکه')).toBeVisible();

    // One emoji back, and the way to show it to the programme's owner.
    await dialog.getByRole('button', { name: '❤️' }).click();
    await expect(dialog.getByRole('button', { name: '❤️' })).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: 'گزارش به مسئول برنامه' }).click();
    await expect(dialog).toContainText('به فرستنده خبری داده نمی‌شود');
    await dialog.getByRole('button', { name: 'گزارش کن' }).click();
    await expect(dialog).toContainText('این قدردانی را گزارش کرده‌اید');
    await dialog.getByRole('button', { name: 'بستن', exact: true }).last().click();

    // It stays on the page; the sender sees that it was read, with the answer.
    await admin.page.goto('/#thanks');
    await expect(admin.page.locator('#main')).toContainText('کارگاه دیروزت');
    await sara.page.goto('/#thanks');
    await sara.page.getByRole('tab', { name: /داده‌ها/ }).click();
    await expect(sara.page.locator('#main')).toContainText('خوانده شد ❤️');
    await admin.context.close();
    await sara.context.close();
  });

  test('the wall: sealed for its receiver, read by everyone else without an amount, with «من هم», reactions and filters', async ({ browser }) => {
    const WALL_MESSAGE = 'ممنون که راه‌اندازی سامانهٔ تازه را آخر هفته هم پیگیری کردی.';
    const admin = await asRole(browser, 'admin');
    const sara = await asRole(browser, 'employee');
    // A third colleague, who has been here long enough for a full wallet.
    const added = await admin.page.request.post('/api/employees', {
      data: { username: 'wall.negar', firstName: 'نگار', lastName: 'وحیدی', position: 'کارشناس', department: 'تولید', role: 'employee' },
    });
    expect(added.ok(), await added.text()).toBe(true);
    const created = await added.json();
    await sql(`update employees set created_at = '2024-01-01', recognition_since = '2024-01-01' where id = $1`, [created.employee.id]);
    const negarContext = await browser.newContext();
    await negarContext.request.post('/api/auth/login', { data: { username: 'wall.negar', password: created.temporaryPassword } });
    await negarContext.request.post('/api/auth/change-password', { data: { currentPassword: created.temporaryPassword, newPassword: 'Negar-wall-123' } });
    // She has seen the tutorials (e2e/thanks-tutorial.spec.ts tries them).
    await negarContext.request.put('/api/recognitions/tutorial', { data: { main: { state: 'done', step: 12 }, received: 'done', missions: { hidden: true } } });
    const negar = await negarContext.newPage();

    const me = (await (await admin.page.request.get('/api/auth/me')).json()).user.id as string;
    const sent = await sara.page.request.post('/api/recognitions', { data: { to: me, amount: 1, valueId: 'teamwork', message: WALL_MESSAGE, isPublic: true } });
    expect(sent.ok()).toBe(true);
    await handOver((await sent.json()).id);

    // The receiver finds it on the wall still sealed, and reads it by breaking the seal.
    await admin.page.goto('/#thanks');
    await admin.page.getByRole('tab', { name: /دیوار/ }).click();
    const adminWall = admin.page.getByRole('region', { name: 'دیوار سپاس' });
    await expect(adminWall).toContainText('قدردانی از شما');
    await expect(adminWall).not.toContainText(WALL_MESSAGE);
    await adminWall.getByRole('button', { name: /باز کن/ }).click();
    const envelope = admin.page.getByRole('dialog', { name: 'قدردانی' });
    await envelope.getByRole('button', { name: 'مهر را باز کن' }).click();
    await expect(envelope).toContainText(WALL_MESSAGE);
    await envelope.getByRole('button', { name: 'بستن', exact: true }).last().click();
    await expect(adminWall).toContainText(WALL_MESSAGE);

    // A colleague with nothing sealed lands on the wall, which never shows the coins.
    await negar.goto('/#thanks');
    const wall = negar.getByRole('region', { name: 'دیوار سپاس' });
    const card = wall.locator('.sp-pin', { hasText: WALL_MESSAGE });
    await expect(card).toContainText('همکاری');
    await expect(card).toContainText('سارا احمدی');
    await expect(card).not.toContainText('سکه');
    await expect(negar.getByRole('region', { name: 'کیف این ماه' })).toContainText('۵۰ سکه برای بخشیدن');

    // An emoji, then «من هم»: two coins of their own, which can be taken back for a few minutes.
    await card.getByRole('button', { name: /واکنش با ایموجی/ }).click();
    // The emoji is saved before the next tap, as it is for a person: once, a «من هم» tapped 60 ms after
    // the emoji (while its answer was still being taken in) reached an enabled button and sent nothing.
    const reacted = negar.waitForResponse((res) => res.url().endsWith('/api/reactions') && res.request().method() === 'PUT');
    const refreshed = negar.waitForResponse((res) => res.url().endsWith('/api/new_colleagues'));
    await card.getByRole('button', { name: 'واکنش 🎉' }).click();
    await reacted;
    await refreshed;
    await expect(card.getByRole('button', { name: /🎉 ۱، شما هم/ })).toBeVisible();
    await card.getByRole('button', { name: /من هم/ }).click();
    await expect(card).toContainText('شما هم همراه شدید.');
    await expect(negar.getByRole('region', { name: 'کیف این ماه' })).toContainText('۴۸ سکه برای بخشیدن');
    await card.getByRole('button', { name: /پس گرفتن/ }).click();
    await expect(negar.getByText('همراهی پس گرفته شد و سکه‌ها برگشت.')).toBeVisible();
    await expect(card.getByRole('button', { name: /من هم/ })).toBeVisible();
    await expect(negar.getByRole('region', { name: 'کیف این ماه' })).toContainText('۵۰ سکه برای بخشیدن');

    // Narrowed to another value there is nothing; back to all of them.
    await wall.getByRole('button', { name: 'یادگیری', exact: true }).click();
    await expect(wall).toContainText('با این فیلتر قدردانی‌ای روی دیوار نیست');
    await wall.getByRole('button', { name: 'همهٔ قدردانی‌ها' }).click();
    await expect(card).toBeVisible();

    // The receiver takes it off the wall: it goes for everyone at once, and comes back the same way.
    await adminWall.locator('.sp-pin', { hasText: WALL_MESSAGE }).getByRole('button', { name: 'از دیوار بردار' }).click();
    await expect(adminWall).not.toContainText(WALL_MESSAGE);
    await expect(card).toBeHidden();
    await admin.page.getByRole('tab', { name: /دریافتی‌ها/ }).click();
    await expect(admin.page.locator('#main')).toContainText('روی دیوار نیست');
    await admin.page.getByRole('button', { name: 'به دیوار برگردان' }).click();
    await expect(card).toBeVisible();

    await admin.context.close();
    await sara.context.close();
    await negarContext.close();
  });

  test('«برنامهٔ سپاس»: the owner deals with a report, changes the rules and the values, and takes one back from the wall', async ({ browser }) => {
    const admin = await asRole(browser, 'admin');
    const sara = await asRole(browser, 'employee');
    const page = admin.page;

    // The report from the first test waits; the menu says so.
    await page.goto('/#thanks-admin');
    await expect(page.getByRole('heading', { name: 'برنامهٔ سپاس' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /گزارش‌ها/ })).toContainText('۱');
    const report = page.getByRole('region', { name: 'گزارش‌ها' });
    // Only now, and only this one, the owner reads the private message; never the coins.
    await expect(report).toContainText('کارگاه دیروزت خیلی به کار تیم فروش آمد. ممنون.');
    await expect(report).toContainText('فقط ما دو نفر');
    await expect(report.locator('.sp-card')).not.toContainText('سکه');
    await report.getByRole('button', { name: 'دیدم، بماند' }).click();
    await expect(report).toContainText('گزارشی منتظر بررسی نیست');
    await expect(page.getByRole('tab', { name: /گزارش‌ها/ })).not.toContainText('۱');
    await report.getByRole('button', { name: 'گزارش‌های بررسی‌شده' }).click();
    await expect(report).toContainText('بررسی شد؛ ماند');

    // The rules: «سپاس» is on, so a change waits for the next month, and can be called off.
    await page.getByRole('tab', { name: 'قواعد سکه' }).click();
    await expect(page.getByText('از اول ماه بعد اعمال می‌شود')).toBeVisible();
    const allowance = page.getByLabel('سهمیهٔ ماهانهٔ هر همکار');
    await expect(allowance).toHaveValue('50');
    await allowance.fill('10');
    await expect(page.getByRole('alert')).toContainText('سقف یک نفر در ماه نمی‌تواند از سهمیهٔ ماهانه بیشتر باشد');
    await expect(page.getByRole('button', { name: 'ذخیرهٔ قواعد' })).toBeDisabled();
    await allowance.fill('40');
    await page.getByRole('button', { name: 'ذخیرهٔ قواعد' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'سهمیهٔ ۴۰ سکه' })).toContainText('تا آن روز: سهمیهٔ ۵۰ سکه');
    await page.getByRole('button', { name: 'لغو تغییر' }).click();
    await expect(page.getByText('سهمیهٔ ۴۰ سکه')).toHaveCount(0);
    await expect(allowance).toHaveValue('50');

    // A value of the company's own: in the give form at once; then back to the five samples.
    await page.getByRole('tab', { name: 'ارزش‌ها' }).click();
    await page.getByRole('button', { name: 'ارزش تازه' }).click();
    await page.getByLabel('نام ارزش ۶').fill('کیفیت');
    // With a description, shown under it in the form and on the wall's filter (6b).
    await page.getByRole('textbox', { name: 'توضیح ارزش ۶' }).fill('کار را درست و بی‌نقص تحویل داد.');
    await page.getByRole('radiogroup', { name: 'رنگ کیفیت' }).getByRole('radio', { name: 'آلویی' }).click();
    await page.getByRole('button', { name: 'ذخیرهٔ ارزش‌ها' }).click();
    await expect(page.getByText('ارزش‌ها ذخیره شد.')).toBeVisible();
    // Sara joined today: on the month's last day her newcomer's share is one coin, already given above,
    // and the form would not open. Here she has been with us for long, with a whole month's coins.
    const saraId = (await (await sara.page.request.get('/api/auth/me')).json()).user.id as string;
    await sql(`update employees set created_at = '2024-01-01', recognition_since = '2024-01-01' where id = $1`, [saraId]);
    await sara.page.goto('/#thanks');
    await sara.page.getByRole('button', { name: 'قدردانی کن' }).first().click();
    await expect(sara.page.getByRole('dialog').getByRole('button', { name: 'کیفیت' })).toContainText('کار را درست و بی‌نقص تحویل داد.');
    await sara.page.keyboard.press('Escape');
    await sara.page.getByRole('group', { name: 'ارزش', exact: true }).getByRole('button', { name: 'کیفیت', exact: true }).click();
    await expect(sara.page.getByText('کیفیت: کار را درست و بی‌نقص تحویل داد.')).toBeVisible();
    await page.getByRole('button', { name: 'پنج ارزش نمونه' }).click();
    await page.getByRole('button', { name: 'ذخیرهٔ ارزش‌ها' }).click();
    await expect(page.getByRole('button', { name: 'ارزش تازه' })).toBeVisible();
    // The samples come back with their descriptions.
    await expect(page.getByRole('textbox', { name: 'توضیح ارزش ۱' })).toHaveValue('کار را همراه دیگران پیش برد، نه تنها.');
    await expect(page.getByRole('textbox', { name: 'توضیح ارزش ۶' })).toHaveCount(0);
    await expect(page.getByLabel('نام ارزش ۶')).toHaveCount(0);

    // From the wall: one that should not be there goes back, with the reason both people read.
    await page.goto('/#thanks');
    await page.getByRole('tab', { name: /دیوار/ }).click();
    const card = page.getByRole('region', { name: 'دیوار سپاس' }).locator('.sp-pin', { hasText: 'راه‌اندازی سامانهٔ تازه' });
    await card.getByRole('button', { name: 'برگرداندن…' }).click();
    const dialog = page.getByRole('dialog', { name: 'برگرداندن قدردانی' });
    await expect(dialog.getByRole('button', { name: 'برگرداندن', exact: true })).toBeDisabled();
    await dialog.getByLabel('دلیل (برای هر دو نفر)').fill('برای آزمون ثبت شده بود.');
    await dialog.getByRole('button', { name: 'برگرداندن', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(card).toHaveCount(0);
    // The month's numbers: counts only, with an Excel copy.
    await page.goto('/#thanks-admin');
    await page.getByRole('tab', { name: 'گزارش ماه' }).click();
    const numbers = page.getByRole('region', { name: 'گزارش ماه' });
    await expect(numbers).toContainText('قدردانی کردند');
    await expect(numbers).toContainText('ماه جاری، هنوز تمام نشده');
    await expect(numbers.getByRole('row', { name: /فروش/ })).toBeVisible();
    await expect(numbers).not.toContainText('سارا احمدی');
    const download = page.waitForEvent('download');
    await numbers.getByRole('button', { name: 'خروجی Excel' }).click();
    expect((await download).suggestedFilename()).toMatch(/^sepas-\d{4}-\d{2}\.csv$/);

    // Each colleague can switch the two monthly reminders off on their «سپاس» page.
    await sara.page.goto('/#thanks');
    const reminders = sara.page.getByRole('checkbox', { name: 'یادآوری ماهانه' });
    await expect(reminders).toBeChecked();
    await reminders.uncheck();
    await expect(sara.page.getByText('یادآوری‌های ماهانهٔ سپاس خاموش شد.')).toBeVisible();
    await sara.page.reload();
    await expect(reminders).not.toBeChecked();
    await reminders.check();

    // A colleague without the permission has no such button and no such page.
    await sara.page.goto('/#thanks');
    await sara.page.getByRole('tab', { name: /دیوار/ }).click();
    await expect(sara.page.getByRole('button', { name: 'برگرداندن…' })).toHaveCount(0);
    await sara.page.goto('/#thanks-admin');
    await expect(sara.page.getByRole('heading', { name: 'برنامهٔ سپاس' })).toHaveCount(0);

    await admin.context.close();
    await sara.context.close();
  });

  test('nothing moves when the device asks for less motion', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'admin', { reducedMotion: 'reduce' });
    await page.goto('/#dashboard');
    await expect(page.getByRole('region', { name: 'سپاس', exact: true })).toHaveAttribute('data-fx', 'none');
    await context.close();
  });

});

test.describe('«سپاس» on a phone', () => {
  test.use({ storageState: 'e2e/.auth/employee.json' });

  test('gets the light version @mobile', async ({ page }) => {
    await page.goto('/#thanks');
    await expect(page.locator('#main .sp')).toHaveAttribute('data-fx', 'light');
    await expect(page.locator('#main')).toContainText('کیف این ماه');
  });
});
