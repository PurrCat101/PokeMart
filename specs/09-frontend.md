# 09 — Web Frontend

## 1. Purpose and scope

The PokéMart web application is a browser client for the public BFF. It provides a local commerce experience for browsing the Pokémon catalog, signing in as a trainer, managing a cart, purchasing listings, and reviewing wallet, inventory, and purchase history.

The frontend is part of the monorepo at `apps/web`. It is not included in `docker-compose.yml`; run it separately from the repository root. It must use the public BFF and must not call the internal PokéMart API directly.

## 2. Technology and local runtime

- Next.js App Router with React and TypeScript.
- Tailwind CSS for application styles.
- Development and production server port: `4003`.
- Public BFF default URL: `http://localhost:4001`.
- `apps/web/next.config.ts` rewrites browser requests from `/api/:path*` to the configured BFF URL.

Configure the BFF URL with `NEXT_PUBLIC_BFF_URL` or `BFF_INTERNAL_URL`; if neither is set, the app uses `http://localhost:4001`. The example values are in `apps/web/.env.example`.

Run from the repository root:

```bash
npm run dev
npm run build:web
npm run start:web
```

The BFF and its downstream services must be running for API-backed features to work. For a local full-stack session, start the Compose services and the web app in separate terminals.

## 3. Application areas

- **Catalog:** load Pokémon and item listings from the public API; search by name or ID; switch between product families; filter Pokémon by type or items by category and availability; sort by ID, price, or name; browse 12 results per page.
- **Cart and checkout:** Pokémon and item listings share one bag. Both catalogs offer a quantity stepper (limited by available stock), **Add to bag** (primary action) and **Buy now** (secondary; pays for that one line without changing the bag). Checkout submits each line to `POST /api/purchases` (with `pokemonId` for a Pokémon, `itemId` for an item); a failed line does not block the others and stays in the bag. The cart is stored in browser `localStorage`; bags saved before items existed (lines without `kind`) are read as Pokémon.
- **Verification awareness:** item listings may need a higher verification level. The UI never says "KYC"; it uses account-verification wording, like an exchange account: *not verified* (level 0) cannot buy anything, *basic verification* (1) unlocks Pokémon and ordinary items, *advanced verification* (2) also unlocks the Master tier. Pokémon always need level 1 (the catalog API returns no level for them), items carry their own `requiredKycLevel`. The bag and checkout compare the item's requirement with the verification record (`level` **and** `status`) from `GET /api/account-info` and warn early, for example "Needs advanced verification. Your account is not verified yet" A known shortfall disables checkout for the bag; an unknown level (the verification service is unavailable) only warns. The API stays the source of truth and still rejects with `KYC_LEVEL_REQUIRED`, which the UI shows as a plain-language message. The numeric level never appears on screen. Selector names such as `item-kyc-{itemId}` and `cart-kyc-warning` keep their original names so tests do not break when copy changes. The check uses `status` as well as the level: only an `ACTIVE` record grants its level, a `REJECTED` record never does, and a `PENDING_REVIEW` account is blocked from every purchase (the API returns `403 KYC_PENDING_REVIEW`; the bag and checkout show "Verification under review" and disable payment).
- **Identity verification flow:** a signed-in account that is not verified (`level` 0, `status` `ACTIVE`) sees a popup, "Verify your identity", once per browser session (remembered per account in `sessionStorage`). "Maybe later" or the close button dismisses it; "Verify now" opens a full-page form (not a route; it replaces the tab content). The form asks for full name, 13-digit national ID, date of birth (18+), 10-digit phone, address and a confirmation checkbox, validates on submit with the same rules as the API (see [`12-kyc.md`](12-kyc.md) section 10), and shows server `details` next to the matching fields. A successful `POST /api/kyc/submissions` returns the user to the shop with a toast, and every tab then shows a banner: *Your verification is under review* (`PENDING_REVIEW`; browsing works, purchases are rejected by the API) or *We couldn't verify your identity* with a **Send again** button (`REJECTED`). The popup does not open while sign-in, checkout or the form is open. Approval or rejection happens out of band (test-only `PUT /__test/users/{userId}` on the KYC service); the UI picks it up the next time account info is loaded (page load or sign-in).
- **Trainer sign-in:** use the demo login endpoint to establish a session. The access token is stored in browser `localStorage` and attached as a bearer token to authenticated API requests.
- **Wallet:** display the signed-in trainer's balance and refresh it after purchase activity.
- **No inventory page:** this is a shop, so the web has no Inventory screen. What a trainer bought is their order history, and everything bought (Pokémon or items) is delivered.
- **Orders (`/orders`):** a real route. Pokémon orders and item orders sit on two tabs of the same page (`orders-kind-pokemon`, `orders-kind-items`). Every order row shows its delivery status and tracking number, and opens the same order-detail dialog with the shipment timeline. A successful checkout opens `/orders`. Signed-out visitors see a sign-in prompt.
- **Purchase history:** show the signed-in trainer's purchase ledger with paginated results. Each order row/card displays a compact customer-facing delivery status and tracking number when available, without requiring navigation into the order.
- **Order detail:** selecting an order opens a dedicated detail view with purchased Pokémon, totals, purchase timestamp, tracking number, current delivery status, and a chronological shipment timeline.

Catalog browsing is public. Wallet, inventory, and purchase operations require authentication. The API remains the source of truth for balances, stock, authorization, purchase results, and delivery status; frontend validation is for user experience only.

Login fields start blank; the UI does not prefill or auto-fill demo credentials. The local seeded login account is documented in the repository root `README.md`.

## 4. API boundary and request behavior

The frontend calls public routes such as `/api/pokemon`, `/api/items`, `/api/auth/login`, `/api/wallet`, `/api/inventory`, and `/api/purchases`. Next.js rewrites these requests to the BFF. The browser does not need a direct URL or credential for the internal API.

The shared API client in `apps/web/src/lib/api.ts` sends an `X-Request-Id`, adds the stored bearer token when present, and converts public API error envelopes into `ApiError` instances. Purchase requests use a client-generated UUID `purchaseId` in the JSON body, following the public API contract.

## 5. UX states and data persistence

- Keep the catalog, inventory, and purchase history loading states visible while requests are in flight.
- Show a catalog service error if the BFF or an upstream service cannot provide catalog data.
- Provide empty states for a signed-out trainer, an empty inventory, and an empty cart where applicable.
- Keep cart contents across page reloads using `pokemart_cart` in browser `localStorage`.
- Keep the access token in `pokemart_token` in browser `localStorage`; signing out clears the token.
- Order history status is read from the public purchase/shipment APIs. The browser must never call Shipping Mock test-control endpoints.
- Refresh or re-fetch shipment status when opening order detail and when the user activates refresh; do not assume status changes only while the page is open. Optional short polling may be used while the detail view is visible, with a bounded interval and cleanup on navigation.
- If shipping is waiting for a label, show `Preparing shipment` and an explanatory message; do not show `Delivered` merely because the provider accepted the shipment or generated a tracking number.
- When the provider is unavailable, retain the last known status and show a non-blocking notice if the latest status cannot be refreshed. Purchase history and order detail should still render from local PokéMart API state.
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
| Navigate | Open catalog (`/`) or orders (`/orders`) | `nav-catalog`, `nav-orders` | `page.getByTestId('nav-orders')` |
| See current balance | Signed-in trainer wallet amount | `wallet-balance` | `page.getByTestId('wallet-balance')` |
| Search catalog | Search field | `catalog-search` | `page.getByTestId('catalog-search')` |
| Browse items | Switch to item catalog and choose an item category from the dropdown (there are 50+ categories) | `catalog-kind-items`, `catalog-item-category` | `page.getByTestId('catalog-kind-items')`; `page.getByTestId('catalog-item-category').selectOption('standard-balls')` |
| View an item | Item card, name, price, and stock | `item-card-{itemId}`, `item-name-{itemId}`, `item-price-{itemId}`, `item-stock-{itemId}` | `page.getByTestId('item-card-1')` |
| Choose a Pokémon | Catalog card, name, price, available stock | `pokemon-card-{pokemonId}`, `pokemon-name-{pokemonId}`, `pokemon-price-{pokemonId}`, `pokemon-stock-{pokemonId}` | `page.getByTestId('pokemon-card-25')`; `page.getByTestId('pokemon-stock-25')` |
| Add to cart | Item action and quantity | `pokemon-quantity-{pokemonId}`, `pokemon-add-to-cart-{pokemonId}` | `page.getByTestId('pokemon-add-to-cart-25')` |
| Review cart | Drawer, item quantity, remove, proceed | `cart-drawer`, `cart-item-{pokemonId}`, `cart-item-quantity-{pokemonId}`, `cart-proceed-to-checkout` | `page.getByTestId('cart-item-25')`; `page.getByTestId('cart-proceed-to-checkout')` |
| Sign in | Email/password, submit, validation error | `login-dialog`, `login-email`, `login-password`, `login-submit`, `login-error` | `page.getByTestId('login-email')` |
| Complete checkout | Confirm, successful state, created purchase ID | `checkout-dialog`, `checkout-confirm`, `checkout-success`, `checkout-purchase-{purchaseId}` | `page.getByTestId('checkout-confirm')` |
| Verify inventory | Inventory entry and quantity by Pokémon | `inventory-view`, `inventory-item-{pokemonId}` | `page.getByTestId('inventory-item-25')` |
| Verify item inventory | Owned item and quantity | `item-inventory`, `item-inventory-item-{itemId}`, `item-inventory-empty` | `page.getByTestId('item-inventory-item-17')` |
| Verify item orders | Row, item name and quantity of an item order | `item-order-row-{purchaseId}`, `item-order-item-{purchaseId}`, `item-order-quantity-{purchaseId}`, `item-orders-empty` | `page.getByTestId('item-order-row-' + id)` |
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
| Navigation and cart entry | `nav-catalog`, `nav-orders`, `nav-catalog-mobile`, `nav-orders-mobile`, `open-cart`, `sign-in`, `sign-out` |
| Catalog controls and states | `catalog-kind-pokemon`, `catalog-kind-items`, `catalog-search`, `catalog-in-stock-filter`, `catalog-sort`, `catalog-refresh`, `catalog-retry`, `catalog-service-error`, `catalog-type` (Pokémon type `<select>`, value = type or `all`), `catalog-item-category` (item category `<select>`, value = category slug or `all`), `catalog-results-summary`, `catalog-clear-filters`, `catalog-loading`, `catalog-empty`, `catalog-grid`, `catalog-pagination`, `catalog-page-previous`, `catalog-page-next`, `catalog-page-{number}` |
| Catalog item | `pokemon-card-{pokemonId}`, `pokemon-name-{pokemonId}`, `pokemon-price-{pokemonId}`, `pokemon-stock-{pokemonId}`, `pokemon-quantity-{pokemonId}`, `pokemon-quantity-decrease-{pokemonId}`, `pokemon-quantity-increase-{pokemonId}`, `pokemon-add-to-cart-{pokemonId}` |
| Catalog item (Pokémon) | adds `pokemon-buy-now-{pokemonId}` to the selectors above |
| Item catalog item | `item-card-{itemId}`, `item-name-{itemId}`, `item-price-{itemId}`, `item-stock-{itemId}`, `item-kyc-{itemId}`, `item-quantity-{itemId}`, `item-quantity-decrease-{itemId}`, `item-quantity-increase-{itemId}`, `item-add-to-cart-{itemId}`, `item-buy-now-{itemId}` |
| Sign in | `login-dialog`, `login-email`, `login-password`, `login-submit`, `login-error`, `login-close` |
| Verification | `kyc-prompt-dialog`, `kyc-prompt-verify`, `kyc-prompt-later`, `kyc-prompt-close`; form: `kyc-view`, `kyc-form`, `kyc-fullName`, `kyc-nationalId`, `kyc-dateOfBirth`, `kyc-phone`, `kyc-address`, `kyc-consent`, `kyc-submit`, `kyc-cancel`, `kyc-back`, `kyc-form-error`, per-field errors `kyc-{field}-error`; banners: `kyc-banner-pending`, `kyc-banner-rejected`, `kyc-banner-retry` |
| Cart | `cart-drawer`, `cart-empty`, `cart-close`, `cart-clear`, `cart-sign-in`, `cart-proceed-to-checkout`, `cart-kyc-warning`, `cart-kyc-pending`; Pokémon lines: `cart-item-{pokemonId}`, `cart-item-quantity-{pokemonId}`, `cart-item-remove-{pokemonId}`, `cart-item-kyc-{pokemonId}`; item lines (note the `item-` infix, so the two ID spaces never collide): `cart-item-item-{itemId}`, `cart-item-item-quantity-{itemId}`, `cart-item-item-remove-{itemId}`, `cart-item-item-kyc-{itemId}` |
| Checkout | `checkout-dialog`, `checkout-progress`, `checkout-confirm`, `checkout-close`, `checkout-success`, `checkout-errors`, `checkout-kyc-warning`, `checkout-kyc-pending`, `checkout-purchase-{purchaseId}` (one receipt per completed line, Pokémon or item) |
| Inventory | `inventory-view`, `inventory-loading`, `inventory-auth-required`, `inventory-empty`, `inventory-refresh`, `inventory-sign-in`, `inventory-item-{pokemonId}` |
| Purchase history | `purchases-view`, `purchases-auth-required`, `purchases-table`, `purchases-empty`, `purchase-row-{purchaseId}`, `purchase-item-{purchaseId}`, `purchase-quantity-{purchaseId}`, `purchase-delivery-status-{purchaseId}`, `purchase-tracking-number-{purchaseId}`, `purchase-open-detail-{purchaseId}`, `purchases-refresh`, `purchases-sign-in`, `purchases-page-previous`, `purchases-page-next` |
| Order detail and shipping | `order-detail-{purchaseId}`, `order-detail-delivery-status`, `order-detail-tracking-number`, `order-detail-shipment-timeline`, `order-detail-refresh`, `order-detail-shipping-notice`, `shipment-timeline-step-{status}`, `shipment-timeline-current`, `shipment-timeline-loading`, `shipment-timeline-error` |
| Order detail close | `order-detail-close` |
| Catalog empty-state action | `catalog-reset-filters` |
| Theme | `theme-toggle` |
| Trainer wallet | `wallet-balance` (text is exactly `₽ {amount}`) |
| Feedback | `toast-{success|error|info}` |

UI tests belong in `tests/testCases/ui/` and run as Playwright project `ui`, independently of the real-state/database setup and other API test projects. The UI suite intentionally contains one complete successful-purchase E2E case: it signs in, chooses an affordable in-stock Pokémon, and verifies the wallet debit, stock reduction, inventory quantity increase, and purchase history entry against values observed before checkout. Configure the target origin with `WEB_BASE_URL`; it defaults to `http://localhost:4003`. Run with `npm run test:ui` after making the target web server reachable. For example:

```powershell
$env:WEB_BASE_URL = 'https://web-under-test.example'
npm run test:ui
```

```bash
WEB_BASE_URL=https://web-under-test.example npm run test:ui
```

The target must have the demo trainer and a funded wallet configured with the credentials in the selected test environment (`AUTH_TEST_EMAIL` and `AUTH_TEST_PASSWORD`). The test does not launch the application or reset data, and it creates a real purchase; use only an isolated test environment. It does not depend on the API test project's global state setup.


## 8. Purchase history and order detail — shipping UX

### Purchase history quick status

Each purchase row/card must show a compact delivery-status label without requiring a click into the order. Use the API's `deliveryStatus` as the source of truth:

| API status | Display label |
|---|---|
| `WAITING_FOR_SHIPMENT` | Preparing shipment |
| `LABEL_CREATED` | Awaiting shipment |
| `IN_TRANSIT` | In transit |
| `OUT_FOR_DELIVERY` | Out for delivery |
| `DELIVERED` | Delivered |
| `DELIVERY_FAILED` | Delivery failed |

UI copy is English. The order detail timeline reads `Order placed` → `Tracking number issued` → `Awaiting shipment` → `In transit` → `Out for delivery` → `Delivered` (`Delivery failed` replaces the remaining steps on failure). `Tracking number issued` and `Awaiting shipment` are both reached at `LABEL_CREATED`; `WAITING_FOR_SHIPMENT` (no tracking number yet) leaves `Order placed` as the latest step.

The order itself may also display the order milestone `ORDER_PLACED` (Order placed), but this must not replace the shipment status. When there is no shipment record because of a legacy order, show a safe neutral fallback rather than treating the order as delivered. Show the tracking number only after one has been issued.

### Order detail

Selecting a purchase opens a dedicated order-detail route or view scoped to that purchase. It must show the order summary and a shipment section containing current status, tracking number (if issued), last status update time, and a chronological timeline. The timeline distinguishes label creation from actual movement and delivery; `LABEL_CREATED` is not `IN_TRANSIT` and neither means `DELIVERED`.

Use accessible text in addition to any color/icon status treatment. Loading and refresh errors must not erase the last known status. A provider outage should produce a non-blocking notice, not a blank order detail page. The user-facing application must call only public BFF endpoints; test-only provider controls are for local API/Playwright exercises and must never be exposed in the UI.

### UI acceptance scenarios

1. After checkout, the purchase appears in history with `Preparing shipment` while shipment label creation is pending.
2. After the worker recovers from a simulated provider outage and creates a tracking number, the history row updates to `Awaiting shipment` without opening the order; the detail view shows the tracking number.
3. After a test operator advances provider status to `IN_TRANSIT`, `OUT_FOR_DELIVERY`, and `DELIVERED`, the reconciliation worker updates PokéMart state; history quick status and the order detail timeline show the latest status.
4. If Shipping is down, history and detail remain available and display the last known state plus a non-blocking notice when appropriate.
5. Verify loading, no-tracking-number, failed shipment creation, delivery failure, and refresh-error states.
