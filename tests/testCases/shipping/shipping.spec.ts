import { RowDataPacket } from 'mysql2';
import { expect, test } from '../../support/fixtures/apiFixtures';
import { MySQLConnection } from '../../support/models/MySQL/MySQLConnection';
import { snapshotPurchaseState, restorePurchaseState, PurchaseStateSnapshot } from '../../support/utils/purchaseState';
import { ShippingWorker } from '../../../apps/pokemart-api/src/shipping-worker';

test.describe('Shipping Integration and Resilience Suite', () => {
  let database: MySQLConnection;
  let worker: ShippingWorker;

  test.beforeEach(async ({ shippingMock }) => {
    database = new MySQLConnection();
    await shippingMock.reset();
    await shippingMock.setMode('success');
    worker = new ShippingWorker({
      shippingBaseUrl: 'http://localhost:3002',
      requestTimeoutMs: 1000,
      maxAttempts: 3,
      batchSize: 10,
      backoffBaseMs: 50,
      backoffMaxMs: 200,
    });
  });

  test.afterEach(async ({ shippingMock }) => {
    await worker.close();
    await shippingMock.reset();
    await database.close();
  });

  // Scenario 1: Purchase succeeds; delivery is initially WAITING_FOR_SHIPMENT, then becomes LABEL_CREATED with a tracking number after worker succeeds.
  test('1. Purchase succeeds; shipment starts WAITING_FOR_SHIPMENT and advances to LABEL_CREATED', async ({
    bffRequest,
    testEnvironment,
  }) => {
    const purchaseId = testEnvironment.purchaseId();
    let snapshot: PurchaseStateSnapshot | undefined;

    try {
      snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);

      const createResponse = await bffRequest.post('/api/purchases', {
        data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
      });
      expect(createResponse.status()).toBe(201);

      // Verify immediate local status before worker runs
      const initialShipmentRes = await bffRequest.get(`/api/purchases/${purchaseId}/shipment`);
      expect(initialShipmentRes.status()).toBe(200);
      const initialShipment = await initialShipmentRes.json();
      expect(initialShipment.purchaseId).toBe(purchaseId);
      expect(initialShipment.orderStatus).toBe('ORDER_PLACED');
      expect(initialShipment.processingStatus).toBe('PENDING');
      expect(initialShipment.deliveryStatus).toBe('WAITING_FOR_SHIPMENT');
      expect(initialShipment.trackingNumber).toBeNull();
      expect(initialShipment.attemptCount).toBe(0);

      // Trigger worker sweep
      const processed = await worker.processDueShipments();
      expect(processed).toBeGreaterThanOrEqual(1);

      // Verify status after worker processed
      const updatedShipmentRes = await bffRequest.get(`/api/purchases/${purchaseId}/shipment`);
      expect(updatedShipmentRes.status()).toBe(200);
      const updatedShipment = await updatedShipmentRes.json();
      expect(updatedShipment.processingStatus).toBe('LABEL_CREATED');
      expect(updatedShipment.deliveryStatus).toBe('LABEL_CREATED');
      expect(typeof updatedShipment.trackingNumber).toBe('string');
      expect(updatedShipment.trackingNumber.length).toBeGreaterThan(0);
      expect(updatedShipment.attemptCount).toBe(1);
    } finally {
      if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
      await database.query('DELETE FROM shipments WHERE purchase_id=?', [purchaseId]);
      await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
    }
  });

  // Scenario 2: Provider returns 500; purchase committed, shipment scheduled for retry, API healthy.
  test('2. Provider returns 500; purchase committed, shipment scheduled for RETRY_WAIT', async ({
    bffRequest,
    testEnvironment,
    shippingMock,
  }) => {
    const purchaseId = testEnvironment.purchaseId();
    let snapshot: PurchaseStateSnapshot | undefined;

    try {
      snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
      await shippingMock.setMode('http-500');

      const createResponse = await bffRequest.post('/api/purchases', {
        data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
      });
      expect(createResponse.status()).toBe(201);

      // Worker executes against 500 mock
      await worker.processDueShipments();

      const shipmentRes = await bffRequest.get(`/api/purchases/${purchaseId}/shipment`);
      expect(shipmentRes.status()).toBe(200);
      const shipment = await shipmentRes.json();
      expect(shipment.processingStatus).toBe('RETRY_WAIT');
      expect(shipment.deliveryStatus).toBe('WAITING_FOR_SHIPMENT');
      expect(shipment.attemptCount).toBe(1);
      expect(shipment.trackingNumber).toBeNull();
      expect(shipment.lastError).toContain('500');

      // Verify health check remains 200 ok
      const healthRes = await bffRequest.get('/health');
      expect(healthRes.status()).toBe(200);
    } finally {
      if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
      await database.query('DELETE FROM shipments WHERE purchase_id=?', [purchaseId]);
      await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
    }
  });

  // Scenario 3: Provider returns 429; worker honors Retry-After or applies bounded retry policy.
  test('3. Provider returns 429; worker sets RETRY_WAIT and updates attemptCount', async ({
    bffRequest,
    testEnvironment,
    shippingMock,
  }) => {
    const purchaseId = testEnvironment.purchaseId();
    let snapshot: PurchaseStateSnapshot | undefined;

    try {
      snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
      await shippingMock.setMode('rate-limit');

      const createResponse = await bffRequest.post('/api/purchases', {
        data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
      });
      expect(createResponse.status()).toBe(201);

      await worker.processDueShipments();

      const shipmentRes = await bffRequest.get(`/api/purchases/${purchaseId}/shipment`);
      expect(shipmentRes.status()).toBe(200);
      const shipment = await shipmentRes.json();
      expect(shipment.processingStatus).toBe('RETRY_WAIT');
      expect(shipment.attemptCount).toBe(1);
      expect(shipment.deliveryStatus).toBe('WAITING_FOR_SHIPMENT');
    } finally {
      if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
      await database.query('DELETE FROM shipments WHERE purchase_id=?', [purchaseId]);
      await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
    }
  });

  // Scenario 4 & 5: Provider unavailable then recovers; pending shipment obtains tracking number without new purchase.
  test('4 & 5. Provider unavailable then recovers; shipment retried without new purchase', async ({
    bffRequest,
    testEnvironment,
    shippingMock,
  }) => {
    const purchaseId = testEnvironment.purchaseId();
    let snapshot: PurchaseStateSnapshot | undefined;

    try {
      snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
      await shippingMock.setMode('unavailable');

      const createResponse = await bffRequest.post('/api/purchases', {
        data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
      });
      expect(createResponse.status()).toBe(201);

      // Worker attempt 1 -> fails with 503
      await worker.processDueShipments();

      const shipmentRes1 = await bffRequest.get(`/api/purchases/${purchaseId}/shipment`);
      expect((await shipmentRes1.json()).processingStatus).toBe('RETRY_WAIT');

      // Provider recovers to success
      await shippingMock.setMode('success');

      // Simulate next attempt being due
      await database.query('UPDATE shipments SET next_attempt_at = NOW(3) WHERE purchase_id = ?', [purchaseId]);

      // Worker attempt 2 -> succeeds
      await worker.processDueShipments();

      const shipmentRes2 = await bffRequest.get(`/api/purchases/${purchaseId}/shipment`);
      const shipment2 = await shipmentRes2.json();
      expect(shipment2.processingStatus).toBe('LABEL_CREATED');
      expect(shipment2.deliveryStatus).toBe('LABEL_CREATED');
      expect(typeof shipment2.trackingNumber).toBe('string');
      expect(shipment2.attemptCount).toBe(2);
    } finally {
      if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
      await database.query('DELETE FROM shipments WHERE purchase_id=?', [purchaseId]);
      await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
    }
  });

  // Scenario 6: Ambiguous timeout; retry uses same idempotency key and no duplicate provider shipment.
  test('6. Ambiguous timeout; retry uses same Idempotency-Key and prevents duplicate provider shipments', async ({
    bffRequest,
    testEnvironment,
    shippingMock,
  }) => {
    const purchaseId = testEnvironment.purchaseId();
    let snapshot: PurchaseStateSnapshot | undefined;

    try {
      snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
      await shippingMock.setMode('ambiguous-timeout');

      await bffRequest.post('/api/purchases', {
        data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
      });

      // Worker attempt with short timeout (1000ms), mock delays 6000ms -> timeout
      await worker.processDueShipments();

      const shipmentRes1 = await bffRequest.get(`/api/purchases/${purchaseId}/shipment`);
      expect((await shipmentRes1.json()).processingStatus).toBe('UNKNOWN');

      // Provider mode back to success
      await shippingMock.setMode('success');
      await database.query('UPDATE shipments SET next_attempt_at = NOW(3) WHERE purchase_id = ?', [purchaseId]);

      // Retry
      await worker.processDueShipments();

      const shipmentRes2 = await bffRequest.get(`/api/purchases/${purchaseId}/shipment`);
      const shipment2 = await shipmentRes2.json();
      expect(shipment2.processingStatus).toBe('LABEL_CREATED');

      // Check request journal from mock: all requests for this purchase used the same Idempotency-Key
      const requests = await shippingMock.getRequests();
      const shipmentRequests = requests.filter((r: any) => r.path === '/shipments');
      expect(shipmentRequests.length).toBeGreaterThanOrEqual(2);
      for (const r of shipmentRequests) {
        expect(r.idempotencyKey).toBe(purchaseId);
      }
    } finally {
      if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
      await database.query('DELETE FROM shipments WHERE purchase_id=?', [purchaseId]);
      await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
    }
  });

  // Scenario 7: Max attempts exhausted; shipment becomes FAILED.
  test('7. Max attempts exhausted; shipment becomes FAILED without infinite retry', async ({
    bffRequest,
    testEnvironment,
    shippingMock,
  }) => {
    const purchaseId = testEnvironment.purchaseId();
    let snapshot: PurchaseStateSnapshot | undefined;

    try {
      snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
      await shippingMock.setMode('http-500');

      await bffRequest.post('/api/purchases', {
        data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
      });

      // Attempt 1
      await worker.processDueShipments();
      // Attempt 2
      await database.query('UPDATE shipments SET next_attempt_at = NOW(3) WHERE purchase_id = ?', [purchaseId]);
      await worker.processDueShipments();
      // Attempt 3 (configured maxAttempts is 3)
      await database.query('UPDATE shipments SET next_attempt_at = NOW(3) WHERE purchase_id = ?', [purchaseId]);
      await worker.processDueShipments();

      const shipmentRes = await bffRequest.get(`/api/purchases/${purchaseId}/shipment`);
      const shipment = await shipmentRes.json();
      expect(shipment.processingStatus).toBe('FAILED');
      expect(shipment.attemptCount).toBe(3);
      expect(shipment.deliveryStatus).toBe('WAITING_FOR_SHIPMENT');

      // Another sweep should NOT pick it up
      await database.query('UPDATE shipments SET next_attempt_at = NOW(3) WHERE purchase_id = ?', [purchaseId]);
      const pickedUp = await worker.processDueShipments();
      expect(pickedUp).toBe(0);
    } finally {
      if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
      await database.query('DELETE FROM shipments WHERE purchase_id=?', [purchaseId]);
      await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
    }
  });

  // Scenario 8: Multiple due shipments are processed in bounded batches.
  test('8. Multiple due shipments are processed in bounded batches', async ({
    bffRequest,
    testEnvironment,
  }) => {
    const purchaseIds = [testEnvironment.purchaseId(), testEnvironment.purchaseId()];
    let snapshot: PurchaseStateSnapshot | undefined;

    try {
      snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);

      for (const id of purchaseIds) {
        await bffRequest.post('/api/purchases', {
          data: { purchaseId: id, pokemonId: testEnvironment.pokemonId, quantity: 1 },
        });
      }

      // Process batch
      const processedCount = await worker.processDueShipments();
      expect(processedCount).toBeGreaterThanOrEqual(2);

      for (const id of purchaseIds) {
        const res = await bffRequest.get(`/api/purchases/${id}/shipment`);
        const body = await res.json();
        expect(body.processingStatus).toBe('LABEL_CREATED');
      }
    } finally {
      if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
      for (const id of purchaseIds) {
        await database.query('DELETE FROM shipments WHERE purchase_id=?', [id]);
        await database.query('DELETE FROM purchases WHERE id=?', [id]);
      }
    }
  });

  // Scenario 9: Two workers overlap; leases prevent concurrent claims.
  test('9. Two workers overlap; lease lock prevents duplicate claims', async ({
    bffRequest,
    testEnvironment,
  }) => {
    const purchaseId = testEnvironment.purchaseId();
    let snapshot: PurchaseStateSnapshot | undefined;
    const worker2 = new ShippingWorker({
      shippingBaseUrl: 'http://localhost:3002',
      requestTimeoutMs: 1000,
      batchSize: 10,
    });

    try {
      snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
      await bffRequest.post('/api/purchases', {
        data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
      });

      // Concurrently run processDueShipments on both workers
      const [count1, count2] = await Promise.all([
        worker.processDueShipments(),
        worker2.processDueShipments(),
      ]);

      // Exactly one worker claims the row
      expect(count1 + count2).toBe(1);
    } finally {
      await worker2.close();
      if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
      await database.query('DELETE FROM shipments WHERE purchase_id=?', [purchaseId]);
      await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
    }
  });

  // Scenario 10: Worker stopped and restarted; expired claims are recovered.
  test('10. Worker crash recovery; expired lease allows work to be reclaimed', async ({
    bffRequest,
    testEnvironment,
  }) => {
    const purchaseId = testEnvironment.purchaseId();
    let snapshot: PurchaseStateSnapshot | undefined;

    try {
      snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
      await bffRequest.post('/api/purchases', {
        data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
      });

      // Simulate a crashed worker that left claimed_until in the past
      await database.query(
        `UPDATE shipments
         SET processing_status = 'PROCESSING',
             claimed_until = DATE_SUB(NOW(3), INTERVAL 10 SECOND)
         WHERE purchase_id = ?`,
        [purchaseId]
      );

      // Fresh worker sweeps and recovers it
      const processed = await worker.processDueShipments();
      expect(processed).toBe(1);

      const shipmentRes = await bffRequest.get(`/api/purchases/${purchaseId}/shipment`);
      expect((await shipmentRes.json()).processingStatus).toBe('LABEL_CREATED');
    } finally {
      if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
      await database.query('DELETE FROM shipments WHERE purchase_id=?', [purchaseId]);
      await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
    }
  });

  // Scenario 11: A user cannot query another user's shipment.
  test('11. Owner scoping; user cannot query another user shipment', async ({
    bffRequest,
    request,
    testEnvironment,
  }) => {
    const purchaseId = testEnvironment.purchaseId();
    let snapshot: PurchaseStateSnapshot | undefined;

    try {
      snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
      await bffRequest.post('/api/purchases', {
        data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
      });

      // Create or use a second test user
      await database.query(
        `INSERT IGNORE INTO users (user_id, email, display_name, password_hash, is_active)
         VALUES ('user-other', 'other@example.test', 'Other Trainer', 'scrypt$16384$8$1$B4ogYl9H5OdXpeDMU2nqIw$78Yct8q9I6o2YRWXLjT98fVCqz_sojm0bF-4fXq_sh5_xkXcvQx-7ErS3FFsKgdC7zGF7IuItadWHOM09h1HTA', TRUE)`
      );

      // Login as other user
      const loginRes = await request.post('http://localhost:3000/pokemart/v1/auth/login', {
        data: { email: 'other@example.test', password: 'PokeMartLab!2026' },
      });
      const otherToken = (await loginRes.json()).accessToken;

      const forbiddenRes = await request.get(`http://localhost:3001/api/purchases/${purchaseId}/shipment`, {
        headers: { Authorization: `Bearer ${otherToken}` },
      });
      expect(forbiddenRes.status()).toBe(404);
      const err = await forbiddenRes.json();
      expect(err.error.code).toBe('PURCHASE_NOT_FOUND');
    } finally {
      if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
      await database.query('DELETE FROM shipments WHERE purchase_id=?', [purchaseId]);
      await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
      await database.query('DELETE FROM users WHERE user_id="user-other"');
    }
  });

  // Scenario 12: Validation tests (malformed UUID, unauthorized, not found).
  test('12. Validation tests: malformed UUID, missing auth, unknown purchase', async ({
    bffRequest,
    request,
  }) => {
    // Malformed UUID
    const badUuidRes = await bffRequest.get('/api/purchases/invalid-uuid/shipment');
    expect(badUuidRes.status()).toBe(400);
    expect((await badUuidRes.json()).error.code).toBe('VALIDATION_ERROR');

    // Missing token
    const unauthRes = await request.get('http://localhost:3001/api/purchases/00000000-0000-4000-8000-000000000001/shipment');
    expect(unauthRes.status()).toBe(401);

    // Unknown purchase
    const notFoundRes = await bffRequest.get('/api/purchases/00000000-0000-4000-8000-000000000001/shipment');
    expect(notFoundRes.status()).toBe(404);
    expect((await notFoundRes.json()).error.code).toBe('PURCHASE_NOT_FOUND');
  });

  // Scenario 13 & Delivery progression: test provider delivery status advance and worker sync.
  test('13. Delivery status progression through IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED', async ({
    bffRequest,
    testEnvironment,
    shippingMock,
  }) => {
    const purchaseId = testEnvironment.purchaseId();
    let snapshot: PurchaseStateSnapshot | undefined;

    try {
      snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
      await bffRequest.post('/api/purchases', {
        data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
      });

      // Worker creates label
      await worker.processDueShipments();

      const [rows] = await database.query<RowDataPacket[]>(
        'SELECT provider_shipment_id FROM shipments WHERE purchase_id = ?',
        [purchaseId]
      );
      const providerShipmentId = (rows[0] as any).provider_shipment_id;
      expect(providerShipmentId).toBeTruthy();

      // Step 1: Advance to IN_TRANSIT in mock
      await shippingMock.updateDeliveryStatus(providerShipmentId, 'IN_TRANSIT');
      await worker.syncDeliveryStatus(purchaseId);
      let res = await bffRequest.get(`/api/purchases/${purchaseId}/shipment`);
      expect((await res.json()).deliveryStatus).toBe('IN_TRANSIT');

      // Step 2: Advance to OUT_FOR_DELIVERY
      await shippingMock.updateDeliveryStatus(providerShipmentId, 'OUT_FOR_DELIVERY');
      await worker.syncDeliveryStatus(purchaseId);
      res = await bffRequest.get(`/api/purchases/${purchaseId}/shipment`);
      expect((await res.json()).deliveryStatus).toBe('OUT_FOR_DELIVERY');

      // Step 3: Advance to DELIVERED
      await shippingMock.updateDeliveryStatus(providerShipmentId, 'DELIVERED');
      await worker.syncDeliveryStatus(purchaseId);
      res = await bffRequest.get(`/api/purchases/${purchaseId}/shipment`);
      expect((await res.json()).deliveryStatus).toBe('DELIVERED');
    } finally {
      if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
      await database.query('DELETE FROM shipments WHERE purchase_id=?', [purchaseId]);
      await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
    }
  });
});
