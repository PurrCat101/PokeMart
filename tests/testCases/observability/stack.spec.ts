import { expect, test } from '@playwright/test';
import { testConfig } from '../../index';
import { grafanaIsUp, lokiLines, promQuery } from '../../support/utils/observability';

// Needs the observability profile: start it with `make observe`. Skipped when Grafana is not reachable,
// so a normal `npm test` stays green without it.
test.beforeAll(async ({ request }) => {
  test.skip(!(await grafanaIsUp(request)), 'Grafana is not reachable. Start it with: make observe');
});

test('OBS-STK-001 Grafana has both datasources and they can reach their backends', async ({ request }) => {
  for (const uid of ['prometheus', 'loki']) {
    const response = await request.get(`${testConfig.grafanaBaseUrl}/api/datasources/uid/${uid}/health`);
    expect(response.status(), `${uid} datasource health`).toBe(200);
    expect((await response.json()).status).toBe('OK');
  }
});

test('OBS-STK-002 the overview dashboard is provisioned', async ({ request }) => {
  const response = await request.get(`${testConfig.grafanaBaseUrl}/api/dashboards/uid/pokemart-overview`);
  expect(response.status()).toBe(200);
  const { dashboard } = await response.json();
  expect(dashboard.title).toBe('PokéMart overview');
  expect(dashboard.panels.length).toBeGreaterThan(5);
});

test('OBS-STK-003 Prometheus is scraping the BFF, the API and the worker', async ({ request }) => {
  await expect
    .poll(async () => {
      const up = await promQuery(request, 'up');
      return up.filter((series) => series.value[1] === '1').map((series) => series.metric.job).sort();
    }, { timeout: 45_000, intervals: [2_000, 5_000] })
    .toEqual(['bff', 'pokemart-api', 'shipping-worker']);
});

test('OBS-STK-004 Loki labels logs by service and by level', async ({ request }) => {
  await request.get(`${testConfig.bffBaseUrl}/api/pokemon?limit=1`);
  await expect
    .poll(async () => (await lokiLines(request, '{service="bff", level="info"}')).length, { timeout: 45_000, intervals: [2_000, 5_000] })
    .toBeGreaterThan(0);
});

test('OBS-STK-005 the shipping worker reports whether it can read the database', async ({ request }) => {
  await expect
    .poll(async () => (await promQuery(request, 'shipping_worker_metrics_db_up'))[0]?.value[1], { timeout: 45_000, intervals: [2_000, 5_000] })
    .toBe('1');
});
