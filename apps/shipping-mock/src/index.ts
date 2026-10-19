import crypto from 'node:crypto';
import express, { Request, Response } from 'express';

const port = Number(process.env.PORT ?? 3002);
const app = express();

export type MockMode =
  | 'success'
  | 'http-500'
  | 'rate-limit'
  | 'timeout-before-accept'
  | 'ambiguous-timeout'
  | 'unavailable';

export type DeliveryStatus =
  | 'LABEL_CREATED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'DELIVERY_FAILED';

export interface ProviderShipment {
  providerShipmentId: string;
  purchaseId: string;
  status: DeliveryStatus;
  trackingNumber: string;
}

export interface JournalRequest {
  timestamp: string;
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  idempotencyKey?: string;
}

let currentMode: MockMode = 'success';
const requestJournal: JournalRequest[] = [];
const shipmentsByProviderId = new Map<string, ProviderShipment>();
const shipmentsByPurchaseId = new Map<string, ProviderShipment>();

const validTransitions: Record<DeliveryStatus, DeliveryStatus[]> = {
  LABEL_CREATED: ['IN_TRANSIT'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'DELIVERY_FAILED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'DELIVERY_FAILED'],
  DELIVERED: [],
  DELIVERY_FAILED: [],
};

const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

app.use(express.json());

// CORS support for Swagger UI
app.use((req, res, next) => {
  const origin = req.header('origin');
  if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Log into test journal
app.use((req, _res, next) => {
  if (!req.path.startsWith('/v1/admin')) {
    requestJournal.push({
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      headers: req.headers,
      body: req.body,
    });
  }
  next();
});

// GET /health
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// POST /v1/shipments
app.post('/v1/shipments', async (req: Request, res: Response) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || !body.purchaseId || !body.recipient || !body.items) {
    res.status(400).json({ error: 'Invalid request body. Required fields: purchaseId, recipient, items' });
    return;
  }

  if (typeof body.purchaseId !== 'string' || !validUuid.test(body.purchaseId)) {
    res.status(400).json({ error: 'purchaseId must be a valid UUID' });
    return;
  }

  // Handle deterministic modes
  switch (currentMode) {
    case 'http-500':
      res.status(500).json({ error: 'Simulated internal server error' });
      return;
    case 'unavailable':
      res.status(503).json({ error: 'Simulated service unavailable' });
      return;
    case 'rate-limit':
      res.setHeader('Retry-After', '2');
      res.status(429).json({ error: 'Rate limit exceeded' });
      return;
    case 'timeout-before-accept':
      // Delay longer than default timeout (e.g. 5000ms) without creating shipment
      await new Promise((resolve) => setTimeout(resolve, 6000));
      res.status(504).json({ error: 'Gateway timeout' });
      return;
    case 'ambiguous-timeout': {
      // Create shipment first, then delay
      let existing = shipmentsByPurchaseId.get(body.purchaseId);
      if (!existing) {
        const providerShipmentId = `prov-${crypto.randomUUID()}`;
        const trackingNumber = `TRK-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        existing = {
          providerShipmentId,
          purchaseId: body.purchaseId,
          status: 'LABEL_CREATED',
          trackingNumber,
        };
        shipmentsByProviderId.set(providerShipmentId, existing);
        shipmentsByPurchaseId.set(body.purchaseId, existing);
      }
      // Delay response past caller's timeout
      await new Promise((resolve) => setTimeout(resolve, 6000));
      res.status(202).json({
        providerShipmentId: existing.providerShipmentId,
        status: existing.status,
        trackingNumber: existing.trackingNumber,
      });
      return;
    }
    case 'success':
    default: {
      let existing = shipmentsByPurchaseId.get(body.purchaseId);
      if (!existing) {
        const providerShipmentId = `prov-${crypto.randomUUID()}`;
        const trackingNumber = `TRK-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        existing = {
          providerShipmentId,
          purchaseId: body.purchaseId,
          status: 'LABEL_CREATED',
          trackingNumber,
        };
        shipmentsByProviderId.set(providerShipmentId, existing);
        shipmentsByPurchaseId.set(body.purchaseId, existing);
      }
      res.status(202).json({
        providerShipmentId: existing.providerShipmentId,
        status: existing.status,
        trackingNumber: existing.trackingNumber,
      });
      return;
    }
  }
});

// GET /v1/shipments/:providerShipmentId
app.get('/v1/shipments/:providerShipmentId', (req: Request, res: Response) => {
  const { providerShipmentId } = req.params;
  const shipment = shipmentsByProviderId.get(providerShipmentId);
  if (!shipment) {
    res.status(404).json({ error: 'Shipment not found' });
    return;
  }
  res.json(shipment);
});

// PUT /v1/admin/mode (local/test only)
app.put('/v1/admin/mode', (req: Request, res: Response) => {
  const mode = req.body?.mode as MockMode;
  const allowedModes: MockMode[] = [
    'success',
    'http-500',
    'rate-limit',
    'timeout-before-accept',
    'ambiguous-timeout',
    'unavailable',
  ];
  if (!allowedModes.includes(mode)) {
    res.status(400).json({ error: `Unknown mode: ${mode}` });
    return;
  }
  currentMode = mode;
  res.json({ mode: currentMode });
});

// PATCH /v1/admin/shipments/:providerShipmentId/status (local/test only)
app.patch('/v1/admin/shipments/:providerShipmentId/status', (req: Request, res: Response) => {
  const { providerShipmentId } = req.params;
  const newStatus = req.body?.status as DeliveryStatus;
  const allowedStatuses: DeliveryStatus[] = [
    'LABEL_CREATED',
    'IN_TRANSIT',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'DELIVERY_FAILED',
  ];
  if (!allowedStatuses.includes(newStatus)) {
    res.status(400).json({ error: `Invalid status: ${newStatus}` });
    return;
  }

  const shipment = shipmentsByProviderId.get(providerShipmentId);
  if (!shipment) {
    res.status(404).json({ error: 'Provider shipment not found' });
    return;
  }

  // Validate forward transition
  if (shipment.status !== newStatus) {
    const allowedNext = validTransitions[shipment.status] || [];
    if (!allowedNext.includes(newStatus)) {
      res.status(400).json({
        error: `Invalid status transition from ${shipment.status} to ${newStatus}`,
      });
      return;
    }
  }

  shipment.status = newStatus;
  res.json(shipment);
});

// POST /v1/admin/shipments/by-purchase-id/:purchaseId/status (local/test only - convenience endpoint)
app.post('/v1/admin/shipments/by-purchase-id/:purchaseId/status', (req: Request, res: Response) => {
  const { purchaseId } = req.params;
  const newStatus = req.body?.status as DeliveryStatus;
  const allowedStatuses: DeliveryStatus[] = [
    'LABEL_CREATED',
    'IN_TRANSIT',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'DELIVERY_FAILED',
  ];
  if (!allowedStatuses.includes(newStatus)) {
    res.status(400).json({ error: `Invalid status: ${newStatus}` });
    return;
  }

  const shipment = shipmentsByPurchaseId.get(purchaseId);
  if (!shipment) {
    res.status(404).json({ error: 'Shipment not found for this purchase ID' });
    return;
  }

  // Validate forward transition
  if (shipment.status !== newStatus) {
    const allowedNext = validTransitions[shipment.status] || [];
    if (!allowedNext.includes(newStatus)) {
      res.status(400).json({
        error: `Invalid status transition from ${shipment.status} to ${newStatus}`,
      });
      return;
    }
  }

  shipment.status = newStatus;
  res.json(shipment);
});

// GET /v1/admin/requests (local/test only)
app.get('/v1/admin/requests', (_req: Request, res: Response) => {
  res.json(requestJournal);
});

// POST /v1/admin/reset (local/test only)
app.post('/v1/admin/reset', (_req: Request, res: Response) => {
  currentMode = 'success';
  requestJournal.length = 0;
  shipmentsByProviderId.clear();
  shipmentsByPurchaseId.clear();
  res.json({ status: 'reset' });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`[shipping-mock] listening on port ${port}`);
  });
}

export { app };
