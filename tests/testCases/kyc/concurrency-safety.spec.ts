import { APIRequestContext, APIResponse } from '@playwright/test';
import { expect, test } from '../../support/fixtures/kycFixtures';
import { kycCatalog, holdsItem, itemStock, walletBalance } from '../../support/utils/kycTestData';
import { newPurchaseId } from '../../support/utils/purchaseId';

/**
 * Concurrency safety: simultaneous purchases must never double-spend the wallet, oversell stock,
 * process one purchase ID twice, or slip past the KYC gate. Every case owns one lab-kyc-race-* account
 * and buys the ordinary item (level 1, price kycCatalog.itemPrice) that the fixture resets before each test.
 */

const buyItem = (api: APIRequestContext, purchaseId = newPurchaseId()): Promise<APIResponse> =>
  api.post('/api/items/purchases', { data: { purchaseId, itemId: kycCatalog.itemId, quantity: 1 } });

const errorCode = async (response: APIResponse): Promise<string> => ((await response.json()) as { error: { code: string } }).error.code;

test.describe('RACE-001: concurrent level-0 purchases are all blocked', () => {
  test('RACE-001a two simultaneous level-0 purchases both fail with 403 KYC_LEVEL_REQUIRED', async ({ kycAccount }) => {
    const { api } = await kycAccount('race-level-0');

    const responses = await Promise.all([buyItem(api), buyItem(api)]);

    for (const response of responses) {
      expect(response.status()).toBe(403);
      expect(await errorCode(response)).toBe('KYC_LEVEL_REQUIRED');
    }
  });

  test('RACE-001b concurrent level-0 purchases leave wallet, stock and inventory untouched', async ({ kycAccount }) => {
    const { api, database } = await kycAccount('race-level-0-wallet');
    const stockBefore = await itemStock(database, kycCatalog.itemId);

    await Promise.all([buyItem(api), buyItem(api), buyItem(api)]);

    expect(await walletBalance(database, 'race-level-0-wallet')).toBe(kycCatalog.walletBalance);
    expect(await itemStock(database, kycCatalog.itemId)).toBe(stockBefore);
    expect(await holdsItem(database, 'race-level-0-wallet', kycCatalog.itemId)).toBe(0);
  });
});

test.describe('RACE-002: the wallet cannot be double-spent', () => {
  test('RACE-002a two concurrent purchases that only one balance can cover: exactly one succeeds, the other gets 422 INSUFFICIENT_FUNDS', async ({ kycAccount }) => {
    const { api, database } = await kycAccount('race-wallet-drain');
    const balance = kycCatalog.itemPrice + 50; // covers one purchase, not two
    await database.query('UPDATE user_wallet SET balance=? WHERE user_id=?', [balance, 'lab-kyc-race-wallet-drain']);

    const responses = await Promise.all([buyItem(api), buyItem(api)]);

    const statuses = responses.map((response) => response.status()).sort();
    expect(statuses).toEqual([201, 422]);
    const refused = responses.find((response) => response.status() === 422)!;
    expect(await errorCode(refused)).toBe('INSUFFICIENT_FUNDS');
    expect(await walletBalance(database, 'race-wallet-drain')).toBe(balance - kycCatalog.itemPrice);
    expect(await holdsItem(database, 'race-wallet-drain', kycCatalog.itemId)).toBe(1);
  });

  test('RACE-002b the wallet equals the start balance minus price times successful purchases', async ({ kycAccount }) => {
    const { api, database } = await kycAccount('race-wallet-consistency');

    const responses = await Promise.all(Array.from({ length: 5 }, () => buyItem(api)));

    const succeeded = responses.filter((response) => response.status() === 201).length;
    expect(succeeded).toBe(5); // wallet and stock are ample, so none should be refused
    expect(await walletBalance(database, 'race-wallet-consistency')).toBe(kycCatalog.walletBalance - kycCatalog.itemPrice * succeeded);
    expect(await holdsItem(database, 'race-wallet-consistency', kycCatalog.itemId)).toBe(succeeded);
  });
});

test.describe('RACE-003: stock is never oversold', () => {
  test('RACE-003a concurrent purchases reduce stock by exactly the number that succeeded', async ({ kycAccount }) => {
    const { api, database } = await kycAccount('race-stock-depletion');
    const stockBefore = await itemStock(database, kycCatalog.itemId);

    const responses = await Promise.all(Array.from({ length: 5 }, () => buyItem(api)));

    const succeeded = responses.filter((response) => response.status() === 201).length;
    const stockAfter = await itemStock(database, kycCatalog.itemId);
    expect(stockAfter).toBe(stockBefore - succeeded);
    expect(stockAfter).toBeGreaterThanOrEqual(0);
  });

  test('RACE-003b buying more than the remaining stock concurrently sells exactly the stock and refuses the rest with 409 INSUFFICIENT_STOCK', async ({ kycAccount }) => {
    const { api, database } = await kycAccount('race-stock-limit');
    const limitedStock = 3;
    await database.query('UPDATE item_listing SET stock=? WHERE item_source_id=?', [limitedStock, kycCatalog.itemId]);

    const responses = await Promise.all(Array.from({ length: limitedStock + 3 }, () => buyItem(api)));

    const succeeded = responses.filter((response) => response.status() === 201);
    const refused = responses.filter((response) => response.status() === 409);
    expect(succeeded).toHaveLength(limitedStock);
    expect(refused).toHaveLength(3);
    for (const response of refused) expect(await errorCode(response)).toBe('INSUFFICIENT_STOCK');
    expect(await itemStock(database, kycCatalog.itemId)).toBe(0);
    expect(await holdsItem(database, 'race-stock-limit', kycCatalog.itemId)).toBe(limitedStock);
  });
});

test.describe('RACE-004: a purchase ID is processed once', () => {
  test('RACE-004a the same purchaseId sent twice concurrently charges once and the duplicate gets 409 ITEM_PURCHASE_DUPLICATE', async ({ kycAccount }) => {
    const { api, database } = await kycAccount('race-duplicate-id');
    const purchaseId = newPurchaseId();

    const responses = await Promise.all([buyItem(api, purchaseId), buyItem(api, purchaseId)]);

    expect(responses.map((response) => response.status()).sort()).toEqual([201, 409]);
    const duplicate = responses.find((response) => response.status() === 409)!;
    expect(await errorCode(duplicate)).toBe('ITEM_PURCHASE_DUPLICATE');
    expect(await walletBalance(database, 'race-duplicate-id')).toBe(kycCatalog.walletBalance - kycCatalog.itemPrice);
    expect(await holdsItem(database, 'race-duplicate-id', kycCatalog.itemId)).toBe(1);
  });
});

test.describe('RACE-005: the KYC level is enforced at purchase time', () => {
  test('RACE-005a a level-0 account is refused with 403 KYC_LEVEL_REQUIRED and nothing is charged', async ({ kycAccount }) => {
    const { api, database } = await kycAccount('race-kyc-timing');

    const response = await buyItem(api);

    expect(response.status()).toBe(403);
    expect(await errorCode(response)).toBe('KYC_LEVEL_REQUIRED');
    expect(await walletBalance(database, 'race-kyc-timing')).toBe(kycCatalog.walletBalance);
  });
});
