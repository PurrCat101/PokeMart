import { RowDataPacket } from 'mysql2';
import { test as setup } from '@playwright/test';
import { testConfig } from '../../index';
import { MySQLConnection } from '../../support/models/MySQL/MySQLConnection';

setup('reset configured real-test wallet and Pokémon listing to baseline', async () => {
  const { userId, pokemonId, walletBalance, pokemonPrice, pokemonStock } = testConfig.environments.real;
  if (![pokemonId, walletBalance, pokemonPrice, pokemonStock].every(Number.isSafeInteger)
    || pokemonId < 1 || walletBalance < 0 || pokemonPrice < 1 || pokemonStock < 1) {
    throw new Error('Real-test baseline requires positive integer Pokémon ID, price, and stock, and a non-negative integer wallet balance.');
  }

  const database = new MySQLConnection();
  try {
    const [walletRows] = await database.query<RowDataPacket[]>(
      'SELECT user_id FROM user_wallet WHERE user_id=?',
      [userId],
    );
    if (walletRows.length !== 1) {
      throw new Error(`Cannot reset real-test baseline: wallet for configured user "${userId}" must already exist.`);
    }

    const [listingRows] = await database.query<RowDataPacket[]>(
      'SELECT pokemon_source_id FROM shop_listing WHERE pokemon_source_id=?',
      [pokemonId],
    );
    if (listingRows.length !== 1) {
      throw new Error(`Cannot reset real-test baseline: listing for configured Pokémon ${pokemonId} must already exist.`);
    }

    await database.query('UPDATE user_wallet SET balance=? WHERE user_id=?', [walletBalance, userId]);
    await database.query(
      'UPDATE shop_listing SET price=?, stock=?, active=TRUE WHERE pokemon_source_id=?',
      [pokemonPrice, pokemonStock, pokemonId],
    );
    await database.query(
      'DELETE FROM user_inventory WHERE user_id=? AND pokemon_source_id=?',
      [userId, pokemonId],
    );
  } finally {
    await database.close();
  }
});
