import { RowDataPacket } from 'mysql2';
import { expect, test } from '../../support/fixtures/apiFixtures';
import { MySQLConnection } from '../../support/models/MySQL/MySQLConnection';

test('@e2e @purchase-flow an uncommitted purchaseId can be retried, while a committed ID is rejected as duplicate', async ({ bffRequest, testEnvironment }) => {
  const purchaseId = testEnvironment.purchaseId();
  const database = new MySQLConnection();
  let walletBefore: number | undefined;
  let stockBefore: number | undefined;
  let inventoryBefore: number | undefined;
  let inventorySnapshotTaken = false;

  try {
    const [walletRows] = await database.query<RowDataPacket[]>('SELECT balance FROM user_wallet WHERE user_id=?', [testEnvironment.userId]);
    const [listingRows] = await database.query<RowDataPacket[]>('SELECT stock FROM shop_listing WHERE pokemon_source_id=?', [testEnvironment.pokemonId]);
    const [inventoryRows] = await database.query<RowDataPacket[]>('SELECT quantity FROM user_inventory WHERE user_id=? AND pokemon_source_id=?', [testEnvironment.userId, testEnvironment.pokemonId]);
    expect(walletRows).toHaveLength(1);
    expect(listingRows).toHaveLength(1);
    walletBefore = Number(walletRows[0].balance);
    stockBefore = Number(listingRows[0].stock);
    inventorySnapshotTaken = true;
    if (inventoryRows.length) inventoryBefore = Number(inventoryRows[0].quantity);

    const failedAttempt = await bffRequest.post('/api/purchases', {
      data: { purchaseId, pokemonId: 999, quantity: 1 },
    });
    expect(failedAttempt.status()).toBe(404);
    expect(await failedAttempt.json()).toMatchObject({ error: { code: 'POKEMON_NOT_FOUND' } });

    const successfulAttempt = await bffRequest.post('/api/purchases', {
      data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
    });
    expect(successfulAttempt.status()).toBe(201);
    expect(successfulAttempt.headers().location).toBe(`/api/purchases/${purchaseId}`);
    expect(await successfulAttempt.json()).toMatchObject({ purchaseId });

    const duplicateAttempt = await bffRequest.post('/api/purchases', {
      data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 2 },
    });
    expect(duplicateAttempt.status()).toBe(409);
    expect(await duplicateAttempt.json()).toMatchObject({ error: { code: 'PURCHASE_DUPLICATE' } });

    const storedPurchaseResponse = await bffRequest.get(`/api/purchases/${purchaseId}`);
    expect(storedPurchaseResponse.status()).toBe(200);
    expect(await storedPurchaseResponse.json()).toMatchObject({ purchaseId });

    const [walletAfterRows] = await database.query<RowDataPacket[]>('SELECT balance FROM user_wallet WHERE user_id=?', [testEnvironment.userId]);
    const [listingAfterRows] = await database.query<RowDataPacket[]>('SELECT stock, price FROM shop_listing WHERE pokemon_source_id=?', [testEnvironment.pokemonId]);
    const [inventoryAfterRows] = await database.query<RowDataPacket[]>('SELECT quantity FROM user_inventory WHERE user_id=? AND pokemon_source_id=?', [testEnvironment.userId, testEnvironment.pokemonId]);
    const price = Number(listingAfterRows[0].price);
    expect(Number(walletAfterRows[0].balance)).toBe(walletBefore - price);
    expect(Number(listingAfterRows[0].stock)).toBe(stockBefore - 1);
    expect(Number(inventoryAfterRows[0]?.quantity ?? 0)).toBe((inventoryBefore ?? 0) + 1);
  } finally {
    try {
      if (walletBefore !== undefined) await database.query('UPDATE user_wallet SET balance=? WHERE user_id=?', [walletBefore, testEnvironment.userId]);
      if (stockBefore !== undefined) await database.query('UPDATE shop_listing SET stock=? WHERE pokemon_source_id=?', [stockBefore, testEnvironment.pokemonId]);
      if (inventorySnapshotTaken) {
        if (inventoryBefore === undefined) {
          await database.query('DELETE FROM user_inventory WHERE user_id=? AND pokemon_source_id=?', [testEnvironment.userId, testEnvironment.pokemonId]);
        } else {
          await database.query('UPDATE user_inventory SET quantity=? WHERE user_id=? AND pokemon_source_id=?', [inventoryBefore, testEnvironment.userId, testEnvironment.pokemonId]);
        }
      }
      await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
    } finally {
      await database.close();
    }
  }
});
