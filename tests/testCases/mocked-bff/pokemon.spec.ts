import { expect, test } from '../../support/fixtures/apiFixtures';

test('mocked BFF exposes the documented catalog shape', async ({ bffRequest }) => {
  const response = await bffRequest.get('/api/pokemon');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    totalCount: 1,
    page: { limit: 20, offset: 0 },
    items: [
      {
        pokemon: {
          id: 1,
          name: 'bulbasaur',
          types: ['grass', 'poison'],
          spriteUrl: 'https://example.test/1.png',
        },
        listing: { price: 300, availableStock: 5 },
      },
    ],
  });
});
