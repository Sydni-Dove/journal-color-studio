# HANDOFF — Journal Color Studio + Product Studio

Read this first when picking up the work (any assistant or developer). Keep it current: update it in the same
commit as any change to state, branches, rules or open decisions.

_Last updated: 2026-10-15 (8.1 story-length investigation added; model comparison blocked on an API key — see below). Phase 8 is merged to `main` (89f054b) and live. Phase 8.1's server side is live (cost table + `generate-document` with develop mode and page-limit handling) and live-tested; the studio side is on `claude/phase8.1-develop-content`, **not merged** (awaiting approval)._

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
| `main` | Phases 0–8 (Phase 8 merged 2026-10-15, 89f054b), paper-gold print fixes, Rose Marble gold. Production for both apps. |
| `claude/phase8-ai-generation` | Phase 8 as reviewed; merged into `main`. Keep for reference; don't build on it. |
| `claude/phase8.1-develop-content` | Phase 8.1 (Develop original content): built and live-tested; its server side is deployed (approved). **Studio not to be merged without approval.** |
| `preview/product-studio-builder-design-lab` | Older preview branch; everything on it is in `main`. |
| `claude/roadmap-guided-design-builder` | First draft of the Phase 9 roadmap entry; superseded (now in `main`). Safe to delete. |
| `backup/*` | Safety copies; do not build on them. |

## Rules (from Sydni)

- Never push to `main` or promote production without Sydni's explicit approval for that change.
- Report review results before merging a phase. Do not begin the next phase until the previous one is merged and stable.
- `product-studio/tests/golden-templates.test.ts` must stay unchanged by refactors; a deliberate print change
  updates it in the same commit and says why.
- Commits end with the Co-Authored-By / Claude-Session lines; no model ids in commits or code.
- JCS stays the design lab, PS the product builder (see above).

## Phases (details: `product-studio/docs/roadmap.md`)

0–8 done (foundation, measurement, pagination, data layer, devotional, inventory, layout assistant, AI-generated
documents). **8.1 Develop original content** — built on `claude/phase8.1-develop-content` with Sydni's decisions
(counts as 1 of the 5; 30 whole entries a request + batches; public-domain Scripture quotations only; free for now).
Details: `product-studio/docs/phase-8.1-plan.md`. Server side is live and live-tested (below); the studio merge
awaits approval. No external research.
**9 Guided Design Builder & Custom Cover Artwork** — after 8.1 (4 stages; reuses the shared cover snapshot; adds
image upload; "design styles", not "recipes"). **10 Research and develop content** — future, paid tier.
**11 Requirements Assistant** — reserved. Technical improvements (any time, not blocking a phase): self-hosted
fonts (see Testing).

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

## Phase 8 merge and Edge Function deploy (2026-10-15)

- **Merged** `claude/phase8-ai-generation` into `main` (89f054b, a merge commit; the tree is identical to the tested
  branch). Vercel `dove-product-studio` production built it (READY). Verified at the time: unit 1525/1525, build,
  browser 162/162 (with fonts reachable — see Testing).
- **Supabase project verified**: the app's `SUPABASE_URL` is `jnlvvlkwskidloripvtp` = "Dove Expressions App 2",
  the only active project for this app (others listed are inactive or other apps).
- **Deployed** `generate-document` **v8** (was v7) with `verify_jwt` still on: free 5/day + paid hook, 800-page
  limit, new messages, `VERSION generate-document-2026-10-15-spec-v4-plans`; `schema.json` unchanged. The live
  code was read back and matches `main`. **Nothing else changed**: the other 10 functions kept their version and
  fingerprint (ocr-image 23, polly-tts 18, transcribe-audio 13, backfill-audio-transcripts 11, acx-extract 10,
  screenshot-extract 10, hearing-god-video 10, hg-video-diag 5, shared-attachment 3, import-journal 6); no
  database, policy, secret or migration change.
- **Live checks done**: no token → 401; public key only (signed out) → 401 "Sign in to generate a document.";
  forged token → 401; CORS preflight → 204. Production site: signed out, Generate with AI shows the sign-in card,
  no description box, no request sent. Production bundle contains the new wording.
- **Signed-in live checks — all passed (2026-10-15, approved temporary test account
  `ps-livecheck-20261015@example.com`, created by SQL, no email sent):**
  (1) "A 7-day prayer journal…" → 200, gpt-4.1-mini, v8; the proposal ran through `checkProposal` +
  `buildFromOutline` → 15 pages, 0 errors (only the expected "perfect bound needs 24 pages" note).
  (2) "A daily log, 900 copies" → 422 "That proposal would have at least 900 pages; a document can have at most 800…"
  (counted as 1 of the 5: the model was called).
  (3) Requests 3–5 → 200; the 6th → 429 "Free accounts can make 5 document proposals a day, and today's are used."
  `edge_usage_logs` held exactly 5 rows (units 1) — the 6th, refused at the limit, isn't counted; the 900-page one was
  (the AI had been called; see the usage-accounting evaluation in `phase-8.1-plan.md`). The account's own REST
  DELETE and PATCH on its rows changed 0 rows, and it stayed blocked afterwards (the cap can't be reset by the user).
- **Cleanup still open:** the test account was signed out everywhere (no live refresh tokens), but deleting it
  timed out through the Supabase MCP tool (deletes don't run from the cloud session; reads/inserts do). Delete it in
  the Supabase dashboard → Authentication → Users → `ps-livecheck-20261015@example.com`; its 5 usage rows go with it
  (`edge_usage_logs_user_id_fkey` is ON DELETE CASCADE). Expected afterwards: 11 users, 40 usage rows.

## Phase 8.1 — Develop Original Content (live-tested 2026-10-15; branch not merged)

**Status:** the server side is live in production (approved): migration `ai_generation_costs` applied, and
`generate-document` deployed. The **studio changes are only on `claude/phase8.1-develop-content`**: production
still runs the Phase 8 studio, which never sends `mode`, so production users get Structure only. **Do not merge
without Sydni's approval.**

**What it does.**
- **Mode choice** in Generate with AI:
  - *Structure only* is the default; its request and product are exactly Phase 8's (tested).
  - *Develop original content* has the AI write the days, lessons, stories, activities, questions and prayers.
  - Each request counts as 1 of the 5 a day.
- **Size:** up to 30 complete entries per request. "Write the next batch" continues a series without repeats.
- **AI-written content is marked:** `origin` on entries and page sections shows "AI-written — review" in Your
  content and Add to page, with "Mark as reviewed" and "Mark all reviewed".
  - It stays editable, and undo, save, sync and duplicate keep it.
  - It is never printed (tested).
  - The maker's wording is never marked or changed.
- **Scripture:** quotations only from public-domain translations (KJV, WEB). Every AI reference and quotation is
  listed to check; copyrighted translations are flagged.
- **Page limit:**
  - A clear quantity over 800 ("900 copies") is answered before anything is sent or counted, in both the studio
    and the server, with the maker's choices: reduce, split, or edit it.
  - The AI is told the limit, and told never to lower, drop or merely describe pages.
  - A proposal that still comes back past the limit is returned with the limit, and the review offers "Reduce to
    fit" (every change listed) or "Split into documents". Nothing changes until the maker chooses.
  - The old silent 500-copy cut is gone.
- **Accounting:** unchanged for requests that reach the AI (counted first).
- **Cost tracking:** real tokens and estimated USD for every model call go to `ai_generation_costs`. It is written
  with the service role; RLS is on with no policies; `user_id` is set to null when an account is deleted.

**Pre-deploy checks.**
- The project is `jnlvvlkwskidloripvtp`, the only active project for this app.
- The migration only creates the new table and its two indexes.
- Users (12), usage rows (45) and all public tables were unchanged after the migration. The security advisor
  showed only the expected "RLS enabled, no policy" info notice for the new table.
- Only `generate-document` was redeployed. The other 10 functions are unchanged (same versions and sha).

**Live results (temporary test accounts, branch build against the live function).**

| Check | Result |
|---|---|
| Structure Only | Reading log, 30 pages, 6 s; parts labelled "Suggested" as in Phase 8; 0 AI-written marks |
| Free pre-check | "A daily log, 900 copies": studio sent nothing; server returned 422 `page-limit` before counting |
| Develop (children's character journal, ages 6–9, 6 lessons) | 18–21 s; each lesson has a trait, a real fitting verse reference, a story with a named child, an activity, two questions and a prayer; age-appropriate |
| Next batch ×2 | 12 → 18 lessons; all distinct |
| Saved and reopened | AI-written labels kept, including after online sync into a fresh browser; the printed pages show none |
| 6th request | 429 "Free accounts can make 5 document proposals a day…"; the review keeps what was written |
| Over-limit proposal ("a daily food journal… three years") | AI built 1,095 copies; review offered Reduce (1,095 → 790) or Split into 2 |
| Cost | 21 calls, $0.074 total. Structure ≈ $0.0015 per proposal; develop with 6 lessons ≈ $0.0045 |

**Live defects found and fixed (each now has a test; the real answer is the fixture
`tests/fixtures/live/develop-children-2026-10-15.json`):**
1. The develop answer had `entries: null` while its notes claimed 6 lessons. Fix: develop mode uses a format where
   entries are required, plus a worked example of the shape.
2. The AI put the lessons somewhere other than the list. Fix: one retry within the same proposal, naming what's
   missing. If it's still incomplete, the answer is returned anyway (paid for) with a note, never discarded.
3. The AI wrote lessons but no page to print them. Fix: the studio adds a page per entry and says so.
4. Batch 1 repeated lessons 1–6. Fixes:
   - every name already written goes into the request itself, and close synonyms and reused verses are excluded;
   - the server retries when half or more are repeats;
   - the studio leaves out repeated entries and says so.
5. The two reflection questions were written but never printed (the AI's page gave blank lines). Fix: any written
   part a page leaves out is added to it and said.
6. Stories came back as definitions. Fix: the rules ask for the requested form (a story with a named character and
   an event). Now real stories, but still short.
7. The page-limit instruction made the AI drop the daily pages and describe them in notes. Fix: build every
   section at full quantity; the limit is the studio's to handle.
8. The studio cut any count above 500 copies to 500, silently. Fix: removed; a sanity bound of 20,000 remains.

**Known limitation:** develop stories run 28–50 words against the 100–180 asked for (gpt-4.1-mini writes short).
Options are listed in the 8.1 report: accept and edit, or try a stronger model for develop only (higher cost per
request).

**Function versions.** The deploy counter now reads v16; each step above was a redeploy of `generate-document` only.
The current code is `VERSION generate-document-2026-10-15-spec-v12-page-limit-build`, identical to the branch.

**Tests.**
- Unit 1,571/1,571; golden snapshots unchanged.
- Browser 168/168: 162 existing plus 6 new, covering iPhone 390/430 and both page-limit paths, with the sandbox
  font routing.

**Cleanup (Sydni, dashboard → Authentication → Users).** Delete the temporary accounts:
- `ps-livecheck-20261015@example.com` (from Phase 8)
- `ps-livecheck81-20261015@example.com`
- `ps-livecheck81b-20261015@example.com`
- `ps-livecheck81c-20261015@example.com`

All are signed out everywhere. Their usage rows go with them; their cost rows stay with `user_id` null.

## Phase 8.1 — story length and model comparison (2026-10-15; investigation, nothing deployed)

Sydni's request: before merging, compare the current model with a stronger one for Develop only, using identical
prompts and measuring:
- story length;
- story development;
- whether activities and questions relate to the story;
- Scripture accuracy;
- distinct lessons across batches;
- age fit and depth;
- tokens, cost and time.

Recommend on quality per cost, not newness. Also find out whether short stories come from token limits, the answer
format or the instructions. Structure Only stays unchanged. No merge or deploy until reported.

**Status: the comparison itself is blocked.** The OpenAI key exists only as a secret inside the live Edge Function.
This cloud sandbox has none (the API returns 401 here), and calling another model through the server would mean
deploying, which is on hold. Everything that doesn't need new AI calls is done:

**Root-cause findings (from the 48 live stories recorded on 2026-10-15, gpt-4.1-mini, 8 answers × 6 lessons):**

| Prompt version | Story words (median per answer) | In 100–180 |
|---|---|---|
| v9 (no story rule) | 32.5 / 34 / 33.5 | 0 of 18 |
| v10 (no story rule) | 40 / 47 / 23 | 0 of 18 |
| v11 ("a story … about 100–180 words") | 39.5 / 39.5 | 0 of 12 |

1. **Not the output-token ceiling.**
   - Successful develop answers used about 1,860–2,260 completion tokens of the 12,000 allowed (15–19%).
   - Every one ended normally ("stop"); none hit the ceiling, which would have been recorded as "too-long".
   - Sydni's own develop request produced 4,359 tokens, so the model can write more in one answer.
2. **Not fixed by instructions alone.**
   - Adding the 100–180-word rule moved the median by about zero words.
   - The rule sits in a long system prompt among many others, and the maker's own wording says "a *simple*
     story-style teaching" and "a *short* Bible verse", which pulls toward brevity.
   - The page-limit and "under about 7,000 words" guards are far above about 1,100 words for 6 stories, so they
     don't explain it.
3. **Likely partly the answer format.**
   - All six lessons × seven fields come back in one structured JSON answer, each field a short string inside
     key/value pairs. Models tend to compress many parallel string fields.
   - The strict structured-output format can't require a minimum length per field, so length can't be enforced
     through the format; it has to be measured after the answer.
4. **Model capability: unknown until tested.** That is what the comparison is for. The variants below separate
   model from prompt from batch size.

**Ready to run: `product-studio/tests/live/develop-model-eval.mjs`** (manual; not part of `npm test`).
- **Identical prompts:** it bundles the live function's own SYSTEM prompt, develop rules and develop schema from
  `index.ts` at run time. A dry run confirmed the extraction: system prompt 8,913 characters, with the develop rules,
  the story rule and the required-entries format.
- **Requests:** the children's journal request, then one next batch, per run.
- **Variants:**
  - gpt-4.1-mini (current);
  - gpt-4.1;
  - gpt-4o;
  - gpt-4.1-mini with the story length restated in the request itself;
  - gpt-4.1-mini with 3 lessons per request.
- **Measures:**
  - story words and how many fall within 100–180;
  - named characters;
  - whether questions refer to the story's character;
  - repeated titles across the batch;
  - verses (for manual accuracy review);
  - time, tokens and cost.
- **Output:** raw answers are saved to `tests/live/out/` (git-ignored) for reading every lesson. Story structure
  (situation, decision, resolution), age fit and verse accuracy are judged by reading them, not only by counters.
- **Estimated cost of a full run** (5 variants × 2 runs × 2 requests): about $0.25–0.45 at list prices
  (gpt-4.1 about $0.03–0.05 per request; mini about $0.005). The prices in the script should be checked against
  OpenAI's pricing page.

**Approved 2026-10-15: option (a).** Sydni is adding a dedicated key as `OPENAI_API_KEY` in this cloud environment's
settings. A new session picks it up; this one can't see it.

Her additions:
- a 6th variant, one complete lesson per request (`mini-1`: lessons 1, 2, 3 in three requests);
- fewest calls for a meaningful comparison;
- total spend under $1;
- judge quality by reading the lessons (teaching value, creativity, story development, age fit, Scripture
  relevance, whether questions truly connect to the story), not by word counts alone;
- no deploy, no merge, and no change to the live Edge Function.

**Session 2026-10-15 (local Claude Code, Mac) — comparison NOT yet run; no key reachable.**
- Found this branch on `origin` (it was not checked out locally); worktree: `GitHub/product-studio-phase8.1`.
- `npm ci` done in `product-studio/` (esbuild present, so the harness can bundle the live function's prompts).
- No `OPENAI_API_KEY` exists in this machine's environment, shell profiles or any `.env`. Sydni said to use her key but
  has not set it where Claude can read it. Do NOT paste the key into chat or commit it.
- To run (Sydni in her own terminal, or Codex/Claude once the variable is set):
  `cd product-studio && OPENAI_API_KEY=… node tests/live/develop-model-eval.mjs`
  (6 variants, 13 calls, about $0.20–0.30, guard stops at $0.90). Results land in `tests/live/out/` (git-ignored).
- Nothing deployed, merged or changed in the live Edge Function. Remaining steps are unchanged from the plan below.

**Next session — run it:** from `product-studio/`, run `node tests/live/develop-model-eval.mjs`.
- That is 1 run of each of the 6 variants, 13 calls in all, estimated at about $0.20–0.30.
- A spend guard stops it at $0.90.
- If two variants are close, re-run just those once: `node tests/live/develop-model-eval.mjs 1 <id>,<id>`.
- Then read every lesson in `tests/live/out/`, compare, recommend a model, prompt structure and batch size, and
  record the findings and the actual cost here.

**Options considered before the approval:**
- (a) Add an OpenAI key as a secret in this cloud environment (environment settings → Edit), named
  `OPENAI_API_KEY`. A dedicated key with a low spending limit is best. Nothing is deployed; delete the key after.
- (b) Approve a temporary, separate evaluation function (not `generate-document`, test accounts only, deleted
  afterwards).

(a) touches nothing in production.

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
(also protects users who print offline). The cloud sandbox's Chromium also stalls on Google font files through
the proxy; routing font requests through Playwright (`route.fetch`) made all 162 browser tests pass there.

## Printing notes

- Sydni's printer: Epson EcoTank ET-2980. Gold prints true with the paper gold (#AB9230 for the Dove gold #E6A742),
  confirmed 2026-10-15 — no further color adjustment needed. Print settings: Epson driver (not AirPrint), High
  quality, EPSON Color Controls.
