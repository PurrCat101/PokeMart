import { expect, test } from '../../support/fixtures/kycFixtures';
import { expectPublicError } from '../../support/utils/expectPublicError';
import { kycCatalog } from '../../support/utils/kycTestData';
import { newPurchaseId } from '../../support/utils/purchaseId';
import { testConfig } from '../../index';

// Item purchases and the item inventory have their own list endpoints. The Pokémon endpoints
// (/api/purchases, /api/inventory) never include items, so these are the only way to see what was bought.
// The scenario account is level 1 (buys ordinary items). Its item orders are cleared first so counts are exact.

interface ItemOrder {
  purchaseId: string;
  item: { id: number; name: string };
  quantity: number;
  pricing: { unitPrice: number; totalPrice: number };
  createdAt: string;
}

test('ITEM-HIS-001 bought items show up in the item order list and the item inventory, newest first and paged', async ({ kycAccount }) => {
  const { api, database, userId } = await kycAccount('basic-item');
  await database.query('DELETE FROM item_purchases WHERE user_id=?', [userId]);

  const first = newPurchaseId();
  const second = newPurchaseId();
  for (const [purchaseId, quantity] of [[first, 2], [second, 1]] as const) {
    const bought = await api.post('/api/items/purchases', { data: { purchaseId, itemId: kycCatalog.itemId, quantity } });
    expect(bought.status()).toBe(201);
    // created_at has millisecond precision; keep the two orders apart so "newest first" is unambiguous.
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  const list = await api.get('/api/items/purchases');
  expect(list.status()).toBe(200);
  const page = await list.json() as { totalCount: number; page: { limit: number; offset: number }; items: ItemOrder[] };
  expect(page.totalCount).toBe(2);
  expect(page.page).toEqual({ limit: 20, offset: 0 });
  expect(page.items.map((order) => order.purchaseId)).toEqual([second, first]);
  expect(page.items[1]).toMatchObject({
    purchaseId: first,
    item: { id: kycCatalog.itemId, name: expect.any(String) },
    quantity: 2,
    pricing: { unitPrice: kycCatalog.itemPrice, totalPrice: 2 * kycCatalog.itemPrice },
  });
  expect(new Date(page.items[1].createdAt).toISOString()).toBe(page.items[1].createdAt);

  const inventory = await api.get('/api/items/inventory');
  expect(inventory.status()).toBe(200);
  expect(await inventory.json()).toEqual({
    items: [{ item: { id: kycCatalog.itemId, name: page.items[0].item.name }, quantity: 3 }],
  });

  const secondPage = await api.get('/api/items/purchases?limit=1&offset=1');
  const olderOnly = await secondPage.json() as { totalCount: number; page: { limit: number; offset: number }; items: ItemOrder[] };
  expect(olderOnly.totalCount).toBe(2);
  expect(olderOnly.page).toEqual({ limit: 1, offset: 1 });
  expect(olderOnly.items.map((order) => order.purchaseId)).toEqual([first]);
});

test('ITEM-HIS-002 a user never sees another user\'s item orders or items', async ({ kycAccount }) => {
  const buyer = await kycAccount('basic-item');
  await buyer.database.query('DELETE FROM item_purchases WHERE user_id=?', [buyer.userId]);
  const purchaseId = newPurchaseId();
  expect((await buyer.api.post('/api/items/purchases', { data: { purchaseId, itemId: kycCatalog.itemId, quantity: 1 } })).status()).toBe(201);

  const other = await kycAccount('basic-pokemon');
  await other.database.query('DELETE FROM item_purchases WHERE user_id=?', [other.userId]);

  const otherOrders = await (await other.api.get('/api/items/purchases')).json() as { totalCount: number; items: ItemOrder[] };
  expect(otherOrders.totalCount).toBe(0);
  expect(otherOrders.items).toEqual([]);
  expect(await (await other.api.get('/api/items/inventory')).json()).toEqual({ items: [] });
});

test.describe('request validation and authentication', () => {
  test('ITEM-HIS-003 bad paging is rejected with the public error envelope', async ({ kycAccount }) => {
    const { api } = await kycAccount('basic-item');

    await expectPublicError(await api.get('/api/items/purchases?limit=0', { headers: { 'X-Request-Id': 'tc-item-his-003a' } }), {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      requestId: 'tc-item-his-003a',
      details: [{ field: 'limit', message: 'must be between 1 and 100' }],
      retryable: false,
    });
    await expectPublicError(await api.get('/api/items/purchases?unexpected=true', { headers: { 'X-Request-Id': 'tc-item-his-003b' } }), {
      status: 400,
      code: 'UNKNOWN_QUERY_PARAMETER',
      message: 'Unknown query parameter',
      requestId: 'tc-item-his-003b',
      details: [{ field: 'unexpected', message: 'is not supported' }],
      retryable: false,
    });
  });

  test('ITEM-HIS-004 both lists require sign-in', async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({ baseURL: testConfig.bffBaseUrl });
    try {
      expect((await anonymous.get('/api/items/purchases')).status()).toBe(401);
      expect((await anonymous.get('/api/items/inventory')).status()).toBe(401);
    } finally {
      await anonymous.dispose();
    }
  });
});
