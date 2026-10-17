import { APIRequestContext, expect, test as base } from '@playwright/test';
import { testConfig } from '../../index';
import { newPurchaseId } from '../utils/purchaseId';

type ApiFixtures = {
  bffRequest: APIRequestContext;
  testEnvironment: {
    userId: string;
    pokemonId: number;
    pageSize: number;
    walletBalance: number;
    purchaseId: () => string;
    scenarioHeaders: (scenario: string) => Record<string, string>;
  };
};

export const test = base.extend<ApiFixtures>({
  bffRequest: async ({ playwright, request }, use, testInfo) => {
    const isWireMock = testInfo.project.name === 'wiremock';
    const isInternalApi = testInfo.project.name === 'pokeapi';
    const baseURL = isWireMock ? testConfig.wiremockBaseUrl : isInternalApi ? testConfig.pokemartApiBaseUrl : testConfig.bffBaseUrl;
    let accessToken = 'wiremock-test-token';
    if (!isWireMock) {
      const loginPath = isInternalApi ? '/pokemart/v2/auth/login' : '/api/auth/login';
      const login = await request.post(loginPath, {
        data: { email: testConfig.auth.email, password: testConfig.auth.password },
      });
      if (!login.ok()) throw new Error(`Test authentication failed with HTTP ${login.status()}. Check the configured test account.`);
      const body = await login.json() as { accessToken?: unknown };
      if (typeof body.accessToken !== 'string') throw new Error('Test authentication response did not include an access token.');
      accessToken = body.accessToken;
    }
    const context = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
    });
    try { await use(context); }
    finally { await context.dispose(); }
  },
  testEnvironment: async ({}, use, testInfo) => {
    const target = testInfo.project.name === 'wiremock' ? 'wiremock' : 'real';
    const environment = testConfig.environments[target];
    await use({
      userId: environment.userId,
      pokemonId: environment.pokemonId,
      pageSize: environment.pageSize,
      walletBalance: environment.walletBalance,
      purchaseId: () => target === 'wiremock' ? testConfig.environments.wiremock.purchaseId : newPurchaseId(),
      scenarioHeaders: (scenario): Record<string, string> => target === 'wiremock' ? { 'X-WireMock-Scenario': scenario } : {},
    });
  },
});

export { expect };
