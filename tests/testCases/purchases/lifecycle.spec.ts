import { RowDataPacket } from 'mysql2';
import { expect, test } from '../../support/fixtures/apiFixtures';
import { MySQLConnection } from '../../support/models/MySQL/MySQLConnection';
import { restorePurchaseState, snapshotPurchaseState, PurchaseStateSnapshot } from '../../support/utils/purchaseState';

test('@e2e purchase lifecycle updates catalog, wallet, inventory, history, and purchase detail atomically', async ({ bffRequest, testEnvironment }) => {
  const database = new MySQLConnection();
  const purchaseId = testEnvironment.purchaseId();
  let snapshot: PurchaseStateSnapshot | undefined;

  try {
    snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
    const [catalogBeforeResponse, walletBeforeResponse, inventoryBeforeResponse] = await Promise.all([
      bffRequest.get(`/api/pokemon/${testEnvironment.pokemonId}`),
      bffRequest.get('/api/wallet'),
      bffRequest.get('/api/inventory'),
    ]);
    expect(catalogBeforeResponse.status()).toBe(200);
    expect(walletBeforeResponse.status()).toBe(200);
    expect(inventoryBeforeResponse.status()).toBe(200);
    const catalogBefore = await catalogBeforeResponse.json();
    const walletBefore = await walletBeforeResponse.json();
    const inventoryBefore = await inventoryBeforeResponse.json();
    const pokemon = catalogBefore.pokemon;
    const price = catalogBefore.listing.price;
    const previousQuantity = inventoryBefore.items.find(
      (item: { pokemon: { id: number }; quantity: number }) => item.pokemon.id === testEnvironment.pokemonId,
    )?.quantity ?? 0;
    expect(snapshot.stock).toBeGreaterThanOrEqual(1);
    expect(walletBefore.wallet.balance).toBeGreaterThanOrEqual(price);

    const createResponse = await bffRequest.post('/api/purchases', {
      data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
      headers: { 'X-Request-Id': 'tc-purchase-lifecycle' },
    });
    expect(createResponse.status()).toBe(201);
    expect(createResponse.headers().location).toBe(`/api/purchases/${purchaseId}`);
    expect(createResponse.headers()['x-request-id']).toBe('tc-purchase-lifecycle');
    const createdPurchase = await createResponse.json();
    expect(createdPurchase).toEqual({
      purchaseId,
      pokemon: { id: testEnvironment.pokemonId, name: pokemon.name },
      quantity: 1,
      pricing: { unitPrice: price, totalPrice: price },
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });

    const [detailResponse, historyResponse, walletAfterResponse, inventoryAfterResponse, catalogAfterResponse] = await Promise.all([
      bffRequest.get(`/api/purchases/${purchaseId}`),
      bffRequest.get('/api/purchases?limit=100&offset=0'),
      bffRequest.get('/api/wallet'),
      bffRequest.get('/api/inventory'),
      bffRequest.get(`/api/pokemon/${testEnvironment.pokemonId}`),
    ]);
    expect(detailResponse.status()).toBe(200);
    expect(historyResponse.status()).toBe(200);
    expect(walletAfterResponse.status()).toBe(200);
    expect(inventoryAfterResponse.status()).toBe(200);
    expect(catalogAfterResponse.status()).toBe(200);

    expect(await detailResponse.json()).toEqual(createdPurchase);
    const history = await historyResponse.json();
    const historyItem = history.items.find((item: { purchaseId: string }) => item.purchaseId === purchaseId);
    expect(historyItem).toEqual(createdPurchase);
    expect(history.totalCount).toBeGreaterThanOrEqual(1);
    expect((await walletAfterResponse.json()).wallet.balance).toBe(walletBefore.wallet.balance - price);
    const inventoryAfter = await inventoryAfterResponse.json();
    expect(inventoryAfter.items.find(
      (item: { pokemon: { id: number } }) => item.pokemon.id === testEnvironment.pokemonId,
    )).toEqual({
      pokemon: { id: testEnvironment.pokemonId, name: pokemon.name },
      quantity: previousQuantity + 1,
    });
    expect((await catalogAfterResponse.json()).listing).toEqual({
      price,
      availableStock: snapshot.stock - 1,
    });
  } finally {
    try {
      if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
      await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
    } finally {
      await database.close();
    }
  }
});
