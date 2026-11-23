import { expect, test } from '../../support/fixtures/apiFixtures';
import { testConfig } from '../../index';

// When account-info is unavailable on page load, the user is not told they are signed out.
// A 401 still means signed out.

test('UI-SESS-001 a service outage while checking the saved sign-in shows a notice, not a sign-in prompt', async ({ page }) => {
  // Real sign-in to obtain a real token, then reload with account-info failing.
  await page.goto('/');
  await page.getByTestId('sign-in').click();
  await page.getByTestId('login-email').fill(testConfig.auth.email);
  await page.getByTestId('login-password').fill(testConfig.auth.password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-dialog')).toBeHidden();

  await page.route('**/api/account-info', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      headers: { 'x-request-id': 'ui-sess-001' },
      body: JSON.stringify({ error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Catalog service is temporarily unavailable', requestId: 'ui-sess-001', retryable: true, details: [] } }),
    }),
  );
  await page.goto('/orders');

  const banner = page.getByTestId('session-unavailable');
  await expect(banner).toBeVisible();
  await expect(banner.getByTestId('error-reference')).toHaveText('ui-sess-001');
  await expect(page.getByTestId('purchases-auth-required')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('pokemart_token'))).not.toBeNull();

  // The service comes back: Try again restores the session.
  await page.unroute('**/api/account-info');
  await page.getByTestId('session-retry').click();
  await expect(banner).toBeHidden();
  await expect(page.getByTestId('wallet-menu-button')).toBeVisible();
});

test('UI-SESS-002 a 401 while checking the saved sign-in means signed out, and the dead token is dropped', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pokemart_token', 'expired.token.value'));
  await page.route('**/api/account-info', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: 'ui-sess-002', retryable: false, details: [] } }),
    }),
  );
  await page.goto('/orders');

  await expect(page.getByTestId('purchases-auth-required')).toBeVisible();
  await expect(page.getByTestId('session-unavailable')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pokemart_token'))).toBeNull();
});
