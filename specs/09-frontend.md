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
