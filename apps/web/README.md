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
2. **Trainer Authentication:** Direct login modal with 1-click test trainer credential autofill (`lab-user-001@example.test`).
3. **Live Wallet Display:** Real-time PokéDollar (`₽`) balance indicator.
4. **Transactional Idempotency:** Creates unique UUID `purchaseId` per checkout, with balance & stock validation.
5. **Trainer Backpack (Inventory):** Live synced collection of purchased Pokémon.
6. **Audit Ledger:** Chronological record of all past purchases with transaction UUIDs.
