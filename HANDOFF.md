# HANDOFF — Journal Color Studio + Product Studio

Read this first when picking up the work (any assistant or developer). Keep it current: update it in the same
commit as any change to state, branches, rules or open decisions.

_Last updated: 2026-10-15 — Phase 8 reviewed and fixed (on `claude/phase8-ai-generation`), waiting for merge approval._

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
- Browser tests (now 151/162 with the new ones) in the cloud sandbox: the 11 failures need web fonts, which never load there (export is
  correctly blocked until fonts load); 10 of them fail identically on `main`. Run them on a normal machine.
- Edge Function `generate-document` (Supabase project `jnlvvlkwskidloripvtp`): deployed v7 = branch code;
  sign-in required (signed-out call → 401); OpenAI key server-side only; usage rows insert/read own only (cap can't
  be reset); 19 live proposals ran 2026-10-09. Deployed cap is 30/day for everyone; the branch sets **free 5/day**
  and a paid hook (`app_metadata.plan === "paid"` → `PAID_DAILY_CAP`, default 50) — takes effect when the
  function is redeployed (needs approval).
- Done after review (2026-10-15, on the branch):
  - **Space between paragraphs**: on by default; Page layout → Spacing → "Space between paragraphs" turns it off
    (`layoutOptions.paragraphSpace`). In the page and pagination cache keys, so preview, continued pages and
    print follow it. A blank line at a page break is dropped. Tests: on/off pagination, browser switch + reload.
  - **Free AI allowance 5/day**, enforced in the Edge Function (server), with a paid hook (`app_metadata.plan ===
    "paid"` → `PAID_DAILY_CAP`, default 50). No paid tier, billing or plan-granting yet.
  - **800-page limit**: the outline's fewest pages are counted before anything is built and the real count after
    expansion (review shows a plain message; Create stays off). The Edge Function rejects a proposal past 800
    before returning it.
  - **Signed out**: Generate with AI shows the sign-in card first; no description box until signed in.
  - **iPhone review screen** (Sydni's report: fields clipped left/right, "Page 1" title showing "Re"). Root causes:
    (1) every form field inherited the studio's 15px text; iPhone Safari zooms into any field under 16px and
    stays zoomed, so the page ran past both screen edges; (2) the page-title field had an inline `flex: 1`
    (zero basis) beside menus sized by their longest option, squeezing it to 37px. Fix (UI only): fields use
    16px on phones / touch screens (desktop keeps 15px), the Page / Repeats / Copies row is a grid that becomes one
    column under 600px, fields 44px tall. Tests at 390 and 430px (fail on the old layout).
  - Stray `supabase/.DS_Store` removed (root `.gitignore`).
- **Edge Function changes waiting for approval to deploy** (live v7 still allows 30/day and has no page limit):
  free cap 30 → 5 with the paid hook above; reject proposals past 800 pages (`MAX_DOCUMENT_PAGES`); new error
  wording; `VERSION` `generate-document-2026-10-15-spec-v4-plans`. No schema or prompt change. Deploy =
  redeploy `supabase/functions/generate-document` (index.ts + schema.json) to project `jnlvvlkwskidloripvtp`.
- Remaining refinements (not blocking): the review screen shows `{day}`-style placeholders in page titles (show
  them as friendly chips); whether sign-ups are open (each free account = 5 proposals/day of OpenAI cost);
  home-page "Generate with AI" could say "sign in required" before the click; self-host fonts (see Testing).

## AI content: research and creative development (assessed 2026-10-15, not built)

Sydni's test: "A homeschool reading log for kids: book, pages read, a favourite part, and a parent check-off",
with "Bible scriptures, character building, the Abeka curriculum for subjects". Phase 8 built the log and put
those words into an intro note: it is built to keep the maker's wording and *not* invent content ("Do not invent
content entries unless they ask you to write content"), and it has no way to look anything up.

**Today's architecture:** one Edge Function call → one structured-output answer (`docSpecSchema.json`: sections,
components, entries; every piece `source: "user" | "suggested"`) → `checkSpec` → review → `projectFromSpec` →
existing engines. Content already has a home: `entries` (one record per day / lesson / book) printed by per-entry
sections, and component text. So content generation needs no layout or pagination change.

**Three modes, smallest extension:**
1. *Structure only* — today's behaviour (default).
2. *Develop original content* — same call and schema; a `mode` field selects a system-prompt variant that writes
   entries and prompts (reflections, Scripture connections, character prompts, activities), all
   `source: "suggested"` and shown as such in review; the maker's own wording still verbatim. Needs: mode picker in
   the describe step, prompt variant, higher output allowance, the existing Scripture / citation flags. Small.
3. *Research and develop* — a separate step *before* the outline: ask for context (grade, subject, tradition /
   translation), search grounded sources (provider web search with citations, e.g. OpenAI Responses API
   `web_search`, or a search API), return a **content proposal**: topics / findings each with its source URL
   (*verified*) or marked *AI suggestion*; the maker reviews, removes, edits, then the outline is built from the
   approved proposal with the same schema plus an optional `sources` list and a per-item `basis`
   (`user | suggested | sourced` + source ids) — backward compatible. Rules: never claim official curriculum
   alignment or endorsement without evidence (say "inspired by publicly available descriptions of …"); no
   reproduction of proprietary curriculum text (topics and summaries only, short attributed quotes at most);
   Scripture as references, with text only from public-domain translations (e.g. KJV) or the maker's own;
   research results kept separate from layout. Medium–large: new review screen, sources UI, schema addition,
   multi-step server flow (may need an async job pattern if it runs longer than the function's time limit),
   tests with recorded research answers.

**Cost:** structure ≈ today's per-request tokens; develop content several times more output; research adds search
calls (per-call fees plus the pages read) and usually a second model call — several times a structure request.
Count research as more than one unit of the daily allowance, and treat it as a paid-tier feature.

**Where it belongs (recommendation):** mode 2 as a small **Phase 8.1** right after Phase 8 merges (same pipeline,
no new dependency; about a short focused round of work). Mode 3 as its own phase **after Phase 9**, alongside the
paid tier (research costs money; needs entitlements, a search provider decision, and the sources review UI).
Phase 9 (Guided Design Builder) is unaffected if mode 3 waits; doing mode 3 first would push Phase 9 back by the
whole research phase. Requirements Assistant moves after research.

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
