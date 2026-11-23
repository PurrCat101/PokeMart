import { Page } from '@playwright/test';
import { expect, test } from '../../support/fixtures/kycFixtures';
import { KycScenario, kycUsers } from '../../support/data/kycUsers';
import { testConfig } from '../../index';

// Read-only checks on the profile page. They reuse accounts whose KYC record these tests never change.

async function signIn(page: Page, scenario: KycScenario): Promise<void> {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e_storage_cleared')) return;
    sessionStorage.setItem('e2e_storage_cleared', '1');
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
  await expect(page.getByTestId('wallet-menu-button')).toBeVisible();
}

test('PROFILE-UI-001 the balance stays hidden in the header until the wallet menu opens, and the menu links to the profile', async ({ page, kycAccount }) => {
  await kycAccount('basic-item');
  await signIn(page, 'basic-item');

  // Nothing private on screen by default, and no KYC badge in the navbar.
  await expect(page.getByTestId('wallet-balance')).toHaveCount(0);
  await expect(page.getByTestId('app-header')).not.toContainText('₽');
  await expect(page.getByTestId('header-kyc-badge')).toHaveCount(0);

  await page.getByTestId('wallet-menu-button').click();
  await expect(page.getByTestId('wallet-balance')).toHaveText(/^₽ [\d,]+$/);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('wallet-menu')).toBeHidden();

  await page.getByTestId('wallet-menu-button').click();
  await page.getByTestId('wallet-menu-profile').click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByTestId('wallet-menu')).toBeHidden();
  await expect(page.getByTestId('profile-view')).toBeVisible();
});

test('PROFILE-UI-002 the profile shows the account, the verification tier, and a balance that is hidden until shown', async ({ page, kycAccount }) => {
  await kycAccount('basic-item');
  await signIn(page, 'basic-item');
  await page.getByTestId('nav-profile').click();
  await expect(page).toHaveURL(/\/profile$/);

  await expect(page.getByTestId('profile-email')).toHaveText(kycUsers['basic-item'].email);
  await expect(page.getByTestId('profile-user-id')).toHaveCount(0);

  await expect(page.getByTestId('profile-kyc-badge')).toHaveText('Basic verification');
  await expect(page.getByTestId('profile-tier-1')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('profile-tier-0')).not.toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('profile-verify')).toHaveCount(0);

  await expect(page.getByTestId('profile-wallet-balance')).toHaveText('₽ ••••');
  await page.getByTestId('profile-balance-toggle').click();
  await expect(page.getByTestId('profile-wallet-balance')).toHaveText(/^₽ [\d,]+$/);
  await page.getByTestId('profile-balance-toggle').click();
  await expect(page.getByTestId('profile-wallet-balance')).toHaveText('₽ ••••');
});

test('PROFILE-UI-003 an unverified account can start verification from the profile', async ({ page, kycAccount }) => {
  await kycAccount('ui-later');
  await signIn(page, 'ui-later');
  await page.getByTestId('kyc-prompt-later').click();
  await page.getByTestId('nav-profile').click();

  await expect(page.getByTestId('profile-kyc-badge')).toHaveText('Not verified');
  await expect(page.getByTestId('profile-tier-0')).toHaveAttribute('aria-current', 'step');
  await page.getByTestId('profile-verify').click();
  await expect(page.getByTestId('kyc-view')).toBeVisible();
});

test('PROFILE-UI-004 the profile asks a signed-out visitor to sign in', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('pokemart_token');
  });
  await page.goto('/profile');
  await expect(page.getByTestId('profile-auth-required')).toBeVisible();
  await expect(page.getByTestId('wallet-menu-button')).toHaveCount(0);
});
