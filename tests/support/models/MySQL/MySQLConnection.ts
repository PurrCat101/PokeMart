import mysql, { Pool, PoolOptions } from 'mysql2/promise';
import { testConfig } from '../../../index';

/** Database helper for persistence assertions and explicit test-data cleanup. */
export class MySQLConnection {
  private readonly pool: Pool;

  constructor(options: PoolOptions = testConfig.mysql) {
    this.pool = mysql.createPool(options);
  }

  query<T extends mysql.RowDataPacket[]>(sql: string, values: unknown[] = []) {
    return this.pool.query<T>(sql, values);
  }

  close() {
    return this.pool.end();
  }
}
