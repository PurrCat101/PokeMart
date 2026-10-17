import { errorCodes } from '../../resources/expectedResults/commonResponses.spec';
import { expect, test } from '../../support/fixtures/apiFixtures';

test('mocked catalog pagination and item DTO follow the public contract', async ({ bffRequest, testEnvironment }) => {
  const response = await bffRequest.get(`/api/pokemon?limit=${testEnvironment.pageSize}&offset=0`);
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.page).toEqual({ limit: testEnvironment.pageSize, offset: 0 });
  expect(body.totalCount).toBeGreaterThan(0);
  expect(body.items.length).toBeGreaterThan(0);
  expect(body.items.length).toBeLessThanOrEqual(testEnvironment.pageSize);
  expect(body.items[0]).toMatchObject({
    pokemon: { id: expect.any(Number), name: expect.any(String), types: expect.any(Array) },
    listing: { price: expect.any(Number), availableStock: expect.any(Number) },
  });
  expect(body).not.toHaveProperty('results');
});

test('mocked catalog rejects unknown query parameters', async ({ bffRequest, testEnvironment }) => {
  const response = await bffRequest.get('/api/pokemon?unexpected=true', {
    headers: testEnvironment.scenarioHeaders('unknown-query-parameter'),
  });
  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: errorCodes.unknownQueryParameter } });
});

test('mocked catalog detail uses nested Pokémon and listing DTOs', async ({ bffRequest, testEnvironment }) => {
  const response = await bffRequest.get(`/api/pokemon/${testEnvironment.pokemonId}`);
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    pokemon: { id: testEnvironment.pokemonId, name: expect.any(String) },
    listing: { price: expect.any(Number), availableStock: expect.any(Number) },
  });
});
