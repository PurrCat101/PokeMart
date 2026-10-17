import { expect, test } from '../../support/fixtures/apiFixtures';

test.beforeEach(async ({ bffRequest }) => {
  const response = await bffRequest.delete('/__admin/requests');
  expect(response.ok()).toBeTruthy();
});

test('WireMock covers every public endpoint success shape', async ({ bffRequest }) => {
  const checks: Array<{ path: string; key: string }> = [
    { path: '/api/pokemon', key: 'items' },
    { path: '/api/pokemon/1', key: 'pokemon' },
    { path: '/api/wallet', key: 'wallet' },
    { path: '/api/inventory', key: 'items' },
    { path: '/api/purchases', key: 'items' },
    { path: '/api/purchases/00000000-0000-4000-8000-000000000001', key: 'purchaseId' },
    { path: '/health', key: 'status' },
    { path: '/ready', key: 'status' },
  ];

  for (const check of checks) {
    const response = await bffRequest.get(check.path);
    expect(response.status(), check.path).toBe(200);
    expect(await response.json()).toHaveProperty(check.key);
  }

  const created = await bffRequest.post('/api/purchases', {
    data: { purchaseId: '00000000-0000-4000-8000-000000000001', pokemonId: 1, quantity: 1 },
  });
  expect(created.status()).toBe(201);
  expect(created.headers().location).toContain('/api/purchases/');
  expect(await created.json()).toHaveProperty('purchaseId');

  const duplicate = await bffRequest.post('/api/purchases', {
    data: { purchaseId: '00000000-0000-4000-8000-000000000001', pokemonId: 1, quantity: 1 },
    headers: { 'X-WireMock-Scenario': 'purchase-duplicate' },
  });
  expect(duplicate.status()).toBe(409);
  expect(await duplicate.json()).toMatchObject({ error: { code: 'PURCHASE_DUPLICATE' } });
});

test('WireMock covers every documented public error code', async ({ bffRequest }) => {
  const cases: Array<{ scenario: string; path: string; method: 'GET' | 'POST'; status: number; code: string }> = [
    { scenario: 'validation-error', path: '/api/pokemon', method: 'GET', status: 400, code: 'VALIDATION_ERROR' },
    { scenario: 'unknown-query-parameter', path: '/api/pokemon', method: 'GET', status: 400, code: 'UNKNOWN_QUERY_PARAMETER' },
    { scenario: 'invalid-json', path: '/api/purchases', method: 'POST', status: 400, code: 'INVALID_JSON' },
    { scenario: 'unsupported-media-type', path: '/api/purchases', method: 'POST', status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' },
    { scenario: 'pokemon-not-found', path: '/api/pokemon/999', method: 'GET', status: 404, code: 'POKEMON_NOT_FOUND' },
    { scenario: 'user-not-found', path: '/api/wallet', method: 'GET', status: 404, code: 'USER_NOT_FOUND' },
    { scenario: 'purchase-not-found', path: '/api/purchases/00000000-0000-4000-8000-000000000099', method: 'GET', status: 404, code: 'PURCHASE_NOT_FOUND' },
    { scenario: 'pokemon-not-for-sale', path: '/api/purchases', method: 'POST', status: 409, code: 'POKEMON_NOT_FOR_SALE' },
    { scenario: 'insufficient-stock', path: '/api/purchases', method: 'POST', status: 409, code: 'INSUFFICIENT_STOCK' },
    { scenario: 'insufficient-funds', path: '/api/purchases', method: 'POST', status: 422, code: 'INSUFFICIENT_FUNDS' },
    { scenario: 'purchase-duplicate', path: '/api/purchases', method: 'POST', status: 409, code: 'PURCHASE_DUPLICATE' },
    { scenario: 'dependency-unavailable', path: '/api/pokemon', method: 'GET', status: 503, code: 'DEPENDENCY_UNAVAILABLE' },
    { scenario: 'internal-error', path: '/api/wallet', method: 'GET', status: 500, code: 'INTERNAL_ERROR' },
  ];

  for (const scenario of cases) {
    const options = {
      headers: { 'X-WireMock-Scenario': scenario.scenario },
      ...(scenario.method === 'POST'
        ? { data: { purchaseId: '00000000-0000-4000-8000-000000000001', pokemonId: 1, quantity: 1 }, headers: { 'X-WireMock-Scenario': scenario.scenario } }
        : {}),
    };
    const response = scenario.method === 'GET'
      ? await bffRequest.get(scenario.path, options)
      : await bffRequest.post(scenario.path, options);
    expect(response.status(), scenario.scenario).toBe(scenario.status);
    expect(await response.json(), scenario.scenario).toMatchObject({ error: { code: scenario.code } });
  }
});
