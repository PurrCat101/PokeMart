import { expect, test } from '../../support/fixtures/apiFixtures';
import { MySQLConnection } from '../../support/models/MySQL/MySQLConnection';
import { snapshotPurchaseState, restorePurchaseState, PurchaseStateSnapshot } from '../../support/utils/purchaseState';
import { ShippingWorker } from '../../../apps/pokemart-api/src/shipping-worker';
import { testConfig } from '../../index';

// Purchase -> shipping provider down -> UI shows "รอจัดส่ง" -> provider recovers -> UI shows the tracking number.
//
// The purchase and the worker sweeps are driven from the test so the run is deterministic (the docker
// shipping-worker only polls every 60s). The assertions are made on what the trainer sees in the web UI.
test('UI shows "รอจัดส่ง" while the shipping provider is down, then the tracking number once it recovers', async ({
  page,
  bffRequest,
  shippingMock,
  testEnvironment,
}) => {
  test.setTimeout(60_000);

  const database = new MySQLConnection();
  const worker = new ShippingWorker({
    shippingBaseUrl: testConfig.shippingMockBaseUrl,
    requestTimeoutMs: 1000,
    maxAttempts: 5,
    batchSize: 10,
    backoffBaseMs: 50,
    backoffMaxMs: 200,
  });
  const purchaseId = testEnvironment.purchaseId();
  let snapshot: PurchaseStateSnapshot | undefined;

  try {
    snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
    await shippingMock.reset();
    await shippingMock.setMode('unavailable');

    // 1. Purchase while the provider is down: the order must still be committed.
    const created = await bffRequest.post('/api/purchases', {
      data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
    });
    expect(created.status()).toBe(201);

    // 2. The worker tries and fails; the shipment is parked in RETRY_WAIT with no tracking number.
    await worker.processDueShipments();
    const parked = await (await bffRequest.get(`/api/purchases/${purchaseId}/shipment`)).json();
    expect(parked.processingStatus).toBe('RETRY_WAIT');
    expect(parked.trackingNumber).toBeNull();

    // 3. The trainer signs in and opens the order.
    await page.addInitScript(() => {
      localStorage.removeItem('pokemart_cart');
      localStorage.removeItem('pokemart_token');
    });
    await page.goto('/');
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await page.getByTestId('sign-in').click();
    await page.getByTestId('login-email').fill(testConfig.auth.email);
    await page.getByTestId('login-password').fill(testConfig.auth.password);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-dialog')).toBeHidden();

    await page.getByTestId('nav-purchases').click();
    await expect(page.getByTestId(`purchase-row-${purchaseId}`)).toBeVisible();
    await expect(page.getByTestId(`purchase-delivery-status-${purchaseId}`)).toHaveText('รอจัดส่ง');
    await expect(page.getByTestId(`purchase-tracking-number-${purchaseId}`)).toHaveCount(0);

    await page.getByTestId(`purchase-open-detail-${purchaseId}`).click();
    const detail = page.getByTestId(`order-detail-${purchaseId}`);
    await expect(detail).toBeVisible();

    // 4. While waiting: "รอจัดส่ง" notice and badge, and no tracking number.
    await expect(page.getByTestId('order-detail-shipping-notice')).toContainText('รอจัดส่ง');
    await expect(page.getByTestId('order-detail-delivery-status')).toHaveText('รอจัดส่ง');
    await expect(page.getByTestId('order-detail-tracking-number')).toHaveCount(0);
    await expect(detail).toContainText('ยังไม่ออกเลขพัสดุ');

    // 5. The provider recovers and the retry becomes due; the worker picks the shipment up again.
    await shippingMock.setMode('success');
    await database.query('UPDATE shipments SET next_attempt_at = NOW(3) WHERE purchase_id = ?', [purchaseId]);
    await worker.processDueShipments();

    const recovered = await (await bffRequest.get(`/api/purchases/${purchaseId}/shipment`)).json();
    expect(recovered.processingStatus).toBe('LABEL_CREATED');
    expect(typeof recovered.trackingNumber).toBe('string');

    // 6. Refresh in the open dialog: the tracking number appears, the waiting notice goes away.
    await page.getByTestId('order-detail-refresh').click();
    await expect(page.getByTestId('order-detail-tracking-number')).toHaveText(recovered.trackingNumber);
    await expect(page.getByTestId('order-detail-delivery-status')).toHaveText('ออกเลขพัสดุแล้ว');
    await expect(page.getByTestId('order-detail-shipping-notice')).toHaveCount(0);
    await expect(page.getByTestId('shipment-timeline-step-LABEL_CREATED')).toHaveAttribute('aria-current', 'step');

    // 7. The same tracking number is shown in the purchase list.
    await page.getByTestId('order-detail-close').click();
    await page.getByTestId('purchases-refresh').click();
    await expect(page.getByTestId(`purchase-tracking-number-${purchaseId}`)).toHaveText(recovered.trackingNumber);
  } finally {
    await worker.close();
    await shippingMock.reset();
    if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
    await database.query('DELETE FROM shipments WHERE purchase_id=?', [purchaseId]);
    await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
    await database.close();
  }
});
