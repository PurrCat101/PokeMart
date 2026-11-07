import { APIRequestContext } from '@playwright/test';
import { testConfig } from '../../index';
import { KycScenario, kycUsers } from '../data/kycUsers';
import { MySQLConnection } from '../models/MySQL/MySQLConnection';

/** Catalog rows the KYC scenarios buy from. Prices and stock are reset before every test. */
export const kycCatalog = {
  pokemonId: 1,
  /** Ordinary item (level 1): potion. */
  itemId: 17,
  /** Master-tier item (level 2): master-ball. */
  masterItemId: 1,
  itemPrice: 100,
  itemStock: 50,
  walletBalance: 100_000,
} as const;

/** Set one account's KYC record on the KYC service. Test-only route, never exposed through the BFF. */
export async function setKycRecord(request: APIRequestContext, scenario: KycScenario): Promise<void> {
  const user = kycUsers[scenario];
  const response = await request.put(`${testConfig.kycBaseUrl}/__test/users/${user.userId}`, {
    data: { level: user.level, status: user.status },
  });
  if (!response.ok()) throw new Error(`Could not set the KYC record for ${user.userId}: HTTP ${response.status()}`);
}

/** Approve or reject a pending account the way a reviewer would. */
export async function decideKyc(request: APIRequestContext, scenario: KycScenario, decision: { level: 0 | 1 | 2; status: 'ACTIVE' | 'REJECTED' }): Promise<void> {
  const response = await request.put(`${testConfig.kycBaseUrl}/__test/users/${kycUsers[scenario].userId}`, { data: decision });
  if (!response.ok()) throw new Error(`Could not record the KYC decision: HTTP ${response.status()}`);
}

export async function injectKycFault(request: APIRequestContext, mode: 'http_500' | 'timeout'): Promise<void> {
  const response = await request.put(`${testConfig.kycBaseUrl}/__test/faults`, { data: { mode } });
  if (response.status() !== 204) throw new Error(`Could not inject the KYC fault: HTTP ${response.status()}`);
}

/** Clears faults and resets the KYC service to its seed data. */
export async function clearKycFaults(request: APIRequestContext): Promise<void> {
  const response = await request.delete(`${testConfig.kycBaseUrl}/__test/faults`);
  if (response.status() !== 204) throw new Error(`Could not clear the KYC faults: HTTP ${response.status()}`);
}

/** Restore one scenario account's wallet and holdings, and the shared catalog rows it buys from. */
export async function resetKycScenarioData(database: MySQLConnection, scenario: KycScenario): Promise<void> {
  const { userId } = kycUsers[scenario];
  const [owner] = await database.query<import('mysql2').RowDataPacket[]>('SELECT user_id FROM users WHERE user_id=?', [userId]);
  if (owner.length !== 1) {
    throw new Error(`Account "${userId}" is missing. Apply the seed changesets (make db-migrate) to create the lab-kyc-* accounts.`);
  }
  await database.query('UPDATE user_wallet SET balance=? WHERE user_id=?', [kycCatalog.walletBalance, userId]);
  await database.query('DELETE FROM user_inventory WHERE user_id=?', [userId]);
  await database.query(
    'UPDATE listings SET price=?, stock=?, active=TRUE WHERE item_source_id IN (?, ?)',
    [kycCatalog.itemPrice, kycCatalog.itemStock, kycCatalog.itemId, kycCatalog.masterItemId],
  );
}

export async function walletBalance(database: MySQLConnection, scenario: KycScenario): Promise<number> {
  const [rows] = await database.query<import('mysql2').RowDataPacket[]>('SELECT balance FROM user_wallet WHERE user_id=?', [kycUsers[scenario].userId]);
  return Number(rows[0].balance);
}

export async function itemStock(database: MySQLConnection, itemId: number): Promise<number> {
  const [rows] = await database.query<import('mysql2').RowDataPacket[]>('SELECT stock FROM listings WHERE item_source_id=?', [itemId]);
  return Number(rows[0].stock);
}

export async function holdsItem(database: MySQLConnection, scenario: KycScenario, itemId: number): Promise<number> {
  const [rows] = await database.query<import('mysql2').RowDataPacket[]>('SELECT quantity FROM user_inventory WHERE user_id=? AND item_source_id=?', [kycUsers[scenario].userId, itemId]);
  return rows.length ? Number(rows[0].quantity) : 0;
}

export async function holdsPokemon(database: MySQLConnection, scenario: KycScenario, pokemonId: number): Promise<number> {
  const [rows] = await database.query<import('mysql2').RowDataPacket[]>('SELECT quantity FROM user_inventory WHERE user_id=? AND pokemon_source_id=?', [kycUsers[scenario].userId, pokemonId]);
  return rows.length ? Number(rows[0].quantity) : 0;
}
