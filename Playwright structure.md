# Playwright test structure

Test cases stay separated by target and purpose. Environment selection changes URLs and test data; it does not combine or select a different set of cases.

```text
tests/
├── package.json
├── tsconfig.json
├── playwright.config.ts
├── index.ts
├── configs/
│   ├── .env.test
│   ├── .env.sit
│   └── .env.stg
├── testCases/
│   ├── mocked-bff/
│   │   ├── browse-wallet.spec.ts
│   │   ├── catalog.spec.ts
│   │   ├── contract.spec.ts
│   │   ├── purchase-flow.spec.ts
│   │   └── purchase-validation.spec.ts
│   ├── pokemon/
│   │   └── catalog.spec.ts
│   ├── purchases/
│   │   ├── retry.spec.ts
│   │   └── validation.spec.ts
│   ├── e2e/
│   │   └── browse-wallet.spec.ts
│   └── PokeAPI/
│       ├── catalog/
│       │   ├── detail.spec.ts
│       │   └── list.spec.ts
│       ├── health/get.spec.ts
│       ├── inventory/get.spec.ts
│       ├── purchases/
│       │   ├── concurrency.spec.ts
│       │   ├── create.spec.ts
│       │   ├── detail.spec.ts
│       │   ├── list.spec.ts
│       │   └── retry.spec.ts
│       ├── ready/get.spec.ts
│       ├── support.ts
│       └── wallet/get.spec.ts
├── support/
│   ├── fixtures/
│   ├── models/
│   ├── services/
│   └── utils/
└── resources/
    └── expectedResults/
        └── commonResponses.spec.ts
```

Select the environment before running tests. PowerShell example:

```powershell
$env:TEST_ENV='test'; npm test
$env:TEST_ENV='sit'; npm test
npm run test:pokeapi
```

The test environment defaults to `test`. `npm run test:pokeapi` runs only internal PokéMart API cases and uses `POKEMART_API_BASE_URL`. Keep credentials out of committed environment files. Database-backed purchase tests in non-test environments require explicit MySQL settings for a dedicated test database.
