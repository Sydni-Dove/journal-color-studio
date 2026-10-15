# Phase 8.1 — Develop Original Content (plan)

Status: **planning only.** Branch `claude/phase8.1-develop-content`. Nothing here is merged or deployed. The Edge Function change (v9) needs Sydni's approval before deployment.

## What it is

Phase 8 builds the *structure* of a document: its pages, sections, blanks and writing space. Where the maker supplies their own wording, Phase 8 places it word for word. Where they don't, it leaves labelled blanks; it never writes days, lessons or readings for them.

Phase 8.1 adds a second, optional mode: **Develop original content**. The maker can ask the AI to draft the actual content too, for example 30 devotional days with a theme, a reflection prompt and a Scripture reference for each. Three rules hold in this mode:

- the maker's own wording is never changed;
- every AI-written piece is marked as AI-written in the editor until the maker reviews it;
- every AI-written piece can be edited like anything else.

**Out of scope:** external research, web search, citations from outside sources and curriculum alignment. Those belong to Phase 10 (Research).

## The two modes

The describe step (`AiDocumentWizard`) gets a choice with two options.

**Structure only** is the default and behaves exactly like Phase 8. Same request, same system prompt and same output. Existing tests and golden print snapshots must stay byte-identical.

**Develop original content** adds an optional "How many entries?" field. It's a number with a cap (see the decisions below). With it blank, the AI picks a sensible count and explains the choice in notes.

## Request and Edge Function (v9)

- **Request body:** `{ description, content, mode }`. The `mode` field is `"structure" | "develop"`; when missing it means `"structure"`, so the current client keeps working.
- **Validation:** an unknown `mode` returns 400. When `mode = "develop"`, `entryCount` is optional, must be an integer from 1 to `MAX_DEVELOPED_ENTRIES`, and anything else returns 400.
- **System prompt:**
  - Structure only keeps today's text unchanged.
  - Develop mode adds a short block that replaces the single "Do not invent content entries…" line with rules for writing content:
    - Write the entries the maker asked for, as `entries` with `source: "suggested"`, plus a per-entry section that prints them.
    - The maker's wording is still used exactly and still marked `source: "user"`. AI wording never replaces, merges into or "improves" it.
    - Scripture references are allowed. Quoted verse text may only come from a public-domain translation (see decision 3), named in notes. Never invent a reference; when unsure, give a theme instead of a reference.
    - Never claim alignment with any curriculum, standard or denomination's teaching.
    - No outside facts, statistics or quotations. This is the Phase 10 boundary.
- **Schema:** no change. `entries.source` and `components[].source` already exist (`docSpecSchema.json` and `schema.json` stay the same file).
- **Limits:**
  - The page limit (800) still applies, and develop mode counts toward it the same way.
  - A larger `max_tokens` applies only in develop mode.
  - After the model answers, the function checks that `entries.records.length ≤ MAX_DEVELOPED_ENTRIES`; above that it returns 422 with a clear message.
- **Usage:** each develop request writes one `edge_usage_logs` row with `units` per decision 1. The daily check moves from counting rows to summing `units`. For structure-only rows, where `units = 1`, the result is identical.

## Keeping track of what the AI wrote (provenance)

Today `source` lives only in the spec. Once `projectFromSpec` builds the project, the marking is gone. Phase 8.1 keeps it.

- Add `origin?: { kind: "ai-suggestion"; at: string }` to `DataRecord` and to `PromptBlock`. It's optional, so older projects load unchanged and nothing that prints reads it.
- `projectFromSpec` sets `origin` only on records and blocks whose spec `source` is `"suggested"`. In **develop mode only**, that covers written content (entries, text, prompts, lists). Structure only keeps today's behaviour (labels and titles are not marked), so Phase 8 output stays identical.
- **Editor:**
  - In *Your content* (DataPanel) and the page-section editor (PromptEditor), each marked item gets an "AI-written — review" badge.
  - A "Mark as reviewed" button removes `origin`, and editing the text does not remove it by itself.
  - DataPanel gets a "Mark all reviewed" button and a count such as "12 entries still to review".
- **Never printed:** the badge is editor-only. PDF/print output is identical with or without `origin`; a test enforces this.
- **Undo** covers "Mark as reviewed" like any other edit. Cloud save and load round-trip `origin`.

## Review screen in develop mode

The existing review step stays. Develop mode adds an **Entries** list showing each AI-written entry with its badge, editable in place before building. Entries the maker supplied show a "Your wording" tag and stay read-only here, as they are today. The page-count estimate updates as entries are added or removed. The 390/430px mobile layout follows the Phase 8 fixes: one column, 16px inputs and 44px targets.

## Tests

**Unit tests**
- Structure only produces an identical project for the existing recorded fixtures, and the golden snapshots are unchanged.
- Maker wording survives develop mode byte for byte, and is never marked AI-written.
- Every `source: "suggested"` record or block in develop mode carries `origin` after `projectFromSpec`.
- Print output is identical with and without `origin`.
- The entry cap and the 800-page limit both apply in develop mode.
- Old projects (with no `origin`) load and print unchanged.
- Static checks on the function file:
  - `mode` is validated;
  - the develop prompt block is present only in develop mode;
  - the usage sum uses `units`;
  - the plan is still read from `app_metadata`.

**Browser tests:** the mode picker, the badges, "Mark as reviewed" and "Mark all reviewed", and the review screen at 390px and 430px.

**AI calls:** recorded AI fixtures only. Tests never call the live function.

## Rollout order

1. Client provenance (`origin`, badges, mark reviewed). This is useful on its own and safe, because Structure only never sets `origin`.
2. Mode picker and review list, behind the server answering `mode` (an old server ignores it, so the UI is hidden until v9 reports support through `check`).
3. Edge Function v9, which needs approval. Verify the project as for v8, deploy only `generate-document`, and confirm the other 10 functions are unchanged.
4. Live checks with a signed-in account: one develop request, one structure request, and the usage rows.

## Decisions needed from Sydni

1. **Daily allowance:** does a develop request count as 1 or 2 of the 5 free daily proposals? (Recommendation: 2. It costs several times more tokens, and 2 still allows two full develop runs a day.)
2. **Maximum entries per request:** recommendation 40. That fits a 30-day devotional or a 40-day fast, and keeps answers inside one model response. Larger books can be built in batches later.
3. **Scripture quotation policy:** recommendation is references always allowed; quoted verse text only from KJV/WEB (public domain), and otherwise references only. Notes name the translation and remind the maker to verify.
4. **Free or paid:** recommendation is free within the daily allowance now. When the paid tier exists, develop mode can become paid-only through the same `isPaid` check without a client change.
