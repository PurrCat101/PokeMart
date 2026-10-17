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
  bffRequest: async ({ request }, use) => use(request),
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
