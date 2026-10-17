import { expect, test } from '../../../support/fixtures/apiFixtures';
import { expectPublicError } from '../../../support/utils/expectPublicError';
import { internalHeaders } from '../support';

test('INT-WALLET-001 GET wallet returns the identified user wallet', async ({ request, testEnvironment }) => {
  const response = await request.get('/pokemart/v1/wallet', {
    headers: internalHeaders(testEnvironment.userId, 'tc-pokeapi-wallet'),
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    userId: testEnvironment.userId,
    balance: testEnvironment.walletBalance,
  });
});

test('INT-WALLET-002 GET wallet requires authentication and reports users without wallets', async ({ request }) => {
  const requestId = 'tc-pokeapi-wallet-error';
  const noIdentity = await request.get('/pokemart/v1/wallet', { headers: { 'X-Request-Id': requestId } });
  await expectPublicError(noIdentity, {
    status: 401,
    code: 'UNAUTHORIZED',
    message: 'A valid bearer token is required',
    requestId,
    details: [],
  });

  const unknownUser = await request.get('/pokemart/v1/wallet', {
    headers: internalHeaders('lab-empty-user-001', requestId),
  });
  await expectPublicError(unknownUser, {
    status: 404,
    code: 'USER_NOT_FOUND',
    message: 'User not found',
    requestId,
    details: [],
  });
});
