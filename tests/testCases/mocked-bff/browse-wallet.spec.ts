import { expect, test } from '../../support/fixtures/apiFixtures';

test('mocked BFF returns catalog and wallet data in public DTOs', async ({ bffRequest, testEnvironment }) => {
  const [catalogResponse, walletResponse] = await Promise.all([
    bffRequest.get('/api/pokemon'),
    bffRequest.get('/api/wallet'),
  ]);
  expect(catalogResponse.status()).toBe(200);
  expect(walletResponse.status()).toBe(200);
  const catalog = await catalogResponse.json();
  const wallet = await walletResponse.json();
  expect(catalog.items.length).toBeGreaterThan(0);
  expect(catalog).not.toHaveProperty('results');
  expect(wallet.wallet).toMatchObject({ userId: testEnvironment.userId, balance: testEnvironment.walletBalance });
  expect(wallet).not.toHaveProperty('userId');
});
