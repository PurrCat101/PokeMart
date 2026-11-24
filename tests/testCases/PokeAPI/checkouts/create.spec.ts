import { RowDataPacket } from 'mysql2';
import { expect, test } from '../../../support/fixtures/apiFixtures';
import { MySQLConnection } from '../../../support/models/MySQL/MySQLConnection';
import { expectPublicError } from '../../../support/utils/expectPublicError';
import { PurchaseStateSnapshot, restorePurchaseState, snapshotPurchaseState } from '../../../support/utils/purchaseState';
import { internalHeaders } from '../support';

// A checkout buys a whole bag in one transaction: all lines commit, or nothing changes.
// These cases need two active, in-stock Pokémon listings the test user can afford; they use the configured
// REAL_POKEMON_ID and the next ID, and restore both listings, the wallet and the inventory afterwards.

type Bag = {
  database: MySQLConnection;
  userId: string;
  ids: [number, number];
  prices: [number, number];
  snapshots: [PurchaseStateSnapshot, PurchaseStateSnapshot];
  purchaseIds: string[];
};

async function openBag(testEnvironment: { userId: string; pokemonId: number; purchaseId: () => string }): Promise<Bag> {
  const database = new MySQLConnection();
  const ids: [number, number] = [testEnvironment.pokemonId, testEnvironment.pokemonId + 1];
  const [rows] = await database.query<RowDataPacket[]>('SELECT pokemon_source_id AS id, price, stock, active FROM listings WHERE pokemon_source_id IN (?, ?) ORDER BY pokemon_source_id', ids);
  expect(rows).toHaveLength(2);
  rows.forEach((row) => { expect(Number(row.active)).toBe(1); expect(Number(row.stock)).toBeGreaterThanOrEqual(2); });
  const snapshots: [PurchaseStateSnapshot, PurchaseStateSnapshot] = [
    await snapshotPurchaseState(database, testEnvironment.userId, ids[0]),
    await snapshotPurchaseState(database, testEnvironment.userId, ids[1]),
  ];
  return { database, userId: testEnvironment.userId, ids, prices: [Number(rows[0].price), Number(rows[1].price)], snapshots, purchaseIds: [testEnvironment.purchaseId(), testEnvironment.purchaseId()] };
}

async function closeBag(bag: Bag): Promise<void> {
  try {
    await bag.database.query('DELETE FROM purchases WHERE id IN (?, ?)', bag.purchaseIds); // shipments follow by foreign key
    await restorePurchaseState(bag.database, bag.userId, bag.ids[0], bag.snapshots[0]);
    await restorePurchaseState(bag.database, bag.userId, bag.ids[1], bag.snapshots[1]);
    await bag.database.query('UPDATE user_wallet SET balance=? WHERE user_id=?', [bag.snapshots[0].walletBalance, bag.userId]);
  } finally {
    await bag.database.close();
  }
}

function body(bag: Bag, quantities: [number, number] = [1, 1]) {
  return { lines: bag.ids.map((pokemonId, i) => ({ purchaseId: bag.purchaseIds[i], pokemonId, quantity: quantities[i] })) };
}

async function state(bag: Bag) {
  const [wallet] = await bag.database.query<RowDataPacket[]>('SELECT balance FROM user_wallet WHERE user_id=?', [bag.userId]);
  const [stock] = await bag.database.query<RowDataPacket[]>('SELECT pokemon_source_id AS id, stock FROM listings WHERE pokemon_source_id IN (?, ?) ORDER BY pokemon_source_id', bag.ids);
  const [inventory] = await bag.database.query<RowDataPacket[]>('SELECT pokemon_source_id AS id, quantity FROM user_inventory WHERE user_id=? AND pokemon_source_id IN (?, ?) ORDER BY pokemon_source_id', [bag.userId, ...bag.ids]);
  const [purchases] = await bag.database.query<RowDataPacket[]>('SELECT id FROM purchases WHERE id IN (?, ?)', bag.purchaseIds);
  const [shipments] = await bag.database.query<RowDataPacket[]>('SELECT purchase_id FROM shipments WHERE purchase_id IN (?, ?)', bag.purchaseIds);
  return {
    balance: Number(wallet[0].balance),
    stock: stock.map((row) => Number(row.stock)),
    inventory: inventory.map((row) => [Number(row.id), Number(row.quantity)]),
    purchases: purchases.length,
    shipments: shipments.length,
  };
}

test('INT-CHECKOUT-001 a two-line bag commits every line together', async ({ request, testEnvironment }) => {
  const bag = await openBag(testEnvironment);
  try {
    const before = await state(bag);
    const response = await request.post('/pokemart/v1/checkouts', { data: body(bag), headers: internalHeaders(bag.userId, 'tc-checkout-001') });
    expect(response.status()).toBe(201);
    const result = await response.json();
    expect(result.purchases.map((p: { id: string }) => p.id)).toEqual(bag.purchaseIds);
    expect(result.purchases.map((p: { totalPrice: number }) => p.totalPrice)).toEqual(bag.prices);

    const after = await state(bag);
    expect(after.balance).toBe(before.balance - bag.prices[0] - bag.prices[1]);
    expect(after.stock).toEqual(before.stock.map((value) => value - 1));
    expect(after.purchases).toBe(2);
    expect(after.shipments).toBe(2);
    expect(after.inventory.map(([, quantity]) => quantity)).toEqual(bag.snapshots.map((s) => (s.inventoryQuantity ?? 0) + 1));
  } finally {
    await closeBag(bag);
  }
});

test('INT-CHECKOUT-002 a line without enough stock rolls the whole bag back', async ({ request, testEnvironment }) => {
  const bag = await openBag(testEnvironment);
  try {
    await bag.database.query('UPDATE listings SET stock=0 WHERE pokemon_source_id=?', [bag.ids[1]]);
    const before = await state(bag);
    const response = await request.post('/pokemart/v1/checkouts', { data: body(bag), headers: internalHeaders(bag.userId, 'tc-checkout-002') });
    await expectPublicError(response, { status: 409, code: 'INSUFFICIENT_STOCK', message: 'Insufficient stock', requestId: 'tc-checkout-002', details: [{ field: 'lines[1]', message: `pokemonId ${bag.ids[1]}` }] });
    expect(await state(bag)).toEqual(before); // the affordable first line was not bought either
  } finally {
    await closeBag(bag);
  }
});

test('INT-CHECKOUT-003 a wallet that covers each line but not the total buys nothing', async ({ request, testEnvironment }) => {
  const bag = await openBag(testEnvironment);
  try {
    await bag.database.query('UPDATE user_wallet SET balance=? WHERE user_id=?', [bag.prices[0] + bag.prices[1] - 1, bag.userId]);
    const before = await state(bag);
    const response = await request.post('/pokemart/v1/checkouts', { data: body(bag), headers: internalHeaders(bag.userId, 'tc-checkout-003') });
    await expectPublicError(response, { status: 422, code: 'INSUFFICIENT_FUNDS', message: 'Insufficient funds', requestId: 'tc-checkout-003', details: [] });
    expect(await state(bag)).toEqual(before);
  } finally {
    await closeBag(bag);
  }
});

test('INT-CHECKOUT-004 retrying a committed checkout does not charge twice', async ({ request, testEnvironment }) => {
  const bag = await openBag(testEnvironment);
  try {
    const first = await request.post('/pokemart/v1/checkouts', { data: body(bag), headers: internalHeaders(bag.userId, 'tc-checkout-004') });
    expect(first.status()).toBe(201);
    const afterFirst = await state(bag);
    const retry = await request.post('/pokemart/v1/checkouts', { data: body(bag), headers: internalHeaders(bag.userId, 'tc-checkout-004') });
    await expectPublicError(retry, { status: 409, code: 'PURCHASE_DUPLICATE', message: 'Purchase ID has already been processed', requestId: 'tc-checkout-004', details: [] });
    expect(await state(bag)).toEqual(afterFirst);
  } finally {
    await closeBag(bag);
  }
});

test('INT-CHECKOUT-005 invalid bags are rejected before anything is written', async ({ request, testEnvironment }) => {
  const bag = await openBag(testEnvironment);
  try {
    const before = await state(bag);
    const headers = internalHeaders(bag.userId, 'tc-checkout-005');
    const cases: Array<{ name: string; data: unknown; field: string }> = [
      { name: 'no lines', data: { lines: [] }, field: 'lines' },
      { name: 'unknown field', data: { ...body(bag), extra: true }, field: 'body' },
      { name: 'bad quantity on the second line', data: body(bag, [1, 0] as [number, number]), field: 'lines[1].quantity' },
      { name: 'same product twice', data: { lines: [body(bag).lines[0], { ...body(bag).lines[0], purchaseId: bag.purchaseIds[1] }] }, field: 'lines[1]' },
      { name: 'same purchaseId twice', data: { lines: [body(bag).lines[0], { ...body(bag).lines[1], purchaseId: bag.purchaseIds[0] }] }, field: 'lines[1].purchaseId' },
    ];
    for (const item of cases) {
      const response = await request.post('/pokemart/v1/checkouts', { data: item.data, headers });
      expect(response.status(), item.name).toBe(400);
      const error = (await response.json()).error;
      expect(error.code, item.name).toBe('VALIDATION_ERROR');
      expect(error.details[0].field, item.name).toBe(item.field);
    }
    expect(await state(bag)).toEqual(before);
  } finally {
    await closeBag(bag);
  }
});

test('INT-CHECKOUT-006 two bags with the same products in opposite order both commit (no deadlock)', async ({ request, testEnvironment }) => {
  const bag = await openBag(testEnvironment);
  const otherIds = [testEnvironment.purchaseId(), testEnvironment.purchaseId()];
  try {
    const before = await state(bag);
    const forward = body(bag);
    const reversed = { lines: [{ purchaseId: otherIds[0], pokemonId: bag.ids[1], quantity: 1 }, { purchaseId: otherIds[1], pokemonId: bag.ids[0], quantity: 1 }] };
    const responses = await Promise.all([
      request.post('/pokemart/v1/checkouts', { data: forward, headers: internalHeaders(bag.userId, 'tc-checkout-006a') }),
      request.post('/pokemart/v1/checkouts', { data: reversed, headers: internalHeaders(bag.userId, 'tc-checkout-006b') }),
    ]);
    expect(responses.map((response) => response.status())).toEqual([201, 201]);
    const after = await state(bag);
    expect(after.stock).toEqual(before.stock.map((value) => value - 2));
    expect(after.balance).toBe(before.balance - 2 * (bag.prices[0] + bag.prices[1]));
  } finally {
    try { await bag.database.query('DELETE FROM purchases WHERE id IN (?, ?)', otherIds); } finally { await closeBag(bag); }
  }
});
