import { errorCodes } from '../../resources/expectedResults/commonResponses.spec';
import { expect, test } from '../../support/fixtures/apiFixtures';

test('mocked purchase rejects a missing purchaseId', async ({ bffRequest, testEnvironment }) => {
  const response = await bffRequest.post('/api/purchases', {
    data: { pokemonId: testEnvironment.pokemonId, quantity: 1 },
    headers: testEnvironment.scenarioHeaders('validation-error'),
  });
  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: errorCodes.validationError } });
});

test('mocked purchase rejects a malformed purchaseId', async ({ bffRequest, testEnvironment }) => {
  const response = await bffRequest.post('/api/purchases', {
    data: { purchaseId: 'not-a-uuid', pokemonId: testEnvironment.pokemonId, quantity: 1 },
    headers: testEnvironment.scenarioHeaders('validation-error'),
  });
  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: errorCodes.validationError } });
});

test('mocked purchase requires a JSON request body', async ({ bffRequest, testEnvironment }) => {
  const response = await bffRequest.post('/api/purchases', {
    data: 'not-json',
    headers: {
      'Content-Type': 'text/plain',
      ...testEnvironment.scenarioHeaders('unsupported-media-type'),
    },
  });
  expect(response.status()).toBe(415);
  expect(await response.json()).toMatchObject({ error: { code: 'UNSUPPORTED_MEDIA_TYPE' } });
});
