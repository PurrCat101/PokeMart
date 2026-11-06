import { expect, test } from '../../support/fixtures/kycFixtures';
import { KycScenario, kycUsers } from '../../support/data/kycUsers';

// Read-only checks, but each scenario still has its own account so the data is never shared.
const scenarios: KycScenario[] = ['status-none', 'status-basic', 'status-full', 'status-pending', 'status-rejected'];

for (const [index, scenario] of scenarios.entries()) {
  const expected = kycUsers[scenario];

  test(`KYC-STATUS-00${index + 1} ${scenario}: status and account-info report ${expected.level}/${expected.status}`, async ({ kycAccount }) => {
    const { api } = await kycAccount(scenario);
    const record = { level: expected.level, status: expected.status };

    const status = await api.get('/api/kyc/status');
    expect(status.status()).toBe(200);
    expect(await status.json()).toMatchObject(record);

    const account = await api.get('/api/account-info');
    expect(account.status()).toBe(200);
    expect(await account.json()).toMatchObject({ user: { userId: expected.userId }, kyc: record });
  });
}
