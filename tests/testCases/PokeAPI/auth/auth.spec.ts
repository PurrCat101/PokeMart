import { expect, test } from '../../../support/fixtures/apiFixtures';
import { expectPublicError } from '../../../support/utils/expectPublicError';
import { internalHeaders } from '../support';

test('INT-AUTH-001 current-user endpoint accepts a signed access token', async ({ request, testEnvironment }) => {
  const response = await request.get('/pokemart/v1/auth/me', {
    headers: internalHeaders(testEnvironment.userId, 'tc-pokeapi-auth-me'),
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    user: { userId: testEnvironment.userId },
  });
});

test('INT-AUTH-002 current-user endpoint rejects missing and invalid tokens', async ({ request }) => {
  const requestId = 'tc-pokeapi-auth-unauthorized';
  const missing = await request.get('/pokemart/v1/auth/me', {
    headers: { 'X-Request-Id': requestId },
  });
  await expectPublicError(missing, {
    status: 401,
    code: 'UNAUTHORIZED',
    message: 'A valid bearer token is required',
    requestId,
    details: [],
  });

  const invalid = await request.get('/pokemart/v1/auth/me', {
    headers: { 'X-Request-Id': requestId, Authorization: 'Bearer invalid.token.value' },
  });
  await expectPublicError(invalid, {
    status: 401,
    code: 'UNAUTHORIZED',
    message: 'A valid bearer token is required',
    requestId,
    details: [],
  });
});
