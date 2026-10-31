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
