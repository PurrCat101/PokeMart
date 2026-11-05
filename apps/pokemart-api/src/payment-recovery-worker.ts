import mysql, { Pool } from 'mysql2/promise';

/** Recover only ambiguous top-ups. The provider id is deterministic in this lab. */
export class PaymentRecoveryWorker {
  private readonly pool: Pool;
  private readonly baseUrl: string;
  private timer: NodeJS.Timeout | undefined;

  constructor() {
    this.baseUrl = (process.env.PAYMENT_BASE_URL ?? 'http://localhost:4004').replace(/\/$/, '');
    this.pool = mysql.createPool({ host: process.env.MYSQL_HOST ?? 'localhost', port: Number(process.env.MYSQL_PORT ?? 3306), user: process.env.MYSQL_USER ?? 'pokemart_user', password: process.env.MYSQL_PASSWORD ?? 'change_me_for_local_development', database: process.env.MYSQL_DATABASE ?? 'pokemart_lab', connectionLimit: 3, timezone: 'Z' });
  }
  async start() {
    // Existing database volumes need migration 005 before payment recovery can run.
    // Do not take down the unrelated shipping worker while that deliberate migration is pending.
    await this.sweep();
    this.timer = setInterval(() => void this.sweep(), Number(process.env.PAYMENT_POLL_INTERVAL_MS ?? 60000));
  }
  async stop() { if (this.timer) clearInterval(this.timer); await this.pool.end(); }
  async sweep() {
    try {
      const [rows] = await this.pool.query<any[]>('SELECT top_up_id FROM top_ups WHERE status="UNKNOWN" AND next_attempt_at <= NOW(3) ORDER BY created_at LIMIT 10');
      for (const row of rows) await this.recover(row.top_up_id);
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      console.warn(JSON.stringify({ service: 'payment-recovery-worker', action: 'sweep_skipped', reason: code === 'ER_NO_SUCH_TABLE' ? 'migration_005_pending' : 'database_unavailable' }));
    }
  }
  private async recover(topUpId: string) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(`${this.baseUrl}/v1/payment_intents/pi_${topUpId.replaceAll('-', '')}`, { signal: controller.signal });
      const payload: any = response.ok ? await response.json() : undefined;
      const connection = await this.pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.query<any[]>('SELECT * FROM top_ups WHERE top_up_id=? FOR UPDATE', [topUpId]); const topUp = rows[0];
        if (!topUp || topUp.status !== 'UNKNOWN') { await connection.commit(); return; }
        if (payload?.status === 'succeeded') {
          await connection.query('UPDATE top_ups SET status="COMPLETED", provider_payment_id=?, last_error_code=NULL, claimed_until=NULL WHERE top_up_id=? AND status="UNKNOWN"', [payload.id, topUpId]);
          await connection.query('UPDATE user_wallet SET balance=balance+? WHERE user_id=?', [topUp.amount_baht, topUp.user_id]);
        } else if (response.status === 404 || payload?.status === 'canceled') {
          await connection.query('UPDATE top_ups SET status="FAILED", last_error_code="provider_not_succeeded", claimed_until=NULL WHERE top_up_id=? AND status="UNKNOWN"', [topUpId]);
        } else {
          await connection.query('UPDATE top_ups SET attempt_count=attempt_count+1, next_attempt_at=DATE_ADD(NOW(3), INTERVAL 60 SECOND), last_error_code="provider_unavailable" WHERE top_up_id=?', [topUpId]);
        }
        await connection.commit();
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    } catch (error) { console.error(JSON.stringify({ service: 'payment-recovery-worker', action: 'recover', topUpId, error: error instanceof Error ? error.message : 'unknown' })); }
    finally { clearTimeout(timer); }
  }
}
