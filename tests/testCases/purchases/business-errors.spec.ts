import { RowDataPacket } from 'mysql2';
import { expect, test } from '../../support/fixtures/apiFixtures';
import { MySQLConnection } from '../../support/models/MySQL/MySQLConnection';
import { expectPublicError } from '../../support/utils/expectPublicError';
import { PurchaseStateSnapshot, restorePurchaseState, snapshotPurchaseState } from '../../support/utils/purchaseState';

const requestId = 'tc-purchase-business';

async function expectNoPurchase(database: MySQLConnection, purchaseId: string): Promise<void> {
  const [rows] = await database.query<RowDataPacket[]>('SELECT id FROM purchases WHERE id=?', [purchaseId]);
  expect(rows).toEqual([]);
}

test('PUR-BIZ-001 missing Pokémon during purchase returns 404 without state changes', async ({ bffRequest, testEnvironment }) => {
  const database = new MySQLConnection();
  const purchaseId = testEnvironment.purchaseId();
  let snapshot: PurchaseStateSnapshot | undefined;
  try {
    snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
    const response = await bffRequest.post('/api/purchases', {
      data: { purchaseId, pokemonId: 999, quantity: 1 },
      headers: { 'X-Request-Id': requestId },
    });
    await expectPublicError(response, {
      status: 404,
      code: 'POKEMON_NOT_FOUND',
      message: 'Pokémon not found',
      requestId,
      details: [],
    });
    expect(await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId)).toEqual(snapshot);
    await expectNoPurchase(database, purchaseId);
  } finally {
    if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
    await database.close();
  }
});

test('PUR-BIZ-002 inactive listing returns 409 without state changes', async ({ bffRequest, testEnvironment }) => {
  const database = new MySQLConnection();
  const purchaseId = testEnvironment.purchaseId();
  let snapshot: PurchaseStateSnapshot | undefined;
  let active: number | undefined;
  try {
    snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
    const [listingRows] = await database.query<RowDataPacket[]>('SELECT active FROM shop_listing WHERE pokemon_source_id=?', [testEnvironment.pokemonId]);
    active = Number(listingRows[0].active);
    await database.query('UPDATE shop_listing SET active=FALSE WHERE pokemon_source_id=?', [testEnvironment.pokemonId]);

    const response = await bffRequest.post('/api/purchases', {
      data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
      headers: { 'X-Request-Id': requestId },
    });
    await expectPublicError(response, {
      status: 409,
      code: 'POKEMON_NOT_FOR_SALE',
      message: 'Pokémon is not for sale',
      requestId,
      details: [],
    });
    expect(await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId)).toEqual(snapshot);
    await expectNoPurchase(database, purchaseId);
  } finally {
    try {
      if (active !== undefined) await database.query('UPDATE shop_listing SET active=? WHERE pokemon_source_id=?', [active, testEnvironment.pokemonId]);
      if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
    } finally {
      await database.close();
    }
  }
});

test('PUR-BIZ-003 insufficient stock returns 409 without state changes', async ({ bffRequest, testEnvironment }) => {
  const database = new MySQLConnection();
  const purchaseId = testEnvironment.purchaseId();
  let snapshot: PurchaseStateSnapshot | undefined;
  try {
    snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
    await database.query('UPDATE shop_listing SET stock=0 WHERE pokemon_source_id=?', [testEnvironment.pokemonId]);

    const response = await bffRequest.post('/api/purchases', {
      data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
      headers: { 'X-Request-Id': requestId },
    });
    await expectPublicError(response, {
      status: 409,
      code: 'INSUFFICIENT_STOCK',
      message: 'Insufficient stock',
      requestId,
      details: [],
    });
    expect(await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId)).toEqual({ ...snapshot, stock: 0 });
    await expectNoPurchase(database, purchaseId);
  } finally {
    if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
    await database.close();
  }
});

test('PUR-BIZ-004 insufficient funds returns 422 without state changes', async ({ bffRequest, testEnvironment }) => {
  const database = new MySQLConnection();
  const purchaseId = testEnvironment.purchaseId();
  let snapshot: PurchaseStateSnapshot | undefined;
  try {
    snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
    await database.query('UPDATE user_wallet SET balance=0 WHERE user_id=?', [testEnvironment.userId]);

    const response = await bffRequest.post('/api/purchases', {
      data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
      headers: { 'X-Request-Id': requestId },
    });
    await expectPublicError(response, {
      status: 422,
      code: 'INSUFFICIENT_FUNDS',
      message: 'Insufficient funds',
      requestId,
      details: [],
    });
    expect(await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId)).toEqual({ ...snapshot, walletBalance: 0 });
    await expectNoPurchase(database, purchaseId);
  } finally {
    if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
    await database.close();
  }
});
