# HANDOFF — Journal Color Studio + Product Studio

## Phase 8.1 integration — 2026-10-15 (local Claude Code; branch `claude/phase8.1-develop-content`, NOT merged, NOT deployed)

Approved by Sydni: **gpt-4.1 for Develop original content only, six lessons per request; Structure Only stays on gpt-4.1-mini.**
- **Codex's work recovered.** The local checkout (`~/.codex/worktrees/e4f6/.../product-studio-phase8.1-codex`, branch `codex/phase8-1-story-quality`) was accessible. Its uncommitted changes were committed (d706cad), checked (8 files, no credentials; `/private/tmp/dove-ps-openai-key` is outside the repo and not in any commit), pushed to GitHub as `codex/phase8-1-story-quality` (not merged to main) and merged into this branch together with the cloud session's comparison. Its story-length/lesson-completeness validation (`quality.ts`), single bounded retry and incomplete-content review warning (Create stays disabled until acknowledged) are kept as the safeguard. One conflict, in `tests/live/develop-model-eval.mjs`, resolved by keeping both (Codex's checkpointing + the cloud run's used-verse carry-forward).
- **Server (`supabase/functions/generate-document/index.ts`, v13, not deployed).** Develop uses `DEVELOP_MODELS = [gpt-4.1, gpt-4.1-mini]`; Structure Only keeps `MODELS`. The backup runs only when gpt-4.1 fails on availability (404/408/429/5xx, network or timeout); a bad request breaks instead of falling back. The weak-content retry repeats the same model (gpt-4.1). A backup answer carries `fallback: {from, to, reason}`. The story ask (8–10 sentences with beats, a different child's name per lesson, no Scripture reference inside the story, a question naming the main character, activity practises the trait) is added to the request message when the description wants stories. Next batches also carry `usedVerses` and `usedNames`. Limit and default: 6 entries. `gpt-4.1` added to the cost table. `quality.ts` also flags a Scripture reference written inside a story.
- **Studio.** `MAX_DEVELOPED_ENTRIES = DEFAULT_DEVELOPED_ENTRIES = 6`; blank count sends 6; `batchRequest` sends used references and children's names (names = the capitalised word a story repeats most — a heuristic); the wizard shows a visible note (`ai-fallback-note`) when the backup wrote the lessons, for first requests and next batches; next batches that come back incomplete are not appended.
- **Tests.** 30-lesson expectations changed to 6; new tests for the model lists, availability-only fallback, same-model retry, fallback marker and carried-forward references/names. Results: `vitest` 1583/1583 (print snapshots included), `tsc` clean, `npm run build` OK, `npm run test:mobile` (browser, incl. preview/print parity and the Develop tests) 169/169. Structure Only, AI-written markers, saving, pagination and printing tests unchanged and passing.
- **Not done / needs Sydni.** Deploy of the Edge Function (v13) and merge to main await approval. No live gpt-4.1 call was made with the final wizard path (the comparison used the same prompt). The per-name heuristic is untested on real data. The `4.1-ship` run is the only real-model evidence.

## Codex Phase 8.1 investigation — 2026-10-15 (local branch `codex/phase8-1-story-quality`)

- Started from clean `claude/phase8.1-develop-content` at `e800566` in an isolated local clone. The Desktop checkout was not edited. Production was not changed or redeployed. Supabase read-only check confirms `generate-document` is active at v16 with JWT verification on.
- The earlier model comparison output is **not present** in `product-studio/tests/live/out/` or the Desktop checkout. This session has no `OPENAI_API_KEY`. The handoff's documented 48-story analysis is available, but the subsequently described six-variant results and actual comparison spend could not be recovered. No billable API call was made in this session. Do not assert that any model or batch strategy won the comparison.
- Confirmed defect: the 100–180-word instruction was prompt-only. `developGap` checked empty/thin *aggregate entries*, and allowed as few as three when six were requested, so a 28–77-word story or missing lessons could pass. The client discarded the Edge Function's `incomplete` warning and allowed creation. Token ceiling is ruled out by the recorded normal `stop` finishes at 15–19% of allowance. Prompt competition and six-field batching plausibly encourage compression; their individual causal effects remain unmeasured.
- Current limited fix: `quality.ts` checks requested children's stories for length and requested Scripture, activity, two questions and prayer. The server now requires the requested lesson count, and its existing one-retry path uses the content checks. If the retry is still deficient, the review keeps the paid answer and shows a prominent reason; Create stays disabled until the maker explicitly acknowledges the incomplete content. An incomplete next batch is not silently appended. This does not judge narrative quality, verse accuracy or story-specific questions; human review remains necessary. Structure Only's prompt and path are unchanged.
- Strategy assessment: six in one call is fastest/cheapest but current evidence shows shallow stories; three or one per call may improve focus, with more latency/cost, but neither is proven; outline then develop adds calls and integration work; selective expansion of failing narratives uses the fewest extra calls if a measured quality gate and field-level patch are implemented safely. The present gate/retry is a contained first step, not proof that Phase 8.1 meets the depth target. Compare saved outputs or run the existing harness within the previously authorized budget before selecting the production generation strategy.
- Files changed: `supabase/functions/generate-document/index.ts`, new `quality.ts`, `product-studio/src/engines/generate/pipeline.ts`, `product-studio/src/components/wizard/AiDocumentWizard.tsx`, new `product-studio/tests/develop-quality.test.ts`, `product-studio/tests/browser/develop-content.browser.ts`, `product-studio/tests/live/develop-model-eval.mjs`, this handoff. TypeScript and build pass. Full unit run: 1,578/1,578, including print snapshots. Full browser: 168/169; desktop "Prayer Requests" heading fit measured 10px wide in one run, then passed unchanged in isolation (3/3 relevant heading cases). All Develop and AI document browser tests passed, including preview/print parity. Costs for these local checks: $0. Sydni reported $0.27 already spent from the $1 evaluation budget, leaving $0.73. A read-only aggregate of `ai_generation_costs` for 2026-10-15 shows 21 live function calls totaling $0.073783 estimated (17 develop calls $0.067219, 4 structure calls $0.006564); this does not include direct comparison calls. The harness now checkpoints each completed call and stops after $0.55 of new recorded spend, leaving room for the final in-flight call. At current OpenAI list rates, mini costs $0.40 per million input and $1.60 per million output tokens; the prior measured six-lesson proposal was about $0.0045, and a retry adds another model call. Actual cost for compliant longer lessons remains unmeasured. No new billable calls until the API key is securely available; keep all remaining calls inside the $0.73 balance.
- Phase 8.1 is **not ready to merge**: live quality performance of the fix, comparison results, and browser/print regression evidence are outstanding. No merge/deploy approval was requested or used.

Read this first when picking up the work (any assistant or developer). Keep it current: update it in the same
commit as any change to state, branches, rules or open decisions.

_Last updated: 2026-10-15 (8.1 final model comparison done — recommend gpt-4.1 for Develop only, ship prompt, 6 per request; Codex branch must be pushed to coordinate; model comparison blocked on an API key — see below). Phase 8 is merged to `main` (89f054b) and live. Phase 8.1's server side is live (cost table + `generate-document` with develop mode and page-limit handling) and live-tested; the studio side is on `claude/phase8.1-develop-content`, **not merged** (awaiting approval)._

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

### Comparison results (cloud session, 2026-10-15) — run on this branch's harness

**How it ran:** no key was needed in the sandbox. The cloud environment's network proxy injects the OpenAI credential
for `api.openai.com`, but only for clients that go through the proxy and send **no** `Authorization` header. Node's
`fetch` ignores the proxy by default, so the harness now has an `OPENAI_VIA_PROXY=1` switch (no header) and is run as:
`cd product-studio && NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt OPENAI_VIA_PROXY=1 node tests/live/develop-model-eval.mjs`.
Nothing was deployed, merged or changed in the live Edge Function. No key was printed, pasted or committed.
The Mac-terminal key file Codex proposed is **not needed** if the run happens in this cloud environment.

**Actual cost this session:** first run (6 variants, 13 calls) **$0.1343**; one follow-up variant (`mini-sent`, 2 calls)
**$0.0106**; a second follow-up call (`mini-sent-3`) failed mid-answer and was billed but not recorded (a few tenths of a
cent). About **$0.15** in total from this session, separate from whatever was spent earlier from Sydni's side.

**Story words per lesson (batch 1 | batch 2), 6 lessons per request unless noted; target 100–180:**

| Variant | Batch 1 | Batch 2 | In range | Cost (2 calls) | Time |
|---|---|---|---|---|---|
| mini-live (gpt-4.1-mini, live prompt) | 52 37 36 32 23 25 | 69 58 62 54 51 45 | 0/12 | $0.0090 | 32 s |
| 4.1-live (gpt-4.1) | 49 44 46 43 41 39 | 70 64 65 60 60 56 | 0/12 | $0.0467 | 27 s |
| 4o-live (gpt-4o) | 32 28 24 19 25 13 | 53 34 49 29 43 33 | 0/12 | $0.0502 | 31 s |
| mini-userlen (length asked in request, words) | 77 67 69 62 60 52 | 68 66 60 68 63 59 | 0/12 | $0.0095 | 32 s |
| mini-3 (3 lessons/request) | 55 37 42 | 82 62 58 | 0/6 | $0.0082 | 26 s |
| mini-1 (see note) | 48 42 40 44 | 78 · 72 | 0/6 | $0.0107 | 31 s |
| **mini-sent (length asked in request, in sentences)** | 111 116 113 110 106 102 | 107 100 95 90 84 88 | **8/12** | $0.0106 | 36 s |

`mini-sent` appended: "the story field must be a full mini-story of 8 to 10 sentences (about 140 words): name a child, set the scene, show
what tempts or troubles them, the choice, what happens next, how it ends, tied to the verse. Never fewer than 8
sentences." (`SENT` in the harness.) `mini-sent-3` and `4.1-sent` were added but **not completed** (see "Not tested").
Note on `mini-1`: the first request returned **4** lessons, not 1, so it is not a clean one-per-request test; the two
single-lesson follow-up requests gave 78 and 72 words, longer than that model's usual 40–60.

**Read-through of the saved lessons (quality, not just counts):**
- **gpt-4.1-mini, live prompt.** Many "stories" are one-to-three-sentence anecdotes or plain definitions (Respect, Gratitude,
  Friendliness, and in `mini-1` "Imagine you see a friend…" with no story at all). Questions are generic ("Why is it
  important to be honest?") and rarely name the character. The "no synonym repeats" rule was broken (Thankfulness after
  Gratitude), and verses repeat across batches (Ephesians 4:32 for Kindness and Forgiveness; Galatians 5:22-23 twice).
- **gpt-4.1.** Clearly better craft at the same length: every story has a named child, a situation, a choice and a
  resolution; questions refer to the character ("How did Sophie show kindness in the story?"); themes and verses are
  distinct (Colossians 3:13 for Forgiveness, Proverbs 25:28 for Self-Control, Galatians 6:9 for Perseverance), no
  synonym repeats. Still 39–70 words — better stories, not longer ones — at about **5× the cost**.
- **gpt-4o.** The weakest and thinnest (13–32 words in batch 1), merges both questions into one field, and costs as much as
  gpt-4.1. Not worth considering.
- **mini-userlen.** Same cost as mini. Every story now has a scene, a decision and an ending, and several name the Scripture
  idea in the story. About 52–77 words; still short, and a few questions are generic. Verse repeat (Ephesians 4:32) persists.
- **mini-3 / mini-1.** Smaller batches help a little (best single stories ~80–100 words, e.g. the seed-planting Patience
  story) but not reliably, and cost more calls.
- **mini-sent.** The only variant that reached the target: 102–116 words in batch 1 and 84–107 in batch 2, 0 repeated titles,
  same price as the live prompt. Spot-read lessons (Kindness, Honesty) are complete mini-stories with a choice and an
  ending and the verse worked into the narrative. **Caveat:** that run's raw output was lost (the run crashed on the
  follow-up variant before the results file was written), so only part of it was read; verse accuracy, question quality
  and age fit for `mini-sent` still need a full read.

**Findings and recommendation (quality per cost):**
1. **Model: keep gpt-4.1-mini.** gpt-4.1 gives nicer writing and better question-to-story links but not more length, at
   about 5× the cost; gpt-4o is worse and costs the same. A model upgrade is not the lever for the length problem.
2. **The lever is the request, and the unit is sentences, not words.** "100–180 words" (in the rules or in the request)
   moved the median by 0–25 words; "8 to 10 sentences, about 140 words, with these story beats" in the per-request ask moved it
   from ~40 to ~105 words with no extra cost or time. Put the length and the story beats in the user message next to the
   per-lesson ask, not only in the long system prompt.
3. **Batch size: keep 6 per request** with the sentence instruction (cheapest, fewest calls). Whether 3 per request adds
   anything on top of the sentence instruction is untested; the old data says smaller batches help only slightly.
4. **Still validate on the server.** Even `mini-sent` missed the 100-word floor in 4 of 12 stories (84–95 words) — the
   Codex validation of the *story field* (not the whole lesson) plus one targeted retry is the right backstop, and with
   the sentence instruction the retry should rarely trigger. Codex's candidate E (expand only the failing narratives) is a
   sensible fallback and should be built only if the retry rate stays high.
5. **Quality gaps no length fix addresses** (mini): repeated verses across batches, questions that don't name the
   character, occasional synonym theme repeats. Cheap mitigation: pass the list of used verses as well as titles into the
   next-batch request, and add "at least one reflection question must refer to the main character by name".

**Not tested (budget left; the guard is $0.90 and total spend is well under $1):**
- `4.1-sent` (does the stronger model write richer stories with the same instruction?) and `mini-sent-3` — the harness
  has both; the last attempt hit a connection reset / truncated answer. The harness now reports an unparseable answer with
  its finish reason instead of crashing. Run: `… node tests/live/develop-model-eval.mjs 1 mini-sent,mini-sent-3,4.1-sent`
  (est. under $0.15). Re-run `mini-sent` once more as well, so its raw lessons are saved for a complete read.

**Relationship to Codex's branch (`codex/phase8-1-story-quality`):** not touched or merged here. Its server-side story-length
and lesson-part validation, retry and incomplete-content warning are the right complement; the prompt change above
(sentences + story beats in the request) should be added there and verified with the harness. Nothing is ready to merge
until a sentence-instruction run is read in full.

### Final comparison (cloud session, 2026-10-15) — the version we'd ship, all 30 lessons read

**Approved by Sydni:** three variants within the remaining budget.

**The tested prompt ("ship"):**
- the per-request instruction for an 8–10 sentence story (about 140 words) with story beats;
- at least one reflection question must name the story's main character;
- the activity must practise the same trait;
- next batches also list the Scripture references already used.

Run with `… node tests/live/develop-model-eval.mjs 1 mini-ship,mini-ship-3,4.1-ship` (proxy mode; see above). Raw
lessons: `product-studio/docs/research/develop-model-comparison-2026-10-15.json`. Every lesson was read, not a sample.
Nothing was deployed, merged, or changed in the live function.

| Variant | Calls | Lessons | Story words | In 100–180 | Tokens in/out | Time | Cost | Per lesson |
|---|---|---|---|---|---|---|---|---|
| mini-ship (gpt-4.1-mini, 6 per request) | 2 | 12 | 94 84 75 77 66 70 · 106 98 104 103 95 90 | 3/12 | 5,900 / 4,936 | 34 s | $0.0103 | $0.0009 |
| mini-ship-3 (gpt-4.1-mini, 3 per request) | 2 | 6 | 105 87 88 · 93 77 80 | 1/6 | 5,847 / 3,733 | 27 s | $0.0083 | $0.0014 |
| **4.1-ship (gpt-4.1, 6 per request)** | 2 | 12 | 126 122 119 112 106 106 · 134 125 118 117 106 106 | **12/12** | 5,901 / 5,400 | 35 s | $0.0550 | $0.0046 |

**Read-through against Sydni's criteria.**

- **Story arc (beginning → situation → decision → consequence)**
  - **gpt-4.1:** all 12 have a real arc with a temptation and a costly choice, for example:
    - Eli breaks the window and confesses;
    - Maya gives up winning the race to help Alex;
    - Ella gives away her pencils;
    - Noah stops the game when the timer beeps;
    - Sophie tries out and *doesn't* get the part, but is proud she was brave.
  - **mini, 6 per request:** arcs are present but thin in batch 1 (66–94 words); several resolve in one line.
  - **mini, 3 per request:** similar to mini at 6.
- **Trait shown through actions**
  - **gpt-4.1:** yes, in every lesson.
  - **mini:** mostly. Some lessons tell rather than show: Gratitude is Jack *thinking*, and Respect is mostly *sharing*, a repeat of Generosity.
- **Language and age fit:** all three are suitable for ages 6–9.
  - **mini:** formulaic ("X remembered that God… X learned that…").
  - **mini, 3 per request:** adds redundant citations inside the story, such as "(Ephesians 4:32)".
  - **gpt-4.1:** reads more naturally, though it still ends most stories with a "learned that…" sentence.
- **Questions and activity tied to the story**
  - **All variants:** the named-character rule worked; question 1 names the child in all 30 lessons.
  - **gpt-4.1:** activities mirror the story's action ("let someone else go first", "help while you wait").
  - **mini:** activities are relevant but more generic. One exception is excellent: mini, 3 per request, Patience — plant a seed and wait.
- **Scripture: accuracy and fit**
  - **All references are real and fit their trait**, including:
    - Proverbs 12:22 (honesty);
    - Joshua 1:9 (courage);
    - Colossians 3:13 (forgiveness);
    - Proverbs 25:28 (self-control);
    - Luke 16:10 (responsibility);
    - Philippians 2:3 (humility);
    - 2 Corinthians 9:7 (generosity);
    - Proverbs 12:10 (kindness to animals);
    - Psalm 24:1 (creation).
  - **The used-verse list worked across batches:** no reference repeats between batch 1 and batch 2 in any variant.
  - **One repeat within a single answer:** mini at 6 per request used Ephesians 4:32 for both Kindness and Forgiveness.
  - **Verse text:** none was quoted; references only, as the policy requires.
- **No repeated themes, situations or lessons**
  - **gpt-4.1:** 12 distinct traits and situations.
  - **mini, 6 per request:** near-repeats despite the rule — "Kindness to Animals" after Kindness, "Thankfulness for Creation" after Gratitude, and a Respect lesson that repeats Generosity's sharing-a-toy situation.
  - **mini, 3 per request:** a repeated situation (a broken toy or doll in both Honesty and Forgiveness).
  - **All models:** reuse first names across lessons (Lily, Tommy, Maya, Noah). This is minor and can be fixed with one instruction.
- **Depth without filler**
  - **gpt-4.1:** the extra length is story detail, not padding.
  - **mini:** the moral is restated two or three times.
  - **Prayers:** short and generic in every variant (acceptable for this age).

**Recommendation.**

1. **Model: gpt-4.1 for Develop original content only.** Structure Only stays on gpt-4.1-mini, unchanged.
   - Same prompt, same time (about 35 s for two requests).
   - Every story met the length target (12/12, vs 3/12 for mini).
   - Clearly better story craft, and no repeated themes or verses.
   - Cost: about **$0.028 per 6-lesson request vs about $0.005** (≈ $0.0046 vs $0.0009 per lesson).
   - Worst case at today's free allowance (5 develop requests per user per day) is about $0.14 per user per day.
   - Mini with retries would still repeat themes, which a length retry can't fix.
   - Fallback when gpt-4.1 fails: gpt-4.1-mini.
2. **Prompt format: the ship prompt.** Put sentences plus story beats in the per-request message, alongside:
   - the named-character question rule;
   - the activity-matches-trait rule;
   - the used-verse list in next batches.

   Two small additions are suggested:
   - "use a different child's name in each lesson, and not one already used";
   - "no reference written inside the story (it has its own field)".
3. **Batch size: 6 per request.** 3 per request was no better on mini and costs more per lesson; one per request was
   not clean (the earlier run returned 4) and multiplies calls. 6 per request with gpt-4.1 met every criterion.
4. **Keep Codex's story-length and lesson-part validation and its single retry as the backstop** (with gpt-4.1 it
   should rarely fire). Codex's candidate E, expanding only the failing stories, isn't needed now; revisit only if the
   retry rate is high in use.

**Actual API cost.** Estimated from recorded tokens at list prices (gpt-4.1-mini $0.40 / $1.60 and gpt-4.1 $2 / $8 per
1M tokens); check OpenAI's usage page for the billed total.
- This run: 6 calls, **$0.0736**.
- Earlier cloud comparison: about $0.15.
- Comparison total so far: about **$0.22**.
- The earlier live function testing ($0.074, in `ai_generation_costs`) is separate.
- Codex reported "$0.27 spent" from Sydni's side; both totals are well under $1.

**Coordination with Codex (`codex/phase8-1-story-quality`).** The branch is **not on GitHub**; it exists only in Codex's
local worktree on Sydni's Mac. Its server story-length and lesson-part validation, retry, and review warning (Create
waits until the maker acknowledges it) overlap this branch's `developGap` and its "incomplete" note. To avoid
overwriting or duplicating, the plan is:

1. **Codex pushes its branch.**
2. **Merge it into this branch.** Codex's validation replaces this branch's thinner `developGap` checks (entries
   present, thin, repeats — keep the repeat check if Codex doesn't have one), and Codex's acknowledgment-gated warning
   replaces the "ai-no-entries" note.
3. **Then add the ship prompt and the develop-only gpt-4.1 setting.** These are new and don't overlap.
4. **Tests:** re-run unit and browser tests.
5. **Report before any deploy or merge.**

Codex's request for a key file is not needed: this cloud environment already reaches OpenAI (see above).

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
