import { expect, test } from '../../../support/fixtures/apiFixtures';
import { expectPublicError } from '../../../support/utils/expectPublicError';
import { internalHeaders } from '../support';

test('INT-CAT-LIST-001 GET catalog returns the internal paginated DTO and stable order', async ({ request, testEnvironment }) => {
  const response = await request.get('/pokemart/v2/catalog/pokemon', {
    headers: internalHeaders(testEnvironment.userId, 'tc-pokeapi-catalog'),
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.count).toBe(151);
  expect(body.limit).toBe(20);
  expect(body.offset).toBe(0);
  expect(body.results).toHaveLength(20);
  expect(body.results[0]).toEqual({
    id: 1,
    name: 'bulbasaur',
    types: ['grass', 'poison'],
    spriteUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png',
    price: 300,
    stock: expect.any(Number),
  });
  expect(body.results.map((pokemon: { id: number }) => pokemon.id)).toEqual(
    [...body.results].map((pokemon: { id: number }) => pokemon.id).sort((left: number, right: number) => left - right),
  );
  expect(body).not.toHaveProperty('totalCount');
  expect(body).not.toHaveProperty('items');
});

test('INT-CAT-LIST-002 GET catalog supports pagination boundaries and empty pages', async ({ request, testEnvironment }) => {
  for (const limit of [1, 100]) {
    const response = await request.get(`/pokemart/v2/catalog/pokemon?limit=${limit}&offset=0`, {
      headers: internalHeaders(testEnvironment.userId),
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ count: 151, limit, offset: 0 });
    expect(body.results.length).toBe(Math.min(limit, 151));
  }

  const emptyResponse = await request.get('/pokemart/v2/catalog/pokemon?limit=2&offset=999', {
    headers: internalHeaders(testEnvironment.userId),
  });
  expect(emptyResponse.status()).toBe(200);
  expect(await emptyResponse.json()).toEqual({ count: 151, limit: 2, offset: 999, results: [] });
});

test('INT-CAT-LIST-003 GET catalog rejects invalid and unknown query parameters', async ({ request, testEnvironment }) => {
  const requestId = 'tc-pokeapi-catalog-error';
  for (const scenario of [
    { query: 'limit=0', code: 'VALIDATION_ERROR', details: [{ field: 'limit', message: 'must be between 1 and 100' }] },
    { query: 'limit=abc', code: 'VALIDATION_ERROR', details: [{ field: 'limit', message: 'must be an integer' }] },
    { query: 'offset=-1', code: 'VALIDATION_ERROR', details: [{ field: 'offset', message: 'must be an integer' }] },
    { query: 'unexpected=true', code: 'UNKNOWN_QUERY_PARAMETER', details: [{ field: 'unexpected', message: 'is not supported' }] },
  ]) {
    const response = await request.get(`/pokemart/v2/catalog/pokemon?${scenario.query}`, {
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
});

test('INT-CAT-LIST-004 GET catalog is public and ignores X-User-Id', async ({ request }) => {
  const requestId = 'tc-pokeapi-catalog-user';
  const cases: Array<Record<string, string>> = [
    { 'X-Request-Id': requestId },
    { 'X-User-Id': 'bad user', 'X-Request-Id': requestId },
  ];
  for (const headers of cases) {
    const response = await request.get('/pokemart/v2/catalog/pokemon', { headers });
    expect(response.status()).toBe(200);
    expect(response.headers()['x-request-id']).toBe(requestId);
    expect(await response.json()).toMatchObject({ count: 151, results: expect.any(Array) });
  }
});
