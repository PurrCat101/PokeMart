import { catalogTestData } from '../../resources/testData/commonTestData.spec';
import { errorCodes } from '../../resources/expectedResults/commonResponses.spec';
import { expect, test } from '../../support/fixtures/apiFixtures';
import { BffService } from '../../support/services/bffService';

test('rejects unknown catalog query parameters', async ({ bffRequest }) => {
  const response = await bffRequest.get('/api/pokemon?unexpected=true');
  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: errorCodes.unknownQueryParameter } });
});

test('honours pagination boundaries and returns no more than limit', async ({ bffRequest }) => {
  const response = await new BffService(bffRequest).getCatalog(catalogTestData.pageSize);
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ totalCount: 151, page: { limit: 2, offset: 0 } });
  expect(body.items).toHaveLength(2);
  expect(body.items[0].pokemon.id).toBeLessThan(body.items[1].pokemon.id);
});
