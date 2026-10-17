import { RowDataPacket } from 'mysql2';
import { expect, test } from '../../support/fixtures/apiFixtures';
import { MySQLConnection } from '../../support/models/MySQL/MySQLConnection';
import { restorePurchaseState, snapshotPurchaseState, PurchaseStateSnapshot } from '../../support/utils/purchaseState';
import { expectPublicError } from '../../support/utils/expectPublicError';

test('@e2e concurrent POST /api/purchases with the same purchaseId commits exactly once', async ({ bffRequest, testEnvironment }) => {
  const database = new MySQLConnection();
  const purchaseId = testEnvironment.purchaseId();
  const requestId = 'tc-purchase-concurrency';
  let snapshot: PurchaseStateSnapshot | undefined;

  try {
    snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
    const [listingRows] = await database.query<RowDataPacket[]>('SELECT price FROM shop_listing WHERE pokemon_source_id=?', [testEnvironment.pokemonId]);
    const price = Number(listingRows[0].price);
    expect(snapshot.stock).toBeGreaterThanOrEqual(1);
    expect(snapshot.walletBalance).toBeGreaterThanOrEqual(price);

    const responses = await Promise.all([
      bffRequest.post('/api/purchases', {
        data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
        headers: { 'X-Request-Id': requestId },
      }),
      bffRequest.post('/api/purchases', {
        data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
        headers: { 'X-Request-Id': requestId },
      }),
    ]);
    expect(responses.map((response) => response.status()).sort()).toEqual([201, 409]);
    const createdResponse = responses.find((response) => response.status() === 201);
    const duplicateResponse = responses.find((response) => response.status() === 409);
    expect(createdResponse).toBeDefined();
    expect(duplicateResponse).toBeDefined();
    expect(createdResponse?.headers().location).toBe(`/api/purchases/${purchaseId}`);
    const createdBody = await createdResponse!.json();
    expect(createdBody).toMatchObject({
      purchaseId,
      pokemon: { id: testEnvironment.pokemonId },
      quantity: 1,
      pricing: { unitPrice: price, totalPrice: price },
    });
    await expectPublicError(duplicateResponse!, {
      status: 409,
      code: 'PURCHASE_DUPLICATE',
      message: 'Purchase ID has already been processed',
      requestId,
      details: [],
    });

    const [purchaseRows] = await database.query<RowDataPacket[]>('SELECT id FROM purchases WHERE id=?', [purchaseId]);
    expect(purchaseRows).toHaveLength(1);
    const [walletRows] = await database.query<RowDataPacket[]>('SELECT balance FROM user_wallet WHERE user_id=?', [testEnvironment.userId]);
    const [listingAfterRows] = await database.query<RowDataPacket[]>('SELECT stock FROM shop_listing WHERE pokemon_source_id=?', [testEnvironment.pokemonId]);
    const [inventoryRows] = await database.query<RowDataPacket[]>('SELECT quantity FROM user_inventory WHERE user_id=? AND pokemon_source_id=?', [testEnvironment.userId, testEnvironment.pokemonId]);
    expect(Number(walletRows[0].balance)).toBe(snapshot.walletBalance - price);
    expect(Number(listingAfterRows[0].stock)).toBe(snapshot.stock - 1);
    expect(Number(inventoryRows[0]?.quantity ?? 0)).toBe((snapshot.inventoryQuantity ?? 0) + 1);
  } finally {
    try {
      if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
      await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
    } finally {
      await database.close();
    }
  }
});
