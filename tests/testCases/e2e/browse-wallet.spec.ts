import { expect, test } from '../../support/fixtures/apiFixtures';

test('@e2e browse catalog and read wallet through the public BFF', async ({ bffRequest, testEnvironment }) => {
  const [catalogResponse, walletResponse] = await Promise.all([
    bffRequest.get('/api/pokemon'),
    bffRequest.get('/api/wallet'),
  ]);
  expect(catalogResponse.status()).toBe(200);
  expect(walletResponse.status()).toBe(200);
  const catalog = await catalogResponse.json();
  const wallet = await walletResponse.json();
  expect(catalog.items.length).toBeGreaterThan(0);
  expect(catalog.items.length).toBeLessThanOrEqual(20);
  expect(catalog).not.toHaveProperty('results');
  expect(wallet.wallet).toMatchObject({ userId: testEnvironment.userId, balance: testEnvironment.walletBalance });
  expect(wallet).not.toHaveProperty('userId');
});
