import { expect, test } from '../../../support/fixtures/apiFixtures';

test('INT-HEALTH-001 GET /health reports process liveness without caller headers', async ({ request }) => {
  const response = await request.get('/health');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  expect(response.headers()['x-request-id']).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  expect(await response.json()).toEqual({ status: 'ok' });
});
