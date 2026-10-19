import mysql, { Pool, RowDataPacket } from 'mysql2/promise';

export interface ShippingWorkerOptions {
  pool?: Pool;
  shippingBaseUrl?: string;
  requestTimeoutMs?: number;
  maxAttempts?: number;
  batchSize?: number;
  pollIntervalMs?: number;
  statusSyncIntervalMs?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  workerLeaseSeconds?: number;
  logger?: (fields: Record<string, unknown>) => void;
}

export class ShippingWorker {
  private readonly pool: Pool;
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly maxAttempts: number;
  private readonly batchSize: number;
  private readonly pollIntervalMs: number;
  private readonly statusSyncIntervalMs: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly workerLeaseSeconds: number;
  private readonly log: (fields: Record<string, unknown>) => void;
  private readonly workerId: string;

  private pollTimer: NodeJS.Timeout | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private isProcessingBatch = false;
  private isSyncingStatus = false;
  private isRunning = false;
  private lastHeartbeatAt: Date = new Date();

  constructor(options: ShippingWorkerOptions = {}) {
    this.baseUrl = (options.shippingBaseUrl ?? process.env.SHIPPING_BASE_URL ?? 'http://localhost:3002').replace(/\/$/, '');
    this.requestTimeoutMs = options.requestTimeoutMs ?? Number(process.env.SHIPPING_REQUEST_TIMEOUT_MS ?? 2000);
    this.maxAttempts = options.maxAttempts ?? Number(process.env.SHIPPING_MAX_ATTEMPTS ?? 5);
    this.batchSize = options.batchSize ?? Number(process.env.SHIPPING_BATCH_SIZE ?? 10);
    this.pollIntervalMs = options.pollIntervalMs ?? Number(process.env.SHIPPING_POLL_INTERVAL_MS ?? 60000);
    this.statusSyncIntervalMs = options.statusSyncIntervalMs ?? Number(process.env.SHIPPING_STATUS_SYNC_INTERVAL_MS ?? 15000);
    this.backoffBaseMs = options.backoffBaseMs ?? Number(process.env.SHIPPING_BACKOFF_BASE_MS ?? 500);
    this.backoffMaxMs = options.backoffMaxMs ?? Number(process.env.SHIPPING_BACKOFF_MAX_MS ?? 60000);
    this.workerLeaseSeconds = options.workerLeaseSeconds ?? 30;
    this.workerId = `worker-${Math.random().toString(36).substring(2, 9)}`;

    this.log = options.logger ?? ((fields) => {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'shipping-worker',
        workerId: this.workerId,
        ...fields,
      }));
    });

    if (options.pool) {
      this.pool = options.pool;
    } else {
      this.pool = mysql.createPool({
        host: process.env.MYSQL_HOST ?? 'localhost',
        port: Number(process.env.MYSQL_PORT ?? 3306),
        user: process.env.MYSQL_USER ?? 'pokemart_user',
        password: process.env.MYSQL_PASSWORD ?? 'change_me_for_local_development',
        database: process.env.MYSQL_DATABASE ?? 'pokemart_lab',
        waitForConnections: true,
        connectionLimit: 5,
        timezone: 'Z',
      });
    }
  }

  public getHeartbeat(): { running: boolean; lastHeartbeatAt: string } {
    return {
      running: this.isRunning,
      lastHeartbeatAt: this.lastHeartbeatAt.toISOString(),
    };
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastHeartbeatAt = new Date();
    this.log({ action: 'start', pollIntervalMs: this.pollIntervalMs, syncIntervalMs: this.statusSyncIntervalMs });

    // Run immediately, then start interval loops
    void this.processDueShipments();
    void this.syncDeliveryStatus();

    this.pollTimer = setInterval(() => {
      this.lastHeartbeatAt = new Date();
      void this.processDueShipments();
    }, this.pollIntervalMs);

    this.syncTimer = setInterval(() => {
      this.lastHeartbeatAt = new Date();
      void this.syncDeliveryStatus();
    }, this.statusSyncIntervalMs);
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.log({ action: 'stop' });
  }

  /**
   * Claim eligible rows and process them in a bounded batch.
   * Can also be called directly by tests for deterministic sweep.
   */
  public async processDueShipments(): Promise<number> {
    if (this.isProcessingBatch) return 0;
    this.isProcessingBatch = true;
    this.lastHeartbeatAt = new Date();

    try {
      const claimedPurchases = await this.claimDueShipments();
      if (!claimedPurchases.length) {
        return 0;
      }

      for (const purchaseId of claimedPurchases) {
        await this.processSingleShipment(purchaseId);
      }

      return claimedPurchases.length;
    } catch (err: any) {
      this.log({ action: 'processDueShipments', error: err?.message });
      return 0;
    } finally {
      this.isProcessingBatch = false;
    }
  }

  /**
   * Short transaction to lease eligible rows.
   */
  private async claimDueShipments(): Promise<string[]> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      // Eligible:
      // 1) (status = PENDING or RETRY_WAIT or UNKNOWN) and next_attempt_at <= NOW(3) and (claimed_until IS NULL or claimed_until < NOW(3))
      // 2) or (status = PROCESSING and claimed_until < NOW(3)) -> crash recovery
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT purchase_id
         FROM shipments
         WHERE (
           (processing_status IN ('PENDING', 'RETRY_WAIT', 'UNKNOWN') AND next_attempt_at <= NOW(3) AND (claimed_until IS NULL OR claimed_until < NOW(3)))
           OR (processing_status = 'PROCESSING' AND claimed_until < NOW(3))
         )
         ORDER BY next_attempt_at ASC, created_at ASC
         LIMIT ?
         FOR UPDATE SKIP LOCKED`,
        [this.batchSize]
      );

      const purchaseIds = (rows as Array<{ purchase_id: string }>).map((r) => r.purchase_id);
      if (purchaseIds.length > 0) {
        // Lease them
        const placeholders = purchaseIds.map(() => '?').join(',');
        await conn.query(
          `UPDATE shipments
           SET processing_status = 'PROCESSING',
               claimed_until = DATE_ADD(NOW(3), INTERVAL ? SECOND),
               updated_at = NOW(3)
           WHERE purchase_id IN (${placeholders})`,
          [this.workerLeaseSeconds, ...purchaseIds]
        );
      }

      await conn.commit();
      return purchaseIds;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Process a single shipment outside DB transaction.
   */
  private async processSingleShipment(purchaseId: string): Promise<void> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT s.*, p.pokemon_source_id AS pokemonId, r.name AS pokemonName, p.quantity, u.display_name AS userName
       FROM shipments s
       JOIN purchases p ON p.id = s.purchase_id
       JOIN pokemon_reference r ON r.source_id = p.pokemon_source_id
       JOIN users u ON u.user_id = p.user_id
       WHERE s.purchase_id = ?`,
      [purchaseId]
    );

    if (!rows.length) return;
    const item = rows[0] as any;
    const currentAttempt = Number(item.attempt_count) + 1;

    const requestBody = {
      purchaseId,
      recipient: {
        name: item.userName || 'Lab Trainer',
        address: '1 Test Street',
      },
      items: [
        {
          pokemonId: item.pokemonId,
          pokemonName: item.pokemonName,
          quantity: item.quantity,
        },
      ],
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    const startMs = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/v1/shipments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latencyMs = Date.now() - startMs;

      if (response.status === 202) {
        const data = (await response.json()) as { providerShipmentId: string; status: string; trackingNumber: string };
        await this.pool.query(
          `UPDATE shipments
           SET processing_status = 'LABEL_CREATED',
               delivery_status = 'LABEL_CREATED',
               provider_shipment_id = ?,
               tracking_number = ?,
               attempt_count = ?,
               claimed_until = NULL,
               last_error_code = NULL,
               last_error_message = NULL,
               updated_at = NOW(3)
           WHERE purchase_id = ?`,
          [data.providerShipmentId, data.trackingNumber, currentAttempt, purchaseId]
        );
        this.log({ action: 'shipment_success', purchaseId, currentAttempt, latencyMs });
        return;
      }

      // Check Retry-After for 429
      let retryAfterMs: number | null = null;
      if (response.status === 429) {
        const retryHeader = response.headers.get('retry-after');
        if (retryHeader) {
          const parsedSeconds = Number(retryHeader);
          if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
            retryAfterMs = parsedSeconds * 1000;
          }
        }
      }

      const errorText = await response.text();
      let errorMsg = `HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(errorText);
        if (parsed.error) errorMsg += `: ${parsed.error}`;
      } catch {
        if (errorText) errorMsg += `: ${errorText.substring(0, 100)}`;
      }

      const isClientErrorNonRetryable = response.status >= 400 && response.status < 500 && response.status !== 429;
      if (isClientErrorNonRetryable || currentAttempt >= this.maxAttempts) {
        // Exceeded attempts or non-retryable 4xx
        await this.pool.query(
          `UPDATE shipments
           SET processing_status = 'FAILED',
               attempt_count = ?,
               claimed_until = NULL,
               last_error_code = ?,
               last_error_message = ?,
               updated_at = NOW(3)
           WHERE purchase_id = ?`,
          [currentAttempt, `HTTP_${response.status}`, errorMsg, purchaseId]
        );
        this.log({ action: 'shipment_failed', purchaseId, currentAttempt, status: response.status, errorMsg });
      } else {
        // Retryable
        const delayMs = retryAfterMs ?? this.calculateBackoff(currentAttempt);
        await this.pool.query(
          `UPDATE shipments
           SET processing_status = 'RETRY_WAIT',
               attempt_count = ?,
               next_attempt_at = DATE_ADD(NOW(3), INTERVAL ? MICROSECOND),
               claimed_until = NULL,
               last_error_code = ?,
               last_error_message = ?,
               updated_at = NOW(3)
           WHERE purchase_id = ?`,
          [currentAttempt, delayMs * 1000, `HTTP_${response.status}`, errorMsg, purchaseId]
        );
        this.log({ action: 'shipment_retry_scheduled', purchaseId, currentAttempt, status: response.status });
      }
    } catch (err: any) {
      clearTimeout(timeout);
      const isTimeout = err?.name === 'AbortError' || err?.code === 'ETIMEDOUT';
      const errorCode = isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR';
      const errorMsg = isTimeout ? 'Provider request timed out' : (err?.message ?? 'Network error');

      if (currentAttempt >= this.maxAttempts) {
        await this.pool.query(
          `UPDATE shipments
           SET processing_status = 'FAILED',
               attempt_count = ?,
               claimed_until = NULL,
               last_error_code = ?,
               last_error_message = ?,
               updated_at = NOW(3)
           WHERE purchase_id = ?`,
          [currentAttempt, errorCode, errorMsg, purchaseId]
        );
      } else {
        // For ambiguous timeout, specification says persist UNKNOWN or schedule reconciliation / retry with same key
        const delayMs = this.calculateBackoff(currentAttempt);
        const statusToSet = isTimeout ? 'UNKNOWN' : 'RETRY_WAIT';
        await this.pool.query(
          `UPDATE shipments
           SET processing_status = ?,
               attempt_count = ?,
               next_attempt_at = DATE_ADD(NOW(3), INTERVAL ? MICROSECOND),
               claimed_until = NULL,
               last_error_code = ?,
               last_error_message = ?,
               updated_at = NOW(3)
           WHERE purchase_id = ?`,
          [statusToSet, currentAttempt, delayMs * 1000, errorCode, errorMsg, purchaseId]
        );
      }
      this.log({ action: 'shipment_error', purchaseId, currentAttempt, errorCode, errorMsg });
    }
  }

  /**
   * Exponential backoff with jitter: min(max, base * 2^(attempt-1)) + random jitter
   */
  private calculateBackoff(attempt: number): number {
    const exp = Math.min(this.backoffMaxMs, this.backoffBaseMs * Math.pow(2, Math.max(0, attempt - 1)));
    const jitter = Math.floor(Math.random() * (this.backoffBaseMs / 2));
    return Math.min(this.backoffMaxMs, exp + jitter);
  }

  /**
   * Reconcile delivery status for shipments that have provider_shipment_id.
   * Can also be called directly by tests.
   */
  public async syncDeliveryStatus(purchaseId?: string): Promise<number> {
    if (this.isSyncingStatus) return 0;
    this.isSyncingStatus = true;

    try {
      // Find shipments where provider_shipment_id is present and delivery_status is not terminal (DELIVERED or DELIVERY_FAILED)
      const [rows] = await this.pool.query<RowDataPacket[]>(
        `SELECT purchase_id, provider_shipment_id, delivery_status
         FROM shipments
         WHERE provider_shipment_id IS NOT NULL
           AND delivery_status NOT IN ('DELIVERED', 'DELIVERY_FAILED')
           ${purchaseId === undefined ? '' : 'AND purchase_id = ?'}
         LIMIT ?`,
        purchaseId === undefined ? [this.batchSize] : [purchaseId, this.batchSize]
      );

      const items = rows as Array<{ purchase_id: string; provider_shipment_id: string; delivery_status: string }>;
      let updatedCount = 0;

      for (const item of items) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
        try {
          const res = await fetch(`${this.baseUrl}/v1/shipments/${item.provider_shipment_id}`, {
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (res.ok) {
            const data = (await res.json()) as { status: string };
            if (data.status && data.status !== item.delivery_status) {
              await this.pool.query(
                `UPDATE shipments
                 SET delivery_status = ?, updated_at = NOW(3)
                 WHERE purchase_id = ?`,
                [data.status, item.purchase_id]
              );
              updatedCount += 1;
              this.log({ action: 'delivery_status_synced', purchaseId: item.purchase_id, oldStatus: item.delivery_status, newStatus: data.status });
            }
          }
        } catch (err: any) {
          clearTimeout(timeout);
          // Provider outage leaves last known delivery status intact
          this.log({ action: 'sync_error', providerShipmentId: item.provider_shipment_id, error: err?.message });
        }
      }

      return updatedCount;
    } catch (err: any) {
      this.log({ action: 'syncDeliveryStatus', error: err?.message });
      return 0;
    } finally {
      this.isSyncingStatus = false;
    }
  }

  public async close(): Promise<void> {
    await this.stop();
  }
}
