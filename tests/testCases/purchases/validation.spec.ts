import { RowDataPacket } from 'mysql2';
import { expect, test } from '../../support/fixtures/apiFixtures';
import { MySQLConnection } from '../../support/models/MySQL/MySQLConnection';
import { expectPublicError } from '../../support/utils/expectPublicError';

type PurchaseValidationCase = {
  id: string;
  title: string;
  body: (purchaseId: string, pokemonId: number) => Record<string, unknown>;
  field: string;
  message: string;
};

const requestId = 'tc-purchase-validation';

async function snapshotState(database: MySQLConnection, userId: string, pokemonId: number, sentinelId: string) {
  const [walletRows] = await database.query<RowDataPacket[]>('SELECT balance FROM user_wallet WHERE user_id=?', [userId]);
  const [listingRows] = await database.query<RowDataPacket[]>('SELECT stock FROM shop_listing WHERE pokemon_source_id=?', [pokemonId]);
  const [inventoryRows] = await database.query<RowDataPacket[]>('SELECT quantity FROM user_inventory WHERE user_id=? AND pokemon_source_id=?', [userId, pokemonId]);
  const [purchaseRows] = await database.query<RowDataPacket[]>('SELECT id FROM purchases WHERE id=?', [sentinelId]);
  return {
    wallet: walletRows.map((row) => Number(row.balance)),
    stock: listingRows.map((row) => Number(row.stock)),
    inventory: inventoryRows.map((row) => Number(row.quantity)),
    purchases: purchaseRows.map((row) => row.id),
  };
}

const cases: PurchaseValidationCase[] = [
  { id: 'PUR-VAL-001', title: 'missing purchaseId', body: (_id, pokemonId) => ({ pokemonId, quantity: 1 }), field: 'purchaseId', message: 'must be a UUID' },
  { id: 'PUR-VAL-002', title: 'null purchaseId', body: (_id, pokemonId) => ({ purchaseId: null, pokemonId, quantity: 1 }), field: 'purchaseId', message: 'must be a UUID' },
  { id: 'PUR-VAL-003', title: 'malformed purchaseId', body: (_id, pokemonId) => ({ purchaseId: 'not-a-uuid', pokemonId, quantity: 1 }), field: 'purchaseId', message: 'must be a UUID' },
  { id: 'PUR-VAL-004', title: 'missing pokemonId', body: (id) => ({ purchaseId: id, quantity: 1 }), field: 'pokemonId', message: 'must be a positive integer' },
  { id: 'PUR-VAL-005', title: 'null pokemonId', body: (id) => ({ purchaseId: id, pokemonId: null, quantity: 1 }), field: 'pokemonId', message: 'must be a positive integer' },
  { id: 'PUR-VAL-006', title: 'string pokemonId', body: (id) => ({ purchaseId: id, pokemonId: '1', quantity: 1 }), field: 'pokemonId', message: 'must be a positive integer' },
  { id: 'PUR-VAL-007', title: 'zero pokemonId', body: (id) => ({ purchaseId: id, pokemonId: 0, quantity: 1 }), field: 'pokemonId', message: 'must be a positive integer' },
  { id: 'PUR-VAL-008', title: 'decimal pokemonId', body: (id) => ({ purchaseId: id, pokemonId: 1.5, quantity: 1 }), field: 'pokemonId', message: 'must be a positive integer' },
  { id: 'PUR-VAL-009', title: 'missing quantity', body: (id, pokemonId) => ({ purchaseId: id, pokemonId }), field: 'quantity', message: 'must be an integer from 1 to 99' },
  { id: 'PUR-VAL-010', title: 'null quantity', body: (id, pokemonId) => ({ purchaseId: id, pokemonId, quantity: null }), field: 'quantity', message: 'must be an integer from 1 to 99' },
  { id: 'PUR-VAL-011', title: 'string quantity', body: (id, pokemonId) => ({ purchaseId: id, pokemonId, quantity: '1' }), field: 'quantity', message: 'must be an integer from 1 to 99' },
  { id: 'PUR-VAL-012', title: 'zero quantity below minimum', body: (id, pokemonId) => ({ purchaseId: id, pokemonId, quantity: 0 }), field: 'quantity', message: 'must be an integer from 1 to 99' },
  { id: 'PUR-VAL-013', title: 'negative quantity', body: (id, pokemonId) => ({ purchaseId: id, pokemonId, quantity: -1 }), field: 'quantity', message: 'must be an integer from 1 to 99' },
  { id: 'PUR-VAL-014', title: 'decimal quantity', body: (id, pokemonId) => ({ purchaseId: id, pokemonId, quantity: 1.5 }), field: 'quantity', message: 'must be an integer from 1 to 99' },
  { id: 'PUR-VAL-015', title: 'quantity above maximum', body: (id, pokemonId) => ({ purchaseId: id, pokemonId, quantity: 100 }), field: 'quantity', message: 'must be an integer from 1 to 99' },
  { id: 'PUR-VAL-016', title: 'unknown request property', body: (id, pokemonId) => ({ purchaseId: id, pokemonId, quantity: 1, unexpected: true }), field: 'body', message: 'contains unknown fields' },
];

for (const scenario of cases) {
  test(`${scenario.id} POST /api/purchases rejects ${scenario.title} without mutating state`, async ({ bffRequest, testEnvironment }) => {
    const purchaseId = testEnvironment.purchaseId();
    const database = new MySQLConnection();
    let before: Awaited<ReturnType<typeof snapshotState>> | undefined;
    try {
      before = await snapshotState(database, testEnvironment.userId, testEnvironment.pokemonId, purchaseId);
      const response = await bffRequest.post('/api/purchases', {
        data: scenario.body(purchaseId, testEnvironment.pokemonId),
        headers: { 'X-Request-Id': requestId },
      });
      await expectPublicError(response, {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        requestId,
        details: [{ field: scenario.field, message: scenario.message }],
      });
      expect(await snapshotState(database, testEnvironment.userId, testEnvironment.pokemonId, purchaseId)).toEqual(before);
    } finally {
      await database.close();
    }
  });
}

test('PUR-VAL-017 POST /api/purchases rejects a non-object JSON body without mutation', async ({ bffRequest, testEnvironment }) => {
  const requestPurchaseId = testEnvironment.purchaseId();
  const database = new MySQLConnection();
  try {
    const before = await snapshotState(database, testEnvironment.userId, testEnvironment.pokemonId, requestPurchaseId);
    const response = await bffRequest.post('/api/purchases', {
      data: null,
      headers: { 'X-Request-Id': requestId },
    });
    await expectPublicError(response, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      requestId,
      details: [{ field: 'body', message: 'must be an object' }],
    });
    expect(await snapshotState(database, testEnvironment.userId, testEnvironment.pokemonId, requestPurchaseId)).toEqual(before);
  } finally {
    await database.close();
  }
});

test('PUR-VAL-018 POST /api/purchases rejects malformed JSON with the exact error envelope', async ({ bffRequest, testEnvironment }) => {
  const testEnvironmentId = testEnvironment.purchaseId();
  const database = new MySQLConnection();
  try {
    const before = await snapshotState(database, testEnvironment.userId, testEnvironment.pokemonId, testEnvironmentId);
    const response = await bffRequest.post('/api/purchases', {
      data: Buffer.from('{"purchaseId":'),
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    });
    await expectPublicError(response, {
      status: 400,
      code: 'INVALID_JSON',
      message: 'Malformed JSON request body',
      requestId,
      details: [],
    });
    expect(await snapshotState(database, testEnvironment.userId, testEnvironment.pokemonId, testEnvironmentId)).toEqual(before);
  } finally {
    await database.close();
  }
});

test('PUR-VAL-019 POST /api/purchases requires application/json', async ({ bffRequest, testEnvironment }) => {
  const testEnvironmentId = testEnvironment.purchaseId();
  const database = new MySQLConnection();
  try {
    const before = await snapshotState(database, testEnvironment.userId, testEnvironment.pokemonId, testEnvironmentId);
    const response = await bffRequest.post('/api/purchases', {
      data: 'not-json',
      headers: { 'Content-Type': 'text/plain', 'X-Request-Id': requestId },
    });
    await expectPublicError(response, {
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Content-Type must be application/json',
      requestId,
      details: [],
    });
    expect(await snapshotState(database, testEnvironment.userId, testEnvironment.pokemonId, testEnvironmentId)).toEqual(before);
  } finally {
    await database.close();
  }
});

test('PUR-API-001 quantity 99 is schema-valid and reaches the stock business rule', async ({ bffRequest, testEnvironment }) => {
  const database = new MySQLConnection();
  let originalStock: number | undefined;
  try {
    const [listingRows] = await database.query<RowDataPacket[]>('SELECT stock FROM shop_listing WHERE pokemon_source_id=?', [testEnvironment.pokemonId]);
    expect(listingRows).toHaveLength(1);
    originalStock = Number(listingRows[0].stock);
    await database.query('UPDATE shop_listing SET stock=0 WHERE pokemon_source_id=?', [testEnvironment.pokemonId]);

    const response = await bffRequest.post('/api/purchases', {
      data: { purchaseId: testEnvironment.purchaseId(), pokemonId: testEnvironment.pokemonId, quantity: 99 },
      headers: { 'X-Request-Id': requestId },
    });
    await expectPublicError(response, {
      status: 409,
      code: 'INSUFFICIENT_STOCK',
      message: 'Insufficient stock',
      requestId,
      details: [],
    });
  } finally {
    try {
      if (originalStock !== undefined) await database.query('UPDATE shop_listing SET stock=? WHERE pokemon_source_id=?', [originalStock, testEnvironment.pokemonId]);
    } finally {
      await database.close();
    }
  }
});

test('PUR-API-PATH GET /api/purchases/:id distinguishes malformed and nonexistent UUIDs', async ({ bffRequest }) => {
  const malformedResponse = await bffRequest.get('/api/purchases/not-a-uuid', {
    headers: { 'X-Request-Id': requestId },
  });
  await expectPublicError(malformedResponse, {
    status: 400,
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    requestId,
    details: [{ field: 'id', message: 'must be a UUID' }],
  });

  const missingResponse = await bffRequest.get('/api/purchases/00000000-0000-4000-8000-000000000099', {
    headers: { 'X-Request-Id': requestId },
  });
  await expectPublicError(missingResponse, {
    status: 404,
    code: 'PURCHASE_NOT_FOUND',
    message: 'Purchase not found',
    requestId,
    details: [],
  });

  const versionSevenResponse = await bffRequest.get('/api/purchases/00000000-0000-7000-8000-000000000099', {
    headers: { 'X-Request-Id': requestId },
  });
  await expectPublicError(versionSevenResponse, {
    status: 404,
    code: 'PURCHASE_NOT_FOUND',
    message: 'Purchase not found',
    requestId,
    details: [],
  });
});
