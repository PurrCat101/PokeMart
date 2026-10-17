import { expect, test } from '../../../support/fixtures/apiFixtures';
import { expectPublicError } from '../../../support/utils/expectPublicError';
import { internalHeaders } from '../support';

test('INT-INVENTORY-001 GET inventory returns internal item fields in stable order', async ({ request, testEnvironment }) => {
  const response = await request.get('/pokemart/v1/inventory', {
    headers: internalHeaders(testEnvironment.userId, 'tc-pokeapi-inventory'),
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toEqual({ count: expect.any(Number), results: expect.any(Array) });
  expect(body.count).toBe(body.results.length);
  for (const item of body.results) {
    expect(item).toEqual({
      pokemonId: expect.any(Number),
      name: expect.any(String),
      quantity: expect.any(Number),
    });
    expect(item.quantity).toBeGreaterThanOrEqual(1);
  }
  expect(body).not.toHaveProperty('items');
});

test('INT-INVENTORY-002 GET inventory returns an empty list for an authenticated user without inventory', async ({ request }) => {
  const requestId = 'tc-pokeapi-inventory-empty';
  const emptyResponse = await request.get('/pokemart/v1/inventory', {
    headers: internalHeaders('lab-empty-user-001', requestId),
  });
  expect(emptyResponse.status()).toBe(200);
  expect(await emptyResponse.json()).toEqual({ count: 0, results: [] });

  const noIdentity = await request.get('/pokemart/v1/inventory', {
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
