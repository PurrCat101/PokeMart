import { expect, test } from '../../support/fixtures/kycFixtures';
import { expectPublicError } from '../../support/utils/expectPublicError';
import { injectKycFault, kycCatalog, walletBalance } from '../../support/utils/kycTestData';
import { newPurchaseId } from '../../support/utils/purchaseId';

// With every listing needing level 1, a KYC outage means no purchase can be authorised: fail closed.
// Account bootstrap must survive, so sign-in and the wallet keep working with kyc: null.

test('KYC-DOWN-001 a KYC outage fails a purchase closed with 503 and no state change', async ({ kycAccount, kycAdmin }) => {
  const { api, database } = await kycAccount('down-purchase');
  await injectKycFault(kycAdmin, 'http_500');
  const requestId = 'tc-kyc-down-001';

  const response = await api.post('/api/purchases', {
    data: { purchaseId: newPurchaseId(), pokemonId: kycCatalog.pokemonId, quantity: 1 },
    headers: { 'X-Request-Id': requestId },
  });

  await expectPublicError(response, {
    status: 503,
    code: 'DEPENDENCY_UNAVAILABLE',
    message: 'KYC service is temporarily unavailable',
    requestId,
    details: [],
    retryable: true,
  });
  expect(await walletBalance(database, 'down-purchase')).toBe(kycCatalog.walletBalance);
});

test('KYC-DOWN-002 a KYC outage returns account-info 200 with kyc null and /api/kyc/status 503', async ({ kycAccount, kycAdmin }) => {
  const { api } = await kycAccount('down-account');
  await injectKycFault(kycAdmin, 'http_500');

  const account = await api.get('/api/account-info');
  expect(account.status()).toBe(200);
  expect(await account.json()).toMatchObject({ kyc: null });

  const status = await api.get('/api/kyc/status');
  expect(status.status()).toBe(503);
  expect((await status.json()).error.code).toBe('DEPENDENCY_UNAVAILABLE');
});
