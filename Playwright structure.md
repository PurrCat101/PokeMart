```text
tests/
├── package.json
├── tsconfig.json
├── playwright.config.ts
├── index.ts
├── .gitignore
├── .prettierrc
├── .README.md
├── testCases/
│   ├── e2e/
│   │   └── business.spec.ts
│   └── {APIendpoints}/
│       ├── business.spec.ts
│       └── validation.spec.ts
├── support/
│   ├── fixtures/
│   │   └── apiFixtures.ts
│   ├── services/
│   │   └── api3rdPartyServices.ts
│   ├── common/
│   ├── utils/
│   └── models/
│       └── MySQL/
│           └── MySQLConnection.ts
├── resources/
│   ├── testData/
│   │   └── commonTestData.spec.ts
│   ├── prepareData/
│   │   └── commonprepareData.spec.ts
│   └── expectedResults/
│       └── commonResponses.spec.ts
└── configs/
    ├── .env.sit
    ├── .env.stg
    └── .env.default
```