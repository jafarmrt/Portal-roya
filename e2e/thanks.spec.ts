import { expect, test, type Browser } from '@playwright/test';
import pg from 'pg';

const asRole = async (browser: Browser, role: 'admin' | 'employee', options: Parameters<Browser['newContext']>[0] = {}) => {
  const context = await browser.newContext({ storageState: `e2e/.auth/${role}.json`, ...options });
  return { context, page: await context.newPage() };
};

/** What the scheduler does once the minutes for taking a recognition back have passed. */
async function handOver(id: string) {
  const client = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL ?? 'postgresql://portal:portal@localhost:5432/portal_e2e' });
  await client.connect();
  await client.query(`update recognitions set deliver_at = now() - interval '1 minute', delivered_at = now() where id = $1`, [id]);
  await client.end();
}

const MESSAGE = 'ممنون که گزارش فصلی را با آن‌همه تغییر به‌موقع رساندی.';

// «سپاس» is still being built (no switch on the settings page); global-setup switches it on. Both people
// joined the portal today, so their first month's wallet is small: every recognition here is one coin.
test.describe('«سپاس»: giving and receiving', () => {
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
    await expect(dialog).toContainText('خوب است.');
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
