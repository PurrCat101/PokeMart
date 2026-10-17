import { expect, test } from '../../support/fixtures/apiFixtures';
import { newPurchaseId } from '../../support/utils/purchaseId';
import { MySQLConnection } from '../../support/models/MySQL/MySQLConnection';
import { RowDataPacket } from 'mysql2';

test('@purchase-retry an unprocessed purchaseId can be retried but a committed one is a duplicate', async ({ bffRequest }) => {
  const purchaseId = newPurchaseId();
  const database = new MySQLConnection();
  let walletBefore: number | undefined;
  let stockBefore: number | undefined;
  let inventoryBefore: number | undefined;
  try {
    const [walletRows] = await database.query<RowDataPacket[]>('SELECT balance FROM user_wallet WHERE user_id=?', ['lab-user-001']);
    const [listingRows] = await database.query<RowDataPacket[]>('SELECT stock, price FROM shop_listing WHERE pokemon_source_id=1');
    const [inventoryRows] = await database.query<RowDataPacket[]>('SELECT quantity FROM user_inventory WHERE user_id=? AND pokemon_source_id=1', ['lab-user-001']);
    expect(walletRows).toHaveLength(1);
    expect(listingRows).toHaveLength(1);
    walletBefore = Number(walletRows[0].balance);
    stockBefore = Number(listingRows[0].stock);
    if (inventoryRows.length) inventoryBefore = Number(inventoryRows[0].quantity);
    const price = Number(listingRows[0].price);

    const failedAttempt = await bffRequest.post('/api/purchases', {
      data: { purchaseId, pokemonId: 999, quantity: 1 },
    });
    expect(failedAttempt.status()).toBe(404);
    expect(await failedAttempt.json()).toMatchObject({ error: { code: 'POKEMON_NOT_FOUND' } });

    const successfulAttempt = await bffRequest.post('/api/purchases', {
      data: { purchaseId, pokemonId: 1, quantity: 1 },
    });
    expect(successfulAttempt.status()).toBe(201);
    expect(successfulAttempt.headers().location).toBe(`/api/purchases/${purchaseId}`);
    expect(await successfulAttempt.json()).toMatchObject({ purchaseId });

    const duplicateAttempt = await bffRequest.post('/api/purchases', {
      data: { purchaseId, pokemonId: 1, quantity: 1 },
    });
    expect(duplicateAttempt.status()).toBe(409);
    expect(await duplicateAttempt.json()).toMatchObject({ error: { code: 'PURCHASE_DUPLICATE' } });

    const [walletAfterResponse, pokemonAfterResponse, storedPurchaseResponse] = await Promise.all([
      bffRequest.get('/api/wallet'),
      bffRequest.get('/api/pokemon/1'),
      bffRequest.get(`/api/purchases/${purchaseId}`),
    ]);
    expect(walletAfterResponse.status()).toBe(200);
    expect(pokemonAfterResponse.status()).toBe(200);
    expect(storedPurchaseResponse.status()).toBe(200);
    expect((await walletAfterResponse.json()).wallet.balance).toBe(walletBefore - price);
    expect((await pokemonAfterResponse.json()).listing.availableStock).toBe(stockBefore - 1);
    expect(await storedPurchaseResponse.json()).toMatchObject({ purchaseId });
  } finally {
    try {
      if (walletBefore !== undefined) await database.query('UPDATE user_wallet SET balance=? WHERE user_id=?', [walletBefore, 'lab-user-001']);
      if (stockBefore !== undefined) await database.query('UPDATE shop_listing SET stock=? WHERE pokemon_source_id=1', [stockBefore]);
      if (inventoryBefore === undefined) {
        await database.query('DELETE FROM user_inventory WHERE user_id=? AND pokemon_source_id=1', ['lab-user-001']);
      } else {
        await database.query('UPDATE user_inventory SET quantity=? WHERE user_id=? AND pokemon_source_id=1', [inventoryBefore, 'lab-user-001']);
      }
      await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
    } finally {
      await database.close();
    }
  }
});
