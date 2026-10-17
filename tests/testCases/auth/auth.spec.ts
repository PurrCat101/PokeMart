import { expect, test } from '../../support/fixtures/apiFixtures';
import { testConfig } from '../../index';

test('AUTH-001 valid credentials return a bearer token that identifies the user', async ({ request }) => {
  const login = await request.post('/api/auth/login', {
    data: { email: testConfig.auth.email, password: testConfig.auth.password },
  });
  expect(login.status()).toBe(200);
  const loginBody = await login.json();
  expect(loginBody).toMatchObject({
    tokenType: 'Bearer',
    expiresIn: 3600,
    user: {
      userId: 'lab-user-001',
      email: testConfig.auth.email,
      displayName: 'PokéMart Lab User',
    },
  });
  expect(loginBody.accessToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

  const profile = await request.get('/api/auth/me', {
    headers: { Authorization: `Bearer ${loginBody.accessToken}` },
  });
  expect(profile.status()).toBe(200);
  expect(await profile.json()).toEqual({ user: loginBody.user });
});

test('AUTH-002 invalid credentials and missing or invalid tokens are rejected', async ({ request }) => {
  const badLogin = await request.post('/api/auth/login', {
    data: { email: testConfig.auth.email, password: 'incorrect-password' },
  });
  expect(badLogin.status()).toBe(401);
  expect((await badLogin.json()).error.code).toBe('INVALID_CREDENTIALS');

  const missingToken = await request.get('/api/wallet');
  expect(missingToken.status()).toBe(401);
  expect((await missingToken.json()).error.code).toBe('UNAUTHORIZED');

  const invalidToken = await request.get('/api/wallet', {
    headers: { Authorization: 'Bearer invalid.token.value' },
  });
  expect(invalidToken.status()).toBe(401);
  expect((await invalidToken.json()).error.code).toBe('UNAUTHORIZED');
});
