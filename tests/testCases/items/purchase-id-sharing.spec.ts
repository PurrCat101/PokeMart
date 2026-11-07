import type { RowDataPacket } from 'mysql2';
import { expect, test } from '../../support/fixtures/kycFixtures';
import { kycCatalog } from '../../support/utils/kycTestData';
import { newPurchaseId } from '../../support/utils/purchaseId';

// Pokémon and item purchases share one `purchases` table and one /api/purchases endpoint, so a committed
// purchaseId is a duplicate whichever kind of product the second attempt asks for. The second attempt
// changes nothing. The scenario account is level 1 (buys ordinary Pokémon and items).

async function pokemonStock(database: { query: <T extends RowDataPacket[]>(sql: string, values?: unknown[]) => Promise<[T, unknown]> }): Promise<number> {
  const [rows] = await database.query<RowDataPacket[]>('SELECT stock FROM listings WHERE pokemon_source_id=?', [kycCatalog.pokemonId]);
  return Number(rows[0].stock);
}

test('PUR-SHARE-001 an ID used by an item purchase is rejected when reused for a Pokémon', async ({ kycAccount }) => {
  const { api, database, userId } = await kycAccount('basic-item');
  const purchaseId = newPurchaseId();
  const stockBefore = await pokemonStock(database);

  try {
    const item = await api.post('/api/purchases', { data: { purchaseId, itemId: kycCatalog.itemId, quantity: 1 } });
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

test('PUR-SHARE-002 an ID used by a Pokémon purchase is rejected when reused for an item', async ({ kycAccount }) => {
  const { api, database, userId } = await kycAccount('basic-item');
  const purchaseId = newPurchaseId();
  const stockBefore = await pokemonStock(database);

  try {
    const pokemon = await api.post('/api/purchases', { data: { purchaseId, pokemonId: kycCatalog.pokemonId, quantity: 1 } });
    expect(pokemon.status()).toBe(201);

    const item = await api.post('/api/purchases', { data: { purchaseId, itemId: kycCatalog.itemId, quantity: 1 } });
    expect(item.status()).toBe(409);
    expect((await item.json()).error.code).toBe('PURCHASE_DUPLICATE');

    const [orders] = await database.query<RowDataPacket[]>('SELECT kind FROM purchases WHERE id=?', [purchaseId]);
    expect(orders.map((row) => row.kind)).toEqual(['POKEMON']);
    const [itemHeld] = await database.query<RowDataPacket[]>('SELECT quantity FROM user_inventory WHERE user_id=? AND item_source_id=?', [userId, kycCatalog.itemId]);
    expect(itemHeld).toHaveLength(0);
  } finally {
    await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
    await database.query('UPDATE listings SET stock=? WHERE pokemon_source_id=?', [stockBefore, kycCatalog.pokemonId]);
  }
});
