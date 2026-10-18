import { defineConfig } from '@playwright/test';
import { testConfig } from './index';

export default defineConfig({
  testDir: './testCases',
  timeout: 15_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  projects: [
    {
      name: 'real-state-setup',
      testMatch: ['setup/**/*.setup.ts'],
    },
    {
      name: 'wiremock',
      testMatch: /mocked-bff\/.*\.spec\.ts/,
      use: { baseURL: testConfig.wiremockBaseUrl },
    },
    {
      name: 'api',
      testMatch: ['auth/**/*.spec.ts', 'pokemon/**/*.spec.ts', 'purchases/validation.spec.ts', 'purchases/read.spec.ts'],
      testIgnore: ['PokeAPI/**'],
      dependencies: ['real-state-setup'],
      use: { baseURL: testConfig.bffBaseUrl },
    },
    {
      name: 'e2e',
      testMatch: ['e2e/**/*.spec.ts', 'purchases/retry.spec.ts', 'purchases/business-errors.spec.ts', 'purchases/concurrency.spec.ts', 'purchases/lifecycle.spec.ts'],
      testIgnore: ['**/PokeAPI/**'],
      dependencies: ['real-state-setup'],
      use: { baseURL: testConfig.bffBaseUrl },
    },
    {
      name: 'ui',
      testMatch: ['ui/**/*.spec.ts'],
      use: { baseURL: process.env.WEB_BASE_URL ?? 'http://localhost:3002' },
    },
    {
      name: 'pokeapi',
      testMatch: ['PokeAPI/**/*.spec.ts'],
      dependencies: ['real-state-setup'],
      use: { baseURL: testConfig.pokemartApiBaseUrl },
    },
  ],
});
