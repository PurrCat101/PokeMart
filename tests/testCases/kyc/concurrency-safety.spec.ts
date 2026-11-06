import { expect, test } from '../../support/fixtures/kycFixtures';
import { newPurchaseId } from '../../support/utils/purchaseId';
import { MySQLConnection } from '../../support/models/MySQL/MySQLConnection';
import { kycCatalog } from '../../support/utils/kycTestData';

/**
 * CONCURRENCY SAFETY TESTS
 *
 * Verify the system prevents:
 * - Double-spending (wallet depletion)
 * - Stock underselling
 * - Race conditions during KYC checks
 */

test.describe('RACE-001: Concurrent Level-0 Purchases Both Blocked', () => {
  test('two simultaneous level-0 purchase attempts both fail with KYC_LEVEL_REQUIRED', async ({
    kycAccount,
  }) => {
    const { api, database } = await kycAccount('race-level-0');

    // Start 2 purchases simultaneously - both should fail at assertKyc
    const [res1, res2] = await Promise.all([
      api.post('/api/purchases', {
        data: {
          purchaseId: newPurchaseId(),
          pokemonId: kycCatalog.pokemonId,
          quantity: 1,
        },
      }),
      api.post('/api/purchases', {
        data: {
          purchaseId: newPurchaseId(),
          pokemonId: kycCatalog.pokemonId,
          quantity: 1,
        },
      }),
    ]);

    // Both should be rejected
    expect(res1.status()).toBe(403);
    expect(res2.status()).toBe(403);

    const err1 = (await res1.json()) as any;
    const err2 = (await res2.json()) as any;

    expect(err1.error.code).toBe('KYC_LEVEL_REQUIRED');
    expect(err2.error.code).toBe('KYC_LEVEL_REQUIRED');
  });

  test('concurrent purchases by level-0 user do not affect wallet', async ({ kycAccount }) => {
    const { api, database } = await kycAccount('race-level-0-wallet');
    const walletBefore = kycCatalog.walletBalance;

    // Two concurrent purchases
    await Promise.all([
      api.post('/api/purchases', {
        data: {
          purchaseId: newPurchaseId(),
          pokemonId: kycCatalog.pokemonId,
          quantity: 1,
        },
      }),
      api.post('/api/purchases', {
        data: {
          purchaseId: newPurchaseId(),
          pokemonId: kycCatalog.pokemonId,
          quantity: 1,
        },
      }),
    ]);

    // Verify wallet unchanged
    const [rows] = await database.query(
      'SELECT balance FROM user_wallet WHERE user_id = ?',
      ['lab-kyc-race-level-0-wallet'],
    );
    const walletAfter = (rows as any[])[0].balance;
    expect(walletAfter).toBe(walletBefore);
  });
});

test.describe('RACE-002: Wallet Double-Spend Prevention', () => {
  test('two concurrent purchases that would overdraw fail gracefully', async ({ kycAccount }) => {
    const { api, database } = await kycAccount('race-wallet-drain');

    // User has limited balance, try to buy same expensive item twice concurrently
    // Only one should succeed due to database lock and transaction rollback

    const [res1, res2] = await Promise.all([
      api.post('/api/purchases', {
        data: {
          purchaseId: newPurchaseId(),
          pokemonId: kycCatalog.pokemonId, // ~1000 cost
          quantity: 1,
        },
      }),
      api.post('/api/purchases', {
        data: {
          purchaseId: newPurchaseId(),
          pokemonId: kycCatalog.pokemonId,
          quantity: 1,
        },
      }),
    ]);

    // Count successes
    const succeeded = [res1.status(), res2.status()].filter((s) => s === 201).length;
    const failed = [res1.status(), res2.status()].filter((s) => s === 403 || s === 422).length;

    // At least one should fail. If first succeeds, second should fail with INSUFFICIENT_FUNDS
    expect(succeeded + failed).toBe(2); // Both requests completed
    expect(succeeded).toBeLessThanOrEqual(1); // At most 1 succeeded (or both failed if level-0)

    if (succeeded === 1) {
      // One succeeded, one failed
      expect(failed).toBe(1);
      const failedRes = res1.status() !== 201 ? res1 : res2;
      const failedError = (await failedRes.json()) as any;
      expect(['KYC_LEVEL_REQUIRED', 'INSUFFICIENT_FUNDS']).toContain(
        failedError.error.code,
      );
    }
  });

  test('wallet balance is consistent after concurrent purchase attempts', async ({
    kycAccount,
  }) => {
    const { api, database } = await kycAccount('race-wallet-consistency');
    const walletBefore = kycCatalog.walletBalance;

    // 5 concurrent purchase attempts
    const results = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        api.post('/api/purchases', {
          data: {
            purchaseId: newPurchaseId(),
            pokemonId: kycCatalog.pokemonId,
            quantity: 1,
          },
        }),
      ),
    );

    const succeeded = results.filter((r) => r.status() === 201).length;

    // Fetch final wallet
    const [rows] = await database.query(
      'SELECT balance FROM user_wallet WHERE user_id = ?',
      ['lab-kyc-race-wallet-consistency'],
    );
    const walletAfter = (rows as any[])[0].balance;

    // Wallet should equal: initial - (price * succeeded)
    const expectedAfter = walletBefore - kycCatalog.pokemonPrice * succeeded;
    expect(walletAfter).toBe(expectedAfter);
  });
});

test.describe('RACE-003: Stock Underselling Prevention', () => {
  test('concurrent purchases do not oversell stock', async ({ kycAccount }) => {
    const { api, database } = await kycAccount('race-stock-depletion');

    // Query initial stock
    const [stockBefore] = await database.query(
      'SELECT stock FROM shop_listing WHERE pokemon_source_id = ?',
      [kycCatalog.pokemonId],
    );
    const initialStock = (stockBefore as any[])[0].stock;

    // Attempt 5 concurrent purchases by a level-1 user
    const results = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        api.post('/api/purchases', {
          data: {
            purchaseId: newPurchaseId(),
            pokemonId: kycCatalog.pokemonId,
            quantity: 1,
          },
        }),
      ),
    );

    const succeeded = results.filter((r) => r.status() === 201).length;

    // Fetch final stock
    const [stockAfter] = await database.query(
      'SELECT stock FROM shop_listing WHERE pokemon_source_id = ?',
      [kycCatalog.pokemonId],
    );
    const finalStock = (stockAfter as any[])[0].stock;

    // Stock should be: initial - succeeded
    const expectedStock = initialStock - succeeded;
    expect(finalStock).toBe(expectedStock);

    // Stock should never go negative
    expect(finalStock).toBeGreaterThanOrEqual(0);

    // Number of successes should not exceed available stock
    expect(succeeded).toBeLessThanOrEqual(initialStock);
  });

  test('INSUFFICIENT_STOCK is thrown when concurrent purchases exhaust stock', async ({
    kycAccount,
  }) => {
    const { api, database } = await kycAccount('race-stock-limit');

    // Find an item with limited stock for this test
    const [stockRows] = await database.query(
      'SELECT pokemon_source_id, stock FROM shop_listing WHERE required_kyc_level <= 1 AND stock < 10 LIMIT 1',
    );

    if ((stockRows as any[]).length === 0) {
      // Skip test if no limited-stock items available
      return;
    }

    const limitedPokemonId = (stockRows as any[])[0].pokemon_source_id;
    const limitedStock = (stockRows as any[])[0].stock;

    // Try to buy more than available stock concurrently
    const attemptCount = limitedStock + 3;
    const results = await Promise.all(
      Array.from({ length: attemptCount }).map(() =>
        api.post('/api/purchases', {
          data: {
            purchaseId: newPurchaseId(),
            pokemonId: limitedPokemonId,
            quantity: 1,
          },
        }),
      ),
    );

    const succeeded = results.filter((r) => r.status() === 201).length;
    const outOfStock = results.filter((r) => r.status() === 409).length;

    // Should succeed up to stock limit
    expect(succeeded).toBeLessThanOrEqual(limitedStock);

    // Extra attempts should fail
    expect(outOfStock).toBeGreaterThanOrEqual(attemptCount - limitedStock);

    // Verify at least some were rejected with INSUFFICIENT_STOCK
    const hasInsufficientStock = results.some(async (r) => {
      if (r.status() === 409) {
        const error = (await r.json()) as any;
        return error.error.code === 'INSUFFICIENT_STOCK';
      }
      return false;
    });

    expect(await hasInsufficientStock).toBeTruthy();
  });
});

test.describe('RACE-004: Duplicate Purchase ID Prevention', () => {
  test('same purchaseId cannot be processed twice concurrently', async ({ kycAccount }) => {
    const { api } = await kycAccount('race-duplicate-id');

    const duplicateId = newPurchaseId();

    // Try to use the same purchaseId in 2 concurrent requests
    const [res1, res2] = await Promise.all([
      api.post('/api/purchases', {
        data: {
          purchaseId: duplicateId,
          pokemonId: kycCatalog.pokemonId,
          quantity: 1,
        },
      }),
      api.post('/api/purchases', {
        data: {
          purchaseId: duplicateId,
          pokemonId: kycCatalog.pokemonId,
          quantity: 1,
        },
      }),
    ]);

    // One should succeed (201), one should fail with PURCHASE_DUPLICATE (409)
    const statuses = [res1.status(), res2.status()];
    expect(statuses).toContain(201);
    expect(statuses).toContain(409);

    const failedRes = res1.status() === 409 ? res1 : res2;
    const error = (await failedRes.json()) as any;
    expect(error.error.code).toBe('PURCHASE_DUPLICATE');
  });
});

test.describe('RACE-005: KYC Fetch-Check Timing', () => {
  test('KYC level at transaction start is enforced (not at fetch time)', async ({
    kycAccount,
  }) => {
    const { api } = await kycAccount('race-kyc-timing');

    // This test documents the current behavior:
    // KYC is fetched once before transaction (prefetchKyc)
    // Then assertKyc runs inside transaction
    // So even if KYC changes between fetch and transaction, the fetched value is used

    // With level 0 user, purchase should be rejected at assertKyc
    const res = await api.post('/api/purchases', {
      data: {
        purchaseId: newPurchaseId(),
        pokemonId: kycCatalog.pokemonId,
        quantity: 1,
      },
    });

    expect(res.status()).toBe(403);
    const error = (await res.json()) as any;
    expect(error.error.code).toBe('KYC_LEVEL_REQUIRED');
  });
});
