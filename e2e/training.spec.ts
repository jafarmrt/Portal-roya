import { expect, test, type Browser } from '@playwright/test';
import moment from 'moment-jalaali';

const TITLE = 'کارگاه اکسل برای فروش';

const asRole = async (browser: Browser, role: 'admin' | 'employee') => {
  const context = await browser.newContext({ storageState: `e2e/.auth/${role}.json` });
  return { context, page: await context.newPage() };
};

const card = (page: Awaited<ReturnType<typeof asRole>>['page']) => page.getByRole('article', { name: TITLE });

// A one-place course held today: the colleague joins the waitlist and gets the place when the admin
// gives it up; the admin takes attendance and adds the slides; the colleague gives feedback and sees
// the course under «دوره‌های من» in their profile.
test.describe('trainings with a waitlist, attendance, handouts and feedback', () => {
  test.describe.configure({ mode: 'serial' });

  test('the colleague joins the waitlist of a full course and moves up', async ({ browser }) => {
    const admin = await asRole(browser, 'admin');
    const today = moment().utcOffset(210).format('jYYYY/jMM/jDD');
    const created = await admin.page.request.post('/api/trainings', {
      data: { title: TITLE, instructor: 'مدرس بیرونی', date: today, time: '۱۴ تا ۱۶', capacity: 1, description: 'جدول محوری و نمودار', category: 'عمومی' },
    });
    expect(created.ok()).toBe(true);
    await admin.page.goto('/#training');
    await card(admin.page).getByRole('button', { name: 'ثبت‌نام در کارگاه آموزشی' }).click();
    await expect(card(admin.page).getByRole('button', { name: /ثبت‌نام شده‌اید/ })).toBeVisible();

    const employee = await asRole(browser, 'employee');
    await employee.page.goto('/#training');
    await card(employee.page).getByRole('button', { name: 'ظرفیت پر است؛ رفتن به لیست انتظار' }).click();
    await expect(employee.page.getByText(/نفر ۱ لیست انتظار هستید/)).toBeVisible();
    await expect(card(employee.page).getByRole('button', { name: /نفر ۱ لیست انتظار/ })).toBeVisible();

    await admin.page.reload();
    await expect(card(admin.page)).toContainText('۱ نفر در لیست انتظار');
    await card(admin.page).getByRole('button', { name: /ثبت‌نام شده‌اید/ }).click();
    await expect(admin.page.getByText('ثبت‌نام شما لغو شد.')).toBeVisible();

    await employee.page.reload();
    await expect(card(employee.page).getByRole('button', { name: /ثبت‌نام شده‌اید/ })).toBeVisible();
    await employee.page.goto('/#notifications');
    await expect(employee.page.getByRole('main')).toContainText('جای شما در دوره قطعی شد');
    await admin.context.close();
    await employee.context.close();
  });

  test('the admin takes attendance and adds the slides', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'admin');
    await page.goto('/#training');
    await card(page).getByRole('button', { name: 'حضور و غیاب، جزوه و نظرها' }).click();
    const dialog = page.getByRole('dialog', { name: 'شرکت‌کننده‌ها و حضور و غیاب' });
    const attendance = dialog.getByRole('group', { name: 'حضور سارا احمدی' });
    await attendance.getByRole('button', { name: 'حاضر' }).click();
    await expect(attendance.getByRole('button', { name: 'حاضر' })).toHaveAttribute('aria-pressed', 'true');

    await dialog.locator('input[type="file"]').setInputFiles({ name: 'اسلایدهای اکسل.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
    await expect(dialog.getByRole('link', { name: 'اسلایدهای اکسل.pdf' })).toBeVisible();
    await dialog.getByRole('button', { name: 'بستن' }).last().click();
    await expect(card(page).getByRole('link', { name: /اسلایدهای اکسل\.pdf/ })).toBeVisible();
    await context.close();
  });

  test('the colleague gives feedback and finds the course in their profile', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'employee');
    await page.goto('/#training');
    await expect(card(page).getByRole('link', { name: /اسلایدهای اکسل\.pdf/ })).toBeVisible();
    await card(page).getByRole('button', { name: 'دوره چطور بود؟ نظر بدهید' }).click();
    const dialog = page.getByRole('dialog', { name: 'دوره چطور بود؟' });
    await dialog.getByRole('group', { name: 'در مجموع چقدر از دوره راضی بودید؟' }).getByText('خیلی زیاد').click();
    await dialog.getByRole('group', { name: 'مطالب دوره چقدر در کارتان به کار می‌آید؟' }).getByText('زیاد', { exact: true }).click();
    await dialog.getByLabel('پیشنهاد یا نظر دیگری دارید؟ (اختیاری)').fill('مثال‌های فروش خیلی کمک کرد.');
    await dialog.getByRole('button', { name: 'ثبت نظر' }).click();
    await expect(dialog).toBeHidden();
    await expect(card(page).getByRole('button', { name: 'نظر شما ثبت شد (تغییر نظر)' })).toBeVisible();
    // Attendance is taken, so the sign-up can no longer be cancelled.
    await expect(card(page).getByRole('button', { name: 'حضور شما ثبت شد' })).toBeDisabled();

    await page.getByRole('button', { name: 'منوی حساب کاربری' }).click();
    await page.getByRole('button', { name: 'پروفایل من در دایرکتوری' }).click();
    const courses = page.getByRole('region', { name: /دوره‌های من/ });
    await expect(courses.getByRole('button', { name: new RegExp(TITLE) })).toContainText('گذرانده');
    await context.close();
  });

  test('the admin reads the feedback without names', async ({ browser }) => {
    const { context, page } = await asRole(browser, 'admin');
    await page.goto('/#training');
    await card(page).getByRole('button', { name: /حضور و غیاب، جزوه و نظرها/ }).click();
    const dialog = page.getByRole('dialog', { name: 'شرکت‌کننده‌ها و حضور و غیاب' });
    await expect(dialog).toContainText('۱ نفر از ۱ شرکت‌کننده نظر داده‌اند');
    await expect(dialog.getByRole('list', { name: 'نظرهای نوشته‌شده' })).toContainText('مثال‌های فروش خیلی کمک کرد.');
    await context.close();
  });
});
