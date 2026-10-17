import mysql, { Pool, PoolOptions } from 'mysql2/promise';
import { testConfig } from '../../../index';

/** Database helper for persistence assertions and explicit test-data cleanup. */
export class MySQLConnection {
  private readonly pool: Pool;

  constructor(options: PoolOptions = testConfig.mysql) {
    if (testConfig.environmentName !== 'test') {
      const required = ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD'];
      const missing = required.filter((key) => !process.env[key]);
      if (missing.length) {
        throw new Error(`Database-backed tests in "${testConfig.environmentName}" require ${missing.join(', ')} to point to a dedicated test database.`);
      }
    }
    this.pool = mysql.createPool(options);
  }

  query<T extends mysql.RowDataPacket[]>(sql: string, values: unknown[] = []) {
    return this.pool.query<T>(sql, values);
  }

  close() {
    return this.pool.end();
  }
}
