# PokéMart Frontend — Anti-AI-Slop UI Design Standard & Guidelines

> **Mandate:** This codebase strictly prohibits generic "AI Slop" aesthetics. Every interface element must be purposeful, high-contrast, structurally sound, and engineered for real product usability.

---

## 1. What is "AI Slop" UI? (Strictly Forbidden 🚫)

| Cliché AI-Slop Pattern | Why It Fails | What We Do Instead |
|---|---|---|
| **Glowing violet/indigo gradients** (`bg-gradient-to-r from-purple-600 to-indigo-600`) | Cheap, generic, uninspired template look from early 2024 AI generators | Solid, deliberate palette: PokéMart Crimson (`#DC2626`), high-contrast zinc neutrals (`zinc-900`/`zinc-100`) |
| **Heavy glassmorphism & blurry glows** (`backdrop-blur-xl bg-white/10 shadow-indigo-500/50`) | Destroys contrast, causes legibility issues, tanks rendering performance | Crisp 1px structural borders (`border-zinc-200 dark:border-zinc-800`), clean opaque surfaces |
| **Bloated bubble radius** (`rounded-3xl`, `rounded-[40px]`) on buttons & cards | Childish, wastes screen space, ruins alignment grid | Disciplined geometry: `rounded-md` (4px/6px) or `rounded-lg` (8px) |
| **Gratuitous icon & emoji spam** (✨, 🚀, 💡, 🔥 on headings) | Meaningless decoration, patronizing tone | Crisp, purposeful labels; icons only when functional (actions, status, navigation) |
| **Hollow marketing copy** ("Next-Gen Pokémon Experience Powered by AI") | Disconnects the user from the actual tool | Clear, functional product copy: "PokéMart Catalog", "Trainer Wallet", "Transaction Ledger" |
| **Low-contrast unreadable text** (`text-zinc-500 text-xs` on dark backgrounds) | Inaccessible, straining to read | High-contrast hierarchy: Primary `text-zinc-900` / `dark:text-zinc-100`, secondary `text-zinc-600` / `dark:text-zinc-400` |
| **Missing real states** (fake buttons, no loading skeleton, no error feedback) | Breeds fragile mockups instead of working software | Full state coverage: Exact skeleton loaders, error banners with API error codes (`INSUFFICIENT_FUNDS`), empty states |

---

## 2. Design System Tokens & Rules

### A. Color Palette
- **Brand Primary:** PokéMart Crimson (`#DC2626` / `bg-red-600`, hover `bg-red-700`, active `bg-red-800`)
- **Neutrals (Light Mode):**
  - Page Background: `bg-zinc-50`
  - Surface / Cards: `bg-white`
  - Borders: `border-zinc-200`
  - Text Primary: `text-zinc-900`
  - Text Secondary: `text-zinc-600`
  - Text Muted: `text-zinc-500`
- **Neutrals (Dark Mode):**
  - Page Background: `bg-zinc-950`
  - Surface / Cards: `bg-zinc-900`
  - Borders: `border-zinc-800`
  - Text Primary: `text-zinc-100`
  - Text Secondary: `text-zinc-400`
  - Text Muted: `text-zinc-500`
- **Pokémon Type Accents:** Authentic, restrained badge tones with subtle borders (e.g., Grass: `bg-emerald-50 text-emerald-700 border-emerald-200`, Fire: `bg-amber-50 text-amber-700 border-amber-200`, Water: `bg-sky-50 text-sky-700 border-sky-200`).

### B. Typography & Numbers
- **Primary Sans:** Clean, balanced font stack (`system-ui, -apple-system, sans-serif`)
- **Data & Numbers:** ALWAYS use `font-mono tabular-nums` for:
  - Prices (`₽ 300`)
  - Wallet balances (`₽ 10,000`)
  - Stock levels (`12 in stock`)
  - IDs & UUIDs (`00000000-0000-4000-8000-000000000001`)
  - Timestamps (`2026-10-18 13:10:00`)

### C. Layout & Information Density
- Designed like a professional commerce and inventory terminal.
- Avoid excessive empty padding (`p-16`). Use balanced, dense layouts (`p-4` to `p-6`).
- Grid views must be structured with consistent aspect ratios and aligned actions.

### D. Interactive States
- **Focus:** Every interactive element MUST have accessible focus rings:
  `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-1`
- **Disabled:** Explicit visual feedback: `disabled:opacity-50 disabled:cursor-not-allowed`
- **Loading:** Shimmer skeleton matching the exact component layout (`animate-pulse bg-zinc-200 dark:bg-zinc-800`).
