import { expect, test } from '../../support/fixtures/apiFixtures';
import { expectPublicError } from '../../support/utils/expectPublicError';

const requestId = 'tc-catalog-validation';

test('CAT-API-001 GET /api/pokemon defaults to the seeded catalog and exact public DTO', async ({ bffRequest }) => {
  const response = await bffRequest.get('/api/pokemon');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  const body = await response.json();
  expect(body.totalCount).toBe(151);
  expect(body.page).toEqual({ limit: 20, offset: 0 });
  expect(body.items).toHaveLength(20);
  expect(body.items[0]).toEqual({
    pokemon: {
      id: 1,
      name: 'bulbasaur',
      types: ['grass', 'poison'],
      spriteUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png',
    },
    listing: { price: 300, availableStock: expect.any(Number) },
  });
  expect(body).not.toHaveProperty('results');
});

test('CAT-API-002 pagination accepts lower, interior, and upper limit boundaries', async ({ bffRequest }) => {
  for (const limit of [1, 2, 99, 100]) {
    const response = await bffRequest.get(`/api/pokemon?limit=${limit}&offset=0`);
    expect(response.status(), `limit=${limit}`).toBe(200);
    const body = await response.json();
    expect(body.page).toEqual({ limit, offset: 0 });
    expect(body.totalCount).toBe(151);
    expect(body.items.length).toBe(Math.min(limit, 151));
    expect(body.items.length).toBeLessThanOrEqual(limit);
    expect(body.items.map((item: { pokemon: { id: number } }) => item.pokemon.id)).toEqual(
      [...body.items].map((item: { pokemon: { id: number } }) => item.pokemon.id).sort((a: number, b: number) => a - b),
    );
  }
});

test('CAT-API-003 offset beyond the catalog returns an empty page', async ({ bffRequest }) => {
  const response = await bffRequest.get('/api/pokemon?limit=2&offset=999');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ totalCount: 151, page: { limit: 2, offset: 999 }, items: [] });
});

const paginationErrors = [
  { id: 'CAT-VAL-001', query: 'limit=0', field: 'limit', message: 'must be between 1 and 100' },
  { id: 'CAT-VAL-002', query: 'limit=101', field: 'limit', message: 'must be between 1 and 100' },
  { id: 'CAT-VAL-003', query: 'limit=-1', field: 'limit', message: 'must be an integer' },
  { id: 'CAT-VAL-004', query: 'limit=abc', field: 'limit', message: 'must be an integer' },
  { id: 'CAT-VAL-005', query: 'limit=1.5', field: 'limit', message: 'must be an integer' },
  { id: 'CAT-VAL-006', query: 'limit=', field: 'limit', message: 'must be an integer' },
  { id: 'CAT-VAL-007', query: 'limit=%20%20', field: 'limit', message: 'must be an integer' },
  { id: 'CAT-VAL-008', query: 'limit=1&limit=2', field: 'limit', message: 'must be an integer' },
  { id: 'CAT-VAL-009', query: 'offset=-1', field: 'offset', message: 'must be an integer' },
  { id: 'CAT-VAL-010', query: 'offset=1.5', field: 'offset', message: 'must be an integer' },
  { id: 'CAT-VAL-011', query: 'offset=', field: 'offset', message: 'must be an integer' },
];

for (const scenario of paginationErrors) {
  test(`${scenario.id} GET /api/pokemon rejects ${scenario.query}`, async ({ bffRequest }) => {
    const response = await bffRequest.get(`/api/pokemon?${scenario.query}`, {
      headers: { 'X-Request-Id': requestId },
    });
    await expectPublicError(response, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      requestId,
      details: [{ field: scenario.field, message: scenario.message }],
    });
  });
}

test('CAT-VAL-012 GET /api/pokemon rejects unknown query parameters with an exact error', async ({ bffRequest }) => {
  const response = await bffRequest.get('/api/pokemon?unexpected=true', {
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

test('CAT-API-004 GET /api/pokemon/:id returns the exact nested public DTO', async ({ bffRequest, testEnvironment }) => {
  const response = await bffRequest.get(`/api/pokemon/${testEnvironment.pokemonId}`);
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toEqual({
    pokemon: {
      id: testEnvironment.pokemonId,
      name: expect.any(String),
      types: expect.any(Array),
      spriteUrl: expect.any(String),
    },
    listing: { price: expect.any(Number), availableStock: expect.any(Number) },
  });
  expect(body).not.toHaveProperty('id');
  expect(body).not.toHaveProperty('price');
});

for (const id of ['abc', '0', '-1', '1.5']) {
  test(`CAT-VAL-PATH GET /api/pokemon/${id} rejects a malformed positive-integer ID`, async ({ bffRequest }) => {
    const response = await bffRequest.get(`/api/pokemon/${encodeURIComponent(id)}`, {
      headers: { 'X-Request-Id': requestId },
    });
    await expectPublicError(response, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      requestId,
      details: [{ field: 'id', message: 'must be a positive integer' }],
    });
  });
}

test('CAT-ERR-404 GET /api/pokemon/:id distinguishes a valid nonexistent ID', async ({ bffRequest }) => {
  const response = await bffRequest.get('/api/pokemon/999', {
    headers: { 'X-Request-Id': requestId },
  });
  await expectPublicError(response, {
    status: 404,
    code: 'POKEMON_NOT_FOUND',
    message: 'Pokémon not found',
    requestId,
    details: [],
  });
});
