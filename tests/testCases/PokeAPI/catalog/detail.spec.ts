import { expect, test } from '../../../support/fixtures/apiFixtures';
import { expectPublicError } from '../../../support/utils/expectPublicError';
import { internalHeaders } from '../support';

test('INT-CAT-DETAIL-001 GET catalog detail returns an internal Pokémon listing', async ({ request, testEnvironment }) => {
  const response = await request.get(`/pokemart/v2/catalog/pokemon/${testEnvironment.pokemonId}`, {
    headers: internalHeaders(testEnvironment.userId, 'tc-pokeapi-detail'),
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toEqual({
    id: testEnvironment.pokemonId,
    name: expect.any(String),
    types: expect.any(Array),
    spriteUrl: expect.any(String),
    price: expect.any(Number),
    stock: expect.any(Number),
  });
  expect(body).not.toHaveProperty('pokemon');
  expect(body).not.toHaveProperty('listing');
});

test('INT-CAT-DETAIL-002 GET catalog detail distinguishes invalid IDs, missing Pokémon, and missing identity', async ({ request, testEnvironment }) => {
  const requestId = 'tc-pokeapi-detail-error';
  const invalid = await request.get('/pokemart/v2/catalog/pokemon/1.5', {
    headers: internalHeaders(testEnvironment.userId, requestId),
  });
  await expectPublicError(invalid, {
    status: 400,
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    requestId,
    details: [{ field: 'id', message: 'must be a positive integer' }],
  });

  const missing = await request.get('/pokemart/v2/catalog/pokemon/999', {
    headers: internalHeaders(testEnvironment.userId, requestId),
  });
  await expectPublicError(missing, {
    status: 404,
    code: 'POKEMON_NOT_FOUND',
    message: 'Pokémon not found',
    requestId,
    details: [],
  });

  const noIdentity = await request.get('/pokemart/v2/catalog/pokemon/1', {
    headers: { 'X-Request-Id': requestId, 'X-User-Id': 'bad user' },
  });
  expect(noIdentity.status()).toBe(200);
  expect(noIdentity.headers()['x-request-id']).toBe(requestId);
});
