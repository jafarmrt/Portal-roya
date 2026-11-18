import { expect, test, type Page } from '@playwright/test';

// The portal was updated while a page was open: the server now hands out another build of the page.
// Here the server is made to say so (its status check and the first event of its live connection);
// the page must offer to refresh, refresh by itself only when nothing would be lost, and keep what was
// being written across the refresh.

test.use({ storageState: 'e2e/.auth/employee.json' });

const NEXT_BUILD = 'next-build-for-test';

async function serverWasUpdated(page: Page) {
  await page.route('**/api/system/status', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), clientBuild: NEXT_BUILD } });
  });
  await page.route('**/api/events', (route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: `retry: 60000\nevent: hello\ndata: ${JSON.stringify({ clientBuild: NEXT_BUILD })}\n\n` }),
  );
}

/** A mark that only this load of the page has; gone once it reloads. */
const markPage = (page: Page) => page.evaluate(() => ((window as unknown as { loadMark: number }).loadMark = 1));
// While the page is being reloaded there is nothing to ask yet.
const pageMark = (page: Page) => page.evaluate(() => (window as unknown as { loadMark?: number }).loadMark ?? 0).catch(() => -1);

test('nothing unsaved: the card says so, «بعداً» keeps a mark in the header, and moving on loads the new version', async ({ page }) => {
  await page.goto('/#dashboard');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  // Up to date: no card.
  await page.waitForTimeout(500);
  await expect(page.getByRole('status', { name: 'نسخهٔ تازهٔ پرتال' })).toHaveCount(0);

  await serverWasUpdated(page);
  await page.reload();
  // The page still thinks it is the old one only if the build differs; it does.
  const card = page.getByRole('status', { name: 'نسخهٔ تازهٔ پرتال' });
  await expect(card).toContainText('نسخهٔ تازهٔ پرتال آماده است');
  await markPage(page);

  await card.getByRole('button', { name: 'بعداً', exact: true }).click();
  await expect(card).toHaveCount(0);
  const mark = page.getByRole('button', { name: /نسخهٔ تازهٔ پرتال آماده است؛ نمایش/ });
  await mark.click();
  await expect(card).toBeVisible();

  // The new version's list of changes opens from the card.
  await card.getByRole('button', { name: 'چه چیزی تازه است؟' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');

  // To another part: the page comes back from the new version by itself.
  await page.goto('/#calendar');
  await expect.poll(() => pageMark(page)).toBe(0);
  // It does not keep refreshing when the server still says the same: the card waits instead.
  await markPage(page);
  await page.goto('/#news');
  await page.waitForTimeout(1500);
  expect(await pageMark(page)).toBe(1);
  await expect(card).toBeVisible();
});

test('with a message being written: no refresh by itself, a question before refreshing, and the text comes back', async ({ page }) => {
  await serverWasUpdated(page);
  await page.goto('/#suggestions');
  const subject = page.getByLabel('موضوع');
  const body = page.getByLabel('متن پیام');
  await subject.fill('ساعت ناهار');
  await body.fill('پیشنهاد می‌کنم ساعت ناهار در ماه رمضان جابه‌جا شود.');
  await markPage(page);

  const card = page.getByRole('status', { name: 'نسخهٔ تازهٔ پرتال' });
  await card.getByRole('button', { name: 'تازه‌سازی' }).click();
  await expect(card).toContainText('کار ذخیره‌نشده دارید');
  expect(await pageMark(page)).toBe(1);
  await card.getByRole('button', { name: 'بعداً، اول ذخیره می‌کنم' }).click();
  await expect(card).toHaveCount(0);
  expect(await pageMark(page)).toBe(1);

  // Refreshed anyway (here by the browser): the message is there again, and can be cleared.
  await page.reload();
  await expect(page.getByText('پیامی که قبلاً می‌نوشتید و فرستاده نشده بود، برگردانده شد.')).toBeVisible();
  await expect(subject).toHaveValue('ساعت ناهار');
  await expect(body).toHaveValue('پیشنهاد می‌کنم ساعت ناهار در ماه رمضان جابه‌جا شود.');
  await page.getByRole('button', { name: 'پاک کن' }).click();
  await expect(subject).toHaveValue('');
  await page.reload();
  await expect(subject).toHaveValue('');
  await expect(page.getByText('برگردانده شد')).toHaveCount(0);
});

test('a refresh from the card with something unsaved asks once more, then keeps the text', async ({ page }) => {
  await serverWasUpdated(page);
  await page.goto('/#suggestions');
  await page.getByLabel('موضوع').fill('سرویس ایاب و ذهاب');
  const card = page.getByRole('status', { name: 'نسخهٔ تازهٔ پرتال' });
  await card.getByRole('button', { name: 'تازه‌سازی' }).click();
  await markPage(page);
  await card.getByRole('button', { name: 'همین حالا تازه کن' }).click();
  await expect.poll(() => pageMark(page)).toBe(0);
  await expect(page.getByLabel('موضوع')).toHaveValue('سرویس ایاب و ذهاب');
  // Kept in this tab only, and dropped on signing out.
  expect(await page.evaluate(() => Object.keys(sessionStorage).some((k) => k.startsWith('roya.draft.')))).toBe(true);
});

test.describe('forms closed by mistake', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('a survey and a news item being written come back when their form is opened again', async ({ page }) => {
    await page.goto('/#polls');
    await page.getByRole('button', { name: /نظرسنجی جدید/ }).first().click();
    let dialog = page.getByRole('dialog', { name: 'نظرسنجی جدید' });
    await dialog.getByLabel('عنوان').fill('رضایت از سرویس ایاب و ذهاب');
    await dialog.getByRole('button', { name: 'انصراف' }).click();
    await page.getByRole('button', { name: /نظرسنجی جدید/ }).first().click();
    dialog = page.getByRole('dialog', { name: 'نظرسنجی جدید' });
    await expect(dialog.getByRole('status')).toContainText('برگردانده شد');
    await expect(dialog.getByLabel('عنوان')).toHaveValue('رضایت از سرویس ایاب و ذهاب');
    await dialog.getByRole('button', { name: 'پاک کن' }).click();
    await expect(dialog.getByLabel('عنوان')).toHaveValue('');
    await dialog.getByRole('button', { name: 'انصراف' }).click();

    await page.goto('/#news');
    await page.getByRole('button', { name: /خبر جدید|انتشار خبر/ }).first().click();
    const editor = page.getByRole('dialog', { name: /انتشار خبر/ });
    await editor.getByLabel(/عنوان/).first().fill('تعطیلی دفتر مرکزی');
    await page.reload();
    await page.getByRole('button', { name: /خبر جدید|انتشار خبر/ }).first().click();
    await expect(editor.getByRole('status')).toContainText('برگردانده شد');
    await expect(editor.getByLabel(/عنوان/).first()).toHaveValue('تعطیلی دفتر مرکزی');

    // Signing out drops every draft in this tab.
    await page.keyboard.press('Escape');
    await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.getByRole('button', { name: 'منوی حساب کاربری' }).click();
    await page.getByRole('button', { name: 'خروج از حساب' }).click();
    await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('roya.draft.')))).toEqual([]);
  });
});
