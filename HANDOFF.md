# HANDOFF — Journal Color Studio + Product Studio

Read this first when picking up the work (any assistant or developer). Keep it current: update it in the same
commit as any change to state, branches, rules or open decisions.

_Last updated: 2026-11-25 — Bubble Lettering on `claude/bubble-lettering` (preview, not merged).  Devotional Spread merged to `main` (fea7fe4) and live, with Sydni's approval (Nov 25). 2026-11-17 — Online saving for Cover Studio and Coloring Book on `claude/online-cover-studio` (new Supabase table + bucket created, with approval; app code not merged). Toolbar feedback on `claude/toolbar-feedback-six` (not merged). Earlier: Coloring Book on `claude/coloring-book-studio`; Phase 8 merged to `main` (89f054b) and live._


## Bubble Lettering line art (2026-11-25, branch `claude/bubble-lettering` from main 6ae0fd3 — preview, not merged)

Requested by Sydni (via another chat, with her Allow). A home card, “Bubble Lettering”, opens `components/lettering/LetteringStudio.tsx`.
- **Drawing** (`engines/lettering/bubble.ts`): the words are set in Fredoka Bold (bundled: `@fontsource/fredoka` woff, parsed by `opentype.js`). They become vector paths, puffed by the roundness and outlined. The black layer is stroked at 2 × (puff + outline), with a white layer of 2 × puff on top, so overlapping letters share one outer outline, with round joins. Openings too small to stay open are filled in (`openCounters`), so they never print as solid black dots. Lines stack outline to outline. A sample's canvas size can be kept. The SVG has no text or font, only paths. The PNG is drawn from the same paths at 300 DPI (`browser.ts`), with a transparent background or white.
- **Copying a sample:**
  - The sample is uploaded or picked from pictures already in Product Studio (project artwork, coloring-book pages and covers).
  - `measureLettering` reads the size, lines, separate shapes, outline thickness (the most common black run), letter height and width, gaps, line gap and body thickness. Images over 2400 px are measured scaled down, with the DPI scaled to match.
  - `styleFrom` solves capital height and roundness from line height and body thickness, using the font's own typical stroke (`typicalStroke`, scanline runs over the glyph outlines), then fits spacing (negative = overlap) and letter width to each line's width. It needs the sample's words for overlapping letters.
  - Round-trip accuracy: the browser test reads back known settings within about 0.04 in and 0.25 pt.
- **Styles** (`styles.ts`): saved on this device (localStorage `dove-product-studio:v1:lettering-styles`) and normalized. Classic bubble is built in. They are not synced online yet.
- **Placing** (`place.ts`): always on a **copy** of the project (“… (with lettering)”): the PNG becomes an artwork asset, placed as a top or bottom band (`illustration`, area) or centred in the safe area (`background`, safe). The original project is byte-for-byte unchanged (tested).
- **Verified:** 1,845 unit tests (13 new in tests/bubble-lettering.test.ts) and 205 browser tests (tests/browser/bubble-lettering.browser.ts is new; studio-ux now counts 13 home cards). Golden snapshots are unchanged.


## Devotional Spread (2026-11-25, branch `claude/devotional-spread`; merged to `main` fea7fe4 and live with Sydni's approval)

A new Coloring Book page type, started for Sydni's “Mommy & Me: Growing With God Together” (KJV, per Sydni, Nov 25). Her book wasn't in her saved items, so it was built and checked on a sample (`tests/fixtures/mommyAndMe.ts`: KJV lines word for word, placeholder devotional wording). Her saved books and projects were not read for changes or touched.
- **Model:** `Scene.pageType = "devotional-spread"` + `Scene.mommy` (`MommyPage`: declaration, art, `readWord` lines with `kind` exact/paraphrase/reflection, `blanks` with answers never printed, `reflect`, `heart`, `layout` column/band, `qr`, `textOff`, `letterStyle`). Per-page `letterStyle` and `textOff` work on every page (`sceneBrief` in cover/assemble.ts); absent = the book's setting. Book: `spread` (split 0.65, label 10.5 pt, text 9.5 pt, lines 0.3 in), `artCharacters` (Girl 1 by default), `digitalProjectId`. All normalized in coverStore/coloringBookStore; older books open unchanged.
- **Assembly** (assembleBook.ts): the daughter page (`scene-<id>`) is always an even, left-hand page and the Mommy page (`mommy-<id>`) faces it. A truly blank `pad-<id>` page is added first when needed, and there are no blank backs inside a spread. The daughter page puts its words across the top: bubble (`coloring-lettering` with the `place-top` block, Auto capped near the top quarter) or elegant (guided-page, top). The Mommy page uses the `devotional-mommy` layout (layouts/book/devotionalMommy.ts). Its art sits on the inner side by page side, so it mirrors with the gutter, and the activity column sits outside it, with soft outlined panels, `sprig` glyph separators (primitives/nodes.tsx) and the QR placeholder box. The band option is also there. A whole-page image (8.5:11) fills the page; any other is fitted to `dm-art` (pictureAreaOf honours `dm-art` as laid out).
- **Checks** (missing.ts): blank answers missing from that page's printed excerpts, or no answer recorded (warnings); images under 2550 × 3300 on either page (warnings); Mommy art missing (blocking); column/band overflow (blocking); refs missing or unrecognised; a word-for-word suggestion for exact quotes; the QR placeholder reminder. NIV with spreads is blocking until `scripturePermission` (Setup shows the box). Exact quotes count toward `printedReferences`/`bookWords`; paraphrases and reflections don't. Reference labels: exact = “Ref (TRANSLATION)” (KJV = ref alone), paraphrase = “Ref · paraphrase”, reflection = ref alone.
- **UI:** Pages has “Add a Devotional Spread”, spread cards showing both pages, and SpreadEditor.tsx (both pages side by side in print order, the daughter and Mommy fields, KJV/WEB “Fill in the wording” for exact lines, an inline answer check, uploads with the size check, approve, and an **Art Prompt** per page via `spreadArtPrompt`: style lock, page rules, Jesus rules, the character pasted word for word, ending “Spell every word exactly as written.”). There is also a Devotional Spread settings panel (split, sizes, line spacing, saved characters). Setup has the binding margin (inner gutter) select. Preview has the facing-pages view and “Export printable digital PDF” (the same pages on the digital format). The library has a “Start Mommy & Me” starter (KJV, one empty spread, Girl 1).
- **Verified:** 1,832 unit tests (30 new in tests/devotional-spread.test.ts) and 204 browser tests (1 new: tests/browser/devotional-spread.browser.ts) pass. Golden snapshots are unchanged. Both PDFs export at 8.5 × 11 in.
- **Open, for Sydni:** ordinary blank backs (`blank()`) draw faint writing lines (guided-page with no blocks), in her other books too. Left as is pending her OK; the new spread pad page is truly blank.


## Table styling and the Stationery table look (2026-11-23, branch `claude/table-styling` from main 7519da0 — review pending, not merged)

- **Style → Tables** (`layoutOptions.tableStyle`, `TablesPanel`, shown in the Writing area when a product has a table): border weight, border color (custom via `RuleNode.hex` / `BoxNode.strokeHex`, tints via `opacity` / `strokeOpacity`), grid, header and padding. Lines only (`tableLines` in layouts/stationery/surfaces.ts): rows, row height and writing space never change; padding only changes the heading row. Absent style = the original look, and golden snapshots are unchanged.
- **Per-table "Look"** (`PromptTable.look: "stationery"`, `outerBorder`): `stationeryTableStyle` gives 0.25 pt rules under each row, a light outer border (or none), a subtle column line (45% tint), headings at 88% size, no shading, in the product's border color. It keeps its own look over the product style. The look is saved through the document model (`tableLook` / `tableOuterBorder`).
- **Hope Planner check** (working copy built from the template with Sydni's saved settings; her project p_mwpi3k8q_qpa7vbdp was read, not changed):
  - 66 pages: title, Notes, How to Use, 30 spreads, 2 index pages, a blank last page. All 8.5 × 11 in; only page 66 (the blank last page) has no text.
  - Margins alternate: inside 0.75" (coil side) and outside, top and bottom 0.5".
  - 180 margin notes: all at 11 pt, none shrunk; at least 0.08" room around each, panels at most 35% full. No panel overlaps writing or enters the binding side, and there are no diagnostics.
  - **Unresolved:** her saved PDF has 65 pages, but the template gives 66. It wasn't changed; it needs her PDF to compare.
- Sydni approved the Stationery look (Nov 24). The Hope Planner template now makes its Prayers I Have Prayed table in it (`look: "stationery"`); only the book-hope-journal golden snapshots changed, and the rows are identical. Her saved project and the page count are unchanged.


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
| `claude/online-cover-studio` | `claude/coloring-book-studio` + online saving for Cover Studio drafts/collections, coloring books and their pictures; full carry-over from Cover Studio (2026-11-17). **Not merged; needs approval.** |
| `claude/toolbar-feedback-six` | From `main`: palette list reachable, color swaps, list pages + Checklist layout, yearly calendars, months at the front, Browse pages reordering, time dividers (2026-11-17). **Not merged; needs approval.** |
| `claude/cover-studio-scripture-clarity` | Local only (not pushed): Cover Studio coloring pages — one Scripture choice, "Printed on this page", line art only. Two browser tests to update. |
| `claude/coloring-book-studio` | Stacked on the three branches below it + `main`; Coloring Book product workflow (2026-11-14). **Not merged; needs approval.** |
| `claude/guided-steps-artwork` | Four-step editor + uploaded artwork (2026-11-14). **Not merged; needs approval.** |
| `main` | Phases 0–8 (Phase 8 merged 2026-10-15, 89f054b), paper-gold print fixes, Rose Marble gold. Production for both apps. |
| `claude/phase8-ai-generation` | Phase 8 as reviewed; merged into `main`. Keep for reference; don't build on it. |
| `claude/phase8.1-develop-content` | Phase 8.1 (Develop original content): planning, then development. **Not to be merged or deployed without approval.** |
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
documents). **8.1 Develop original content** — approved, planning on its own branch (no external research).
**9 Guided Design Builder & Custom Cover Artwork** — after 8.1 (4 stages; reuses the shared cover snapshot; adds
image upload; "design styles", not "recipes"). **10 Research and develop content** — future, paid tier.
**11 Requirements Assistant** — reserved. Technical improvements (any time, not blocking a phase): self-hosted
fonts (see Testing).

## Saving checks per the Nov 19 Supabase review (branch `claude/review-toolbar-and-coloring`)

- **Timers that read `product_studio_items`:** only `useItemsSync` (src/app/useItemsSync.ts), mounted once in App, so there is one shared check per tab. Its schedule:
  - `SAVE_CHECK_INTERVAL_MS = 180000` while the tab is visible and in use.
  - None while hidden. On visibilitychange to visible, one check right away.
  - Stops after 15 minutes with no pointer, keyboard, touch or wheel activity; the next interaction checks and resumes.
  - Failures back off 3, 6, 12, then 15 minutes, and reset after a success.
  - Routine lists `select=kind,id,name,updated_at,deleted_at`. A book's `data` is fetched only when it is new here, changed online, or deleted online while kept here.
- **Other timers:** `useUpdateCheck` (a new-version check against Vercel, not Supabase), App autosave (local), and the save debounce (1.5 s).
- **Saving is unchanged:** a save starts its own sync and never waits for the routine check. The compare-and-swap on kind, id and the last known updated_at is kept, and pictures stay in `product-studio-artwork`.
- **Echo fix:** a sync's own writes on this device (`browserItems.put`/`remove`) no longer announce "changed", so they don't start a second sync (`quietly` in itemBases.ts).
- **Browser test** (online-cover-studio, Playwright clock): one light list per 3 min; none hidden for 20 min; one on return; none while idle; one on the next interaction; book data fetched once.
- **Logs, Nov 18 22:30 to Nov 19 22:30 UTC:** 13 item GETs in total, all from the nf29vmktu build. The overnight every-24-second polling came from the old preview tabs, now closed.

## Bubble letters to color (2026-11-18, branch `claude/review-toolbar-and-coloring`)

- Coloring Book → Interior Pages → "Title and verse style" offers "Elegant fonts" (as before) or "Bubble letters to color", stored in `pageTypography.letterStyle: "bubble"`. Bubble pages use the layout `coloring-lettering` (layouts/book/coloringLettering.ts), built to match Sydni's Brave Ballerinas sample:
  - Everything sits at the bottom under the picture: the title, then the verse, then the reference.
  - Title: Fredoka 700 at 64 pt, made smaller only if it doesn't fit, with an outlined heart each side.
  - Verse: the same outlined letters, 28 pt by default (`bubbleVersePt`, 22–36), centred on 2–4 lines. If it would run past four lines it drops in steps to 18 pt, then shows a note to use a short excerpt.
  - Reference: alone, with no dash and no "(KJV)", with a short line each side ending in a small outlined heart.
  - Burst strokes sit beside the verse, three short lines each side.
  - The picture area ends 0.18" below the top of the title, so the art tucks slightly behind it.
  - Black outlines only. Outlined text is `TextNode.outline` (white letters, black stroke via `-webkit-text-stroke` + `paint-order`). Hearts are `TextNode.glyph: "heart"`, drawn as an SVG path.
- Feedback round 1 (Gracious Ballerinas, Psalm 56:3):
  - **Auto sizes by default:** the title is the largest that fits, up to 110 pt within ~11% of the page; a long title wraps onto two balanced lines rather than shrinking below the verse. The verse is the largest up to 54 pt, on at most 4 lines within ~15%. Together the lettering takes about the bottom quarter.
  - **Size and position controls:** "Title letter size" and "Verse letter size" (Auto or a fixed size), and "Move the words up, closer to the picture" (0–2 in, `bubbleRaiseIn`, sent to the layout as a `raise` block's weight).
  - **No gap above the words:** a fitted picture now sits at the bottom of its area (crop.y = 1).
  - **"Doesn't fit" bug fixed:** What's Missing reported the 11.7 pt outlined hearts as shrunk text. It now skips drawn shapes, checks bubble pages for spill-over only, passes on the layout's own notes, and rounds sizes.
  - **Reference box fixed:** it now resets per scene (`key={scene.id}` on PageEditor and ScriptureEditor).
  - Fredoka `avgCharEm` corrected to 0.5 from a measured title, which puts the title hearts close to the letters.
- Words on the page, per scene: "Full verse" or "Short excerpt" (`verseUse`, `verseExcerpt`), KJV only.
  - The excerpt must be the verse's own words in order (`excerptFromVerse`); otherwise What's Missing blocks printing.
  - A book in another translation prints its full approved wording and shows a warning saying so.
  - Excerpts work in the elegant style too.
- The Editor loads Fredoka for these pages, and the coloring studios always load it.

## Online saving outage (2026-11-18) and the fix (branch `claude/review-toolbar-and-coloring`)

- **What happened:** from about 13:07 UTC, the Supabase API (PostgREST) killed a request about once a minute for running too long ("Thread killed by timeout manager"). By about 13:15 UTC (8:15 AM Eastern) the database stopped answering. Every table returned 504 or 522, the Dove journal app's tables too, and sign-ins failed. `select 1` from the Supabase tools also timed out.
- **Cause, corrected after the restart:** the saved data is tiny (1 coloring book of about 2 KB, 29 projects of about 104 KB in total, no pictures), so Product Studio's downloads were not what overloaded the database. Postgres logged no error: it went silent after 13:17 UTC until the restart at 15:47. The cause isn't visible in the logs; it may have been on Supabase's side. The Supabase dashboard's Reports (CPU, memory) for 13:00–13:20 UTC are the place to look. The app changes below still stand, since they make routine checks smaller and the error messages plainer.
- **First reading (superseded):** `useItemsSync` ran a full sync every minute in every open tab, including background tabs. Each sync downloaded every Cover Studio and Coloring Book item with its whole `data` (`select kind,id,name,updated_at,data,deleted_at`). Three preview tabs (4od3is4gx, m7kq263c4, m9yc0axz8) did this every minute. Timeouts started the evening online saving went live and grew as books grew.
- **Fix in the app:**
  - `ItemsBackend.list()` now reads names and versions only. `syncItems` fetches an item's data (`get`) only when it changed online, is new on this device, or was deleted online while kept here.
  - Routine checks run every 5 minutes, only in a visible tab, and back off to 10, 20, then 30 minutes after failures (`nextWaitMs`). Coming back to a tab checks at most once a minute.
  - Every Supabase request gives up after 45 s (`timedFetch` in persistence/cloud.ts).
  - Plain messages (persistence/saveErrors.ts): a server that can't be reached is never called a wrong password. Sign-in shows "Couldn't reach the sign-in server, so your password wasn't checked…"; a save shows "Couldn't reach the saving server, so your work isn't saved online yet…".
  - No saved data was deleted or changed.
- **Still needed:** the old preview tabs still run the old every-minute sync, so close them. The database itself needs a restart from the Supabase dashboard (waiting on Sydni's go-ahead).
- **Coloring Book review fixes** (from a test of the review build):
  - Page words print in black (`COLORING_INK` overrides on the interior and Cover Studio coloring pages).
  - The reference goes on its own line under the verse, with no dash.
  - New books start at 18 pt Cormorant Garamond (`NEW_BOOK_TEXT_PT`). Saved books keep their own choice; one without a size stays 13 pt.
  - One print-sharpness number everywhere (`illustrationPpi`, measured where the page draws the picture).
  - A picture placed "Between the title and verse" now follows the words as laid out (`pictureAreaOf`), so it updates with the verse size and never overlaps it.

## Combined review build (2026-11-17, branch `claude/review-toolbar-and-coloring` — review pending, not merged)

- `claude/online-cover-studio` (38f8759, includes `claude/coloring-book-studio`) with `claude/toolbar-feedback-six` (903e35b) merged in. The only conflict was `app.css`, where both branches added styles at the end; both sets were kept.
- 38f8759 fixes the toolbar note "not updating with typography changes". Coloring book title and verse lines no longer pin their own font and size: they use the product's typography (headings = title font, body = Scripture font), so Style → Typography reaches the pages.
- Combined suites: 1,749 unit and 202 browser tests, all passing. Golden snapshots: only the checklist entries were added.
- a8335e7 (from `claude/online-cover-studio`): the artwork panel has a new "Covers" option, "Between the title and verse", for a page background on any page with a picture area (a coloring page). The whole picture is fitted between the words. The area comes from the solved `-art` group, inside the side margins. A new background on such a page starts there, and a hint shows when a picture runs under the words. This answers Sydni's screenshot of a page-size illustration drawn under the Joshua 1:9 verse. Coloring Book Studio still places page-canvas-size illustrations over the whole page, as before.
- Two designs per sheet (built on this branch): Print / Save PDF now has these choices:
  - "Single design per sheet" or "Two designs per sheet — actual size".
  - Automatic orientation: `twoUpLayout` tries side by side and stacked, on landscape and portrait paper, and picks the arrangement with the most room at the edges. It leaves a 0.25" gap between the designs when there's room.
  - Trim marks for both designs (`TwoUpCutMarks`).
  - A count line, e.g. "50 notepad sheets = 25 printed Letter sheets". A single master design fills both places on the sheet. A page too large for two is refused, not scaled.
  - A note when the art comes within 0.25" of the paper edge (most home printers can't print there).
  - The dialog lists the sizes that print two per sheet, from `twoPerSheetSizes`:
    - Clear of the printer's edge: 5×8, 5×7, 4×8, A6, 4×6, 3×5.
    - Edge to edge: 4.25×11, 5.5×8.5, 4×9.
  - New notepad sizes: 4 × 8 (two side by side on landscape Letter, 0.25" clear) and 4.25 × 11 (two fill portrait Letter).
- Grocery List toolbar notes, done on this branch. All three are `layoutOptions.listPage` settings, set in the "List sections, lines and checkboxes" panel:
  - "Still need line options": `lineStyle` is solid, dashed, dotted, or no lines (checkboxes kept). `LinesNode.dash` renders dashed or dotted lines.
  - Line spacing: `lineSpacing` is compact 0.28", standard 0.35" or roomy 0.42". The Checklist uses it too.
  - "Should have option for no section": `noSections` makes one list with no headings, in two columns on a wide sheet. "Lines" then counts the whole list.
- Verse size: `pageTypography.textSizePt` (default 13 pt) is set under "Verse and text size" in Coloring Book Interior Pages, and under "Verse size (pt)" in Cover Studio's page design. It reaches the product's body size and the What's Missing text-fit check. In the editor, Style → Typography's Body size also changes it.

## Cover Studio and Coloring Book saved online (2026-11-17, branch `claude/online-cover-studio` — review pending)

**Database change, live (approved by Sydni 2026-11-17):** table `public.product_studio_items` (kind `cover-draft` /
`cover-collection` / `coloring-book`, owner-only RLS like `product_studio_projects`, soft delete) and private bucket
`product-studio-artwork` (`<user id>/<picture id>`, owner-only read/add). Migration recorded in
`supabase/migrations/20261117193100_product_studio_items_and_artwork.sql`. Existing tables and the live app are untouched;
the live app doesn't use the new storage until this branch merges.
App: `persistence/itemsSync.ts` (merge like projects: changed one side → copied across; both → keep both; deletions
travel; items open in a screen are never replaced underneath), `persistence/itemBases.ts`, `app/useItemsSync.ts` (sync
at sign-in, after saves, on focus, every minute). Existing local Cover Studio work goes online on the first signed-in
sync. "Continue as a Coloring Book" (Cover Studio header, and Coloring Book's list) carries title, audience,
characters + pictures, scenes, Scripture choice, verified wording (as approved), style, binding, finished cover.
Tests: `tests/items-sync.test.ts`, `tests/browser/online-cover-studio.browser.ts` (two browsers, one account).

## Coloring Book: a finished product (2026-11-14, branch `claude/coloring-book-studio` — review pending, not merged or deployed)

Home now asks **What would you like to create?** (Coloring Book first; Children's Storybook and Workbook "Coming next";
every existing product type still listed; Cover Studio and Generate with AI under **Advanced tools**). Coloring Book is
one project in five steps — Book Setup, Characters, Interior Pages, Cover Design, Preview and Export — with
context-aware settings (coloring-only on the interior, full color on the cover), optional page text (title, verse,
lesson, custom text), Scripture that is detected, suggested (references only), pasted or fetched (public domain),
approved per page and licence-checked, an outline importer with review, character create / import / prompt,
finished-page previews from the print renderer, "What's missing?", and export through the existing print step.
Details: `product-studio/docs/coloring-book.md`. Tests: `tests/coloring-book-product.test.tsx`,
`tests/browser/coloring-book-product.browser.ts` (Gracious Kids: Jenny, Renae, Robby; Scene 1 "The Brave First Step").
Findings worth a decision: ten single-sided scenes are 22 pages (KDP needs 24 — one drawing page or front matter fixes
it); a book of full NIV verses exceeds Biblica's 25%-of-text free-use limit (permission, KJV/WEB, or references only).
Two home-screen browser tests were updated for the new cards (counts; "Other / Custom Product").

## Cover Studio: four screens, coloring books (2026-11-14, branches — review pending, nothing merged or deployed)

Stacked review branches, each containing the one before:
1. `claude/guided-steps-artwork` — product editor in four steps + uploaded artwork (section below).
2. `claude/stationery-cover-generator` — Cover Studio (section below).
3. `claude/cover-studio-steps` — 1 + 2 merged; Cover Studio in four screens with four categories.
4. **`claude/coloring-book-studio`** — 3 + current `main` (document upload, Scripture cards, generate-document v14)
   merged; category tabs with the step title and Back / Next at the top; Coloring Book Cover tab; cast with reference
   images; scene batches; coloring style (black outlines default, Hybrid optional, line thickness, complexity,
   per-scene overrides); five page outputs with a live space estimate; NIV room for the verse; artwork-only vs complete
   concept; compare-and-approve. Details: `product-studio/docs/cover-studio.md`. Merging 4 brings 1–3 with it.
Tested with *She Is Gracious — Ballet Coloring Book* (`tests/browser/coloring-book.browser.ts`).
**Coloring page fixes (2026-11-14, same branch):** clean eight-part scene prompts with no typography, banners or
drawn measurements; a character registry reused in every scene; references copied/downloaded as real image files;
per-scene illustration check, previews, consistency checklist, approval and regeneration; page assembly in Product
Studio (8.5 × 11, 300 DPI, 0.25 in margins, 0.5 in gutter, blank backs); optional Scripture lettered into the
artwork once verified. Details: `product-studio/docs/cover-studio.md`. Regression: `tests/coloring-book.test.tsx`,
`tests/browser/gracious-kids.browser.ts`. Still manual: a
signed-in ChatGPT run; checking real generated covers against the references (the approval is the maker's); the verse
wording and permission (`codex/scripture-permissions-review` is a separate, unmerged review); reference images live on
one device (no online copy yet).

## Cover Studio (2026-11-13, branch `claude/stationery-cover-generator` from `main` 7d7bb23 — review pending)

Native port of the standalone stationery cover generator into Product Studio (home → **Cover Studio**). Docs:
`product-studio/docs/cover-studio.md`. Not merged, not deployed. Journal Color Studio untouched. Decisions: dimensions
from the geometry engine and printer profiles (bleed 0 = no-bleed build; spine never invented, KDP formula only offered);
collections stored locally apart from projects (no online saving); the 18 prayer / warrior / warring-woman palettes are
cover-only (`COVER_PALETTES`), only Violet + Peach Cloud joined `PALETTES`.

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
  `edge_usage_logs` held exactly 5 rows (units 1) — refused requests are not counted. The account's own REST
  DELETE and PATCH on its rows changed 0 rows, and it stayed blocked afterwards (the cap can't be reset by the user).
- **Cleanup still open:** the test account was signed out everywhere (no live refresh tokens), but deleting it
  timed out through the Supabase MCP tool (deletes don't run from the cloud session; reads/inserts do). Delete it in
  the Supabase dashboard → Authentication → Users → `ps-livecheck-20261015@example.com`; its 5 usage rows go with it
  (`edge_usage_logs_user_id_fkey` is ON DELETE CASCADE). Expected afterwards: 11 users, 40 usage rows.

## Four-step editor and uploaded artwork (2026-11-14; branch `claude/guided-steps-artwork`, not merged)

Production Product Studio (`dove-product-studio`, Vercel) deploys from `main` (09c63c9 on 2026-11-14). This branch
starts there and changes Product Studio only (`product-studio/`); Journal Color Studio files are untouched.

**Four steps.** The editor's existing areas are grouped in the order a product is made, with a step title,
"Step N of 4", a progress bar of the four steps (any step can be opened; steps reached are ticked) and the same
Back / Next on every step (`components/editor/Areas.tsx` `STEPS`, `useStep`, `StepHeader`, `StepFooter`):
1. Product setup: Page setup (product type shown, size, orientation, binding, printer).
2. Pages and content: Pages, Your content, Page layout, Writing, Add to page.
3. Artwork and style: **Artwork** (new) and Style (colors, fonts, covers, background, decorations).
4. Preview and export: Print & export (page check, Print / Save PDF), Advanced.
No control was removed. The step in view and the furthest step reached are remembered per project in this
browser (`dove-product-studio:v1:workflow:<id>`); a new product opens on step 1, one already being made on step 2;
a Custom Page still opens on Add to page. The work itself saves with the project as before.

**Uploaded artwork** (`types/artwork.ts`, `engines/artwork/place.ts`, `engines/artwork/store.ts`,
`primitives/ArtLayer.tsx`, `components/editor/ArtworkPanel.tsx`). Upload PNG, JPG or WebP (checked by its bytes,
up to 40 MB / 12,000 px), then use it as:
- **Cover**: on the chosen cover page(s), to the trim plus the printer's bleed; "Finished cover, as is" (only the
  artwork prints) or "Add title over artwork" (the cover's own title and wording, edited as before, in palette,
  light or dark ink).
- **Page background**: this page only, every page of a kind, or any chosen pages; whole page to the edge, or
  inside the margins (clear of trim and the binding gutter); opacity.
- **Page illustration**: *corner* (over the page, inside the print-safe area; size, nudge, mirrored to the outer
  edge on left-hand pages) or *own area* (a band at the top or bottom: the page's content — lesson text,
  calendars, writing space — is laid out in the room left, and flowing content continues on more pages; this goes
  through `geometryFor` and the flow measurement in `resolve.ts`, so measuring and drawing agree).
- **Art made to run off the page.** When a transparent PNG is added, the edges its design is cut along are
  found (`findCutEdges`: opaque pixels along an edge). A new illustration from art cut along the bottom (and a
  side) is anchored there with "Run off the page edge": flush with the media edge, out into the bleed, so it
  prints to the trimmed edge instead of stopping short inside the margin. Mirrored onto a left-hand page it moves
  to the outer edge and is flipped, so its cut sides still face out. Backgrounds can be mirrored the same way.
Fill-and-crop or show-whole, zoom, position, Replace, Remove; print resolution shown per use (300+ ppi sharp).
**One placement function** feeds the preview, thumbnails and print (`artworkFor`), so they always match.

**Where images are kept.** The project stores only the artwork's id (SHA-256 of the file), name, type and size
plus its placements; the file itself is kept byte for byte (a transparent PNG stays transparent) in this browser's
IndexedDB (`dove-product-studio-artwork`). It survives reopening and reloads on that device. **Online saving
copies the placements but not the image files**: on another device the pages show "Artwork not on this device"
and export names the missing image until it is added again (Replace). Making images follow the project online
needs a Supabase Storage bucket and policies — a schema change that needs Sydni's approval. Deleting a project
doesn't yet delete its images from the device.

**Tests (2026-11-14).** Typecheck clean. Unit: all existing tests unchanged and passing, golden print snapshots
unchanged, plus `tests/artwork.test.tsx` (16): placement math, cover to bleed, background on selected pages,
corner art inside the safe area and mirrored, safe backgrounds clear of the gutter, own-area reflow, save and
reload, old projects unchanged, file reading, and identical images and positions in preview and print.
Browser: `tests/browser/artwork-workflow.browser.ts` (3): steps (Back / Next, jump back, reload) on an existing
saved project; a full-cover JPEG, a WebP background on selected pages and a transparent PNG corner
illustration, reopened and printed — the print tree draws the same images at the same places as the preview and
the PNG is still RGBA; iPhone 390 / 430 with no sideways scroll and 44px touch targets. `tests/browser/areas.ts`
`openArea` now opens the area's step first. Full browser suite on this branch: 165/165 after one existing test
(`cover-divider` "cover surface") was changed to scroll the cover picker into view first: its thumbnails load as
they scroll into view, and the step header now places three of them below the fold (it passes on `main` without
the scroll; real use is unaffected).

**Tried with Sydni's To-Do List "Dots and Stripes" artwork (2026-11-14).** 6 × 9 coil journal, bleed on: cover art
as a full cover with the title over it; the calendar art behind the month; the interior art behind every To Do
page, mirrored on left-hand pages; the transparent corner art on the Notes pages (cut edges found as bottom and
right, so it ran off the page at the outer bottom corner automatically, flipped on left-hand pages). Reopened and
exported to PDF with the same placement. Notes for the art: 1800 × 2700 is 6 × 9 at 300 ppi, but with ⅛" bleed the
page is 6.125 × 9.25, so it prints at about 290 ppi (the studio says "may print a little soft"); 1838 × 2775 px
gives a full 300 ppi with bleed. The calendar art is landscape (11 × 8.5); on a portrait page "Fill and crop" shows
only one corner of it, so use it on landscape monthly pages or choose "Show the whole image".

**Stationery Cover Prompt Generator.** Not in this repository on any branch, not in either Vercel project, and
not in claude.ai artifacts as of 2026-11-14; its source is needed before it can be organized into four screens.

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
