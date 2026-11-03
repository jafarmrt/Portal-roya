import { expect, test } from '@playwright/test';

// Dark mode and larger text are a personal choice in the account menu, kept on the device: the page
// opens already dark after a reload (no white flash), and the colours of the cards follow.
test('a colleague turns on dark mode and larger text, and they stay after a reload', async ({ browser }) => {
  const context = await browser.newContext({ storageState: 'e2e/.auth/employee.json' });
  const page = await context.newPage();
  await page.goto('/#dashboard');
  const html = page.locator('html');
  await expect(html).not.toHaveClass(/dark/);

  await page.getByRole('button', { name: 'منوی حساب کاربری' }).click();
  await page.getByRole('group', { name: 'روشن یا تیره' }).getByRole('button', { name: 'تیره' }).click();
  await expect(html).toHaveClass(/dark/);
  await page.getByRole('group', { name: 'اندازهٔ متن' }).getByRole('button', { name: 'متن درشت', exact: true }).click();
  await expect(html).toHaveAttribute('data-text-size', 'large');

  await page.reload();
  await expect(html).toHaveClass(/dark/);
  await expect(html).toHaveAttribute('data-text-size', 'large');
  // A white card is dark now, and the text is larger.
  const card = page.getByRole('region', { name: 'سامانه‌های سازمان' });
  expect(await card.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgb(255, 255, 255)');
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(18);

  // Back to light: the choice is the person's own, nothing else changes.
  await page.getByRole('button', { name: 'منوی حساب کاربری' }).click();
  await page.getByRole('group', { name: 'روشن یا تیره' }).getByRole('button', { name: 'روشن' }).click();
  await page.getByRole('group', { name: 'اندازهٔ متن' }).getByRole('button', { name: 'متن معمولی' }).click();
  await expect(html).not.toHaveClass(/dark/);
  await expect(html).not.toHaveAttribute('data-text-size', /.+/);
  await context.close();
});

// Each person may give the portal their own colour (kept on the device). The menu bar and buttons
// follow it; Roya's red wordmark and the red of warnings and deletes do not.
test('a colleague picks their own portal colour, and it stays after a reload', async ({ browser }) => {
  const context = await browser.newContext({ storageState: 'e2e/.auth/employee.json' });
  const page = await context.newPage();
  await page.goto('/#dashboard');
  const html = page.locator('html');
  const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-brand-deep').trim());
  const danger = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-danger-700').trim());
  const royaBar = await accent();
  const red = await danger();
  await expect(html).not.toHaveAttribute('data-accent', /.+/);

  await page.getByRole('button', { name: 'منوی حساب کاربری' }).click();
  const colours = page.getByRole('radiogroup', { name: 'رنگ پرتال' });
  await expect(colours.getByRole('radio', { name: 'زرشکی رویا' })).toHaveAttribute('aria-checked', 'true');
  await colours.getByRole('radio', { name: 'سرمه‌ای' }).click();
  await expect(html).toHaveAttribute('data-accent', 'navy');
  await expect(colours.getByRole('radio', { name: 'سرمه‌ای' })).toHaveAttribute('aria-checked', 'true');

  await page.reload();
  await expect(html).toHaveAttribute('data-accent', 'navy');
  expect(await accent()).not.toBe(royaBar);
  expect(await danger()).toBe(red);
  // The built-in wordmark keeps Roya's red.
  const wordmark = page.getByText('ROYA', { exact: true }).first();
  expect(await wordmark.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(227, 6, 19)');

  await page.getByRole('button', { name: 'منوی حساب کاربری' }).click();
  await page.getByRole('radiogroup', { name: 'رنگ پرتال' }).getByRole('radio', { name: 'زرشکی رویا' }).click();
  await expect(html).not.toHaveAttribute('data-accent', /.+/);
  expect(await accent()).toBe(royaBar);
  await context.close();
});
