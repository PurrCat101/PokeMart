import express, { Request, Response } from 'express';
import { installLogShipper } from './log-shipper.js';

installLogShipper('payment-mock');

type Fault = 'http_500' | 'timeout_before_charge' | 'charged_response_lost' | 'decline';
type Payment = { id: string; status: 'succeeded' | 'canceled'; amount: number; currency: string; key: string; body: string };
const app = express();
const port = Number(process.env.PORT ?? 4004);
const payments = new Map<string, Payment>();
const faults = new Map<string, Fault>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedOrigins = new Set([
  'http://localhost:8081', 'http://127.0.0.1:8081',
  'http://localhost:4003', 'http://127.0.0.1:4003', // web UI
]);
app.use((req, res, next) => {
  const origin = req.header('origin');
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ strict: false }));

// One line per call (health checks skipped), so a failed top-up can be traced to what the provider answered.
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const started = Date.now();
  res.on('finish', () => {
    const severity = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'payment-mock',
      severity,
      action: 'provider_request',
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      fault: res.locals.fault, // the injected fault that produced this answer, if any
      durationMs: Date.now() - started,
    }));
  });
  next();
});
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.post('/v1/payment_intents', async (req: Request, res: Response) => {
  const key = req.header('idempotency-key');
  const body = req.body as Record<string, unknown>;
  if (!key || !uuid.test(key) || !body || typeof body.amount !== 'number' || !Number.isInteger(body.amount) || body.amount < 100 || body.currency !== 'thb' || body.confirm !== true) return res.status(400).json({ error: { type: 'invalid_request_error', code: 'invalid_request' } });
  const canonical = JSON.stringify(body);
  const existing = payments.get(key);
  if (existing) {
    if (existing.body !== canonical) return res.status(400).json({ error: { type: 'idempotency_error', code: 'key_reused_with_different_params' } });
    return res.json({ id: existing.id, object: 'payment_intent', status: existing.status, amount: existing.amount, currency: existing.currency });
  }
  const fault = faults.get(key); faults.delete(key);
  res.locals.fault = fault;
  if (fault === 'http_500') return res.status(500).json({ error: { type: 'api_error', code: 'simulated_error' } });
  if (fault === 'timeout_before_charge') { await new Promise((resolve) => setTimeout(resolve, 6000)); return res.status(504).end(); }
  const payment: Payment = { id: `pi_${key.replaceAll('-', '')}`, status: fault === 'decline' ? 'canceled' : 'succeeded', amount: body.amount, currency: 'thb', key, body: canonical };
  payments.set(key, payment);
  if (fault === 'decline') return res.status(402).json({ error: { type: 'card_error', code: 'card_declined' } });
  if (fault === 'charged_response_lost') return req.socket.destroy();
  return res.json({ id: payment.id, object: 'payment_intent', status: payment.status, amount: payment.amount, currency: payment.currency });
});
app.get('/v1/payment_intents/:id', (req, res) => {
  const payment = [...payments.values()].find((value) => value.id === req.params.id);
  if (!payment) return res.status(404).json({ error: { type: 'invalid_request_error', code: 'resource_missing' } });
  return res.json({ id: payment.id, object: 'payment_intent', status: payment.status, amount: payment.amount, currency: payment.currency });
});
app.put('/__test/faults', (req, res) => {
  const { topUpId, fault } = req.body as Record<string, unknown>;
  if (typeof topUpId !== 'string' || !uuid.test(topUpId) || !['http_500', 'timeout_before_charge', 'charged_response_lost', 'decline'].includes(String(fault))) return res.status(400).json({ error: 'invalid fault' });
  faults.set(topUpId, fault as Fault);
  // A pending fault explains the failure that follows for this top-up, so it is worth a warning in Grafana.
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: 'payment-mock', severity: 'warn', action: 'fault_changed', fault, topUpId }));
  return res.status(204).end();
});
app.delete('/__test/faults', (_req, res) => {
  faults.clear(); payments.clear();
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: 'payment-mock', severity: 'info', action: 'faults_cleared' }));
  res.status(204).end();
});
app.listen(port, () => console.log(JSON.stringify({ service: 'payment-mock', port })));
