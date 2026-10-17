import { expect, test } from '../../support/fixtures/apiFixtures';
import { expectPublicError } from '../../support/utils/expectPublicError';

const purchaseId = '00000000-0000-4000-8000-000000000001';

test.beforeEach(async ({ bffRequest }) => {
  const response = await bffRequest.delete('/__admin/requests');
  expect(response.ok()).toBeTruthy();
});

test('WireMock returns the documented exact error bodies for every public error code and endpoint trigger', async ({ bffRequest }) => {
  const cases: Array<{
    scenario: string;
    path: string;
    method: 'GET' | 'POST';
    status: number;
    code: string;
    message: string;
    query?: Record<string, string>;
    body?: unknown;
    contentType?: string;
    details?: Array<{ field: string; message: string }>;
  }> = [
    { scenario: 'validation-error', path: '/api/pokemon', method: 'GET', status: 400, code: 'VALIDATION_ERROR', message: 'Request validation failed', query: { limit: '0' } },
    { scenario: 'unknown-query-parameter', path: '/api/pokemon', method: 'GET', status: 400, code: 'UNKNOWN_QUERY_PARAMETER', message: 'Unknown query parameter', query: { unexpected: 'true' } },
    { scenario: 'invalid-json', path: '/api/purchases', method: 'POST', status: 400, code: 'INVALID_JSON', message: 'Malformed JSON request body', body: Buffer.from('{"purchaseId":'), contentType: 'application/json' },
    { scenario: 'unsupported-media-type', path: '/api/purchases', method: 'POST', status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type must be application/json', body: 'not-json', contentType: 'text/plain' },
    { scenario: 'purchase-non-object', path: '/api/purchases', method: 'POST', status: 400, code: 'VALIDATION_ERROR', message: 'Request validation failed', body: null, details: [{ field: 'body', message: 'must be an object' }] },
    { scenario: 'pokemon-not-found', path: '/api/pokemon/999', method: 'GET', status: 404, code: 'POKEMON_NOT_FOUND', message: 'Pokémon not found' },
    { scenario: 'user-not-found', path: '/api/wallet', method: 'GET', status: 404, code: 'USER_NOT_FOUND', message: 'User not found' },
    { scenario: 'purchase-not-found', path: '/api/purchases/00000000-0000-4000-8000-000000000099', method: 'GET', status: 404, code: 'PURCHASE_NOT_FOUND', message: 'Purchase not found' },
    { scenario: 'purchase-pokemon-not-found', path: '/api/purchases', method: 'POST', status: 404, code: 'POKEMON_NOT_FOUND', message: 'Pokémon not found', body: { purchaseId, pokemonId: 999, quantity: 1 } },
    { scenario: 'pokemon-not-for-sale', path: '/api/purchases', method: 'POST', status: 409, code: 'POKEMON_NOT_FOR_SALE', message: 'Pokémon is not for sale', body: { purchaseId, pokemonId: 1, quantity: 1 } },
    { scenario: 'insufficient-stock', path: '/api/purchases', method: 'POST', status: 409, code: 'INSUFFICIENT_STOCK', message: 'Insufficient stock', body: { purchaseId, pokemonId: 1, quantity: 99 } },
    { scenario: 'insufficient-funds', path: '/api/purchases', method: 'POST', status: 422, code: 'INSUFFICIENT_FUNDS', message: 'Insufficient funds', body: { purchaseId, pokemonId: 1, quantity: 1 } },
    { scenario: 'purchase-duplicate', path: '/api/purchases', method: 'POST', status: 409, code: 'PURCHASE_DUPLICATE', message: 'Purchase ID has already been processed', body: { purchaseId, pokemonId: 1, quantity: 2 } },
    { scenario: 'dependency-unavailable', path: '/api/pokemon', method: 'GET', status: 503, code: 'DEPENDENCY_UNAVAILABLE', message: 'Catalog service is temporarily unavailable' },
    { scenario: 'internal-error', path: '/api/wallet', method: 'GET', status: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  ];

  for (const scenario of cases) {
    const headers = {
      'X-WireMock-Scenario': scenario.scenario,
      ...(scenario.contentType ? { 'Content-Type': scenario.contentType } : {}),
    };
    const options = {
      headers,
      ...(scenario.query ? { params: scenario.query } : {}),
      ...(scenario.body !== undefined ? { data: scenario.body } : {}),
    };
    const response = scenario.method === 'GET'
      ? await bffRequest.get(scenario.path, options)
      : await bffRequest.post(scenario.path, options);

    await expectPublicError(response, {
      status: scenario.status,
      code: scenario.code,
      message: scenario.message,
      requestId: 'wiremock-request',
      details: scenario.details ?? [],
    });
  }
});
