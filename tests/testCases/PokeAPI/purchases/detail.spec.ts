import { expect, test } from '../../../support/fixtures/apiFixtures';
import { expectPublicError } from '../../../support/utils/expectPublicError';
import { internalHeaders } from '../support';

test('INT-PURCHASE-DETAIL-001 GET purchase detail distinguishes invalid and absent IDs', async ({ request, testEnvironment }) => {
  const requestId = 'tc-pokeapi-purchase-detail';
  const malformed = await request.get('/pokemart/v2/purchases/not-a-uuid', {
    headers: internalHeaders(testEnvironment.userId, requestId),
  });
  await expectPublicError(malformed, {
    status: 400,
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    requestId,
    details: [{ field: 'id', message: 'must be a UUID' }],
  });

  const missing = await request.get('/pokemart/v2/purchases/00000000-0000-4000-8000-000000000099', {
    headers: internalHeaders(testEnvironment.userId, requestId),
  });
  await expectPublicError(missing, {
    status: 404,
    code: 'PURCHASE_NOT_FOUND',
    message: 'Purchase not found',
    requestId,
    details: [],
  });

  const noIdentity = await request.get('/pokemart/v2/purchases/00000000-0000-4000-8000-000000000099', {
    headers: { 'X-Request-Id': requestId },
  });
  await expectPublicError(noIdentity, {
    status: 401,
    code: 'UNAUTHORIZED',
    message: 'A valid bearer token is required',
    requestId,
    details: [],
  });
});
