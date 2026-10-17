import { expect, test } from '../../support/fixtures/apiFixtures';

test('SYS-API-001 valid X-Request-Id is echoed on success responses', async ({ bffRequest }) => {
  const requestId = 'client_trace-123';
  const response = await bffRequest.get('/api/pokemon', {
    headers: { 'X-Request-Id': requestId },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()['x-request-id']).toBe(requestId);
});

test('SYS-API-002 absent or malformed X-Request-Id is replaced with a valid generated ID', async ({ bffRequest }) => {
  const withoutRequestId = await bffRequest.get('/api/wallet');
  expect(withoutRequestId.status()).toBe(200);
  expect(withoutRequestId.headers()['x-request-id']).toMatch(/^[A-Za-z0-9_-]{1,64}$/);

  const malformed = await bffRequest.get('/api/wallet', {
    headers: { 'X-Request-Id': 'contains spaces' },
  });
  expect(malformed.status()).toBe(200);
  expect(malformed.headers()['x-request-id']).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  expect(malformed.headers()['x-request-id']).not.toBe('contains spaces');
});

test('SYS-API-003 client-supplied X-User-Id cannot override the configured development identity', async ({ bffRequest, testEnvironment }) => {
  const response = await bffRequest.get('/api/wallet', {
    headers: { 'X-User-Id': 'attacker-chosen-user' },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    wallet: { userId: testEnvironment.userId, balance: testEnvironment.walletBalance },
  });
});
