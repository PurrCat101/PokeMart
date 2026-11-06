import client from 'prom-client';

/**
 * Prometheus metrics for the PokéMart API. One registry per process, scraped from GET /metrics.
 *
 * Label values stay low-cardinality on purpose: `route` is the Express route pattern
 * (for example /pokemart/v1/purchases/:id), never the raw URL, and unmatched paths collapse to one value.
 * Request IDs belong in logs, not in metric labels.
 */
export const registry = new client.Registry();
registry.setDefaultLabels({ service: 'pokemart-api' });
client.collectDefaultMetrics({ register: registry });

const requestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests handled by this service, in seconds.',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export function observeRequest(method: string, route: string | undefined, status: number, seconds: number): void {
  // Scrapes would otherwise measure themselves.
  if (route === '/metrics') return;
  requestDuration.observe({ method, route: route ?? 'unmatched', status: String(status) }, seconds);
}
