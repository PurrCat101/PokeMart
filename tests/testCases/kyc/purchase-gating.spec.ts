import { expect, test } from '../../support/fixtures/kycFixtures';
import { expectPublicError } from '../../support/utils/expectPublicError';
import { holdsItem, holdsPokemon, itemStock, kycCatalog, walletBalance } from '../../support/utils/kycTestData';
import { newPurchaseId } from '../../support/utils/purchaseId';

// Tiers: level 0 buys nothing, level 1 buys ordinary listings (every Pokémon, ordinary items),
// level 2 also buys the Master tier. An account under review buys nothing, whatever its level.
// Each test owns one lab-kyc-* account (see support/data/kycUsers.ts) so no two cases share data.

const pendingMessage = 'Your identity verification is under review. Purchases are unavailable until it is approved.';

test.describe('level 0 cannot buy', () => {
  test('KYC-BUY-001 level 0 is refused a Pokémon with 403 KYC_LEVEL_REQUIRED and nothing changes', async ({ kycAccount }) => {
    const { api, database } = await kycAccount('none-pokemon');
    const requestId = 'tc-kyc-buy-001';

    const response = await api.post('/api/purchases', {
      data: { purchaseId: newPurchaseId(), pokemonId: kycCatalog.pokemonId, quantity: 1 },
      headers: { 'X-Request-Id': requestId },
    });

    await expectPublicError(response, {
      status: 403,
      code: 'KYC_LEVEL_REQUIRED',
      message: 'This Pokémon requires a higher verification level',
      requestId,
      details: [{ required: 1, current: 0 }],
      retryable: false,
    });
    expect(await walletBalance(database, 'none-pokemon')).toBe(kycCatalog.walletBalance);
    expect(await holdsPokemon(database, 'none-pokemon', kycCatalog.pokemonId)).toBe(0);
  });

  test('KYC-BUY-002 level 0 is refused an ordinary item with 403 KYC_LEVEL_REQUIRED and nothing changes', async ({ kycAccount }) => {
    const { api, database } = await kycAccount('none-item');
    const stockBefore = await itemStock(database, kycCatalog.itemId);
    const requestId = 'tc-kyc-buy-002';

    const response = await api.post('/api/purchases', {
      data: { purchaseId: newPurchaseId(), itemId: kycCatalog.itemId, quantity: 1 },
      headers: { 'X-Request-Id': requestId },
    });

    await expectPublicError(response, {
      status: 403,
      code: 'KYC_LEVEL_REQUIRED',
      message: 'This item requires a higher verification level',
      requestId,
      details: [{ required: 1, current: 0 }],
      retryable: false,
    });
    expect(await walletBalance(database, 'none-item')).toBe(kycCatalog.walletBalance);
    expect(await itemStock(database, kycCatalog.itemId)).toBe(stockBefore);
    expect(await holdsItem(database, 'none-item', kycCatalog.itemId)).toBe(0);
  });
});

test.describe('level 1 buys ordinary listings', () => {
  test('KYC-BUY-003 level 1 buys a Pokémon', async ({ kycAccount }) => {
    const { api, database } = await kycAccount('basic-pokemon');

    const response = await api.post('/api/purchases', {
      data: { purchaseId: newPurchaseId(), pokemonId: kycCatalog.pokemonId, quantity: 1 },
    });

    expect(response.status()).toBe(201);
    expect(await holdsPokemon(database, 'basic-pokemon', kycCatalog.pokemonId)).toBe(1);
    expect(await walletBalance(database, 'basic-pokemon')).toBeLessThan(kycCatalog.walletBalance);
  });

  test('KYC-BUY-004 level 1 buys an ordinary item', async ({ kycAccount }) => {
    const { api, database } = await kycAccount('basic-item');

    const response = await api.post('/api/purchases', {
      data: { purchaseId: newPurchaseId(), itemId: kycCatalog.itemId, quantity: 2 },
    });

    expect(response.status()).toBe(201);
    expect(await holdsItem(database, 'basic-item', kycCatalog.itemId)).toBe(2);
    expect(await walletBalance(database, 'basic-item')).toBe(kycCatalog.walletBalance - 2 * kycCatalog.itemPrice);
    expect(await itemStock(database, kycCatalog.itemId)).toBe(kycCatalog.itemStock - 2);
  });

  test('KYC-BUY-005 level 1 is refused a Master item with details showing level 2 is required', async ({ kycAccount }) => {
    const { api, database } = await kycAccount('basic-master');
    const requestId = 'tc-kyc-buy-005';

    const response = await api.post('/api/purchases', {
      data: { purchaseId: newPurchaseId(), itemId: kycCatalog.masterItemId, quantity: 1 },
      headers: { 'X-Request-Id': requestId },
    });

    await expectPublicError(response, {
      status: 403,
      code: 'KYC_LEVEL_REQUIRED',
      message: 'This item requires a higher verification level',
      requestId,
      details: [{ required: 2, current: 1 }],
      retryable: false,
    });
    expect(await walletBalance(database, 'basic-master')).toBe(kycCatalog.walletBalance);
    expect(await itemStock(database, kycCatalog.masterItemId)).toBe(kycCatalog.itemStock);
    expect(await holdsItem(database, 'basic-master', kycCatalog.masterItemId)).toBe(0);
  });
});

test('KYC-BUY-006 level 2 buys a Master item', async ({ kycAccount }) => {
  const { api, database } = await kycAccount('full-master');

  const response = await api.post('/api/purchases', {
    data: { purchaseId: newPurchaseId(), itemId: kycCatalog.masterItemId, quantity: 1 },
  });

  expect(response.status()).toBe(201);
  expect(await holdsItem(database, 'full-master', kycCatalog.masterItemId)).toBe(1);
  expect(await walletBalance(database, 'full-master')).toBe(kycCatalog.walletBalance - kycCatalog.itemPrice);
});

test.describe('under review buys nothing', () => {
  test('KYC-BUY-007 an account under review is refused a Pokémon with 403 KYC_PENDING_REVIEW', async ({ kycAccount }) => {
    const { api, database } = await kycAccount('pending-pokemon');
    const requestId = 'tc-kyc-buy-007';

    const response = await api.post('/api/purchases', {
      data: { purchaseId: newPurchaseId(), pokemonId: kycCatalog.pokemonId, quantity: 1 },
      headers: { 'X-Request-Id': requestId },
    });

    await expectPublicError(response, { status: 403, code: 'KYC_PENDING_REVIEW', message: pendingMessage, requestId, details: [], retryable: false });
    expect(await walletBalance(database, 'pending-pokemon')).toBe(kycCatalog.walletBalance);
    expect(await holdsPokemon(database, 'pending-pokemon', kycCatalog.pokemonId)).toBe(0);
  });

  test('KYC-BUY-008 an account under review is refused an item with 403 KYC_PENDING_REVIEW', async ({ kycAccount }) => {
    const { api, database } = await kycAccount('pending-item');
    const requestId = 'tc-kyc-buy-008';

    const response = await api.post('/api/purchases', {
      data: { purchaseId: newPurchaseId(), itemId: kycCatalog.itemId, quantity: 1 },
      headers: { 'X-Request-Id': requestId },
    });

    await expectPublicError(response, { status: 403, code: 'KYC_PENDING_REVIEW', message: pendingMessage, requestId, details: [], retryable: false });
    expect(await walletBalance(database, 'pending-item')).toBe(kycCatalog.walletBalance);
    expect(await holdsItem(database, 'pending-item', kycCatalog.itemId)).toBe(0);
  });

  test('KYC-BUY-009 under review wins over a sufficient level (level 1 under review is still refused)', async ({ kycAccount }) => {
    const { api, database } = await kycAccount('basic-pending');
    const requestId = 'tc-kyc-buy-009';

    const response = await api.post('/api/purchases', {
      data: { purchaseId: newPurchaseId(), pokemonId: kycCatalog.pokemonId, quantity: 1 },
      headers: { 'X-Request-Id': requestId },
    });

    await expectPublicError(response, { status: 403, code: 'KYC_PENDING_REVIEW', message: pendingMessage, requestId, details: [], retryable: false });
    expect(await walletBalance(database, 'basic-pending')).toBe(kycCatalog.walletBalance);
  });
});

test('KYC-BUY-010 a rejected account (level 0) is refused a Pokémon with 403 KYC_LEVEL_REQUIRED', async ({ kycAccount }) => {
  const { api, database } = await kycAccount('rejected-pokemon');
  const requestId = 'tc-kyc-buy-010';

  const response = await api.post('/api/purchases', {
    data: { purchaseId: newPurchaseId(), pokemonId: kycCatalog.pokemonId, quantity: 1 },
    headers: { 'X-Request-Id': requestId },
  });

  await expectPublicError(response, {
    status: 403,
    code: 'KYC_LEVEL_REQUIRED',
    message: 'This Pokémon requires a higher verification level',
    requestId,
    details: [{ required: 1, current: 0 }],
    retryable: false,
  });
  expect(await walletBalance(database, 'rejected-pokemon')).toBe(kycCatalog.walletBalance);
});
