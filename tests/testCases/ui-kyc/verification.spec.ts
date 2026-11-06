import { Page } from '@playwright/test';
import { expect, test } from '../../support/fixtures/kycFixtures';
import { KycScenario, kycUsers } from '../../support/data/kycUsers';
import { testConfig } from '../../index';

// Each test signs in as its own lab-kyc-ui-* account; kycAccount sets that account's KYC record first.

async function signIn(page: Page, scenario: KycScenario): Promise<void> {
  await page.addInitScript(() => {
    localStorage.removeItem('pokemart_cart');
    localStorage.removeItem('pokemart_token');
  });
  await page.goto('/');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await page.getByTestId('sign-in').click();
  await page.getByTestId('login-email').fill(kycUsers[scenario].email);
  await page.getByTestId('login-password').fill(testConfig.auth.password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-dialog')).toBeHidden();
  await expect(page.getByTestId('wallet-balance')).toBeVisible();
}

test('KYC-UI-001 an unverified account sees the popup and can dismiss it with Maybe later for the session', async ({ page, kycAccount }) => {
  await kycAccount('ui-later');
  await signIn(page, 'ui-later');

  await expect(page.getByTestId('kyc-prompt-dialog')).toBeVisible();
  await page.getByTestId('kyc-prompt-later').click();
  await expect(page.getByTestId('kyc-prompt-dialog')).toBeHidden();
  await expect(page.getByTestId('kyc-view')).toBeHidden();

  // The dismissal is remembered for the browser session, so a reload does not bring it back.
  await page.reload();
  await expect(page.getByTestId('wallet-balance')).toBeVisible();
  await expect(page.getByTestId('kyc-prompt-dialog')).toBeHidden();
});

test('KYC-UI-002 Verify now opens the form and a valid submission shows the under-review banner', async ({ page, kycAccount }) => {
  await kycAccount('ui-verify');
  await signIn(page, 'ui-verify');

  await page.getByTestId('kyc-prompt-verify').click();
  await expect(page.getByTestId('kyc-view')).toBeVisible();

  await page.getByTestId('kyc-fullName').fill('Somchai Jaidee');
  await page.getByTestId('kyc-nationalId').fill('1101700230708');
  await page.getByTestId('kyc-dateOfBirth').fill('1990-05-17');
  await page.getByTestId('kyc-phone').fill('0812345678');
  await page.getByTestId('kyc-address').fill('99 Sukhumvit Road, Khlong Toei, Bangkok 10110');
  await page.getByTestId('kyc-consent').check();
  await page.getByTestId('kyc-submit').click();

  await expect(page.getByTestId('kyc-view')).toBeHidden();
  await expect(page.getByTestId('kyc-banner-pending')).toBeVisible();
  await expect(page.getByTestId('kyc-prompt-dialog')).toBeHidden();
});

test('KYC-UI-003 the form shows an error beside every invalid field and does not submit', async ({ page, kycAccount }) => {
  await kycAccount('ui-validation');
  await signIn(page, 'ui-validation');
  await page.getByTestId('kyc-prompt-verify').click();

  await page.getByTestId('kyc-nationalId').fill('1234567890123');
  await page.getByTestId('kyc-submit').click();

  for (const field of ['fullName', 'nationalId', 'dateOfBirth', 'phone', 'address', 'consent']) {
    await expect(page.getByTestId(`kyc-${field}-error`)).toBeVisible();
  }
  await expect(page.getByTestId('kyc-view')).toBeVisible();
  await expect(page.getByTestId('kyc-banner-pending')).toBeHidden();
});

test('KYC-UI-004 an account under review sees the banner, no popup, and cannot check out', async ({ page, kycAccount }) => {
  await kycAccount('ui-pending');
  await signIn(page, 'ui-pending');

  await expect(page.getByTestId('kyc-banner-pending')).toBeVisible();
  await expect(page.getByTestId('kyc-prompt-dialog')).toBeHidden();

  await page.getByTestId('pokemon-add-to-cart-1').click();
  await page.getByTestId('open-cart').click();
  await expect(page.getByTestId('cart-kyc-pending')).toBeVisible();
  await expect(page.getByTestId('cart-proceed-to-checkout')).toBeDisabled();
});

test('KYC-UI-005 a rejected account sees the rejected banner and Send again opens the form', async ({ page, kycAccount }) => {
  await kycAccount('ui-rejected');
  await signIn(page, 'ui-rejected');

  await expect(page.getByTestId('kyc-banner-rejected')).toBeVisible();
  await expect(page.getByTestId('kyc-prompt-dialog')).toBeHidden();

  await page.getByTestId('kyc-banner-retry').click();
  await expect(page.getByTestId('kyc-view')).toBeVisible();
});
