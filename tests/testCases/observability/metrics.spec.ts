import { expect, test } from '@playwright/test';
import { testConfig } from '../../index';

// These tests read GET /metrics straight from the services, so they do not need Grafana or Prometheus.

async function metricsOf(request: import('@playwright/test').APIRequestContext, baseUrl: string): Promise<string> {
  const response = await request.get(`${baseUrl}/metrics`);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/plain');
  return response.text();
}

test('OBS-MET-001 BFF /metrics counts requests under the route pattern, never the raw URL', async ({ request }) => {
  await request.get(`${testConfig.bffBaseUrl}/api/pokemon/1`);
  await request.get(`${testConfig.bffBaseUrl}/api/pokemon/99999`);

  const text = await metricsOf(request, testConfig.bffBaseUrl);
  expect(text).toMatch(/http_request_duration_seconds_count\{[^}]*route="\/api\/pokemon\/:id"[^}]*status="200"/);
  expect(text).toMatch(/http_request_duration_seconds_count\{[^}]*route="\/api\/pokemon\/:id"[^}]*status="404"/);
  // One time series per pattern keeps cardinality bounded. A raw ID in a label would create one per ID.
  expect(text).not.toContain('route="/api/pokemon/99999"');
});

test('OBS-MET-002 paths that match no route collapse into one "unmatched" label', async ({ request }) => {
  await request.get(`${testConfig.bffBaseUrl}/api/this-route-does-not-exist-1`);
  await request.get(`${testConfig.bffBaseUrl}/api/this-route-does-not-exist-2`);

  const text = await metricsOf(request, testConfig.bffBaseUrl);
  expect(text).toMatch(/http_request_duration_seconds_count\{[^}]*route="unmatched"[^}]*status="404"/);
  expect(text).not.toContain('this-route-does-not-exist');
});

test('OBS-MET-003 a scrape does not count itself', async ({ request }) => {
  await metricsOf(request, testConfig.bffBaseUrl);
  const text = await metricsOf(request, testConfig.bffBaseUrl);
  expect(text).not.toContain('route="/metrics"');
});

test('OBS-MET-004 the BFF measures its calls to the PokéMart API', async ({ request }) => {
  await request.get(`${testConfig.bffBaseUrl}/api/pokemon?limit=1`);
  const text = await metricsOf(request, testConfig.bffBaseUrl);
  expect(text).toMatch(/upstream_request_duration_seconds_count\{[^}]*status="200"/);
  expect(text).toContain('upstream_request_failures_total');
});

test('OBS-MET-005 PokéMart API /metrics uses route patterns too', async ({ request }) => {
  await request.get(`${testConfig.pokemartApiBaseUrl}/pokemart/v1/catalog/pokemon/1`);
  const text = await metricsOf(request, testConfig.pokemartApiBaseUrl);
  expect(text).toMatch(/http_request_duration_seconds_count\{[^}]*route="\/pokemart\/v1\/catalog\/pokemon\/:id"/);
  expect(text).not.toContain('route="/pokemart/v1/catalog/pokemon/1"');
});
