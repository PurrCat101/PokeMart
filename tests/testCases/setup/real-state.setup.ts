import { test as setup } from '@playwright/test';
import { MySQLConnection } from '../../support/models/MySQL/MySQLConnection';
import { resetRealTestState } from '../../support/utils/resetRealTestState';

setup('reset configured real-test wallet and Pokémon listing to baseline', async () => {
  const database = new MySQLConnection();
  try {
    await resetRealTestState(database);
  } finally {
    await database.close();
  }
});
