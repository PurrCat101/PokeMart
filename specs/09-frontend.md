# 09 — Web Frontend

## 1. Purpose and scope

The PokéMart web application is a browser client for the public BFF. It provides a local commerce experience for browsing the Pokémon catalog, signing in as a trainer, managing a cart, purchasing listings, and reviewing wallet, inventory, and purchase history.

The frontend is part of the monorepo at `apps/web`. It is not included in `docker-compose.yml`; run it separately from the repository root. It must use the public BFF and must not call the internal PokéMart API directly.

## 2. Technology and local runtime

- Next.js App Router with React and TypeScript.
- Tailwind CSS for application styles.
- Development and production server port: `3002`.
- Public BFF default URL: `http://localhost:3001`.
- `apps/web/next.config.ts` rewrites browser requests from `/api/:path*` to the configured BFF URL.

Configure the BFF URL with `NEXT_PUBLIC_BFF_URL` or `BFF_INTERNAL_URL`; if neither is set, the app uses `http://localhost:3001`. The example values are in `apps/web/.env.example`.

Run from the repository root:

```bash
npm run dev:web
npm run build:web
npm run start:web
```

The BFF and its downstream services must be running for API-backed features to work. For a local full-stack session, start the Compose services and the web app in separate terminals.

## 3. Application areas

- **Catalog:** load catalog data from the public API; search by Pokémon name or ID; filter by type and availability; sort by ID, price, or name; browse 12 results per page.
- **Cart and checkout:** add listings with quantity limits based on available stock, adjust or remove cart items, and submit purchases through the BFF. The cart is stored in browser `localStorage`.
- **Trainer sign-in:** use the demo login endpoint to establish a session. The access token is stored in browser `localStorage` and attached as a bearer token to authenticated API requests.
- **Wallet:** display the signed-in trainer's balance and refresh it after purchase activity.
- **Inventory:** display the signed-in trainer's owned Pokémon and refresh the view after checkout.
- **Purchase history:** show the signed-in trainer's purchase ledger with paginated results.

Catalog browsing is public. Wallet, inventory, and purchase operations require authentication. The API remains the source of truth for balances, stock, authorization, and purchase results; frontend validation is for user experience only.

Login fields start blank; the UI does not prefill or auto-fill demo credentials. The local seeded login account is documented in the repository root `README.md`.

## 4. API boundary and request behavior

The frontend calls public routes such as `/api/pokemon`, `/api/auth/login`, `/api/wallet`, `/api/inventory`, and `/api/purchases`. Next.js rewrites these requests to the BFF. The browser does not need a direct URL or credential for the internal API.

The shared API client in `apps/web/src/lib/api.ts` sends an `X-Request-Id`, adds the stored bearer token when present, and converts public API error envelopes into `ApiError` instances. Purchase requests use a client-generated UUID `purchaseId` in the JSON body, following the public API contract.

## 5. UX states and data persistence

- Keep the catalog, inventory, and purchase history loading states visible while requests are in flight.
- Show a catalog service error if the BFF or an upstream service cannot provide catalog data.
- Provide empty states for a signed-out trainer, an empty inventory, and an empty cart where applicable.
- Keep cart contents across page reloads using `pokemart_cart` in browser `localStorage`.
- Keep the access token in `pokemart_token` in browser `localStorage`; signing out clears the token.
- Do not treat browser-held cart data, token state, prices, or stock as trusted server-side state.

## 6. Limitations

- Authentication is for the local lab only. A browser-stored bearer token is accessible to JavaScript and is not a production session design.
- The demo does not implement registration, password recovery, refresh/revocation, or production abuse controls.
- The frontend is not a Docker Compose service. Start it using the npm workspace scripts.
- Playwright suites documented in this repository exercise API and service behavior; they are not a substitute for dedicated browser UI coverage.

For public routes and response shapes, see `specs/openapi.yaml`. For purchase rules and retry behavior, see `specs/03-api-contract.md`.

## 7. Playwright UI automation contract

Use `data-testid` attributes as the frontend-to-QA selector contract. This contract is the source of truth even when no Figma file exists; when Figma is available, map the named screen elements and user actions to these selectors rather than inventing selectors from pixels or layer order.

### Naming rules

| Rule | Convention | Example |
|---|---|---|
| Stable name | lowercase kebab-case; name the feature and purpose, not CSS/component implementation | `catalog-search`, not `blue-input` |
| Action or field | `{feature}-{purpose}` | `login-submit`, `cart-clear` |
| Repeated domain entity | `{entity}-{purpose}-{stableDomainId}` | `pokemon-stock-25`, `purchase-row-<uuid>` |
| State | `{feature}-{state}` | `catalog-empty`, `checkout-success` |
| Position-specific UI | Use a position only when position itself is the behavior under test | `catalog-page-2`; never `button-1` |
| Stability | Keep selector unchanged across copy, style, layout, and component refactors | `login-submit` stays the same if its label changes |
| Uniqueness | A selector identifies one target in its active screen; scope repeated content by entity ID | `page.getByTestId('pokemon-add-to-cart-25')` |
| Accessibility | Test IDs complement semantic roles and accessible names; they do not replace labels or roles | Use `getByRole('button', { name: 'Connect Session' })` for an accessibility assertion |

Do not build selectors from CSS classes, DOM nesting, text, Figma coordinates, or generated array indices. Prefer `page.getByTestId()`; use role/name locators when the assertion is specifically about accessibility or user-facing labeling.

### Figma/user-flow to Playwright locator table

QA can use this mapping from requirements or a Figma screen to design a test before implementation. The `data-testid` value should be included in the test case/design handoff; frontend implementation then adds the same attribute. Existing selectors below are the required contract for the current UI.

| Screen / user intent | Figma concept or requirement | Required `data-testid` | Playwright locator |
|---|---|---|---|
| Open the app | Main application is ready | `app-shell` | `page.getByTestId('app-shell')` |
| Navigate | Open catalog, inventory, or purchases | `nav-catalog`, `nav-inventory`, `nav-purchases` | `page.getByTestId('nav-inventory')` |
| See current balance | Signed-in trainer wallet amount | `wallet-balance` | `page.getByTestId('wallet-balance')` |
| Search catalog | Search field | `catalog-search` | `page.getByTestId('catalog-search')` |
| Choose a Pokémon | Catalog card, name, price, available stock | `pokemon-card-{pokemonId}`, `pokemon-name-{pokemonId}`, `pokemon-price-{pokemonId}`, `pokemon-stock-{pokemonId}` | `page.getByTestId('pokemon-card-25')`; `page.getByTestId('pokemon-stock-25')` |
| Add to cart | Item action and quantity | `pokemon-quantity-{pokemonId}`, `pokemon-add-to-cart-{pokemonId}` | `page.getByTestId('pokemon-add-to-cart-25')` |
| Review cart | Drawer, item quantity, remove, proceed | `cart-drawer`, `cart-item-{pokemonId}`, `cart-item-quantity-{pokemonId}`, `cart-proceed-to-checkout` | `page.getByTestId('cart-item-25')`; `page.getByTestId('cart-proceed-to-checkout')` |
| Sign in | Email/password, submit, validation error | `login-dialog`, `login-email`, `login-password`, `login-submit`, `login-error` | `page.getByTestId('login-email')` |
| Complete checkout | Confirm, successful state, created purchase ID | `checkout-dialog`, `checkout-confirm`, `checkout-success`, `checkout-purchase-{purchaseId}` | `page.getByTestId('checkout-confirm')` |
| Verify inventory | Inventory entry and quantity by Pokémon | `inventory-view`, `inventory-item-{pokemonId}` | `page.getByTestId('inventory-item-25')` |
| Verify purchase history | Purchase row and its item/quantity | `purchases-table`, `purchase-row-{purchaseId}`, `purchase-item-{purchaseId}`, `purchase-quantity-{purchaseId}` | `page.getByTestId(\`purchase-quantity-${purchaseId}\`)` |
| Verify failure or feedback | Error alert or toast by outcome | `login-error`, `checkout-errors`, `catalog-service-error`, `toast-{success|error|info}` | `page.getByTestId('checkout-errors')` |

For a repeated control whose domain ID is unknown until runtime, enumerate its documented region, then read the stable domain ID from its documented selector before building the direct test ID locator:

```ts
const cards = page.getByTestId('catalog-grid').locator('[data-testid^="pokemon-card-"]');
const card = cards.first();
const testId = await card.getAttribute('data-testid');
const pokemonId = testId?.replace('pokemon-card-', '');
if (!pokemonId) throw new Error(`Unexpected Pokémon card test ID: ${testId}`);

await expect(page.getByTestId(`pokemon-stock-${pokemonId}`)).toBeVisible();
await page.getByTestId(`pokemon-add-to-cart-${pokemonId}`).click();
```

Known IDs should always use `page.getByTestId('pokemon-card-25')` directly. Do not use positional selectors such as `nth(0)` for a specific business entity.

### Current selector inventory

| Area | Selector IDs |
|---|---|
| App shell | `app-shell`, `app-header`, `app-main` |
| Navigation and cart entry | `nav-catalog`, `nav-inventory`, `nav-purchases`, `nav-catalog-mobile`, `nav-inventory-mobile`, `nav-purchases-mobile`, `open-cart`, `sign-in`, `sign-out` |
| Catalog controls and states | `catalog-search`, `catalog-in-stock-filter`, `catalog-sort`, `catalog-refresh`, `catalog-retry`, `catalog-service-error`, `catalog-type-{type}`, `catalog-results-summary`, `catalog-clear-filters`, `catalog-loading`, `catalog-empty`, `catalog-grid`, `catalog-pagination`, `catalog-page-previous`, `catalog-page-next`, `catalog-page-{number}` |
| Catalog item | `pokemon-card-{pokemonId}`, `pokemon-name-{pokemonId}`, `pokemon-price-{pokemonId}`, `pokemon-stock-{pokemonId}`, `pokemon-quantity-{pokemonId}`, `pokemon-quantity-decrease-{pokemonId}`, `pokemon-quantity-increase-{pokemonId}`, `pokemon-add-to-cart-{pokemonId}` |
| Sign in | `login-dialog`, `login-email`, `login-password`, `login-submit`, `login-error`, `login-close` |
| Cart | `cart-drawer`, `cart-empty`, `cart-close`, `cart-clear`, `cart-item-{pokemonId}`, `cart-item-quantity-{pokemonId}`, `cart-item-remove-{pokemonId}`, `cart-sign-in`, `cart-proceed-to-checkout` |
| Checkout | `checkout-dialog`, `checkout-progress`, `checkout-confirm`, `checkout-close`, `checkout-success`, `checkout-errors`, `checkout-purchase-{purchaseId}` |
| Inventory | `inventory-view`, `inventory-loading`, `inventory-auth-required`, `inventory-empty`, `inventory-refresh`, `inventory-sign-in`, `inventory-item-{pokemonId}` |
| Purchase history | `purchases-view`, `purchases-auth-required`, `purchases-table`, `purchases-empty`, `purchase-row-{purchaseId}`, `purchase-item-{purchaseId}`, `purchase-quantity-{purchaseId}`, `purchases-refresh`, `purchases-sign-in`, `purchases-page-previous`, `purchases-page-next` |
| Trainer wallet | `wallet-balance` |
| Feedback | `toast-{success|error|info}` |

UI tests belong in `tests/testCases/ui/` and run as Playwright project `ui`, independently of the real-state/database setup and other API test projects. The UI suite intentionally contains one complete successful-purchase E2E case: it signs in, chooses an affordable in-stock Pokémon, and verifies the wallet debit, stock reduction, inventory quantity increase, and purchase history entry against values observed before checkout. Configure the target origin with `WEB_BASE_URL`; it defaults to `http://localhost:3002`. Run with `npm run test:ui` after making the target web server reachable. For example:

```powershell
$env:WEB_BASE_URL = 'https://web-under-test.example'
npm run test:ui
```

```bash
WEB_BASE_URL=https://web-under-test.example npm run test:ui
```

The target must have the demo trainer and a funded wallet configured with the credentials in the selected test environment (`AUTH_TEST_EMAIL` and `AUTH_TEST_PASSWORD`). The test does not launch the application or reset data, and it creates a real purchase; use only an isolated test environment. It does not depend on the API test project's global state setup.
