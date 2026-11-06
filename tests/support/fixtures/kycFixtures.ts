import { APIRequestContext } from '@playwright/test';
import { testConfig } from '../../index';
import { KycScenario, kycUsers } from '../data/kycUsers';
import { MySQLConnection } from '../models/MySQL/MySQLConnection';
import { clearKycFaults, resetKycScenarioData, setKycRecord } from '../utils/kycTestData';
import { expect, test as base } from './apiFixtures';

export interface KycAccount {
  userId: string;
  email: string;
  /** BFF client already signed in as this account. */
  api: APIRequestContext;
  database: MySQLConnection;
}

type KycFixtures = {
  /** Prepares one scenario account: KYC record, wallet and holdings reset, signed in through the BFF. */
  kycAccount: (scenario: KycScenario) => Promise<KycAccount>;
  kycAdmin: APIRequestContext;
};

export const test = base.extend<KycFixtures>({
  kycAdmin: async ({ playwright }, use) => {
    const context = await playwright.request.newContext();
    try {
      await clearKycFaults(context);
      await use(context);
    } finally {
      await clearKycFaults(context).catch(() => undefined);
      await context.dispose();
    }
  },
  kycAccount: async ({ playwright, kycAdmin }, use) => {
    const cleanups: Array<() => Promise<void>> = [];
    await use(async (scenario) => {
      const user = kycUsers[scenario];
      const database = new MySQLConnection();
      cleanups.push(() => database.close());
      await resetKycScenarioData(database, scenario);
      await setKycRecord(kycAdmin, scenario);

      const anonymous = await playwright.request.newContext({ baseURL: testConfig.bffBaseUrl });
      cleanups.push(() => anonymous.dispose());
      const login = await anonymous.post('/api/auth/login', { data: { email: user.email, password: testConfig.auth.password } });
      if (!login.ok()) throw new Error(`Sign-in as ${user.userId} failed with HTTP ${login.status()}. Is the lab-kyc-* seed applied?`);
      const { accessToken } = await login.json() as { accessToken: string };

      const api = await playwright.request.newContext({
        baseURL: testConfig.bffBaseUrl,
        extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
      });
      cleanups.push(() => api.dispose());
      return { userId: user.userId, email: user.email, api, database };
    });
    for (const cleanup of cleanups.reverse()) await cleanup();
  },
});

export { expect };
