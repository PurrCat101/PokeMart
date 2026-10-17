import { expect, test } from '../../../support/fixtures/apiFixtures';
import { expectPublicError } from '../../../support/utils/expectPublicError';
import { internalHeaders } from '../support';

test('INT-WALLET-001 GET wallet returns the identified user wallet', async ({ request, testEnvironment }) => {
  const response = await request.get('/pokemart/v2/wallet', {
    headers: internalHeaders(testEnvironment.userId, 'tc-pokeapi-wallet'),
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    userId: testEnvironment.userId,
    balance: testEnvironment.walletBalance,
  });
});

test('INT-WALLET-002 GET wallet requires identity and reports unknown users', async ({ request }) => {
  const requestId = 'tc-pokeapi-wallet-error';
  const noIdentity = await request.get('/pokemart/v2/wallet', { headers: { 'X-Request-Id': requestId } });
  await expectPublicError(noIdentity, {
    status: 400,
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    requestId,
    details: [{ field: 'X-User-Id', message: 'is required and must be valid' }],
  });

  const unknownUser = await request.get('/pokemart/v2/wallet', {
    headers: internalHeaders('pokeapi-user-does-not-exist', requestId),
  });
  await expectPublicError(unknownUser, {
    status: 404,
    code: 'USER_NOT_FOUND',
    message: 'User not found',
    requestId,
    details: [],
  });
});
