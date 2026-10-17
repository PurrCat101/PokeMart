import { RowDataPacket } from 'mysql2';
import { expect, test } from '../../../support/fixtures/apiFixtures';
import { MySQLConnection } from '../../../support/models/MySQL/MySQLConnection';
import { expectPublicError } from '../../../support/utils/expectPublicError';
import { restorePurchaseState, snapshotPurchaseState } from '../../../support/utils/purchaseState';
import { internalHeaders } from '../support';

test('INT-PURCHASE-RETRY-001 POST failed purchase can retry the same ID after funds are restored', async ({ request, testEnvironment }) => {
  const database = new MySQLConnection();
  const purchaseId = testEnvironment.purchaseId();
  const requestId = 'tc-pokeapi-purchase-retry';
  let snapshot: Awaited<ReturnType<typeof snapshotPurchaseState>> | undefined;
  try {
    snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
    const [listingRows] = await database.query<RowDataPacket[]>('SELECT price FROM shop_listing WHERE pokemon_source_id=? AND active=TRUE', [testEnvironment.pokemonId]);
    expect(listingRows).toHaveLength(1);
    expect(snapshot.stock).toBeGreaterThanOrEqual(1);
    expect(snapshot.walletBalance).toBeGreaterThanOrEqual(Number(listingRows[0].price));

    await database.query('UPDATE user_wallet SET balance=0 WHERE user_id=?', [testEnvironment.userId]);
    const body = { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 };
    const failed = await request.post('/pokemart/v2/purchases', {
      data: body,
      headers: internalHeaders(testEnvironment.userId, requestId),
    });
    await expectPublicError(failed, {
      status: 422,
      code: 'INSUFFICIENT_FUNDS',
      message: 'Insufficient funds',
      requestId,
      details: [],
    });
    const [failedPurchaseRows] = await database.query<RowDataPacket[]>('SELECT id FROM purchases WHERE id=?', [purchaseId]);
    expect(failedPurchaseRows).toEqual([]);

    await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
    const retried = await request.post('/pokemart/v2/purchases', {
      data: body,
      headers: internalHeaders(testEnvironment.userId, requestId),
    });
    expect(retried.status()).toBe(201);
    expect((await retried.json()).id).toBe(purchaseId);
    const [committedRows] = await database.query<RowDataPacket[]>('SELECT id FROM purchases WHERE id=?', [purchaseId]);
    expect(committedRows).toHaveLength(1);
  } finally {
    try {
      if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
      await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
    } finally {
      await database.close();
    }
  }
});
