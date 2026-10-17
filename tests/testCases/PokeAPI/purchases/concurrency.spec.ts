import { RowDataPacket } from 'mysql2';
import { expect, test } from '../../../support/fixtures/apiFixtures';
import { MySQLConnection } from '../../../support/models/MySQL/MySQLConnection';
import { expectPublicError } from '../../../support/utils/expectPublicError';
import { restorePurchaseState, snapshotPurchaseState } from '../../../support/utils/purchaseState';
import { internalHeaders } from '../support';

test('INT-PURCHASE-CONCURRENCY-001 concurrent POSTs with one purchaseId commit once', async ({ request, testEnvironment }) => {
  const database = new MySQLConnection();
  const purchaseId = testEnvironment.purchaseId();
  const requestId = 'tc-pokeapi-purchase-concurrency';
  let snapshot: Awaited<ReturnType<typeof snapshotPurchaseState>> | undefined;
  try {
    snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
    const [listingRows] = await database.query<RowDataPacket[]>('SELECT price, active FROM shop_listing WHERE pokemon_source_id=?', [testEnvironment.pokemonId]);
    expect(listingRows).toHaveLength(1);
    expect(Number(listingRows[0].active)).toBe(1);
    const price = Number(listingRows[0].price);
    expect(snapshot.stock).toBeGreaterThanOrEqual(1);
    expect(snapshot.walletBalance).toBeGreaterThanOrEqual(price);

    const payload = { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 };
    const responses = await Promise.all([
      request.post('/pokemart/v1/purchases', { data: payload, headers: internalHeaders(testEnvironment.userId, requestId) }),
      request.post('/pokemart/v1/purchases', { data: payload, headers: internalHeaders(testEnvironment.userId, requestId) }),
    ]);
    expect(responses.map((response) => response.status()).sort()).toEqual([201, 409]);
    const duplicate = responses.find((response) => response.status() === 409);
    expect(duplicate).toBeDefined();
    await expectPublicError(duplicate!, {
      status: 409,
      code: 'PURCHASE_DUPLICATE',
      message: 'Purchase ID has already been processed',
      requestId,
      details: [],
    });

    const [purchaseRows] = await database.query<RowDataPacket[]>('SELECT id FROM purchases WHERE id=?', [purchaseId]);
    const [walletRows] = await database.query<RowDataPacket[]>('SELECT balance FROM user_wallet WHERE user_id=?', [testEnvironment.userId]);
    const [stockRows] = await database.query<RowDataPacket[]>('SELECT stock FROM shop_listing WHERE pokemon_source_id=?', [testEnvironment.pokemonId]);
    const [inventoryRows] = await database.query<RowDataPacket[]>('SELECT quantity FROM user_inventory WHERE user_id=? AND pokemon_source_id=?', [testEnvironment.userId, testEnvironment.pokemonId]);
    expect(purchaseRows).toHaveLength(1);
    expect(Number(walletRows[0].balance)).toBe(snapshot.walletBalance - price);
    expect(Number(stockRows[0].stock)).toBe(snapshot.stock - 1);
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

test('INT-PURCHASE-CONCURRENCY-002 concurrent distinct purchases competing for the last stock unit allow one commit', async ({ request, testEnvironment }) => {
  const database = new MySQLConnection();
  const purchaseIds = [testEnvironment.purchaseId(), testEnvironment.purchaseId()];
  const requestId = 'tc-pokeapi-last-stock';
  let snapshot: Awaited<ReturnType<typeof snapshotPurchaseState>> | undefined;
  try {
    snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
    const [listingRows] = await database.query<RowDataPacket[]>('SELECT price, active FROM shop_listing WHERE pokemon_source_id=?', [testEnvironment.pokemonId]);
    expect(listingRows).toHaveLength(1);
    expect(Number(listingRows[0].active)).toBe(1);
    const price = Number(listingRows[0].price);
    expect(snapshot.walletBalance).toBeGreaterThanOrEqual(price);
    await database.query('UPDATE shop_listing SET stock=1 WHERE pokemon_source_id=?', [testEnvironment.pokemonId]);

    const responses = await Promise.all(purchaseIds.map((purchaseId) => request.post('/pokemart/v1/purchases', {
      data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
      headers: internalHeaders(testEnvironment.userId, requestId),
    })));
    expect(responses.map((response) => response.status()).sort()).toEqual([201, 409]);
    const rejected = responses.find((response) => response.status() === 409);
    expect(rejected).toBeDefined();
    await expectPublicError(rejected!, {
      status: 409,
      code: 'INSUFFICIENT_STOCK',
      message: 'Insufficient stock',
      requestId,
      details: [],
    });

    const [purchaseRows] = await database.query<RowDataPacket[]>('SELECT id FROM purchases WHERE id IN (?, ?)', purchaseIds);
    const [walletRows] = await database.query<RowDataPacket[]>('SELECT balance FROM user_wallet WHERE user_id=?', [testEnvironment.userId]);
    const [stockRows] = await database.query<RowDataPacket[]>('SELECT stock FROM shop_listing WHERE pokemon_source_id=?', [testEnvironment.pokemonId]);
    const [inventoryRows] = await database.query<RowDataPacket[]>('SELECT quantity FROM user_inventory WHERE user_id=? AND pokemon_source_id=?', [testEnvironment.userId, testEnvironment.pokemonId]);
    expect(purchaseRows).toHaveLength(1);
    expect(Number(walletRows[0].balance)).toBe(snapshot.walletBalance - price);
    expect(Number(stockRows[0].stock)).toBe(0);
    expect(Number(inventoryRows[0]?.quantity ?? 0)).toBe((snapshot.inventoryQuantity ?? 0) + 1);
  } finally {
    try {
      if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
      await database.query('DELETE FROM purchases WHERE id IN (?, ?)', purchaseIds);
    } finally {
      await database.close();
    }
  }
});
