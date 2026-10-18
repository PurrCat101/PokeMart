<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Anti-AI-Slop UI & Design System Guardrails
When developing UI in this project, NEVER generate "AI Slop":
- 🚫 NO violet/purple/indigo gradients or glowing orbs (`bg-gradient-to-r from-purple-600 to-indigo-600`).
- 🚫 NO frosted glassmorphism overlays with low contrast (`backdrop-blur-md bg-white/10`).
- 🚫 NO bloated bubble radii (`rounded-3xl` or excessive `rounded-full` on cards/buttons).
- 🚫 NO hollow marketing buzzwords or emoji spam (✨, 🚀, 💡, 🔥 in headings).
- 🚫 NO unreadable low-contrast typography (`text-zinc-500` text on dark backgrounds).
- ✅ DO use high-contrast, structured layouts with PokéMart Crimson (`#DC2626`) brand accents.
- ✅ DO use `font-mono tabular-nums` for prices, IDs, balances, timestamps, and stock counts.
- ✅ DO provide complete real-world UX states: loading skeletons, clear error banners with API error codes (`INSUFFICIENT_FUNDS`, `INSUFFICIENT_STOCK`), and empty states.
- ✅ DO refer to `ANTI_AI_SLOP_UI_GUIDE.md` for complete design token specifications.
