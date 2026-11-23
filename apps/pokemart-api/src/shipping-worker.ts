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
  /** How often the loop looks for FAILED shipments that can be revived. */
  recoveryIntervalMs?: number;
  /** A FAILED shipment is only probed again after it has been FAILED for this long. */
  recoveryCooldownMs?: number;
  logger?: (fields: Record<string, unknown>) => void;
}

// Failures caused by the provider or the network, not by the request itself. A shipment that ran out of
// attempts because of one of these is revived automatically once the provider answers again.
// Other 4xx responses mean the request is wrong, so retrying the same payload would never help.
const TRANSIENT_FAILURE_SQL = `(last_error_code IN ('TIMEOUT', 'NETWORK_ERROR', 'HTTP_429', 'HTTP_408') OR last_error_code REGEXP '^HTTP_5[0-9][0-9]$')`;

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
  private readonly recoveryIntervalMs: number;
  private readonly recoveryCooldownMs: number;
  private readonly log: (fields: Record<string, unknown>) => void;
  private readonly workerId: string;

  private pollTimer: NodeJS.Timeout | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private recoveryTimer: NodeJS.Timeout | null = null;
  private isProcessingBatch = false;
  private isSyncingStatus = false;
  private isRecovering = false;
  private isRunning = false;
  private lastHeartbeatAt: Date = new Date();

  constructor(options: ShippingWorkerOptions = {}) {
    this.baseUrl = (options.shippingBaseUrl ?? process.env.SHIPPING_BASE_URL ?? 'http://localhost:4002').replace(/\/$/, '');
    this.requestTimeoutMs = options.requestTimeoutMs ?? Number(process.env.SHIPPING_REQUEST_TIMEOUT_MS ?? 2000);
    this.maxAttempts = options.maxAttempts ?? Number(process.env.SHIPPING_MAX_ATTEMPTS ?? 5);
    this.batchSize = options.batchSize ?? Number(process.env.SHIPPING_BATCH_SIZE ?? 10);
    this.pollIntervalMs = options.pollIntervalMs ?? Number(process.env.SHIPPING_POLL_INTERVAL_MS ?? 60000);
    this.statusSyncIntervalMs = options.statusSyncIntervalMs ?? Number(process.env.SHIPPING_STATUS_SYNC_INTERVAL_MS ?? 15000);
    this.backoffBaseMs = options.backoffBaseMs ?? Number(process.env.SHIPPING_BACKOFF_BASE_MS ?? 500);
    this.backoffMaxMs = options.backoffMaxMs ?? Number(process.env.SHIPPING_BACKOFF_MAX_MS ?? 60000);
    this.workerLeaseSeconds = options.workerLeaseSeconds ?? 30;
    this.recoveryIntervalMs = options.recoveryIntervalMs ?? Number(process.env.SHIPPING_RECOVERY_INTERVAL_MS ?? 60000);
    this.recoveryCooldownMs = options.recoveryCooldownMs ?? Number(process.env.SHIPPING_RECOVERY_COOLDOWN_MS ?? 60000);
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
    void this.recoverFailedShipments();

    this.pollTimer = setInterval(() => {
      this.lastHeartbeatAt = new Date();
      void this.processDueShipments();
    }, this.pollIntervalMs);

    this.syncTimer = setInterval(() => {
      this.lastHeartbeatAt = new Date();
      void this.syncDeliveryStatus();
    }, this.statusSyncIntervalMs);

    this.recoveryTimer = setInterval(() => {
      this.lastHeartbeatAt = new Date();
      void this.recoverFailedShipments();
    }, this.recoveryIntervalMs);
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
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = null;
    }
    this.log({ action: 'stop' });
  }

  /**
   * Revive shipments that ran out of attempts only because the provider was unreachable.
   *
   * A FAILED row is not picked up by processDueShipments, so a provider outage longer than
   * maxAttempts sweeps would otherwise strand every shipment queued during it for good.
   *
   * 1. Canary: put the single oldest transient FAILED row back with one attempt left and send it.
   *    If the provider is still down it goes straight back to FAILED, so a dead provider costs one
   *    request per cooldown no matter how many shipments are stranded.
   * 2. Drain: once the canary gets a label, put the rest back with fresh attempts and send them in
   *    bounded batches, stopping at the first batch that does not fully succeed.
   *
   * Returns how many shipments received a label. Tests call this directly.
   */
  public async recoverFailedShipments(): Promise<number> {
    if (this.isRecovering) return 0;
    this.isRecovering = true;
    this.lastHeartbeatAt = new Date();

    try {
      const canary = await this.requeueFailedShipments(1, Math.max(0, this.maxAttempts - 1), this.recoveryCooldownMs);
      if (!canary.length) return 0;

      await this.processDueShipments();
      let recovered = await this.countLabelled(canary);
      if (recovered === 0) {
        this.log({ severity: 'warn', action: 'recovery_probe_failed', purchaseId: canary[0] });
        return 0;
      }
      this.log({ action: 'recovery_provider_back', purchaseId: canary[0] });

      // Bounded so one sweep can never loop forever; whatever is left is picked up on the next tick.
      for (let round = 0; round < 20; round++) {
        const batch = await this.requeueFailedShipments(this.batchSize, 0, 0);
        if (!batch.length) break;
        await this.processDueShipments();
        const labelled = await this.countLabelled(batch);
        recovered += labelled;
        if (labelled < batch.length) break;
      }

      this.log({ action: 'recovery_done', recovered });
      return recovered;
    } catch (err: any) {
      this.log({ severity: 'error', action: 'recoverFailedShipments', error: err?.message });
      return 0;
    } finally {
      this.isRecovering = false;
    }
  }

  private async requeueFailedShipments(limit: number, attemptCount: number, cooldownMs: number): Promise<string[]> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT purchase_id
         FROM shipments
         WHERE processing_status = 'FAILED'
           AND provider_shipment_id IS NULL
           AND ${TRANSIENT_FAILURE_SQL}
           AND updated_at <= DATE_SUB(NOW(3), INTERVAL ? MICROSECOND)
         ORDER BY updated_at ASC
         LIMIT ?
         FOR UPDATE SKIP LOCKED`,
        [cooldownMs * 1000, limit]
      );
      const purchaseIds = (rows as Array<{ purchase_id: string }>).map((r) => r.purchase_id);
      if (purchaseIds.length > 0) {
        const placeholders = purchaseIds.map(() => '?').join(',');
        await conn.query(
          `UPDATE shipments
           SET processing_status = 'RETRY_WAIT',
               attempt_count = ?,
               next_attempt_at = NOW(3),
               claimed_until = NULL,
               updated_at = NOW(3)
           WHERE purchase_id IN (${placeholders})`,
          [attemptCount, ...purchaseIds]
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

  private async countLabelled(purchaseIds: string[]): Promise<number> {
    if (!purchaseIds.length) return 0;
    const placeholders = purchaseIds.map(() => '?').join(',');
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM shipments WHERE processing_status = 'LABEL_CREATED' AND purchase_id IN (${placeholders})`,
      purchaseIds
    );
    return Number((rows[0] as { total: number }).total);
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
      this.log({ severity: 'error', action: 'processDueShipments', error: err?.message });
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
    // One order holds either a Pokémon or an item; exactly one of the two LEFT JOINs matches.
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT s.*, p.kind, COALESCE(p.pokemon_source_id, p.item_source_id) AS productId,
              COALESCE(pr.name, ir.name) AS productName, p.quantity, u.display_name AS userName
       FROM shipments s
       JOIN purchases p ON p.id = s.purchase_id
       LEFT JOIN pokemon_reference pr ON pr.source_id = p.pokemon_source_id
       LEFT JOIN item_reference ir ON ir.source_id = p.item_source_id
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
        item.kind === 'POKEMON'
          ? { pokemonId: item.productId, pokemonName: item.productName, quantity: item.quantity }
          : { itemId: item.productId, itemName: item.productName, quantity: item.quantity },
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

      const isClientErrorNonRetryable = response.status >= 400 && response.status < 500 && response.status !== 429 && response.status !== 408;
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
        this.log({ severity: 'error', action: 'shipment_failed', purchaseId, currentAttempt, status: response.status, reason: errorMsg });
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
        this.log({ severity: 'warn', action: 'shipment_retry_scheduled', purchaseId, currentAttempt, status: response.status, reason: errorMsg, retryInMs: delayMs });
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
      this.log({ severity: 'error', action: 'shipment_error', purchaseId, currentAttempt, errorCode, errorMsg });
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
      let updatedCount = 0;
      // Find shipments where provider_shipment_id is present and delivery_status is not terminal (DELIVERED or DELIVERY_FAILED)
      const [rows] = await this.pool.query<RowDataPacket[]>(
        `SELECT purchase_id, provider_shipment_id, delivery_status
         FROM shipments
         WHERE provider_shipment_id IS NOT NULL
           AND delivery_status NOT IN ('DELIVERED', 'DELIVERY_FAILED')
           ${purchaseId === undefined ? '' : 'AND purchase_id = ?'}
         ORDER BY updated_at ASC
         LIMIT ?`,
        purchaseId === undefined ? [this.batchSize] : [purchaseId, this.batchSize]
      );

      const items = rows as Array<{ purchase_id: string; provider_shipment_id: string; delivery_status: string }>;

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
              continue;
            }
          }
        } catch (err: any) {
          clearTimeout(timeout);
          // Provider outage leaves last known delivery status intact
          this.log({ severity: 'warn', action: 'sync_error', providerShipmentId: item.provider_shipment_id, error: err?.message });
        }
        // Checked but unchanged (or unreachable): move it to the back of the line. Without this the same
        // first `batchSize` shipments are polled on every tick and the ones behind them are never synced.
        await this.pool.query('UPDATE shipments SET updated_at = NOW(3) WHERE purchase_id = ?', [item.purchase_id]);
      }

      return updatedCount;
    } catch (err: any) {
      this.log({ severity: 'error', action: 'syncDeliveryStatus', error: err?.message });
      return 0;
    } finally {
      this.isSyncingStatus = false;
    }
  }

  public async close(): Promise<void> {
    await this.stop();
  }
}
