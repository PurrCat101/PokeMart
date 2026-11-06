import { expect, test } from '@playwright/test';
import { testConfig } from '../../index';
import { grafanaIsUp, lokiLines } from '../../support/utils/observability';

// Needs the observability profile: start it with `make observe`. Skipped when Grafana is not reachable.
// Logs reach Loki a few seconds after the request, so every assertion polls instead of checking once.
test.beforeAll(async ({ request }) => {
  test.skip(!(await grafanaIsUp(request)), 'Grafana is not reachable. Start it with: make observe');
});

const poll = { timeout: 45_000, intervals: [2_000, 3_000, 5_000] };

test('OBS-LOG-001 one request ID can be followed from the BFF into the PokéMart API', async ({ request }) => {
  const requestId = `obs-log-${Date.now()}`;
  const response = await request.get(`${testConfig.bffBaseUrl}/api/pokemon?limit=1`, { headers: { 'X-Request-Id': requestId } });
  expect(response.headers()['x-request-id']).toBe(requestId);

  await expect
    .poll(async () => {
      const lines = await lokiLines(request, `{service=~"bff|pokemart-api"} |= "${requestId}"`);
      return [...new Set(lines.map((l) => l.labels.service))].sort();
    }, poll)
    .toEqual(['bff', 'pokemart-api']);
});

test('OBS-LOG-002 request log lines are structured JSON with the fields you search by', async ({ request }) => {
  const requestId = `obs-json-${Date.now()}`;
  await request.get(`${testConfig.bffBaseUrl}/api/pokemon/1`, { headers: { 'X-Request-Id': requestId } });

  await expect
    .poll(async () => (await lokiLines(request, `{service="bff"} |= "${requestId}" |= "statusCode"`)).length, poll)
    .toBeGreaterThan(0);

  const [entry] = await lokiLines(request, `{service="bff"} |= "${requestId}" |= "statusCode"`);
  const log = JSON.parse(entry.line);
  expect(log).toMatchObject({ service: 'bff', severity: 'info', requestId, method: 'GET', route: '/api/pokemon/:id', statusCode: 200 });
  expect(typeof log.durationMs).toBe('number');
  // `level` is a Loki label taken from `severity`; the request ID is deliberately NOT a label.
  expect(entry.labels.level).toBe('info');
  expect(Object.keys(entry.labels)).not.toContain('requestId');
});

test('OBS-LOG-003 signing in never writes the password or the token to any log', async ({ request }) => {
  const requestId = `obs-login-${Date.now()}`;
  const login = await request.post(`${testConfig.bffBaseUrl}/api/auth/login`, {
    headers: { 'X-Request-Id': requestId },
    data: { email: testConfig.auth.email, password: testConfig.auth.password },
  });
  expect(login.status()).toBe(200);
  const { accessToken } = (await login.json()) as { accessToken: string };
  await request.get(`${testConfig.bffBaseUrl}/api/wallet`, { headers: { Authorization: `Bearer ${accessToken}` } });

  // First prove the login itself reached Loki, otherwise "no secrets found" would pass for the wrong reason.
  await expect
    .poll(async () => (await lokiLines(request, `{service=~"bff|pokemart-api"} |= "${requestId}"`)).length, poll)
    .toBeGreaterThan(0);

  const all = await lokiLines(request, '{service=~".+"}');
  expect(all.length).toBeGreaterThan(0);
  const leaked = all.filter(({ line }) => line.includes(testConfig.auth.password) || line.includes(accessToken) || /eyJ[A-Za-z0-9_-]{10,}/.test(line));
  expect(leaked.map((l) => `${l.labels.service}: ${l.line.slice(0, 80)}`)).toEqual([]);
});
