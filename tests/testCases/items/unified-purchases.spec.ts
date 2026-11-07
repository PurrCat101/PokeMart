import type { RowDataPacket } from 'mysql2';
import { expect, test } from '../../support/fixtures/kycFixtures';
import { expectPublicError } from '../../support/utils/expectPublicError';
import { kycCatalog } from '../../support/utils/kycTestData';
import { newPurchaseId } from '../../support/utils/purchaseId';

// One purchase resource for both kinds: /api/purchases creates, lists, reads and ships Pokémon and item
// purchases alike. `kind` (POKEMON or ITEM) says which of `pokemon` / `item` the purchase carries.
// The scenario account is level 1 (buys ordinary Pokémon and items).

interface Purchase {
  purchaseId: string;
  kind: 'POKEMON' | 'ITEM';
  pokemon?: { id: number; name: string };
  item?: { id: number; name: string };
  quantity: number;
  pricing: { unitPrice: number; totalPrice: number };
}

const validationMessage = 'Request validation failed';

async function stockOf(database: { query: <T extends RowDataPacket[]>(sql: string, values?: unknown[]) => Promise<[T, unknown]> }): Promise<number> {
  const [rows] = await database.query<RowDataPacket[]>('SELECT stock FROM listings WHERE pokemon_source_id=?', [kycCatalog.pokemonId]);
  return Number(rows[0].stock);
}

test('PUR-ONE-001 one history lists Pokémon and item purchases together, newest first, and kind narrows it', async ({ kycAccount }) => {
  const { api, database, userId } = await kycAccount('basic-item');
  await database.query('DELETE FROM purchases WHERE user_id=?', [userId]);
  const stockBefore = await stockOf(database);
  const pokemonOrder = newPurchaseId();
  const itemOrder = newPurchaseId();

  try {
    const pokemon = await api.post('/api/purchases', { data: { purchaseId: pokemonOrder, pokemonId: kycCatalog.pokemonId, quantity: 1 } });
    expect(pokemon.status()).toBe(201);
    expect(pokemon.headers().location).toBe(`/api/purchases/${pokemonOrder}`);
    expect(await pokemon.json()).toMatchObject({ purchaseId: pokemonOrder, kind: 'POKEMON', pokemon: { id: kycCatalog.pokemonId } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const item = await api.post('/api/purchases', { data: { purchaseId: itemOrder, itemId: kycCatalog.itemId, quantity: 2 } });
    expect(item.status()).toBe(201);
    expect(item.headers().location).toBe(`/api/purchases/${itemOrder}`);
    const itemBody = await item.json() as Purchase;
    expect(itemBody).toMatchObject({ purchaseId: itemOrder, kind: 'ITEM', item: { id: kycCatalog.itemId }, quantity: 2 });
    expect(itemBody.pokemon).toBeUndefined();

    const all = await (await api.get('/api/purchases')).json() as { totalCount: number; items: Purchase[] };
    expect(all.totalCount).toBe(2);
    expect(all.items.map((order) => [order.purchaseId, order.kind])).toEqual([[itemOrder, 'ITEM'], [pokemonOrder, 'POKEMON']]);

    const pokemonOnly = await (await api.get('/api/purchases?kind=POKEMON')).json() as { totalCount: number; items: Purchase[] };
    expect(pokemonOnly.totalCount).toBe(1);
    expect(pokemonOnly.items.map((order) => order.purchaseId)).toEqual([pokemonOrder]);

    const itemsOnly = await (await api.get('/api/purchases?kind=ITEM')).json() as { totalCount: number; items: Purchase[] };
    expect(itemsOnly.totalCount).toBe(1);
    expect(itemsOnly.items.map((order) => order.purchaseId)).toEqual([itemOrder]);
  } finally {
    await database.query('DELETE FROM purchases WHERE user_id=?', [userId]);
    await database.query('UPDATE listings SET stock=? WHERE pokemon_source_id=?', [stockBefore, kycCatalog.pokemonId]);
  }
});

test('PUR-ONE-002 detail and shipment of either kind are read from the same endpoints', async ({ kycAccount }) => {
  const { api, database, userId } = await kycAccount('basic-item');
  await database.query('DELETE FROM purchases WHERE user_id=?', [userId]);
  const stockBefore = await stockOf(database);
  const pokemonOrder = newPurchaseId();
  const itemOrder = newPurchaseId();

  try {
    expect((await api.post('/api/purchases', { data: { purchaseId: pokemonOrder, pokemonId: kycCatalog.pokemonId, quantity: 1 } })).status()).toBe(201);
    expect((await api.post('/api/purchases', { data: { purchaseId: itemOrder, itemId: kycCatalog.itemId, quantity: 1 } })).status()).toBe(201);

    for (const [purchaseId, kind] of [[pokemonOrder, 'POKEMON'], [itemOrder, 'ITEM']] as const) {
      const detail = await api.get(`/api/purchases/${purchaseId}`);
      expect(detail.status()).toBe(200);
      expect(await detail.json()).toMatchObject({ purchaseId, kind });

      const shipment = await api.get(`/api/purchases/${purchaseId}/shipment`);
      expect(shipment.status()).toBe(200);
      expect(await shipment.json()).toMatchObject({ purchaseId, processingStatus: 'PENDING', deliveryStatus: 'WAITING_FOR_SHIPMENT' });
    }
  } finally {
    await database.query('DELETE FROM purchases WHERE user_id=?', [userId]);
    await database.query('UPDATE listings SET stock=? WHERE pokemon_source_id=?', [stockBefore, kycCatalog.pokemonId]);
  }
});

test('PUR-ONE-003 a purchase names exactly one product and kind must be POKEMON or ITEM', async ({ kycAccount }) => {
  const { api, database, userId } = await kycAccount('basic-item');
  const purchaseId = newPurchaseId();

  await expectPublicError(
    await api.post('/api/purchases', { headers: { 'X-Request-Id': 'tc-pur-one-003a' }, data: { purchaseId, pokemonId: kycCatalog.pokemonId, itemId: kycCatalog.itemId, quantity: 1 } }),
    { status: 400, code: 'VALIDATION_ERROR', message: validationMessage, requestId: 'tc-pur-one-003a', details: [{ field: 'body', message: 'provide either pokemonId or itemId, not both' }] },
  );
  await expectPublicError(
    await api.post('/api/purchases', { headers: { 'X-Request-Id': 'tc-pur-one-003b' }, data: { purchaseId, quantity: 1 } }),
    { status: 400, code: 'VALIDATION_ERROR', message: validationMessage, requestId: 'tc-pur-one-003b', details: [{ field: 'pokemonId', message: 'must be a positive integer' }] },
  );
  await expectPublicError(
    await api.post('/api/purchases', { headers: { 'X-Request-Id': 'tc-pur-one-003c' }, data: { purchaseId, itemId: 0, quantity: 1 } }),
    { status: 400, code: 'VALIDATION_ERROR', message: validationMessage, requestId: 'tc-pur-one-003c', details: [{ field: 'itemId', message: 'must be a positive integer' }] },
  );
  await expectPublicError(
    await api.get('/api/purchases?kind=GIFT', { headers: { 'X-Request-Id': 'tc-pur-one-003d' } }),
    { status: 400, code: 'VALIDATION_ERROR', message: validationMessage, requestId: 'tc-pur-one-003d', details: [{ field: 'kind', message: 'must be POKEMON or ITEM' }] },
  );

  const [orders] = await database.query<RowDataPacket[]>('SELECT id FROM purchases WHERE user_id=?', [userId]);
  expect(orders).toHaveLength(0);
});
