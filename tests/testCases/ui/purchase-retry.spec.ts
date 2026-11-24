import type { Page } from '@playwright/test';
import { expect, test } from '../../support/fixtures/apiFixtures';
import { testConfig } from '../../index';

// A checkout whose answer is lost may have been committed. Paying again must re-send the SAME checkoutId and bag,
// so the API replays the first result instead of buying the bag twice (specs/03-api-contract.md section 7).
// Real sign-in and catalog; only POST /api/checkouts is stubbed in the browser.

async function signIn(page: Page) {
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
}

async function openCheckoutWithFirstInStockPokemon(page: Page): Promise<number> {
  const cards = page.getByTestId('catalog-grid').locator('[data-testid^="pokemon-card-"]');
  await expect(cards.first()).toBeVisible();
  for (const card of await cards.all()) {
    const id = Number((await card.getAttribute('data-testid'))?.replace('pokemon-card-', ''));
    if (!/^\d+ in stock$/.test(await page.getByTestId(`pokemon-stock-${id}`).innerText())) continue;
    await page.getByTestId(`pokemon-add-to-cart-${id}`).click();
    await page.getByTestId('open-cart').click();
    await page.getByTestId('cart-proceed-to-checkout').click();
    await expect(page.getByTestId('checkout-dialog')).toBeVisible();
    return id;
  }
  throw new Error('No in-stock Pokémon on the first catalog page.');
}

function purchaseBody(pokemonId: number, purchaseId: string) {
  return {
    purchaseId,
    kind: 'POKEMON',
    pokemon: { id: pokemonId, name: 'stubbed' },
    quantity: 1,
    pricing: { unitPrice: 10, totalPrice: 10 },
    createdAt: new Date().toISOString(),
  };
}

test('UI-RETRY-001 a retry after a lost answer re-sends the same checkoutId and shows the replayed order', async ({ page }) => {
  await signIn(page);

  const sent: string[] = [];
  const committedPurchaseId = '11111111-1111-4111-8111-111111111111';
  let pokemonId = 0;
  await page.route('**/api/checkouts', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    sent.push(route.request().postDataJSON().checkoutId);
    if (sent.length === 1) return route.abort('connectionreset'); // committed on the server, answer lost
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      headers: { 'idempotent-replayed': 'true' }, // the stored result of the first try
      body: JSON.stringify({ checkoutId: sent[0], purchases: [purchaseBody(pokemonId, committedPurchaseId)] }),
    });
  });

  pokemonId = await openCheckoutWithFirstInStockPokemon(page);

  // First try: the answer is lost. The user is told to check before paying again, and no reference is shown for a network loss.
  await page.getByTestId('checkout-confirm').click();
  await expect(page.getByTestId('checkout-errors')).toContainText('We could not confirm this order');
  await expect(page.getByTestId('checkout-uncertain-note')).toBeVisible();
  expect(sent).toHaveLength(1);

  // Second try from the same bag: same checkoutId, and the replayed answer is shown as the committed order.
  await page.getByTestId('checkout-close').click();
  await page.getByTestId('open-cart').click();
  await page.getByTestId('cart-proceed-to-checkout').click();
  await page.getByTestId('checkout-confirm').click();

  await expect(page.getByTestId('checkout-success')).toBeVisible();
  await expect(page.getByTestId('checkout-errors')).toHaveCount(0);
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe(sent[0]);
  await expect(page.getByTestId(`checkout-purchase-${committedPurchaseId}`)).toBeVisible();
});

test('UI-RETRY-002 a clear rejection frees the checkoutId, so the next attempt is a new checkout', async ({ page }) => {
  await signIn(page);

  const sent: string[] = [];
  await page.route('**/api/checkouts', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    sent.push(route.request().postDataJSON().checkoutId);
    return route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'INSUFFICIENT_STOCK', message: 'no stock', requestId: 'ui-retry-002', retryable: false, details: [] } }),
    });
  });

  await openCheckoutWithFirstInStockPokemon(page);

  await page.getByTestId('checkout-confirm').click();
  await expect(page.getByTestId('checkout-errors')).toContainText('Not enough stock available.');
  await expect(page.getByTestId('checkout-errors').getByTestId('checkout-error-reference')).toHaveCount(0);
  await expect(page.getByTestId('checkout-uncertain-note')).toHaveCount(0);

  await page.getByTestId('checkout-close').click();
  await page.getByTestId('open-cart').click();
  await page.getByTestId('cart-proceed-to-checkout').click();
  await page.getByTestId('checkout-confirm').click();
  await expect(page.getByTestId('checkout-errors')).toBeVisible();

  expect(sent).toHaveLength(2);
  expect(sent[1]).not.toBe(sent[0]);
});

test('UI-RETRY-003 a 503 on checkout keeps the checkoutId and shows the reference', async ({ page }) => {
  await signIn(page);

  const sent: string[] = [];
  await page.route('**/api/checkouts', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    sent.push(route.request().postDataJSON().checkoutId);
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      headers: { 'x-request-id': 'ui-retry-003' },
      body: JSON.stringify({ error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Catalog service is temporarily unavailable', requestId: 'ui-retry-003', retryable: true, details: [] } }),
    });
  });

  await openCheckoutWithFirstInStockPokemon(page);
  await page.getByTestId('checkout-confirm').click();
  await expect(page.getByTestId('checkout-error-reference')).toHaveText('ui-retry-003');
  await expect(page.getByTestId('checkout-uncertain-note')).toBeVisible();

  await page.getByTestId('checkout-close').click();
  await page.getByTestId('open-cart').click();
  await page.getByTestId('cart-proceed-to-checkout').click();
  await page.getByTestId('checkout-confirm').click();
  await expect(page.getByTestId('checkout-errors')).toBeVisible();

  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe(sent[0]);
});
