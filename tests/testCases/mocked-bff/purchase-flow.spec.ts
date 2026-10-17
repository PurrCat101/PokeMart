import { expect, test } from '../../support/fixtures/apiFixtures';

test('@purchase-flow mocked purchase retry succeeds, while a committed ID returns a duplicate error', async ({ bffRequest, testEnvironment }) => {
  const purchaseId = testEnvironment.purchaseId();
  const failedAttempt = await bffRequest.post('/api/purchases', {
    data: { purchaseId, pokemonId: 999, quantity: 1 },
    headers: testEnvironment.scenarioHeaders('purchase-pokemon-not-found'),
  });
  expect(failedAttempt.status()).toBe(404);
  expect(await failedAttempt.json()).toMatchObject({ error: { code: 'POKEMON_NOT_FOUND' } });

  const successfulAttempt = await bffRequest.post('/api/purchases', {
    data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 1 },
  });
  expect(successfulAttempt.status()).toBe(201);
  expect(successfulAttempt.headers().location).toBe(`/api/purchases/${purchaseId}`);
  expect(await successfulAttempt.json()).toMatchObject({ purchaseId });

  const duplicateAttempt = await bffRequest.post('/api/purchases', {
    data: { purchaseId, pokemonId: testEnvironment.pokemonId, quantity: 2 },
    headers: testEnvironment.scenarioHeaders('purchase-duplicate'),
  });
  expect(duplicateAttempt.status()).toBe(409);
  expect(await duplicateAttempt.json()).toMatchObject({ error: { code: 'PURCHASE_DUPLICATE' } });

  const storedPurchaseResponse = await bffRequest.get(`/api/purchases/${purchaseId}`);
  expect(storedPurchaseResponse.status()).toBe(200);
  expect(await storedPurchaseResponse.json()).toMatchObject({ purchaseId });
});
