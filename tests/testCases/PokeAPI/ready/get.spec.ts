import { expect, test } from '../../../support/fixtures/apiFixtures';

test('INT-READY-001 GET /ready reports initialized MySQL readiness', async ({ request }) => {
  const response = await request.get('/ready');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  expect(response.headers()['x-request-id']).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  expect(await response.json()).toEqual({ status: 'ready', checks: { mysql: 'ok' } });
});
