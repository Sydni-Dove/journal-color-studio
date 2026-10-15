# HANDOFF — Journal Color Studio + Product Studio

Read this first when picking up the work (any assistant or developer). Keep it current: update it in the same
commit as any change to state, branches, rules or open decisions.

_Last updated: 2026-10-15 — Phase 8 reviewed (on `claude/phase8-ai-generation`, not merged)._

## The two apps

| App | Where | Role | Deploys (Vercel) |
| --- | --- | --- | --- |
| **Journal Color Studio** (JCS) | repo root: `index.html`, `color-core.js`, `print-prep.html`, artwork files | Design laboratory: palettes, recolor, covers, artwork; approves visual assets | `journal-color-studio` |
| **Product Studio** (PS) | `product-studio/` (Vite + React + TS) | Product builder: geometry, books, pages, pagination, print/export | `dove-product-studio` (builds only when `product-studio/` changes) |

**Shared design assets:** approved JCS artwork, palettes and covers reach PS through a **versioned
design-library snapshot** (`product-studio/src/design-library/library.ts`, `SNAPSHOT.md`, `coverSurfaces.ts`;
docs `product-studio/docs/design-library-architecture.md`, `cover-divider-pages.md`). No live link: a new JCS
design appears in PS only after a deliberate snapshot refresh (steps in `SNAPSHOT.md` "To refresh"). Never build
a second cover library or copy artwork outside that snapshot. A shared versioned package is an open alternative
that needs its own review.

## Branches (2026-10-15)

| Branch | State |
| --- | --- |
| `main` | Phases 0–7, the paper-gold print fixes, Rose Marble gold (d4e5cf1). Production for both apps. |
| `claude/phase8-ai-generation` | Phase 8 (AI-generated documents) + main merged in + review fixes. **Awaiting approval to merge.** Includes Codex's `codex/product-studio-phase8` and `backup/codex-phase8-uncommitted-2026-10-09`. |
| `preview/product-studio-builder-design-lab` | Older preview branch; everything on it is in `main`. |
| `claude/roadmap-guided-design-builder` | First draft of the Phase 9 roadmap entry; superseded by the roadmap on the Phase 8 branch. Safe to delete after Phase 8 merges. |
| `backup/*` | Safety copies; do not build on them. |

## Rules (from Sydni)

- Never push to `main` or promote production without Sydni's explicit approval for that change.
- Report review results before merging a phase. Do not begin the next phase until the previous one is merged and stable.
- `product-studio/tests/golden-templates.test.ts` must stay unchanged by refactors; a deliberate print change
  updates it in the same commit and says why.
- Commits end with the Co-Authored-By / Claude-Session lines; no model ids in commits or code.
- JCS stays the design lab, PS the product builder (see above).

## Phases (details: `product-studio/docs/roadmap.md`)

0–7 done (foundation, measurement, pagination, data layer, devotional, inventory, layout assistant).
**8 AI-generated documents** — reviewed, not merged. **9 Guided Design Builder & Custom Cover Artwork** — planned,
starts after 8 is merged and stable (4 stages; reuses the shared cover snapshot; adds image upload; "design
styles", not "recipes"). **10 Requirements Assistant** — reserved.

## Phase 8 review (2026-10-15)

- Merges cleanly with `main`. TypeScript clean. Unit tests 1519/1519. Print snapshots: every existing template
  prints exactly as before (only 3 obsolete snapshot entries removed); 30 more products the snapshots don't cover
  (inventory, guided, custom, stationery) also print identically.
- Browser tests 146/157 in the cloud sandbox: the 11 failures need web fonts, which never load there (export is
  correctly blocked until fonts load); 10 of them fail identically on `main`. Run them on a normal machine.
- Edge Function `generate-document` (Supabase project `jnlvvlkwskidloripvtp`): deployed v7 = branch code;
  sign-in required (signed-out call → 401); OpenAI key server-side only; usage rows insert/read own only (cap can't
  be reset); 19 live proposals ran 2026-10-09. Deployed cap is 30/day for everyone; the branch sets **free 5/day**
  and a paid hook (`app_metadata.plan === "paid"` → `PAID_DAILY_CAP`, default 50) — takes effect when the
  function is redeployed (needs approval).
- Fixed in review: a continued page could start or end on the blank paragraph-space line; stray
  `supabase/.DS_Store` removed (root `.gitignore` added).
- Open decisions: (1) paragraph space is always on — saved text with blank lines now prints an empty line between
  paragraphs (keep, or make it a setting); (2) "Generate with AI" shows when signed out (the message comes only
  after describing); (3) no cap on total pages (30 sections × 500 copies possible); (4) review screen shows
  `{day}`-style placeholders and is cramped on phones; (5) whether sign-ups are open (each free account can use
  5 proposals a day once redeployed — cost).

## Business direction

- AI generation will become a paid feature. Free accounts keep a small allowance (about 5 proposals a day or
  fewer); paid accounts get more. Not built yet: billing, how a paid plan is granted (Stripe or manual), the paid
  daily number, and showing remaining uses in the app. The plan must be server-controlled (`app_metadata`), never
  `user_metadata`.

## Testing

```
cd product-studio
./node_modules/.bin/tsc --noEmit -p .
npx vitest run                                   # unit (golden snapshots included)
npx vite build && npx vitest run -c vitest.browser.config.ts   # browser; needs Chromium + internet fonts
```
In the cloud sandbox set `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; font-dependent export
tests fail there (see above). Recommendation: self-host the studio fonts so export never depends on Google Fonts
(also protects users who print offline).

## Printing notes

- Sydni's printer: Epson EcoTank ET-2980. Gold prints true with the paper gold (#AB9230 for the Dove gold #E6A742),
  confirmed 2026-10-15 — no further color adjustment needed. Print settings: Epson driver (not AirPrint), High
  quality, EPSON Color Controls.
