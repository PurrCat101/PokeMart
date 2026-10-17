import { expect, test } from '../../support/fixtures/apiFixtures';

test.beforeEach(async ({ bffRequest }) => {
  const response = await bffRequest.delete('/__admin/requests');
  expect(response.ok()).toBeTruthy();
});

test('WireMock models every public success endpoint with the exact configured body', async ({ bffRequest, testEnvironment }) => {
  const purchaseId = testEnvironment.purchaseId();
  const cases = [
    {
      method: 'GET',
      path: '/api/pokemon',
      body: {
        totalCount: 1,
        page: { limit: 20, offset: 0 },
        items: [{
          pokemon: { id: 1, name: 'bulbasaur', types: ['grass', 'poison'], spriteUrl: 'https://example.test/1.png' },
          listing: { price: 300, availableStock: 5 },
        }],
      },
    },
    {
      method: 'GET',
      path: '/api/pokemon?limit=2&offset=0',
      body: {
        totalCount: 1,
        page: { limit: 2, offset: 0 },
        items: [{
          pokemon: { id: 1, name: 'bulbasaur', types: ['grass', 'poison'], spriteUrl: 'https://example.test/1.png' },
          listing: { price: 300, availableStock: 5 },
        }],
      },
    },
    {
      method: 'GET',
      path: '/api/pokemon/1',
      body: {
        pokemon: { id: 1, name: 'bulbasaur', types: ['grass', 'poison'], spriteUrl: 'https://example.test/1.png' },
        listing: { price: 300, availableStock: 5 },
      },
    },
    {
      method: 'GET',
      path: '/api/wallet',
      body: { wallet: { userId: testEnvironment.userId, balance: testEnvironment.walletBalance } },
    },
    {
      method: 'GET',
      path: '/api/inventory',
      body: { items: [{ pokemon: { id: 1, name: 'bulbasaur' }, quantity: 2 }] },
    },
    {
      method: 'GET',
      path: '/api/purchases',
      body: {
        totalCount: 1,
        page: { limit: 20, offset: 0 },
        items: [{
          purchaseId,
          pokemon: { id: 1, name: 'bulbasaur' },
          quantity: 1,
          pricing: { unitPrice: 300, totalPrice: 300 },
          createdAt: '2026-01-01T00:00:00.000Z',
        }],
      },
    },
    {
      method: 'GET',
      path: `/api/purchases/${purchaseId}`,
      body: {
        purchaseId,
        pokemon: { id: 1, name: 'bulbasaur' },
        quantity: 1,
        pricing: { unitPrice: 300, totalPrice: 300 },
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    },
    {
      method: 'GET',
      path: '/health',
      body: { status: 'ok' },
    },
    {
      method: 'GET',
      path: '/ready',
      body: { status: 'ready', checks: { pokemartApi: 'ok' } },
    },
  ];

  for (const scenario of cases) {
    const response = await bffRequest.get(scenario.path);
    expect(response.status(), `${scenario.method} ${scenario.path}`).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(response.headers()['x-request-id']).toBe('wiremock-request');
    expect(await response.json(), `${scenario.method} ${scenario.path}`).toEqual(scenario.body);
  }

  const purchaseResponse = await bffRequest.post('/api/purchases', {
    data: { purchaseId, pokemonId: 1, quantity: 1 },
  });
  expect(purchaseResponse.status()).toBe(201);
  expect(purchaseResponse.headers()['content-type']).toContain('application/json');
  expect(purchaseResponse.headers().location).toBe(`/api/purchases/${purchaseId}`);
  expect(purchaseResponse.headers()['x-request-id']).toBe('wiremock-request');
  expect(await purchaseResponse.json()).toEqual({
    purchaseId,
    pokemon: { id: 1, name: 'bulbasaur' },
    quantity: 1,
    pricing: { unitPrice: 300, totalPrice: 300 },
    createdAt: '2026-01-01T00:00:00.000Z',
  });
});

test('WireMock models empty catalog pages and inventory', async ({ bffRequest }) => {
  const catalogResponse = await bffRequest.get('/api/pokemon?limit=2&offset=999');
  expect(catalogResponse.status()).toBe(200);
  expect(await catalogResponse.json()).toEqual({
    totalCount: 1,
    page: { limit: 2, offset: 999 },
    items: [],
  });

  const inventoryResponse = await bffRequest.get('/api/inventory', {
    headers: { 'X-WireMock-Scenario': 'inventory-empty' },
  });
  expect(inventoryResponse.status()).toBe(200);
  expect(await inventoryResponse.json()).toEqual({ items: [] });
});

test('WireMock models readiness failure separately from API error envelopes', async ({ bffRequest }) => {
  const response = await bffRequest.get('/ready', {
    headers: { 'X-WireMock-Scenario': 'not-ready' },
  });
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({
    status: 'not_ready',
    checks: { pokemartApi: 'unavailable' },
  });
});

test('WireMock models dependency outages on every public business endpoint', async ({ bffRequest }) => {
  const cases: Array<{ method: 'GET' | 'POST'; path: string; body?: unknown }> = [
    { method: 'GET', path: '/api/pokemon' },
    { method: 'GET', path: '/api/pokemon/1' },
    { method: 'GET', path: '/api/wallet' },
    { method: 'GET', path: '/api/inventory' },
    { method: 'GET', path: '/api/purchases' },
    { method: 'GET', path: '/api/purchases/00000000-0000-4000-8000-000000000001' },
    { method: 'POST', path: '/api/purchases', body: { purchaseId: '00000000-0000-4000-8000-000000000001', pokemonId: 1, quantity: 1 } },
  ];
  for (const scenario of cases) {
    const options = {
      headers: { 'X-WireMock-Scenario': 'dependency-unavailable' },
      ...(scenario.body ? { data: scenario.body } : {}),
    };
    const response = scenario.method === 'GET'
      ? await bffRequest.get(scenario.path, options)
      : await bffRequest.post(scenario.path, options);
    expect(response.status(), `${scenario.method} ${scenario.path}`).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Catalog service is temporarily unavailable',
        requestId: 'wiremock-request',
        details: [],
      },
    });
  }
});
