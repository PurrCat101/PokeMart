import { expect, test } from '../../support/fixtures/kycFixtures';
import { expectPublicError } from '../../support/utils/expectPublicError';
import { decideKyc, kycCatalog, walletBalance } from '../../support/utils/kycTestData';
import { newPurchaseId } from '../../support/utils/purchaseId';
import { testConfig } from '../../index';

// 1101700230708 passes the Thai national-ID check digit.
const validSubmission = {
  fullName: 'Somchai Jaidee',
  nationalId: '1101700230708',
  dateOfBirth: '1990-05-17',
  phone: '0812345678',
  address: '99 Sukhumvit Road, Khlong Toei, Bangkok 10110',
};

test('KYC-SUB-001 a valid submission returns 202, becomes PENDING_REVIEW and then blocks purchases', async ({ kycAccount }) => {
  const { api, database } = await kycAccount('submit-valid');

  const submit = await api.post('/api/kyc/submissions', { data: validSubmission });
  expect(submit.status()).toBe(202);
  expect(await submit.json()).toMatchObject({ level: 0, status: 'PENDING_REVIEW' });

  const status = await api.get('/api/kyc/status');
  expect(await status.json()).toMatchObject({ level: 0, status: 'PENDING_REVIEW' });

  const purchase = await api.post('/api/purchases', { data: { purchaseId: newPurchaseId(), pokemonId: kycCatalog.pokemonId, quantity: 1 } });
  expect(purchase.status()).toBe(403);
  expect((await purchase.json()).error.code).toBe('KYC_PENDING_REVIEW');
  expect(await walletBalance(database, 'submit-valid')).toBe(kycCatalog.walletBalance);
});

test('KYC-SUB-002 an invalid submission returns 400 with one detail per bad field', async ({ kycAccount }) => {
  const { api } = await kycAccount('submit-invalid');
  const requestId = 'tc-kyc-sub-002';

  const response = await api.post('/api/kyc/submissions', {
    data: { fullName: 'A', nationalId: '1234567890123', dateOfBirth: '2015-01-01', phone: '12345', address: 'short' },
    headers: { 'X-Request-Id': requestId },
  });

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR', requestId });
  expect(body.error.details.map((detail: { field: string }) => detail.field).sort()).toEqual(['address', 'dateOfBirth', 'fullName', 'nationalId', 'phone']);

  const status = await api.get('/api/kyc/status');
  expect(await status.json()).toMatchObject({ level: 0, status: 'ACTIVE' });
});

test('KYC-SUB-003 a second submission while under review returns 409 KYC_ALREADY_PENDING', async ({ kycAccount }) => {
  const { api } = await kycAccount('submit-duplicate');
  const requestId = 'tc-kyc-sub-003';

  const response = await api.post('/api/kyc/submissions', { data: validSubmission, headers: { 'X-Request-Id': requestId } });

  await expectPublicError(response, {
    status: 409,
    code: 'KYC_ALREADY_PENDING',
    message: 'A verification request is already under review',
    requestId,
    details: [],
    retryable: false,
  });
});

test('KYC-SUB-004 a verified account cannot submit again (409 KYC_ALREADY_VERIFIED)', async ({ kycAccount }) => {
  const { api } = await kycAccount('submit-verified');
  const requestId = 'tc-kyc-sub-004';

  const response = await api.post('/api/kyc/submissions', { data: validSubmission, headers: { 'X-Request-Id': requestId } });

  await expectPublicError(response, {
    status: 409,
    code: 'KYC_ALREADY_VERIFIED',
    message: 'This account is already verified',
    requestId,
    details: [],
    retryable: false,
  });
});

test('KYC-SUB-005 a rejected account can submit again and goes back to PENDING_REVIEW', async ({ kycAccount }) => {
  const { api } = await kycAccount('submit-resubmit');

  const response = await api.post('/api/kyc/submissions', { data: validSubmission });

  expect(response.status()).toBe(202);
  expect(await response.json()).toMatchObject({ level: 0, status: 'PENDING_REVIEW' });
});

test('KYC-SUB-006 approval after review unlocks purchasing at the new level', async ({ kycAccount, kycAdmin }) => {
  const { api, database } = await kycAccount('approve-flow');
  const blocked = await api.post('/api/purchases', { data: { purchaseId: newPurchaseId(), pokemonId: kycCatalog.pokemonId, quantity: 1 } });
  expect((await blocked.json()).error.code).toBe('KYC_PENDING_REVIEW');

  await decideKyc(kycAdmin, 'approve-flow', { level: 1, status: 'ACTIVE' });

  const purchase = await api.post('/api/purchases', { data: { purchaseId: newPurchaseId(), pokemonId: kycCatalog.pokemonId, quantity: 1 } });
  expect(purchase.status()).toBe(201);
  expect(await walletBalance(database, 'approve-flow')).toBeLessThan(kycCatalog.walletBalance);
});

test('KYC-SUB-007 a submission without a token returns 401', async ({ playwright }) => {
  const anonymous = await playwright.request.newContext({ baseURL: testConfig.bffBaseUrl });
  try {
    const response = await anonymous.post('/api/kyc/submissions', { data: validSubmission });
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
  } finally {
    await anonymous.dispose();
  }
});

test('KYC-SUB-008 a body with unknown fields or non-string values returns 400', async ({ kycAccount }) => {
  const { api } = await kycAccount('submit-malformed');

  const unknownField = await api.post('/api/kyc/submissions', { data: { ...validSubmission, isAdmin: true } });
  expect(unknownField.status()).toBe(400);
  expect((await unknownField.json()).error.code).toBe('VALIDATION_ERROR');

  const wrongType = await api.post('/api/kyc/submissions', { data: { ...validSubmission, phone: 812345678 } });
  expect(wrongType.status()).toBe(400);
  expect((await wrongType.json()).error.details).toEqual([{ field: 'phone', message: 'must be a string' }]);
});
