import { expect, test } from '../../support/fixtures/apiFixtures';
import { BffService } from '../../support/services/bffService';

test('@e2e browse catalog through the real BFF', async ({ bffRequest }) => {
  const bff = new BffService(bffRequest);
  const [catalog, wallet] = await Promise.all([bff.getCatalog(1), bff.getWallet()]);
  expect(catalog.status()).toBe(200);
  expect(wallet.status()).toBe(200);
  const catalogBody = await catalog.json();
  const walletBody = await wallet.json();
  expect(catalogBody.items).toHaveLength(1);
  expect(catalogBody).not.toHaveProperty('results');
  expect(walletBody.wallet).toMatchObject({ userId: 'lab-user-001', balance: 10000 });
  expect(walletBody).not.toHaveProperty('userId');
});
