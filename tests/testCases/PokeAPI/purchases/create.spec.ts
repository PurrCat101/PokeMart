import { RowDataPacket } from 'mysql2';
import { expect, test } from '../../../support/fixtures/apiFixtures';
import { MySQLConnection } from '../../../support/models/MySQL/MySQLConnection';
import { expectPublicError } from '../../../support/utils/expectPublicError';
import { PurchaseStateSnapshot, restorePurchaseState, snapshotPurchaseState } from '../../../support/utils/purchaseState';
import { internalHeaders } from '../support';

async function assertNoPurchase(database: MySQLConnection, purchaseId: string): Promise<void> {
  const [rows] = await database.query<RowDataPacket[]>('SELECT id FROM purchases WHERE id=?', [purchaseId]);
  expect(rows).toEqual([]);
}

test('INT-PURCHASE-CREATE-001 POST purchase commits once, exposes service DTO, and rejects committed duplicates', async ({ request, testEnvironment }) => {
  const database = new MySQLConnection();
  const purchaseId = testEnvironment.purchaseId();
  const requestId = 'tc-pokeapi-purchase-create';
  let snapshot: PurchaseStateSnapshot | undefined;
  try {
    snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
    const [listingRows] = await database.query<RowDataPacket[]>(
      'SELECT l.price, r.name FROM shop_listing l JOIN pokemon_reference r ON r.source_id=l.pokemon_source_id WHERE l.pokemon_source_id=? AND l.active=TRUE',
      [testEnvironment.pokemonId],
    );
    expect(listingRows).toHaveLength(1);
    const price = Number(listingRows[0].price);
    expect(snapshot.stock).toBeGreaterThanOrEqual(1);
    expect(snapshot.walletBalance).toBeGreaterThanOrEqual(price);

    const response = await request.post('/pokemart/v2/purchases', {
      data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
      headers: internalHeaders(testEnvironment.userId, requestId),
    });
    expect(response.status()).toBe(201);
    expect(response.headers()['x-request-id']).toBe(requestId);
    expect(response.headers().location).toBe(`/pokemart/v2/purchases/${purchaseId}`);
    const expectedPurchase = {
      id: purchaseId,
      pokemonId: testEnvironment.pokemonId,
      pokemonName: listingRows[0].name,
      quantity: 1,
      unitPrice: price,
      totalPrice: price,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    };
    expect(await response.json()).toEqual(expectedPurchase);

    const detailResponse = await request.get(`/pokemart/v2/purchases/${purchaseId}`, {
      headers: internalHeaders(testEnvironment.userId, requestId),
    });
    expect(detailResponse.status()).toBe(200);
    const createdBody = await response.json();
    expect(await detailResponse.json()).toEqual(createdBody);

    const otherUserResponse = await request.get(`/pokemart/v2/purchases/${purchaseId}`, {
      headers: internalHeaders('pokeapi-other-test-user', requestId),
    });
    await expectPublicError(otherUserResponse, {
      status: 404,
      code: 'PURCHASE_NOT_FOUND',
      message: 'Purchase not found',
      requestId,
      details: [],
    });

    const duplicateResponse = await request.post('/pokemart/v2/purchases', {
      data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 2 },
      headers: internalHeaders(testEnvironment.userId, requestId),
    });
    await expectPublicError(duplicateResponse, {
      status: 409,
      code: 'PURCHASE_DUPLICATE',
      message: 'Purchase ID has already been processed',
      requestId,
      details: [],
    });

    const [walletRows] = await database.query<RowDataPacket[]>('SELECT balance FROM user_wallet WHERE user_id=?', [testEnvironment.userId]);
    const [stockRows] = await database.query<RowDataPacket[]>('SELECT stock FROM shop_listing WHERE pokemon_source_id=?', [testEnvironment.pokemonId]);
    const [inventoryRows] = await database.query<RowDataPacket[]>('SELECT quantity FROM user_inventory WHERE user_id=? AND pokemon_source_id=?', [testEnvironment.userId, testEnvironment.pokemonId]);
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

test('INT-PURCHASE-CREATE-002 POST purchase rejects invalid payloads and media types without side effects', async ({ request, testEnvironment }) => {
  const database = new MySQLConnection();
  const requestId = 'tc-pokeapi-purchase-validation';
  try {
    const scenarios = [
      { body: { pokemonId: testEnvironment.pokemonId, quantity: 1 }, field: 'purchaseId', message: 'must be a UUID' },
      { body: { purchaseId: 'invalid', pokemonId: testEnvironment.pokemonId, quantity: 1 }, field: 'purchaseId', message: 'must be a UUID' },
      { body: { purchaseId: testEnvironment.purchaseId(), pokemonId: testEnvironment.pokemonId, quantity: 100 }, field: 'quantity', message: 'must be an integer from 1 to 99' },
      { body: { purchaseId: testEnvironment.purchaseId(), pokemonId: testEnvironment.pokemonId, quantity: 1, extra: true }, field: 'body', message: 'contains unknown fields' },
      { body: null, field: 'body', message: 'must be an object' },
    ];

    for (const scenario of scenarios) {
      const purchaseId = typeof scenario.body?.purchaseId === 'string' && /^[0-9a-f-]{36}$/i.test(scenario.body.purchaseId)
        ? scenario.body.purchaseId
        : testEnvironment.purchaseId();
      const before = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
      const response = await request.post('/pokemart/v2/purchases', {
        data: scenario.body,
        headers: internalHeaders(testEnvironment.userId, requestId),
      });
      await expectPublicError(response, {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        requestId,
        details: [{ field: scenario.field, message: scenario.message }],
      });
      expect(await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId)).toEqual(before);
      await assertNoPurchase(database, purchaseId);
    }

    const malformedJson = await request.post('/pokemart/v2/purchases', {
      data: Buffer.from('{"purchaseId":'),
      headers: { ...internalHeaders(testEnvironment.userId, requestId), 'Content-Type': 'application/json' },
    });
    await expectPublicError(malformedJson, {
      status: 400,
      code: 'INVALID_JSON',
      message: 'Malformed JSON request body',
      requestId,
      details: [],
    });

    const unsupportedType = await request.post('/pokemart/v2/purchases', {
      data: 'not-json',
      headers: { ...internalHeaders(testEnvironment.userId, requestId), 'Content-Type': 'text/plain' },
    });
    await expectPublicError(unsupportedType, {
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Content-Type must be application/json',
      requestId,
      details: [],
    });

    const beforeMissingIdentity = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
    const missingIdentity = await request.post('/pokemart/v2/purchases', {
      data: { purchaseId: testEnvironment.purchaseId(), pokemonId: testEnvironment.pokemonId, quantity: 1 },
      headers: { 'X-Request-Id': requestId },
    });
    await expectPublicError(missingIdentity, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      requestId,
      details: [{ field: 'X-User-Id', message: 'is required and must be valid' }],
    });
    expect(await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId)).toEqual(beforeMissingIdentity);
  } finally {
    await database.close();
  }
});

test('INT-PURCHASE-CREATE-003 POST purchase returns documented business errors without mutation', async ({ request, testEnvironment }) => {
  const database = new MySQLConnection();
  let snapshot: PurchaseStateSnapshot | undefined;
  let originalActive: number | undefined;
  try {
    snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
    const [listingRows] = await database.query<RowDataPacket[]>('SELECT active FROM shop_listing WHERE pokemon_source_id=?', [testEnvironment.pokemonId]);
    originalActive = Number(listingRows[0].active);

    const cases: Array<{
      pokemonId: number;
      code: string;
      status: number;
      message: string;
      deactivate?: boolean;
      stock?: number;
      balance?: number;
      quantity?: number;
    }> = [
      { pokemonId: 999, code: 'POKEMON_NOT_FOUND', status: 404, message: 'Pokémon not found' },
      { pokemonId: testEnvironment.pokemonId, code: 'POKEMON_NOT_FOR_SALE', status: 409, message: 'Pokémon is not for sale', deactivate: true },
      { pokemonId: testEnvironment.pokemonId, code: 'INSUFFICIENT_STOCK', status: 409, message: 'Insufficient stock', stock: 0, quantity: 99 },
      { pokemonId: testEnvironment.pokemonId, code: 'INSUFFICIENT_FUNDS', status: 422, message: 'Insufficient funds', balance: 0 },
    ];

    for (const scenario of cases) {
      await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
      await database.query('UPDATE shop_listing SET active=? WHERE pokemon_source_id=?', [originalActive, testEnvironment.pokemonId]);
      if (scenario.deactivate) await database.query('UPDATE shop_listing SET active=FALSE WHERE pokemon_source_id=?', [testEnvironment.pokemonId]);
      if (scenario.stock !== undefined) await database.query('UPDATE shop_listing SET stock=? WHERE pokemon_source_id=?', [scenario.stock, testEnvironment.pokemonId]);
      if (scenario.balance !== undefined) await database.query('UPDATE user_wallet SET balance=? WHERE user_id=?', [scenario.balance, testEnvironment.userId]);

      const purchaseId = testEnvironment.purchaseId();
      const requestId = `tc-pokeapi-business-${scenario.code}`;
      const response = await request.post('/pokemart/v2/purchases', {
        data: { purchaseId, pokemonId: scenario.pokemonId, quantity: scenario.quantity ?? 1 },
        headers: internalHeaders(testEnvironment.userId, requestId),
      });
      await expectPublicError(response, {
        status: scenario.status,
        code: scenario.code,
        message: scenario.message,
        requestId,
        details: [],
      });
      await assertNoPurchase(database, purchaseId);
      const after = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
      expect(after.walletBalance).toBe(scenario.balance ?? snapshot.walletBalance);
      expect(after.stock).toBe(scenario.stock ?? snapshot.stock);
      expect(after.inventoryQuantity).toBe(snapshot.inventoryQuantity);
    }
  } finally {
    try {
      if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
      if (originalActive !== undefined) await database.query('UPDATE shop_listing SET active=? WHERE pokemon_source_id=?', [originalActive, testEnvironment.pokemonId]);
    } finally {
      await database.close();
    }
  }
});
