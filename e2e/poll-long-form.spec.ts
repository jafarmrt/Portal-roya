import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

// A long survey: ten required 1-to-5 questions, more than fit the dialog. Choosing an answer further
// down used to scroll the dialog's own (clipped) frame instead of its body, so the whole form slid out
// of sight and the dialog stayed blank. The answers given so far are also kept until they are sent.

const QUESTIONS = 10;

async function makePoll(browser: Browser, title: string) {
  const admin = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
  const res = await admin.request.post('/api/polls', {
    data: {
      title,
      description: '',
      anonymous: true,
      questions: Array.from({ length: QUESTIONS }, (_, i) => ({ text: `سؤال ${i + 1}: چقدر از این بخش راضی هستید؟`, type: 'rating', required: true, options: [] })),
    },
  });
  expect(res.ok()).toBe(true);
  const { id } = (await res.json()) as { id: string };
  return {
    id,
    remove: async () => {
      await admin.request.delete(`/api/polls/${id}`);
      await admin.close();
    },
  };
}

/** Chooses «زیاد» in the given questions; after each one the form must still be where it was. */
async function answer(page: Page, dialog: Locator, title: string, from: number, to: number) {
  for (let i = from; i < to; i++) {
    const group = dialog.getByRole('radiogroup').nth(i);
    await group.scrollIntoViewIfNeeded();
    await group.getByText('زیاد', { exact: true }).click();
    await expect(group.getByRole('radio').nth(3)).toBeChecked();
    expect(await dialog.evaluate((el) => el.scrollTop), `the dialog's frame after question ${i + 1}`).toBe(0);
    await expect(dialog.getByRole('heading', { name: title })).toBeInViewport();
  }
  await expect(dialog.getByRole('button', { name: 'ثبت پاسخ' })).toBeInViewport();
  // The frame is also put back when something else scrolls it.
  await dialog.evaluate((el) => el.scrollTo(0, 300));
  await expect.poll(() => dialog.evaluate((el) => el.scrollTop)).toBe(0);
}

test.describe('a long survey on a short screen', () => {
  test.use({ storageState: 'e2e/.auth/employee.json', viewport: { width: 1366, height: 700 } });

  test('the form stays on screen, and unsent answers come back after closing and reloading', async ({ page, browser }) => {
    const title = 'نظرسنجی ده‌سؤالی رضایت';
    const poll = await makePoll(browser, title);
    await page.goto(`/#polls/${poll.id}`);
    const dialog = page.getByRole('dialog', { name: title });
    await answer(page, dialog, title, 0, 8);

    // Closed by mistake: the eight answers are there again, and nothing was sent.
    await dialog.getByRole('button', { name: 'انصراف' }).click();
    await expect(dialog).toBeHidden();
    const card = page.getByRole('article', { name: title });
    await card.getByRole('button', { name: 'پاسخ دادن' }).click();
    await expect(dialog.getByRole('status')).toContainText('برگردانده شد');
    await expect(dialog.getByRole('radio', { checked: true })).toHaveCount(8);

    // The page reloads (a new release, a lost connection): still there.
    await page.reload();
    await expect(dialog.getByRole('radio', { checked: true })).toHaveCount(8);

    await answer(page, dialog, title, 8, QUESTIONS);
    await dialog.getByRole('button', { name: 'ثبت پاسخ' }).click();
    await expect(dialog).toBeHidden();
    await expect(card).toContainText('پاسخ شما ثبت شده است');
    // Once sent, nothing is kept in the browser.
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('roya.pollDraft.')))).toEqual([]);
    await poll.remove();
  });

  test('«از اول شروع می‌کنم» empties the form, and signing out leaves no answers behind', async ({ page, browser }) => {
    const title = 'نظرسنجی ده‌سؤالی دوم';
    const poll = await makePoll(browser, title);
    await page.goto(`/#polls/${poll.id}`);
    const dialog = page.getByRole('dialog', { name: title });
    await answer(page, dialog, title, 0, 3);
    await page.reload();
    await expect(dialog.getByRole('radio', { checked: true })).toHaveCount(3);
    await dialog.getByRole('button', { name: 'از اول شروع می‌کنم' }).click();
    await expect(dialog.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(dialog.getByRole('status')).toHaveCount(0);
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('roya.pollDraft.')))).toEqual([]);

    await answer(page, dialog, title, 0, 2);
    await page.evaluate(() => sessionStorage.setItem('roya.pollDraft.someone.else', '{}'));
    await dialog.getByRole('button', { name: 'انصراف' }).click();
    await poll.remove();
    // This sign-in file is shared with the other tests, so the session is ended in the page only.
    await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.getByRole('button', { name: 'منوی حساب کاربری' }).click();
    await page.getByRole('button', { name: 'خروج از حساب' }).click();
    await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('roya.pollDraft.')))).toEqual([]);
  });
});

test.describe('a long survey on a phone @mobile', () => {
  test.use({ storageState: 'e2e/.auth/employee.json' });

  test('the form stays on screen while every question is answered', async ({ page, browser }) => {
    const title = 'نظرسنجی ده‌سؤالی روی گوشی';
    const poll = await makePoll(browser, title);
    await page.goto(`/#polls/${poll.id}`);
    const dialog = page.getByRole('dialog', { name: title });
    await answer(page, dialog, title, 0, QUESTIONS);
    await dialog.getByRole('button', { name: 'ثبت پاسخ' }).click();
    await expect(dialog).toBeHidden();
    await poll.remove();
  });
});
