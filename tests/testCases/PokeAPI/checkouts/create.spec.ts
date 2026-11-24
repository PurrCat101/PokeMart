import crypto from 'node:crypto';
import { RowDataPacket } from 'mysql2';
import { expect, test } from '../../../support/fixtures/apiFixtures';
import { MySQLConnection } from '../../../support/models/MySQL/MySQLConnection';
import { expectPublicError } from '../../../support/utils/expectPublicError';
import { kycCatalog, resetKycScenarioData, setKycRecord } from '../../../support/utils/kycTestData';
import { kycUsers } from '../../../support/data/kycUsers';
import { PurchaseStateSnapshot, restorePurchaseState, snapshotPurchaseState } from '../../../support/utils/purchaseState';
import { internalHeaders } from '../support';

// POST /pokemart/v1/checkouts buys a whole bag in one transaction (all lines commit, or nothing changes).
// The client-generated checkoutId is the idempotency key and the order id:
//   same id + same bag -> the stored 201 is replayed (Idempotent-Replayed: true); same id + another bag -> 409 CHECKOUT_ID_CONFLICT.
// Most cases need two active, in-stock Pokémon listings the test user can afford; they use the configured REAL_POKEMON_ID
// and the next ID, and restore both listings, the wallet, the inventory and the checkout rows afterwards.

type Bag = {
  database: MySQLConnection;
  userId: string;
  ids: [number, number];
  prices: [number, number];
  snapshots: [PurchaseStateSnapshot, PurchaseStateSnapshot];
  checkoutIds: string[]; // every id a test used, so cleanup can remove its rows
};

async function openBag(testEnvironment: { userId: string; pokemonId: number }): Promise<Bag> {
  const database = new MySQLConnection();
  const ids: [number, number] = [testEnvironment.pokemonId, testEnvironment.pokemonId + 1];
  const [rows] = await database.query<RowDataPacket[]>('SELECT pokemon_source_id AS id, price, stock, active FROM listings WHERE pokemon_source_id IN (?, ?) ORDER BY pokemon_source_id', ids);
  expect(rows).toHaveLength(2);
  rows.forEach((row) => { expect(Number(row.active)).toBe(1); expect(Number(row.stock)).toBeGreaterThanOrEqual(2); });
  const snapshots: [PurchaseStateSnapshot, PurchaseStateSnapshot] = [
    await snapshotPurchaseState(database, testEnvironment.userId, ids[0]),
    await snapshotPurchaseState(database, testEnvironment.userId, ids[1]),
  ];
  return { database, userId: testEnvironment.userId, ids, prices: [Number(rows[0].price), Number(rows[1].price)], snapshots, checkoutIds: [] };
}

function newCheckoutId(bag: Bag): string {
  const id = crypto.randomUUID();
  bag.checkoutIds.push(id);
  return id;
}

async function closeBag(bag: Bag): Promise<void> {
  try {
    if (bag.checkoutIds.length) {
      await bag.database.query('DELETE FROM purchases WHERE checkout_id IN (?)', [bag.checkoutIds]); // shipments follow (ON DELETE CASCADE)
      await bag.database.query('DELETE FROM checkouts WHERE id IN (?)', [bag.checkoutIds]);
    }
    await restorePurchaseState(bag.database, bag.userId, bag.ids[0], bag.snapshots[0]);
    await restorePurchaseState(bag.database, bag.userId, bag.ids[1], bag.snapshots[1]);
    await bag.database.query('UPDATE user_wallet SET balance=? WHERE user_id=?', [bag.snapshots[0].walletBalance, bag.userId]);
  } finally {
    await bag.database.close();
  }
}

function body(bag: Bag, checkoutId: string, quantities: [number, number] = [1, 1]) {
  return { checkoutId, lines: bag.ids.map((pokemonId, i) => ({ pokemonId, quantity: quantities[i] })) };
}

async function state(bag: Bag) {
  const [wallet] = await bag.database.query<RowDataPacket[]>('SELECT balance FROM user_wallet WHERE user_id=?', [bag.userId]);
  const [stock] = await bag.database.query<RowDataPacket[]>('SELECT pokemon_source_id AS id, stock FROM listings WHERE pokemon_source_id IN (?, ?) ORDER BY pokemon_source_id', bag.ids);
  const [inventory] = await bag.database.query<RowDataPacket[]>('SELECT pokemon_source_id AS id, quantity FROM user_inventory WHERE user_id=? AND pokemon_source_id IN (?, ?) ORDER BY pokemon_source_id', [bag.userId, ...bag.ids]);
  const ids = bag.checkoutIds.length ? bag.checkoutIds : [''];
  const [purchases] = await bag.database.query<RowDataPacket[]>('SELECT id FROM purchases WHERE checkout_id IN (?)', [ids]);
  const [shipments] = await bag.database.query<RowDataPacket[]>('SELECT s.purchase_id FROM shipments s JOIN purchases p ON p.id=s.purchase_id WHERE p.checkout_id IN (?)', [ids]);
  const [checkouts] = await bag.database.query<RowDataPacket[]>('SELECT id FROM checkouts WHERE id IN (?)', [ids]);
  return {
    balance: Number(wallet[0].balance),
    stock: stock.map((row) => Number(row.stock)),
    inventory: inventory.map((row) => [Number(row.id), Number(row.quantity)]),
    purchases: purchases.length,
    shipments: shipments.length,
    checkouts: checkouts.length,
  };
}

test('INT-CHECKOUT-001 a two-line bag commits every line together under one checkoutId', async ({ request, testEnvironment }) => {
  const bag = await openBag(testEnvironment);
  try {
    const checkoutId = newCheckoutId(bag);
    const before = await state(bag);
    const response = await request.post('/pokemart/v1/checkouts', { data: body(bag, checkoutId), headers: internalHeaders(bag.userId, 'tc-checkout-001') });
    expect(response.status()).toBe(201);
    expect(response.headers()['idempotent-replayed']).toBeUndefined();
    const result = await response.json();
    expect(result.checkoutId).toBe(checkoutId);
    expect(result.purchases.map((p: { pokemonId: number }) => p.pokemonId)).toEqual(bag.ids);
    expect(result.purchases.map((p: { totalPrice: number }) => p.totalPrice)).toEqual(bag.prices);
    expect(new Set(result.purchases.map((p: { id: string }) => p.id)).size).toBe(2); // server-made ids, one per line
    expect(result.purchases.every((p: { checkoutId?: string }) => p.checkoutId === checkoutId)).toBe(true); // every line carries its order id
    const detail = await request.get(`/pokemart/v1/purchases/${result.purchases[0].id}`, { headers: internalHeaders(bag.userId, 'tc-checkout-001-detail') });
    expect((await detail.json()).checkoutId).toBe(checkoutId); // and so does the history read

    const after = await state(bag);
    expect(after.balance).toBe(before.balance - bag.prices[0] - bag.prices[1]);
    expect(after.stock).toEqual(before.stock.map((value) => value - 1));
    expect(after.purchases).toBe(2); // both tagged with the checkoutId
    expect(after.shipments).toBe(2);
    expect(after.checkouts).toBe(1);
    expect(after.inventory.map(([, quantity]) => quantity)).toEqual(bag.snapshots.map((s) => (s.inventoryQuantity ?? 0) + 1));
  } finally {
    await closeBag(bag);
  }
});

test('INT-CHECKOUT-002 a line without enough stock rolls the whole bag back and leaves no checkout row', async ({ request, testEnvironment }) => {
  const bag = await openBag(testEnvironment);
  try {
    const checkoutId = newCheckoutId(bag);
    await bag.database.query('UPDATE listings SET stock=0 WHERE pokemon_source_id=?', [bag.ids[1]]);
    const before = await state(bag);
    const response = await request.post('/pokemart/v1/checkouts', { data: body(bag, checkoutId), headers: internalHeaders(bag.userId, 'tc-checkout-002') });
    await expectPublicError(response, { status: 409, code: 'INSUFFICIENT_STOCK', message: 'Insufficient stock', requestId: 'tc-checkout-002', details: [{ field: 'lines[1]', message: `pokemonId ${bag.ids[1]}` }] });
    expect(await state(bag)).toEqual(before); // the affordable first line was not bought, and the id was not claimed
    expect(before.checkouts).toBe(0);
  } finally {
    await closeBag(bag);
  }
});

test('INT-CHECKOUT-003 a wallet that covers each line but not the total buys nothing', async ({ request, testEnvironment }) => {
  const bag = await openBag(testEnvironment);
  try {
    const checkoutId = newCheckoutId(bag);
    await bag.database.query('UPDATE user_wallet SET balance=? WHERE user_id=?', [bag.prices[0] + bag.prices[1] - 1, bag.userId]);
    const before = await state(bag);
    const response = await request.post('/pokemart/v1/checkouts', { data: body(bag, checkoutId), headers: internalHeaders(bag.userId, 'tc-checkout-003') });
    await expectPublicError(response, { status: 422, code: 'INSUFFICIENT_FUNDS', message: 'Insufficient funds', requestId: 'tc-checkout-003', details: [] });
    expect(await state(bag)).toEqual(before);
  } finally {
    await closeBag(bag);
  }
});

test('INT-CHECKOUT-004 retrying the same checkoutId and bag replays the first answer and charges nothing more', async ({ request, testEnvironment }) => {
  const bag = await openBag(testEnvironment);
  try {
    const checkoutId = newCheckoutId(bag);
    const first = await request.post('/pokemart/v1/checkouts', { data: body(bag, checkoutId), headers: internalHeaders(bag.userId, 'tc-checkout-004') });
    expect(first.status()).toBe(201);
    const firstBody = await first.json();
    const afterFirst = await state(bag);

    const retry = await request.post('/pokemart/v1/checkouts', { data: body(bag, checkoutId), headers: internalHeaders(bag.userId, 'tc-checkout-004') });
    expect(retry.status()).toBe(201);
    expect(retry.headers()['idempotent-replayed']).toBe('true');
    expect(await retry.json()).toEqual(firstBody); // same purchase ids, same prices

    // The same bag with its lines in another order is the same bag.
    const reordered = { checkoutId, lines: [...body(bag, checkoutId).lines].reverse() };
    const third = await request.post('/pokemart/v1/checkouts', { data: reordered, headers: internalHeaders(bag.userId, 'tc-checkout-004') });
    expect(third.status()).toBe(201);
    expect(third.headers()['idempotent-replayed']).toBe('true');
    expect(await third.json()).toEqual(firstBody);
    expect(await state(bag)).toEqual(afterFirst);
  } finally {
    await closeBag(bag);
  }
});

test('INT-CHECKOUT-005 the same checkoutId with a different bag is refused and changes nothing', async ({ request, testEnvironment }) => {
  const bag = await openBag(testEnvironment);
  try {
    const checkoutId = newCheckoutId(bag);
    const first = await request.post('/pokemart/v1/checkouts', { data: body(bag, checkoutId), headers: internalHeaders(bag.userId, 'tc-checkout-005') });
    expect(first.status()).toBe(201);
    const afterFirst = await state(bag);
    const different = await request.post('/pokemart/v1/checkouts', { data: body(bag, checkoutId, [2, 1]), headers: internalHeaders(bag.userId, 'tc-checkout-005') });
    await expectPublicError(different, { status: 409, code: 'CHECKOUT_ID_CONFLICT', message: 'Checkout ID was already used for a different order', requestId: 'tc-checkout-005', details: [] });
    expect(await state(bag)).toEqual(afterFirst);
  } finally {
    await closeBag(bag);
  }
});

test('INT-CHECKOUT-006 invalid bags are rejected before anything is written', async ({ request, testEnvironment }) => {
  const bag = await openBag(testEnvironment);
  try {
    const before = await state(bag);
    const headers = internalHeaders(bag.userId, 'tc-checkout-006');
    const id = crypto.randomUUID();
    const valid = body(bag, id);
    const cases: Array<{ name: string; data: unknown; field: string }> = [
      { name: 'no checkoutId', data: { lines: valid.lines }, field: 'checkoutId' },
      { name: 'checkoutId not a UUID', data: { ...valid, checkoutId: 'not-a-uuid' }, field: 'checkoutId' },
      { name: 'no lines', data: { checkoutId: id, lines: [] }, field: 'lines' },
      { name: 'unknown field', data: { ...valid, extra: true }, field: 'body' },
      { name: 'a purchaseId on a line (the server creates them)', data: { checkoutId: id, lines: [{ ...valid.lines[0], purchaseId: crypto.randomUUID() }] }, field: 'lines[0]' },
      { name: 'bad quantity on the second line', data: body(bag, id, [1, 0] as [number, number]), field: 'lines[1].quantity' },
      { name: 'same product twice', data: { checkoutId: id, lines: [valid.lines[0], valid.lines[0]] }, field: 'lines[1]' },
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

test('INT-CHECKOUT-007 two different bags with the same products in opposite order both commit (no deadlock)', async ({ request, testEnvironment }) => {
  const bag = await openBag(testEnvironment);
  try {
    const before = await state(bag);
    const forward = body(bag, newCheckoutId(bag));
    const reversed = { checkoutId: newCheckoutId(bag), lines: [...forward.lines].reverse() };
    const responses = await Promise.all([
      request.post('/pokemart/v1/checkouts', { data: forward, headers: internalHeaders(bag.userId, 'tc-checkout-007a') }),
      request.post('/pokemart/v1/checkouts', { data: reversed, headers: internalHeaders(bag.userId, 'tc-checkout-007b') }),
    ]);
    expect(responses.map((response) => response.status())).toEqual([201, 201]);
    const after = await state(bag);
    expect(after.stock).toEqual(before.stock.map((value) => value - 2));
    expect(after.balance).toBe(before.balance - 2 * (bag.prices[0] + bag.prices[1]));
    expect(after.purchases).toBe(4);
  } finally {
    await closeBag(bag);
  }
});

test('INT-CHECKOUT-008 two identical requests at once commit once; the second replays the first answer', async ({ request, testEnvironment }) => {
  const bag = await openBag(testEnvironment);
  try {
    const checkoutId = newCheckoutId(bag);
    const before = await state(bag);
    const send = (requestId: string) => request.post('/pokemart/v1/checkouts', { data: body(bag, checkoutId), headers: internalHeaders(bag.userId, requestId) });
    const responses = await Promise.all([send('tc-checkout-008a'), send('tc-checkout-008b')]);
    expect(responses.map((response) => response.status())).toEqual([201, 201]);
    expect(responses.map((response) => response.headers()['idempotent-replayed']).sort()).toEqual(['true', undefined]);
    const [a, b] = await Promise.all(responses.map((response) => response.json()));
    expect(a).toEqual(b);
    const after = await state(bag);
    expect(after.purchases).toBe(2);
    expect(after.balance).toBe(before.balance - bag.prices[0] - bag.prices[1]);
    expect(after.stock).toEqual(before.stock.map((value) => value - 1));
  } finally {
    await closeBag(bag);
  }
});

test('INT-CHECKOUT-009 a rejected checkout frees its id: the same checkoutId works once the cause is fixed', async ({ request, testEnvironment }) => {
  const bag = await openBag(testEnvironment);
  try {
    const checkoutId = newCheckoutId(bag);
    await bag.database.query('UPDATE listings SET stock=0 WHERE pokemon_source_id=?', [bag.ids[1]]);
    const rejected = await request.post('/pokemart/v1/checkouts', { data: body(bag, checkoutId), headers: internalHeaders(bag.userId, 'tc-checkout-009') });
    expect(rejected.status()).toBe(409);
    await bag.database.query('UPDATE listings SET stock=? WHERE pokemon_source_id=?', [Math.max(bag.snapshots[1].stock, 2), bag.ids[1]]);
    const retry = await request.post('/pokemart/v1/checkouts', { data: body(bag, checkoutId), headers: internalHeaders(bag.userId, 'tc-checkout-009') });
    expect(retry.status()).toBe(201);
    expect(retry.headers()['idempotent-replayed']).toBeUndefined(); // a new purchase, not a replay
  } finally {
    await closeBag(bag);
  }
});

test('INT-CHECKOUT-010 checks run by phase over the whole bag: a KYC failure on line 2 beats a stock failure on line 1', async ({ request }) => {
  // Account lab-kyc-basic-master is level 1 / ACTIVE: it may buy a Pokémon but not the Master item (needs level 2).
  const scenario = 'basic-master';
  const userId = kycUsers[scenario].userId;
  const database = new MySQLConnection();
  const checkoutId = crypto.randomUUID();
  let pokemonStock: number | undefined;
  try {
    await setKycRecord(request, scenario);
    await resetKycScenarioData(database, scenario);
    const [rows] = await database.query<RowDataPacket[]>('SELECT stock FROM listings WHERE pokemon_source_id=?', [kycCatalog.pokemonId]);
    pokemonStock = Number(rows[0].stock);
    await database.query('UPDATE listings SET stock=0 WHERE pokemon_source_id=?', [kycCatalog.pokemonId]); // line 1 would fail on stock
    const response = await request.post('/pokemart/v1/checkouts', {
      data: { checkoutId, lines: [{ pokemonId: kycCatalog.pokemonId, quantity: 1 }, { itemId: kycCatalog.masterItemId, quantity: 1 }] }, // line 2 fails on KYC
      headers: internalHeaders(userId, 'tc-checkout-010'),
    });
    await expectPublicError(response, { status: 403, code: 'KYC_LEVEL_REQUIRED', message: 'This item requires a higher verification level', requestId: 'tc-checkout-010', details: [{ required: 2, current: 1 }] });
    const [claimed] = await database.query<RowDataPacket[]>('SELECT id FROM checkouts WHERE id=?', [checkoutId]);
    expect(claimed).toHaveLength(0);
  } finally {
    try {
      if (pokemonStock !== undefined) await database.query('UPDATE listings SET stock=? WHERE pokemon_source_id=?', [pokemonStock, kycCatalog.pokemonId]);
      await resetKycScenarioData(database, scenario);
    } finally {
      await database.close();
    }
  }
});
