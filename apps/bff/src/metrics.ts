import client from 'prom-client';

/**
 * Prometheus metrics for the BFF. One registry per process, scraped from GET /metrics.
 *
 * Label values stay low-cardinality on purpose: `route` is the Express route pattern
 * (for example /api/purchases/:id), never the raw URL, and unmatched paths collapse to one value.
 * Request IDs belong in logs, not in metric labels.
 */
export const registry = new client.Registry();
registry.setDefaultLabels({ service: 'bff' });
client.collectDefaultMetrics({ register: registry });

const durationBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

const requestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests handled by this service, in seconds.',
  labelNames: ['method', 'route', 'status'],
  buckets: durationBuckets,
  registers: [registry],
});

const upstreamDuration = new client.Histogram({
  name: 'upstream_request_duration_seconds',
  help: 'Duration of calls from the BFF to the PokéMart API, in seconds.',
  labelNames: ['status'],
  buckets: durationBuckets,
  registers: [registry],
});

const upstreamFailures = new client.Counter({
  name: 'upstream_request_failures_total',
  help: 'Calls from the BFF to the PokéMart API that failed or timed out before any response.',
  registers: [registry],
});

export function observeRequest(method: string, route: string | undefined, status: number, seconds: number): void {
  // Scrapes would otherwise measure themselves.
  if (route === '/metrics') return;
  requestDuration.observe({ method, route: route ?? 'unmatched', status: String(status) }, seconds);
}

export function observeUpstream(status: number, seconds: number): void {
  upstreamDuration.observe({ status: String(status) }, seconds);
}

export function countUpstreamFailure(): void {
  upstreamFailures.inc();
}
