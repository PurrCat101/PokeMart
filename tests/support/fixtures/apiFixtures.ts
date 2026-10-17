import { APIRequestContext, expect, test as base } from '@playwright/test';

type ApiFixtures = {
  bffRequest: APIRequestContext;
};

export const test = base.extend<ApiFixtures>({
  bffRequest: async ({ request }, use) => use(request),
});

export { expect };
