import { Page } from '@playwright/test';
import { expect, test } from '../../support/fixtures/kycFixtures';
import { kycCatalog } from '../../support/utils/kycTestData';
import { testConfig } from '../../index';

// A trainer buys an item in the web UI and must see it in Orders (item orders), with a delivery status like any other order.
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

test('ITEM-UI-001 an item bought in the web UI appears in Orders with its delivery status', async ({ page, kycAccount }) => {
  test.setTimeout(60_000);
  const { database, userId, email } = await kycAccount('basic-item');
  await database.query('DELETE FROM purchases WHERE user_id=? AND kind="ITEM"', [userId]);
  await signIn(page, email);

  // Nothing bought yet: the item orders tab says so.
  await page.getByTestId('nav-orders').click();
  await expect(page).toHaveURL(/\/orders$/);
  await page.getByTestId('orders-kind-items').click();
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

  // Closing the receipt opens Orders; item orders live on their own tab next to Pokémon orders.
  await expect(page).toHaveURL(/\/orders$/);
  await page.getByTestId('orders-kind-items').click();
  await expect(page.getByTestId(`item-order-row-${purchaseId}`)).toBeVisible();
  await expect(page.getByTestId(`item-order-item-${purchaseId}`)).toContainText(/potion/i);
  await expect(page.getByTestId(`item-order-quantity-${purchaseId}`)).toHaveText('1');
  await expect(page.getByTestId('item-orders-empty')).toBeHidden();

  // Items are delivered too: the order has a shipment, shown as a delivery status.
  await expect(page.getByTestId(`item-order-delivery-status-${purchaseId}`)).toBeVisible();
  await page.getByTestId(`item-order-open-detail-${purchaseId}`).click();
  await expect(page.getByTestId(`order-detail-${purchaseId}`)).toBeVisible();
  await expect(page.getByTestId('order-detail-delivery-status')).toBeVisible();
});
