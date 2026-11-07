import { expect, test } from '../../support/fixtures/apiFixtures';
import { MySQLConnection } from '../../support/models/MySQL/MySQLConnection';
import { snapshotPurchaseState, restorePurchaseState, PurchaseStateSnapshot } from '../../support/utils/purchaseState';
import { grafanaIsUp, lokiLines } from '../../support/utils/observability';

// Needs the observability profile: start it with `make observe`. Skipped when Grafana is not reachable.
// The purchase is made through the BFF and the shipping worker runs in its own container. The worker
// polls every SHIPPING_POLL_INTERVAL_MS (60 s by default), so these polls wait long enough for one sweep.
test.beforeAll(async ({ request }) => {
  test.skip(!(await grafanaIsUp(request)), 'Grafana is not reachable. Start it with: make observe');
});

const poll = { timeout: 120_000, intervals: [2_000, 5_000, 5_000] };

test('OBS-OUT-001 a provider outage shows as a worker retry in Loki and as the provider 503 in the shipping-mock log', async ({
  bffRequest,
  shippingMock,
  testEnvironment,
  request,
}) => {
  test.setTimeout(180_000);

  const database = new MySQLConnection();
  const purchaseId = testEnvironment.purchaseId();
  let snapshot: PurchaseStateSnapshot | undefined;

  try {
    snapshot = await snapshotPurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId);
    await shippingMock.reset();
    await shippingMock.setMode('unavailable');

    const created = await bffRequest.post('/api/purchases', {
      data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
    });
    expect(created.status()).toBe(201);

    // 1. The worker container tries the provider, gets 503 and schedules a retry. Grafana shows it as a warning.
    await expect
      .poll(async () => (await lokiLines(request, `{service="shipping-worker"} |= "shipment_retry_scheduled" |= "${purchaseId}"`)).length, poll)
      .toBeGreaterThan(0);

    const [retry] = await lokiLines(request, `{service="shipping-worker", level="warn"} |= "shipment_retry_scheduled" |= "${purchaseId}"`);
    expect(retry, 'shipment_retry_scheduled should carry the warn level label').toBeDefined();
    expect(JSON.parse(retry.line)).toMatchObject({
      action: 'shipment_retry_scheduled',
      purchaseId,
      status: 503,
    });
    expect(JSON.parse(retry.line).reason).toContain('503');

    // 2. The provider's own log explains the same call: which path, which mode, and the 503 it returned.
    await expect
      .poll(async () => (await lokiLines(request, `{service="shipping-mock"} |= "provider_request" |= "${purchaseId}"`)).length, poll)
      .toBeGreaterThan(0);

    const [providerCall] = await lokiLines(request, `{service="shipping-mock", level="error"} |= "provider_request" |= "${purchaseId}"`);
    expect(providerCall, 'the failing provider call should carry the error level label').toBeDefined();
    expect(JSON.parse(providerCall.line)).toMatchObject({
      action: 'provider_request',
      method: 'POST',
      path: '/v1/shipments',
      statusCode: 503,
      mode: 'unavailable',
      purchaseId,
    });
  } finally {
    await shippingMock.setMode('success');
    await shippingMock.reset();
    if (snapshot) await restorePurchaseState(database, testEnvironment.userId, testEnvironment.pokemonId, snapshot);
    await database.query('DELETE FROM shipments WHERE purchase_id=?', [purchaseId]);
    await database.query('DELETE FROM purchases WHERE id=?', [purchaseId]);
    await database.close();
  }
});
