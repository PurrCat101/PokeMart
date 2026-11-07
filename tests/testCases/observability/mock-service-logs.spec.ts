import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { testConfig } from '../../index';
import { grafanaIsUp, lokiLines } from '../../support/utils/observability';

// Needs the observability profile: start it with `make observe`. Skipped when Grafana is not reachable.
// kyc-api and payment-mock push their own logs to Loki (LOKI_URL), like the other services.
test.beforeAll(async ({ request }) => {
  test.skip(!(await grafanaIsUp(request)), 'Grafana is not reachable. Start it with: make observe');
});

const poll = { timeout: 45_000, intervals: [2_000, 3_000, 5_000] };

test('OBS-LOG-010 kyc-api request lines reach Loki under service="kyc-api"', async ({ request }) => {
  const requestId = `obs-kyc-${Date.now()}`;
  await request.get(`${testConfig.kycBaseUrl}/health`, { headers: { 'X-Request-Id': requestId } });

  await expect
    .poll(async () => (await lokiLines(request, `{service="kyc-api"} |= "${requestId}"`)).length, poll)
    .toBeGreaterThan(0);

  const [entry] = await lokiLines(request, `{service="kyc-api"} |= "${requestId}"`);
  expect(JSON.parse(entry.line)).toMatchObject({ service: 'kyc-api', method: 'GET', path: '/health', requestId });
});

test('OBS-LOG-011 payment-mock logs each call with its status, and failures carry a warn or error level', async ({ request }) => {
  const marker = `obs-pay-${Date.now()}`;
  const response = await request.get(`${testConfig.paymentMockBaseUrl}/v1/payment_intents/${marker}`);
  expect(response.status()).toBeGreaterThanOrEqual(400);

  await expect
    .poll(async () => (await lokiLines(request, `{service="payment-mock"} |= "${marker}"`)).length, poll)
    .toBeGreaterThan(0);

  const [entry] = await lokiLines(request, `{service="payment-mock"} |= "${marker}"`);
  expect(['warn', 'error']).toContain(entry.labels.level);
  expect(JSON.parse(entry.line)).toMatchObject({
    service: 'payment-mock',
    action: 'provider_request',
    method: 'GET',
    path: `/v1/payment_intents/${marker}`,
    statusCode: response.status(),
  });
});

test('OBS-LOG-012 payment-mock logs an injected fault when it is set and when it fails a top-up', async ({ request }) => {
  const topUpId = randomUUID();
  const base = testConfig.paymentMockBaseUrl;

  try {
    // 1. Setting the fault is a warning in Loki: it explains the failure that follows.
    const set = await request.put(`${base}/__test/faults`, { data: { topUpId, fault: 'http_500' } });
    expect(set.status()).toBe(204);

    await expect
      .poll(async () => (await lokiLines(request, `{service="payment-mock", level="warn"} |= "fault_changed" |= "${topUpId}"`)).length, poll)
      .toBeGreaterThan(0);

    const [changed] = await lokiLines(request, `{service="payment-mock", level="warn"} |= "fault_changed" |= "${topUpId}"`);
    expect(JSON.parse(changed.line)).toMatchObject({ action: 'fault_changed', fault: 'http_500', topUpId });

    // 2. The top-up that consumes it fails with 500, and the provider's own line names the fault.
    const charge = await request.post(`${base}/v1/payment_intents`, {
      headers: { 'Idempotency-Key': topUpId },
      data: { amount: 10000, currency: 'thb', confirm: true },
    });
    expect(charge.status()).toBe(500);

    await expect
      .poll(async () => (await lokiLines(request, `{service="payment-mock", level="error"} |= "provider_request" |= "http_500"`)).length, poll)
      .toBeGreaterThan(0);

    const calls = await lokiLines(request, `{service="payment-mock", level="error"} |= "provider_request" |= "http_500"`);
    expect(calls.map((c) => JSON.parse(c.line))).toContainEqual(
      expect.objectContaining({ action: 'provider_request', method: 'POST', path: '/v1/payment_intents', statusCode: 500, fault: 'http_500' }),
    );
  } finally {
    await request.delete(`${base}/__test/faults`);
  }
});
