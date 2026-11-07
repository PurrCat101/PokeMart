import { expect, test } from '../../support/fixtures/kycFixtures';
import { kycCatalog } from '../../support/utils/kycTestData';
import { newPurchaseId } from '../../support/utils/purchaseId';
import { testConfig } from '../../index';
import { ShippingWorker } from '../../../apps/pokemart-api/src/shipping-worker';

// Item purchases are delivered like Pokémon purchases: each one gets a shipment that the shipping
// worker hands to the provider, and GET /api/items/purchases/{id}/shipment reports it.
// The scenario account is level 1 (buys ordinary items).

test('ITEM-SHIP-001 an item order starts waiting for shipment, then gets a tracking number from the worker', async ({ kycAccount }) => {
  const { api, database, userId } = await kycAccount('basic-item');
  await database.query('DELETE FROM purchases WHERE user_id=? AND kind="ITEM"', [userId]);
  const purchaseId = newPurchaseId();
  const worker = new ShippingWorker({ shippingBaseUrl: 'http://localhost:4002', requestTimeoutMs: 1000, batchSize: 1000, logger: () => undefined });

  try {
    const bought = await api.post('/api/items/purchases', { data: { purchaseId, itemId: kycCatalog.itemId, quantity: 1 } });
    expect(bought.status()).toBe(201);

    const waiting = await api.get(`/api/items/purchases/${purchaseId}/shipment`);
    expect(waiting.status()).toBe(200);
    expect(await waiting.json()).toMatchObject({
      purchaseId,
      orderStatus: 'ORDER_PLACED',
      processingStatus: 'PENDING',
      deliveryStatus: 'WAITING_FOR_SHIPMENT',
      trackingNumber: null,
    });

    await worker.processDueShipments();

    const shipped = await (await api.get(`/api/items/purchases/${purchaseId}/shipment`)).json();
    expect(shipped).toMatchObject({ purchaseId, processingStatus: 'LABEL_CREATED', deliveryStatus: 'LABEL_CREATED' });
    expect(shipped.trackingNumber).toEqual(expect.any(String));
  } finally {
    await worker.close();
    await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
  }
});

test('ITEM-SHIP-002 the item shipment endpoint rejects a bad id, an unknown order and a missing token', async ({ kycAccount, playwright }) => {
  const { api } = await kycAccount('basic-item');

  const malformed = await api.get('/api/items/purchases/not-a-uuid/shipment');
  expect(malformed.status()).toBe(400);
  expect((await malformed.json()).error.code).toBe('VALIDATION_ERROR');

  const unknown = await api.get(`/api/items/purchases/${newPurchaseId()}/shipment`);
  expect(unknown.status()).toBe(404);
  expect((await unknown.json()).error.code).toBe('PURCHASE_NOT_FOUND');

  const anonymous = await playwright.request.newContext({ baseURL: testConfig.bffBaseUrl });
  try {
    const unauthenticated = await anonymous.get(`/api/items/purchases/${newPurchaseId()}/shipment`);
    expect(unauthenticated.status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }
});
