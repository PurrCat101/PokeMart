import { defineConfig } from '@playwright/test';
import { testConfig } from './index';

export default defineConfig({
  testDir: './testCases',
  timeout: 15_000,
  fullyParallel: false,
  reporter: 'list',
  projects: [
    {
      name: 'contract-mocked',
      testMatch: /mocked-bff\/.*\.spec\.ts/,
      use: { baseURL: testConfig.wiremockBaseUrl },
    },
    {
      name: 'api-validation',
      testMatch: /(pokemon|purchases)\/.*\.spec\.ts/,
      use: { baseURL: testConfig.bffBaseUrl },
    },
    {
      name: 'integration',
      testMatch: /e2e\/.*\.spec\.ts/,
      use: { baseURL: testConfig.bffBaseUrl },
    },
  ],
});
