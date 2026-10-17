import { errorCodes } from '../../resources/expectedResults/commonResponses.spec';
import { expect, test } from '../../support/fixtures/apiFixtures';

test('missing purchaseId is rejected before state can change', async ({ bffRequest }) => {
  const response = await bffRequest.post('/api/purchases', { data: { pokemonId: 1, quantity: 1 } });
  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: errorCodes.validationError } });
});

test('malformed purchaseId is rejected', async ({ bffRequest }) => {
  const response = await bffRequest.post('/api/purchases', {
    data: { purchaseId: 'not-a-uuid', pokemonId: 1, quantity: 1 },
  });
  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: errorCodes.validationError } });
});
