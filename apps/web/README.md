# PokéMart Commerce Terminal (@pokemart/web)

High-density, intentional PokéMart commerce and inventory terminal built with **Next.js (App Router)** and **Tailwind CSS**.

Integrated seamlessly into the monorepo workspace and connected to the public **BFF (Backend-For-Frontend)** at `http://localhost:3001`.

---

## 🛡️ Anti-AI-Slop Design Philosophy

This frontend follows strict anti-AI-slop design standards:
- **No Cliché Gradients:** No violet/purple glowing gradients or floating orb backgrounds.
- **High-Density, Purposeful UX:** Clean retail & inventory layout with high information density.
- **Accurate Branding:** High-contrast PokéMart Crimson (`#DC2626`) accents and authentic Pokémon type badges.
- **Precise Typography:** Tabular monospaced numbers (`tabular-nums font-mono`) for prices, IDs, timestamps, and stock.
- **Production States:** Layout-stable loading skeletons, structured API error banners with codes (`INSUFFICIENT_FUNDS`, `INSUFFICIENT_STOCK`), and empty states.

See [ANTI_AI_SLOP_UI_GUIDE.md](./ANTI_AI_SLOP_UI_GUIDE.md) for full design token specifications and rules.

---

## 🚀 Getting Started

From the repository root:

```bash
# Run Next.js in development mode (starts on http://localhost:3002)
npm run dev:web

# Build for production
npm run build:web

# Run production build
npm run start:web
```

### Port Allocation:
- `3000`: PokéMart Internal API
- `3001`: PokéMart BFF Service
- `3002`: PokéMart Web Frontend (Next.js)
- `8080`: WireMock
- `8081`: Swagger UI
- `3307`: MySQL (host)

---

## ⚡ Features
1. **Catalog Browsing:** Filterable by name, ID, and Pokémon type with real-time stock and pricing.
2. **Trainer Authentication:** Direct login modal with blank email and password fields; local demo credentials are documented in the repository root [README](../../README.md).
3. **Live Wallet Display:** Real-time PokéDollar (`₽`) balance indicator.
4. **Transactional Idempotency:** Creates unique UUID `purchaseId` per checkout, with balance & stock validation.
5. **Trainer Backpack (Inventory):** Live synced collection of purchased Pokémon.
6. **Audit Ledger:** Chronological record of all past purchases with transaction UUIDs.

## Playwright UI automation

Frontend controls expose a stable `data-testid` contract for browser tests. Selectors use lowercase kebab-case names; repeated records append their stable domain ID, for example `pokemon-card-1` and `pokemon-add-to-cart-1`. QA can write tests from requirements/Figma using the selector-to-locator table in [specs/09-frontend.md](../../specs/09-frontend.md) even before the page is implemented. Do not derive tests from CSS classes, DOM structure, or visible copy when a test ID is defined. Keep semantic role/name assertions for accessibility behavior, and treat test IDs as selectors rather than a replacement for accessible markup.

The UI suite has one end-to-end purchase case that checks wallet debit, stock reduction, inventory increase, and the purchase ledger. It lives in `tests/testCases/ui/` and runs separately from API, database-state setup, and Docker Compose:

```powershell
$env:WEB_BASE_URL = 'http://localhost:3002'
npm run test:ui
```

```bash
WEB_BASE_URL=http://localhost:3002 npm run test:ui
```

Set `WEB_BASE_URL` to the target site's origin to run the same suite against another deployment. The target web server and its BFF/API/database must already be reachable, with the configured demo trainer and a funded wallet. UI tests do not start these services or require the API test project's global state setup. The purchase case creates a real transaction and changes wallet, inventory, and stock; use an isolated test environment. Set `AUTH_TEST_EMAIL` and `AUTH_TEST_PASSWORD` if the target uses credentials different from the selected `tests/configs/.env.*` file. Add browser scenarios under `tests/testCases/ui/` and use `page.getByTestId('...')` with the selector names documented in [specs/09-frontend.md](../../specs/09-frontend.md).
