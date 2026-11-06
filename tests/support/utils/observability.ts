import type { APIRequestContext } from '@playwright/test';
import { testConfig } from '../../index';

/**
 * Helpers for the observability tests. Grafana is the single door: its datasource proxy lets a test
 * query Loki (logs) and Prometheus (metrics) without publishing their own ports.
 */
export async function grafanaIsUp(request: APIRequestContext): Promise<boolean> {
  try {
    const response = await request.get(`${testConfig.grafanaBaseUrl}/api/health`, { timeout: 3000 });
    return response.ok();
  } catch {
    return false;
  }
}

export interface LogLine {
  labels: Record<string, string>;
  line: string;
}

/** Runs a LogQL range query over the last `minutes` minutes. Log lines reach Loki a few seconds late, so poll. */
export async function lokiLines(request: APIRequestContext, logql: string, minutes = 10): Promise<LogLine[]> {
  const now = Date.now();
  const response = await request.get(`${testConfig.grafanaBaseUrl}/api/datasources/proxy/uid/loki/loki/api/v1/query_range`, {
    params: {
      query: logql,
      start: String((now - minutes * 60_000) * 1_000_000),
      end: String((now + 60_000) * 1_000_000),
      limit: '500',
    },
  });
  if (!response.ok()) throw new Error(`Loki query failed with HTTP ${response.status()}: ${await response.text()}`);
  const body = (await response.json()) as { data: { result: Array<{ stream: Record<string, string>; values: Array<[string, string]> }> } };
  return body.data.result.flatMap((stream) => stream.values.map(([, line]) => ({ labels: stream.stream, line })));
}

/** Runs an instant PromQL query and returns the raw result vector. */
export async function promQuery(request: APIRequestContext, query: string) {
  const response = await request.get(`${testConfig.grafanaBaseUrl}/api/datasources/proxy/uid/prometheus/api/v1/query`, {
    params: { query },
  });
  if (!response.ok()) throw new Error(`Prometheus query failed with HTTP ${response.status()}: ${await response.text()}`);
  const body = (await response.json()) as { data: { result: Array<{ metric: Record<string, string>; value: [number, string] }> } };
  return body.data.result;
}
