import { Page } from '@playwright/test';
import { expect, test } from '../../support/fixtures/kycFixtures';
import { kycCatalog } from '../../support/utils/kycTestData';
import { testConfig } from '../../index';

// A trainer buys an item in the web UI and must see it in Orders (item orders) and Inventory (items).
// The scenario account is level 1 (buys ordinary items). Its item orders are cleared first.

async function signIn(page: Page, email: string): Promise<void> {
  // Clear the previous session once per tab only: a reload must not wipe the token we just signed in with.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e_storage_cleared')) return;
    sessionStorage.setItem('e2e_storage_cleared', '1');
    localStorage.removeItem('pokemart_cart');
    localStorage.removeItem('pokemart_token');
  });
  await page.goto('/');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await page.getByTestId('sign-in').click();
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(testConfig.auth.password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-dialog')).toBeHidden();
  await expect(page.getByTestId('wallet-balance')).toBeVisible();
}

test('ITEM-UI-001 an item bought in the web UI appears in Orders and in Inventory', async ({ page, kycAccount }) => {
  test.setTimeout(60_000);
  const { database, userId, email } = await kycAccount('basic-item');
  await database.query('DELETE FROM item_purchases WHERE user_id=?', [userId]);
  await signIn(page, email);

  // Nothing bought yet: the item sections say so.
  await page.getByTestId('nav-inventory').click();
  await expect(page.getByTestId('item-inventory-empty')).toBeVisible();
  await page.getByTestId('nav-purchases').click();
  await expect(page.getByTestId('item-orders-empty')).toBeVisible();

  // Buy one ordinary item (potion).
  await page.getByTestId('nav-catalog').click();
  await page.getByTestId('catalog-kind-items').click();
  await page.getByTestId('catalog-search').fill('potion');
  await expect(page.getByTestId(`item-card-${kycCatalog.itemId}`)).toBeVisible();
  await page.getByTestId(`item-buy-now-${kycCatalog.itemId}`).click();
  await expect(page.getByTestId('checkout-dialog')).toBeVisible();
  await page.getByTestId('checkout-confirm').click();
  await expect(page.getByTestId('checkout-success')).toBeVisible();

  const purchaseTestId = await page.locator('[data-testid^="checkout-purchase-"]').first().getAttribute('data-testid');
  const purchaseId = purchaseTestId?.replace(/^checkout-purchase-/, '');
  if (!purchaseId || purchaseId === purchaseTestId) throw new Error(`Unexpected checkout purchase test ID: ${purchaseTestId}`);
  await page.getByTestId('checkout-close').click();

  // Items land in Inventory, in their own section.
  await expect(page.getByTestId('inventory-view')).toBeVisible();
  await expect(page.getByTestId(`item-inventory-item-${kycCatalog.itemId}`)).toContainText('×1');
  await expect(page.getByTestId('item-inventory-empty')).toBeHidden();

  // ...and in Orders, in the item orders table.
  await page.getByTestId('nav-purchases').click();
  await expect(page.getByTestId(`item-order-row-${purchaseId}`)).toBeVisible();
  await expect(page.getByTestId(`item-order-item-${purchaseId}`)).toContainText(/potion/i);
  await expect(page.getByTestId(`item-order-quantity-${purchaseId}`)).toHaveText('1');
  await expect(page.getByTestId('item-orders-empty')).toBeHidden();
});
