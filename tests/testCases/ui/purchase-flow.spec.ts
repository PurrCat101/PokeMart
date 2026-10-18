import { expect, test } from '@playwright/test';
import { testConfig } from '../../index';

test('trainer purchases one Pokémon and sees wallet, stock, inventory, and history updated', async ({ page }) => {
  test.setTimeout(60_000);

  await page.addInitScript(() => {
    localStorage.removeItem('pokemart_cart');
    localStorage.removeItem('pokemart_token');
  });
  await page.goto('/');
  await expect(page.getByTestId('app-shell')).toBeVisible();

  await page.getByTestId('sign-in').click();
  await page.getByTestId('login-email').fill(testConfig.auth.email);
  await page.getByTestId('login-password').fill(testConfig.auth.password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-dialog')).toBeHidden();
  await expect(page.getByTestId('wallet-balance')).toBeVisible();

  const initialBalance = parseDisplayedNumber(await page.getByTestId('wallet-balance').innerText());
  const cards = page.getByTestId('catalog-grid').locator('[data-testid^="pokemon-card-"]');
  await expect(cards.first()).toBeVisible();

  let selectedPokemon: {
    id: number;
    name: string;
    price: number;
    stock: number;
  } | undefined;

  for (const card of await cards.all()) {
    const testId = await card.getAttribute('data-testid');
    const idMatch = testId?.match(/^pokemon-card-(\d+)$/);
    if (!idMatch) throw new Error(`Unexpected catalog card test ID: ${testId}`);

    const id = Number(idMatch[1]);
    const stockText = await page.getByTestId(`pokemon-stock-${id}`).innerText();
    const stockMatch = stockText.match(/^(\d+) in stock$/);
    if (!stockMatch) continue;

    const price = parseDisplayedNumber(await page.getByTestId(`pokemon-price-${id}`).innerText());
    if (price > initialBalance) continue;

    selectedPokemon = {
      id,
      name: await page.getByTestId(`pokemon-name-${id}`).innerText(),
      price,
      stock: Number(stockMatch[1]),
    };
    break;
  }

  if (!selectedPokemon) {
    throw new Error('No in-stock catalog item on the current page is affordable with the trainer wallet.');
  }

  const { id, name, price, stock } = selectedPokemon;
  expect(stock).toBeGreaterThan(0);

  await page.getByTestId('nav-inventory').click();
  await expect(page.getByTestId('inventory-view')).toBeVisible();
  await expect(page.getByTestId('inventory-loading')).toBeHidden();
  const existingInventoryItem = page.getByTestId(`inventory-item-${id}`);
  const initialInventoryQuantity = (await existingInventoryItem.count()) > 0
    ? parseQuantity(await existingInventoryItem.innerText())
    : 0;

  await page.getByTestId('nav-catalog').click();
  await expect(page.getByTestId(`pokemon-add-to-cart-${id}`)).toBeEnabled();
  await page.getByTestId(`pokemon-add-to-cart-${id}`).click();
  await page.getByTestId('open-cart').click();
  await expect(page.getByTestId(`cart-item-${id}`)).toBeVisible();
  await expect(page.getByTestId(`cart-item-quantity-${id}`)).toHaveValue('1');
  await page.getByTestId('cart-proceed-to-checkout').click();

  await expect(page.getByTestId('checkout-dialog')).toBeVisible();
  await page.getByTestId('checkout-confirm').click();
  await expect(page.getByTestId('checkout-success')).toBeVisible();
  await expect(page.getByTestId('checkout-errors')).toHaveCount(0);

  const checkoutPurchase = page.locator('[data-testid^="checkout-purchase-"]').first();
  await expect(checkoutPurchase).toBeVisible();
  const purchaseTestId = await checkoutPurchase.getAttribute('data-testid');
  const purchaseId = purchaseTestId?.replace(/^checkout-purchase-/, '');
  if (!purchaseId || purchaseId === purchaseTestId) {
    throw new Error(`Unexpected checkout purchase test ID: ${purchaseTestId}`);
  }

  await page.getByTestId('checkout-close').click();
  await expect(page.getByTestId('inventory-view')).toBeVisible();
  await expect(page.getByTestId(`inventory-item-${id}`)).toContainText(`×${initialInventoryQuantity + 1}`);
  await expect(page.getByTestId('wallet-balance')).toHaveText(`₽ ${(initialBalance - price).toLocaleString()}`);

  await page.getByTestId('nav-catalog').click();
  const expectedStock = stock - 1;
  await expect(page.getByTestId(`pokemon-stock-${id}`)).toHaveText(
    expectedStock === 0 ? 'Out of Stock' : `${expectedStock} in stock`
  );

  await page.getByTestId('nav-purchases').click();
  const purchaseRow = page.getByTestId(`purchase-row-${purchaseId}`);
  await expect(purchaseRow).toBeVisible();
  await expect(page.getByTestId(`purchase-item-${purchaseId}`)).toContainText(new RegExp(name, 'i'));
  await expect(page.getByTestId(`purchase-quantity-${purchaseId}`)).toHaveText('1');
});

function parseDisplayedNumber(text: string): number {
  const value = Number(text.replace(/[^\d-]/g, ''));
  if (!Number.isFinite(value)) throw new Error(`Could not parse displayed number: ${text}`);
  return value;
}

function parseQuantity(text: string): number {
  const match = text.match(/×(\d+)/);
  if (!match) throw new Error(`Could not parse inventory quantity: ${text}`);
  return Number(match[1]);
}
