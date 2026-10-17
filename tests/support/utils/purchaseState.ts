import { RowDataPacket } from 'mysql2';
import { MySQLConnection } from '../models/MySQL/MySQLConnection';

export type PurchaseStateSnapshot = {
  walletBalance: number;
  stock: number;
  inventoryQuantity: number | null;
};

export async function snapshotPurchaseState(
  database: MySQLConnection,
  userId: string,
  pokemonId: number,
): Promise<PurchaseStateSnapshot> {
  const [walletRows] = await database.query<RowDataPacket[]>('SELECT balance FROM user_wallet WHERE user_id=?', [userId]);
  const [listingRows] = await database.query<RowDataPacket[]>('SELECT stock FROM shop_listing WHERE pokemon_source_id=?', [pokemonId]);
  const [inventoryRows] = await database.query<RowDataPacket[]>('SELECT quantity FROM user_inventory WHERE user_id=? AND pokemon_source_id=?', [userId, pokemonId]);
  if (walletRows.length !== 1 || listingRows.length !== 1) {
    throw new Error(`Cannot snapshot purchase state for user "${userId}" and Pokémon ${pokemonId}.`);
  }
  return {
    walletBalance: Number(walletRows[0].balance),
    stock: Number(listingRows[0].stock),
    inventoryQuantity: inventoryRows.length ? Number(inventoryRows[0].quantity) : null,
  };
}

export async function restorePurchaseState(
  database: MySQLConnection,
  userId: string,
  pokemonId: number,
  snapshot: PurchaseStateSnapshot,
): Promise<void> {
  await database.query('UPDATE user_wallet SET balance=? WHERE user_id=?', [snapshot.walletBalance, userId]);
  await database.query('UPDATE shop_listing SET stock=? WHERE pokemon_source_id=?', [snapshot.stock, pokemonId]);
  if (snapshot.inventoryQuantity === null) {
    await database.query('DELETE FROM user_inventory WHERE user_id=? AND pokemon_source_id=?', [userId, pokemonId]);
  } else {
    await database.query('UPDATE user_inventory SET quantity=? WHERE user_id=? AND pokemon_source_id=?', [snapshot.inventoryQuantity, userId, pokemonId]);
  }
}
