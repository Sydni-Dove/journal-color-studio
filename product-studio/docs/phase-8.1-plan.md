# Phase 8.1 — Develop Original Content

Status: **live-tested.** The server side is deployed with Sydni's approval: the cost table and `generate-document`.
The studio changes are on branch `claude/phase8.1-develop-content`; merging them needs her approval. Live results
and the defects found and fixed are in HANDOFF.md (Phase 8.1).

## What it is

Phase 8 builds a document's *structure*: its pages, sections, blanks and writing space. The maker's own wording is
placed word for word. Phase 8.1 adds a second, optional mode, **Develop original content**. In that mode the AI also
writes the content itself: days, lessons, exercises, Scripture connections and activities. Every piece it writes is
marked "AI-written — review" in the editor until the maker reviews it, and every piece can be edited. The maker's own
wording is never changed. **Structure only** stays the default and stays exactly Phase 8: the same request, the same
prompt and the same product.

Out of scope: external research and curriculum alignment (Phase 10).

## Sydni's decisions (2026-10-15)

1. **Allowance.** Develop counts as one of the five free proposals a day, the same as Structure only. Real token
   use and estimated cost are tracked separately, to evaluate pricing later.
2. **Size.** A request writes at most **30** complete entries, under a total output-size limit. A longer series is
   written in further batches; an entry is never cut short.
3. **Scripture.** References are supported. Verse text is quoted only from public-domain translations (KJV, WEB),
   never from copyrighted ones. Verses are never invented, and an unverified quotation is never presented as accurate.
4. **Plan.** Develop mode is included in the free five-a-day allowance. The paid-tier design (`app_metadata.plan`,
   `PAID_DAILY_CAP`) is kept, and no subscription is built.

## How it works

### Choosing the mode

The describe screen offers two choices. **Structure only** is the default. **Develop original content** adds an
optional "How many entries?" box (1–30).

### Request

Structure only sends `{description, content}`, which is exactly Phase 8's request; a test enforces that. Develop
sends `{description, content, mode: "develop", entryCount?}`. A next batch sends `batch: {name, fields, from, count,
previous}`.

### Edge Function v9

v9 is in `supabase/functions/generate-document/index.ts` and is **not deployed**.

**Validation.** The function checks `mode`, `entryCount` (1–30) and `batch` before any usage is counted, and returns
400 if any of them is invalid. Batch names and keys are reduced to short plain text before they reach the prompt.

**Prompt.**
- Structure only keeps the Phase 8 prompt unchanged.
- Develop replaces exactly one line, "Do not invent content entries…", with the develop rules:
  - write entries with `source: "suggested"`, at most 30;
  - fewer whole entries rather than partial ones, with notes saying how many remain;
  - proportionate length;
  - original writing only;
  - the maker's wording used exactly;
  - the Scripture rules above;
  - no outside research, statistics, quotations of people, citations or curriculum claims.

**Model settings.** Develop uses `temperature 0.5` (Structure only stays at 0.2) and a `max_tokens` ceiling of 12,000
(about 8,000 words). Its timeout is 135 s, which stays under the function's ~150 s limit. The backup model is tried
only if the first one fails within 30 s.

**Cut-off answers.** An answer cut off at the ceiling (`finish_reason: "length"`) is never handed back half-written.
The maker gets a clear message: ask for fewer entries, then write the rest as the next batch.

**Daily allowance.** One `edge_usage_logs` row (`units 1`) is written per request in either mode. The allowance
check is unchanged.

**Cost records.** Each model call is recorded in `ai_generation_costs`:
- prompt and completion tokens;
- estimated USD, from a price table (gpt-4.1-mini $0.40 / $1.60, gpt-4o-mini $0.15 / $0.60 per 1M tokens);
- model, mode and outcome (`ok`, `too-many-pages`, `too-long`, `refused`).

The function writes these rows with the service role. They are best effort: a failure is logged and never blocks
or fails the request.

### Migration

`supabase/migrations/20261015120000_ai_generation_costs.sql` is **not applied**. It creates `ai_generation_costs`
with row level security turned on and no policies, so signed-in users can neither read nor change it. `user_id` is
`on delete set null`, so the cost history outlives deleted accounts. `edge_usage_logs`, which other functions also
use, is not touched.

### Review screen

**Badges.** In develop mode, parts the AI wrote wording for are labelled **AI-written** (violet). The maker's parts
are **Your words** (green). Blanks, tables and plain writing space stay **Suggested**.

**Entries.** Each AI-written entry opens to read and edit every field, or to remove it.

**Next batch.** "Write the next batch" (1–30, default 10) continues from the next entry number. It sends the recent
entry names so the series continues rather than repeats, and it uses one of the day's proposals. The new entries'
references and quotations are added to the list to check, renumbered to their place in the list.

**Checks.** More than five checks fold into "N references and quotations to check before printing".

### Scripture checks

These are made in the studio (`spec.ts`):
- an AI-supplied reference is a **reference to check**;
- a reference beside quoted text of four or more words is a **quotation to check**, covering both its wording and
  its translation;
- a quotation naming a copyrighted translation (NIV, ESV, NLT, NKJV, NASB, CSB and others) is flagged to use the
  reference only, or KJV / WEB;
- the maker's own references are never flagged as the AI's.

### Limits in the studio

These are the client-side limits in `checkSpec`, develop mode only:
- at most `MAX_DEVELOPED_ENTRIES = 30` AI-written entries;
- at most `MAX_DEVELOPED_TEXT = 150,000` characters across them.

Beyond either, whole entries are kept and the rest is left for the next batch, with a note saying so. The maker's
own lists keep the Phase 8 limits. The 800-page limit applies to both modes.

### Tracking what the AI wrote

`origin?: { kind: "ai-suggestion"; at }` is stored on `DataRecord` and `PromptBlock`. The rules for setting it:
- AI-written entries are marked in either mode.
- In develop mode, page sections the AI wrote wording for (headings, text, prompts, lists) are marked too.
- Blanks, tables, rules and plain writing space are never marked.
- In Structure only, no page section is marked.

**In the editor.**
- **Your content** shows an "AI-written — review" badge on each entry, "Mark as reviewed" on each entry, "Mark all
  reviewed", and "N AI-written to review" in the list title.
- **Add to page** shows the same badge on each page section, "Mark as reviewed" on each section, and "Mark all
  reviewed" for the page.

**Behaviour.**
- Editing never removes the mark; only marking it reviewed does.
- A duplicated entry keeps its mark.
- Undo covers reviewing.
- Saving and loading keep the mark.
- **It never prints:** the pages are identical with and without it, and a test enforces this. Older products have no
  marks and load and print unchanged.

**Limitation.** The answer format has one `source` per list. If the AI claims a list is the maker's but its values
aren't word for word what they wrote, the whole list becomes AI-written. That errs on the side of review.

## Tests

**Unit tests** (`tests/develop-content.test.ts`, 32 tests):
- Structure only matches Phase 8 exactly, for every recorded answer, with no section marked.
- The request body is exactly Phase 8's.
- Develop marks AI-written entries and passages and never the maker's opening.
- The maker's wording prints once, exactly.
- The marks never print.
- Saving and reloading keep the marks; mark reviewed works for one entry and for all; duplicates keep the mark.
- Older products load and print unchanged.
- 35 entries → 30 kept whole; too much text → fewer entries, never a cut-off one.
- Batches append only the list's own fields.
- Scripture: reference, KJV quotation and NIV quotation flags; the maker's own references are not flagged.
- Server static checks:
  - the prompt is unchanged in Structure only;
  - the develop prompt replaces exactly one line;
  - validation happens before usage is counted;
  - one usage row per request;
  - the Scripture rules are in the prompt;
  - a cut-off answer is never handed back;
  - cost records use the service role;
  - the migration has row level security and no policies;
  - no refund logic exists yet.

**Browser tests** (`tests/browser/develop-content.browser.ts`, 4 tests):
- Structure only is the default, and its request is unchanged.
- Full flow:
  - choose develop;
  - edit a day;
  - write the next batch;
  - create the document;
  - the marks are saved and are not on the printed pages;
  - review the page sections and the entries;
  - Undo.
- iPhone 390px and 430px: no horizontal overflow, touch targets of at least 44px.

**AI calls.** Recorded answers only (`tests/fixtures/developSpecs.ts`); no test calls the live AI.

**Results (2026-10-15).**
- Unit tests: 1,557 / 1,557.
- Golden print snapshots: unchanged.
- Build: clean.
- Browser tests: all 166 pass (162 existing plus 4 new). In this sandbox, 11 export and print tests need the Google
  font files fetched through the test's own route (the known proxy stall; see HANDOFF → Testing); with that, all
  pass.

## Usage accounting: oversized and invalid proposals (evaluation — no change made)

**What happens today.** The 900-copies live check used a daily proposal even though it was refused. That is because
the allowance is counted *before* the AI is called. This order is deliberate: a call that fails, times out or is
rejected afterwards has still been paid for, and counting first means a user can never make more paid calls than
their allowance.

Requests rejected *before* the call are not counted and cost nothing:
- an empty or too-long description;
- an invalid mode or count;
- not signed in;
- over the limit.

So only answers rejected *after* the call (too many pages, cut off, declined) use up a proposal.

**Options, safest first.**

1. **Stop wasted calls before they happen (recommended now; no accounting change).**
   - a. Tell the AI the 800-page limit in the prompt. A request for 900 copies then gets a usable 800-page proposal
     with a note, instead of a refusal. This doesn't cost a proposal for nothing, and it adds no risk.
   - b. Add a free pre-check in the function: a description that explicitly asks for more than 800 copies, pages,
     days or entries gets a clear message *before* anything is counted or the AI is called. Nothing is spent, so it
     can't be abused.

   Either one alone would have saved the proposal in the 900-copies check. Option 1a changes the Structure only
   prompt slightly, so it needs Sydni's approval like everything else in v9.

2. **A capped refund (only if the cost data shows it's needed; an accounting change).** An answer rejected for a
   *server* reason (too many pages, cut off, unreadable) wouldn't count toward the five. A hard daily ceiling on
   real AI calls would still apply, for example 8 (5 + 3 refunds), so a user can't loop. A refusal by the AI itself
   is never refunded, so the limits can't be used for probing.
   - The extra cost is bounded at 3 calls per user per day: about half a cent each in Structure only, and up to
     about 2 cents in develop.
   - It needs a schema change. Usage rows would be written by the service role with an outcome, either in a new
     table or as a new column, instead of by the user's own client. `edge_usage_logs` is shared with other
     functions, so it shouldn't be reshaped casually.

3. **Not recommended.** Counting after the call, or refunding everything rejected. Both turn every rejected request
   into an unlimited paid call.

**Recommendation.** Option 1 (a and b) now, deployed with v9 if approved. Option 2 only if `ai_generation_costs`
(its `outcome` column) shows meaningful numbers of wasted proposals. Nothing in usage accounting has been changed.

## Page limit (approved 2026-10-15, built and live-tested)

- A clear quantity past 800 is answered before anything is sent or counted, with the maker's choices: reduce,
  split, or edit it themselves.
- The AI is told the limit, and told never to lower, drop or merely describe pages.
- A proposal that still comes back past the limit is returned with the limit. The review offers "Reduce to fit"
  (every change listed) or "Split into documents". Nothing changes until the maker chooses.
- Allowance accounting is unchanged for requests that reach the AI.

## Before merge / deploy (needs approval)

1. Review on a preview deployment of this branch. Develop mode needs v9, and an old server ignores `mode`, so the
   branch preview can show the UI but will generate Structure only until v9 is deployed.
2. Apply the migration, then deploy `generate-document` v9 only. Verify the project and that the other 10 functions
   are unchanged, as for v8.
3. Run live checks with a signed-in account:
   - one develop request (7 days) and one batch;
   - one Structure only request, confirming the result is the same as before;
   - read back `ai_generation_costs` and `edge_usage_logs`.
4. Merge to main.
