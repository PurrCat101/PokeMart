import { expect, test } from '../../support/fixtures/apiFixtures';
import { expectPublicError } from '../../support/utils/expectPublicError';

const requestId = 'tc-purchase-history';

test('PUR-API-READ-001 GET /api/wallet returns exactly the configured public wallet resource', async ({ bffRequest, testEnvironment }) => {
  const response = await bffRequest.get('/api/wallet');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  expect(await response.json()).toEqual({
    wallet: { userId: testEnvironment.userId, balance: testEnvironment.walletBalance },
  });
});

test('PUR-API-READ-002 GET /api/inventory returns a closed public item shape including empty inventory', async ({ bffRequest }) => {
  const response = await bffRequest.get('/api/inventory');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toEqual({ items: expect.any(Array) });
  for (const item of body.items) {
    expect(item).toEqual({
      pokemon: { id: expect.any(Number), name: expect.any(String) },
      quantity: expect.any(Number),
    });
    expect(item.quantity).toBeGreaterThanOrEqual(1);
  }
  expect(body).not.toHaveProperty('count');
  expect(body).not.toHaveProperty('results');
});

test('PUR-API-READ-003 GET /api/purchases returns stable paginated public DTOs', async ({ bffRequest }) => {
  const response = await bffRequest.get('/api/purchases?limit=2&offset=0');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toEqual({
    totalCount: expect.any(Number),
    page: { limit: 2, offset: 0 },
    items: expect.any(Array),
  });
  expect(body.items.length).toBeLessThanOrEqual(2);
  for (const item of body.items) {
    expect(item).toEqual({
      purchaseId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
      pokemon: { id: expect.any(Number), name: expect.any(String) },
      quantity: expect.any(Number),
      pricing: { unitPrice: expect.any(Number), totalPrice: expect.any(Number) },
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  }
  expect(body).not.toHaveProperty('count');
  expect(body).not.toHaveProperty('results');

  if (body.items.length > 0) {
    const item = body.items[0];
    const detailResponse = await bffRequest.get(`/api/purchases/${item.purchaseId}`);
    expect(detailResponse.status()).toBe(200);
    expect(await detailResponse.json()).toEqual(item);
  }
});

test('PUR-API-READ-006 GET /api/purchases applies the documented default pagination', async ({ bffRequest }) => {
  const response = await bffRequest.get('/api/purchases');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.page).toEqual({ limit: 20, offset: 0 });
  expect(body.items.length).toBeLessThanOrEqual(20);
});

test('PUR-API-READ-004 purchase history supports the catalog pagination boundaries', async ({ bffRequest }) => {
  for (const limit of [1, 100]) {
    const response = await bffRequest.get(`/api/purchases?limit=${limit}&offset=0`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.page).toEqual({ limit, offset: 0 });
    expect(body.items.length).toBeLessThanOrEqual(limit);
  }

  const emptyPageResponse = await bffRequest.get('/api/purchases?limit=1&offset=999999');
  expect(emptyPageResponse.status()).toBe(200);
  const emptyPage = await emptyPageResponse.json();
  expect(emptyPage.page).toEqual({ limit: 1, offset: 999999 });
  expect(emptyPage.items).toEqual([]);
});

test('PUR-VAL-PAGE-001 GET /api/purchases applies pagination validation boundaries', async ({ bffRequest }) => {
  const cases = [
    { query: 'limit=0', field: 'limit', message: 'must be between 1 and 100' },
    { query: 'offset=-1', field: 'offset', message: 'must be an integer' },
    { query: 'limit=1&limit=2', field: 'limit', message: 'must be an integer' },
  ];
  for (const scenario of cases) {
    const response = await bffRequest.get(`/api/purchases?${scenario.query}`, {
      headers: { 'X-Request-Id': requestId },
    });
    await expectPublicError(response, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      requestId,
      details: [{ field: scenario.field, message: scenario.message }],
    });
  }
});

test('PUR-API-READ-005 purchase history rejects unknown query parameters', async ({ bffRequest }) => {
  const response = await bffRequest.get('/api/purchases?unexpected=true', {
    headers: { 'X-Request-Id': requestId },
  });
  await expectPublicError(response, {
    status: 400,
    code: 'UNKNOWN_QUERY_PARAMETER',
    message: 'Unknown query parameter',
    requestId,
    details: [{ field: 'unexpected', message: 'is not supported' }],
  });
});
