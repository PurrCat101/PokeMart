import type { RowDataPacket } from 'mysql2';
import { expect, test } from '../../support/fixtures/kycFixtures';
import { kycCatalog } from '../../support/utils/kycTestData';
import { newPurchaseId } from '../../support/utils/purchaseId';

// Pokémon and item orders live in one `purchases` table, so a committed purchaseId is a duplicate for
// both endpoints. Each endpoint answers with its own error code, and the second attempt changes nothing.
// The scenario account is level 1 (buys ordinary Pokémon and items).

async function pokemonStock(database: { query: <T extends RowDataPacket[]>(sql: string, values?: unknown[]) => Promise<[T, unknown]> }): Promise<number> {
  const [rows] = await database.query<RowDataPacket[]>('SELECT stock FROM listings WHERE pokemon_source_id=?', [kycCatalog.pokemonId]);
  return Number(rows[0].stock);
}

test('PUR-SHARE-001 an ID used by an item purchase is rejected by the Pokémon endpoint', async ({ kycAccount }) => {
  const { api, database, userId } = await kycAccount('basic-item');
  const purchaseId = newPurchaseId();
  const stockBefore = await pokemonStock(database);

  try {
    const item = await api.post('/api/items/purchases', { data: { purchaseId, itemId: kycCatalog.itemId, quantity: 1 } });
    expect(item.status()).toBe(201);

    const pokemon = await api.post('/api/purchases', { data: { purchaseId, pokemonId: kycCatalog.pokemonId, quantity: 1 } });
    expect(pokemon.status()).toBe(409);
    expect((await pokemon.json()).error.code).toBe('PURCHASE_DUPLICATE');

    const [orders] = await database.query<RowDataPacket[]>('SELECT kind FROM purchases WHERE id=?', [purchaseId]);
    expect(orders.map((row) => row.kind)).toEqual(['ITEM']);
    expect(await pokemonStock(database)).toBe(stockBefore);
    const [pokemonHeld] = await database.query<RowDataPacket[]>('SELECT quantity FROM user_inventory WHERE user_id=? AND pokemon_source_id=?', [userId, kycCatalog.pokemonId]);
    expect(pokemonHeld).toHaveLength(0);
  } finally {
    await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
  }
});

test('PUR-SHARE-002 an ID used by a Pokémon purchase is rejected by the item endpoint', async ({ kycAccount }) => {
  const { api, database, userId } = await kycAccount('basic-item');
  const purchaseId = newPurchaseId();
  const stockBefore = await pokemonStock(database);

  try {
    const pokemon = await api.post('/api/purchases', { data: { purchaseId, pokemonId: kycCatalog.pokemonId, quantity: 1 } });
    expect(pokemon.status()).toBe(201);

    const item = await api.post('/api/items/purchases', { data: { purchaseId, itemId: kycCatalog.itemId, quantity: 1 } });
    expect(item.status()).toBe(409);
    expect((await item.json()).error.code).toBe('ITEM_PURCHASE_DUPLICATE');

    const [orders] = await database.query<RowDataPacket[]>('SELECT kind FROM purchases WHERE id=?', [purchaseId]);
    expect(orders.map((row) => row.kind)).toEqual(['POKEMON']);
    const [itemHeld] = await database.query<RowDataPacket[]>('SELECT quantity FROM user_inventory WHERE user_id=? AND item_source_id=?', [userId, kycCatalog.itemId]);
    expect(itemHeld).toHaveLength(0);
  } finally {
    await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
    await database.query('UPDATE listings SET stock=? WHERE pokemon_source_id=?', [stockBefore, kycCatalog.pokemonId]);
  }
});

test('PUR-SHARE-003 each endpoint only reads back its own kind of purchase', async ({ kycAccount }) => {
  const { api, database } = await kycAccount('basic-item');
  const itemOrderId = newPurchaseId();

  try {
    expect((await api.post('/api/items/purchases', { data: { purchaseId: itemOrderId, itemId: kycCatalog.itemId, quantity: 1 } })).status()).toBe(201);

    const asPokemon = await api.get(`/api/purchases/${itemOrderId}`);
    expect(asPokemon.status()).toBe(404);
    expect((await asPokemon.json()).error.code).toBe('PURCHASE_NOT_FOUND');

    const shipmentAsPokemon = await api.get(`/api/purchases/${itemOrderId}/shipment`);
    expect(shipmentAsPokemon.status()).toBe(404);

    expect((await api.get(`/api/items/purchases/${itemOrderId}`)).status()).toBe(200);
  } finally {
    await database.query('DELETE FROM purchases WHERE id=?', [itemOrderId]);
  }
});
