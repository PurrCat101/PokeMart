import http from 'node:http';
import client from 'prom-client';
import mysql from 'mysql2/promise';
import type { ShippingWorker } from './shipping-worker.js';

/**
 * The worker has no HTTP API, so it opens one small port that only serves GET /metrics.
 *
 * Instead of instrumenting every branch of the sweep loop, the gauges are read from the database
 * at scrape time. That answers the questions you actually ask while operating it: how many
 * shipments are waiting, retrying, failed or delivered, and is the worker still alive?
 */
const PROCESSING_STATUSES = ['PENDING', 'PROCESSING', 'RETRY_WAIT', 'LABEL_CREATED', 'FAILED', 'UNKNOWN'] as const;
const DELIVERY_STATUSES = ['WAITING_FOR_SHIPMENT', 'LABEL_CREATED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED'] as const;
const TOP_UP_STATUSES = ['PENDING', 'COMPLETED', 'FAILED', 'UNKNOWN'] as const;

type Counts = Record<string, number>;
interface Snapshot {
  dbUp: 0 | 1;
  processing: Counts;
  delivery: Counts;
  topUps: Counts;
}

const zeroed = (values: readonly string[]): Counts => Object.fromEntries(values.map((v) => [v, 0]));

export function startMetricsServer(worker: ShippingWorker): http.Server {
  const port = Number(process.env.METRICS_PORT ?? 4010);
  const registry = new client.Registry();
  registry.setDefaultLabels({ service: 'shipping-worker' });
  client.collectDefaultMetrics({ register: registry });

  // A tiny dedicated pool so a scrape can never starve the sweep loop of connections.
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST ?? 'localhost',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'pokemart_user',
    password: process.env.MYSQL_PASSWORD ?? 'change_me_for_local_development',
    database: process.env.MYSQL_DATABASE ?? 'pokemart_lab',
    waitForConnections: true,
    connectionLimit: 1,
    // A scrape must answer quickly even when MySQL is down, so Prometheus sees db_up=0
    // instead of a timed-out scrape (its default timeout is 10s).
    connectTimeout: 2000,
    timezone: 'Z',
  });

  async function countBy(table: 'shipments' | 'top_ups', column: string, values: readonly string[]): Promise<Counts> {
    const [rows] = await pool.query<any[]>({
      sql: `SELECT ${column} AS value, COUNT(*) AS total FROM ${table} GROUP BY ${column}`,
      timeout: 2000,
    });
    const counts = zeroed(values);
    for (const row of rows) counts[String(row.value)] = Number(row.total);
    return counts;
  }

  // One database read per scrape, finished before any metric is rendered, so db_up always matches the numbers.
  let snapshot: Snapshot = { dbUp: 0, processing: zeroed(PROCESSING_STATUSES), delivery: zeroed(DELIVERY_STATUSES), topUps: zeroed(TOP_UP_STATUSES) };
  async function refresh(): Promise<void> {
    try {
      const [processing, delivery, topUps] = await Promise.all([
        countBy('shipments', 'processing_status', PROCESSING_STATUSES),
        countBy('shipments', 'delivery_status', DELIVERY_STATUSES),
        countBy('top_ups', 'status', TOP_UP_STATUSES),
      ]);
      snapshot = { dbUp: 1, processing, delivery, topUps };
    } catch {
      // Keep the last known counts but flag that they are stale.
      snapshot = { ...snapshot, dbUp: 0 };
    }
  }

  const fromSnapshot = (name: string, help: string, label: string, pick: (s: Snapshot) => Counts) =>
    new client.Gauge({
      name,
      help,
      labelNames: [label],
      registers: [registry],
      collect() {
        this.reset();
        for (const [value, total] of Object.entries(pick(snapshot))) this.set({ [label]: value }, total);
      },
    });

  fromSnapshot('shipments_by_processing_status', 'Shipments grouped by processing_status (PENDING, RETRY_WAIT and UNKNOWN are waiting to be sent).', 'processing_status', (s) => s.processing);
  fromSnapshot('shipments_by_delivery_status', 'Shipments grouped by delivery_status, as customers see it.', 'delivery_status', (s) => s.delivery);
  fromSnapshot('top_ups_by_status', 'Wallet top-ups grouped by status (UNKNOWN ones are retried by the payment recovery worker).', 'status', (s) => s.topUps);

  new client.Gauge({
    name: 'shipping_worker_running',
    help: '1 while the shipping worker loop is running.',
    registers: [registry],
    collect() { this.set(worker.getHeartbeat().running ? 1 : 0); },
  });

  new client.Gauge({
    name: 'shipping_worker_last_heartbeat_timestamp_seconds',
    help: 'Unix time of the worker last sweep tick. A value that stops moving means the worker is stuck.',
    registers: [registry],
    collect() { this.set(Date.parse(worker.getHeartbeat().lastHeartbeatAt) / 1000); },
  });

  new client.Gauge({
    name: 'shipping_worker_metrics_db_up',
    help: '1 when this scrape could read the database. 0 means the counts above are stale.',
    registers: [registry],
    collect() { this.set(snapshot.dbUp); },
  });

  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/metrics') {
      await refresh();
      res.writeHead(200, { 'Content-Type': registry.contentType });
      res.end(await registry.metrics());
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(port, () => console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: 'shipping-worker', action: 'metrics_listening', port })));
  return server;
}
