import { expect, test } from '../../support/fixtures/apiFixtures';

test('sign-in form clears entered credentials after closing and reopening', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('app-shell')).toBeVisible();

  await page.getByTestId('sign-in').click();
  await page.getByTestId('login-email').fill('trainer@example.test');
  await page.getByTestId('login-password').fill('not-a-real-password');
  await page.getByTestId('login-close').click();
  await expect(page.getByTestId('login-dialog')).toBeHidden();

  await page.getByTestId('sign-in').click();
  await expect(page.getByTestId('login-email')).toHaveValue('');
  await expect(page.getByTestId('login-password')).toHaveValue('');
});
