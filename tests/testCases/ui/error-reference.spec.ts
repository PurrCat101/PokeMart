import { expect, test } from '../../support/fixtures/apiFixtures';

// The user sees a reference only when the failure is a system fault they cannot fix.
// The BFF answers are stubbed in the browser, so this suite does not need the real services to fail.

function envelope(status: number, code: string, message: string, requestId: string, retryable = false) {
  return {
    status,
    contentType: 'application/json',
    headers: { 'x-request-id': requestId },
    body: JSON.stringify({ error: { code, message, requestId, retryable, details: [] } }),
  };
}

async function openLogin(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.removeItem('pokemart_cart');
    localStorage.removeItem('pokemart_token');
  });
  await page.goto('/');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await page.getByTestId('sign-in').click();
  await page.getByTestId('login-email').fill('trainer@example.test');
  await page.getByTestId('login-password').fill('not-a-real-password');
}

test('UI-ERR-001 wrong credentials show a plain message and no reference', async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill(envelope(401, 'INVALID_CREDENTIALS', 'Invalid email or password', 'ui-err-001')),
  );
  await openLogin(page);
  await page.getByTestId('login-submit').click();

  const error = page.getByTestId('login-error');
  await expect(error).toContainText('Incorrect email or password.');
  await expect(error.getByTestId('error-reference')).toHaveCount(0);
  await expect(error).not.toContainText('INVALID_CREDENTIALS');
  await expect(error).not.toContainText('401');
});

test('UI-ERR-002 a service outage on sign-in shows the request ID as a reference, without status or code', async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill(envelope(503, 'DEPENDENCY_UNAVAILABLE', 'Catalog service is temporarily unavailable', 'ui-err-002', true)),
  );
  await openLogin(page);
  await page.getByTestId('login-submit').click();

  const error = page.getByTestId('login-error');
  await expect(error).toContainText('Service is temporarily unavailable. Please try again later.');
  await expect(error.getByTestId('error-reference')).toHaveText('ui-err-002');
  await expect(error).not.toContainText('DEPENDENCY_UNAVAILABLE');
  await expect(error).not.toContainText('503');
});

test('UI-ERR-003 a lost connection on sign-in shows no reference', async ({ page }) => {
  await page.route('**/api/auth/login', (route) => route.abort('connectionrefused'));
  await openLogin(page);
  await page.getByTestId('login-submit').click();

  const error = page.getByTestId('login-error');
  await expect(error).toContainText("We can't reach the server");
  await expect(error.getByTestId('error-reference')).toHaveCount(0);
});

test('UI-ERR-004 an unknown error code is treated as a system fault and shows the reference', async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill(envelope(400, 'SOMETHING_NEW', 'internal detail that must not leak', 'ui-err-004')),
  );
  await openLogin(page);
  await page.getByTestId('login-submit').click();

  await expect(page.getByTestId('login-error').getByTestId('error-reference')).toHaveText('ui-err-004');
});

test('UI-ERR-005 the catalog error page names no internal service and offers the reference', async ({ page }) => {
  await page.route('**/api/pokemon?**', (route) =>
    route.fulfill(envelope(503, 'DEPENDENCY_UNAVAILABLE', 'Catalog service is temporarily unavailable', 'ui-err-005', true)),
  );
  await page.goto('/');

  const errorPage = page.getByTestId('catalog-service-error');
  await expect(errorPage).toBeVisible();
  await expect(errorPage.getByTestId('catalog-service-error-reference')).toHaveText('ui-err-005');
  await expect(errorPage).not.toContainText(/docker|BFF|upstream/i);
  await expect(errorPage).not.toContainText('503');
  await expect(errorPage).not.toContainText('DEPENDENCY_UNAVAILABLE');
});
