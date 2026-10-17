import { expect, test } from '../../../support/fixtures/apiFixtures';
import { expectPublicError } from '../../../support/utils/expectPublicError';
import { internalHeaders } from '../support';

test('INT-PURCHASE-LIST-001 GET purchase history returns paginated internal records', async ({ request, testEnvironment }) => {
  const response = await request.get('/pokemart/v1/purchases?limit=2&offset=0', {
    headers: internalHeaders(testEnvironment.userId, 'tc-pokeapi-purchase-list'),
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toEqual({ count: expect.any(Number), limit: 2, offset: 0, results: expect.any(Array) });
  expect(body.results.length).toBeLessThanOrEqual(2);
  for (const purchase of body.results) {
    expect(purchase).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      pokemonId: expect.any(Number),
      pokemonName: expect.any(String),
      quantity: expect.any(Number),
      unitPrice: expect.any(Number),
      totalPrice: expect.any(Number),
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(purchase.totalPrice).toBe(purchase.unitPrice * purchase.quantity);
  }
  expect(body).not.toHaveProperty('totalCount');
  expect(body).not.toHaveProperty('items');
});

test('INT-PURCHASE-LIST-002 GET purchase history validates pagination, unknown query, and authentication', async ({ request, testEnvironment }) => {
  const requestId = 'tc-pokeapi-purchase-list-error';
  for (const scenario of [
    { query: 'limit=101', code: 'VALIDATION_ERROR', details: [{ field: 'limit', message: 'must be between 1 and 100' }] },
    { query: 'offset=1.5', code: 'VALIDATION_ERROR', details: [{ field: 'offset', message: 'must be an integer' }] },
    { query: 'unexpected=true', code: 'UNKNOWN_QUERY_PARAMETER', details: [{ field: 'unexpected', message: 'is not supported' }] },
  ]) {
    const response = await request.get(`/pokemart/v1/purchases?${scenario.query}`, {
      headers: internalHeaders(testEnvironment.userId, requestId),
    });
    await expectPublicError(response, {
      status: 400,
      code: scenario.code,
      message: scenario.code === 'VALIDATION_ERROR' ? 'Request validation failed' : 'Unknown query parameter',
      requestId,
      details: scenario.details,
    });
  }

  const noIdentity = await request.get('/pokemart/v1/purchases', {
    headers: { 'X-Request-Id': requestId },
  });
  await expectPublicError(noIdentity, {
    status: 401,
    code: 'UNAUTHORIZED',
    message: 'A valid bearer token is required',
    requestId,
    details: [],
  });
});
