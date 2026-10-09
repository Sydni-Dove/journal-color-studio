# Product Studio roadmap

Product Studio builds print-ready products in layers. Each layer can change
without rebuilding the others:

```text
Product project (size, binding, printer)
  → Geometry (trim, margins, gutters, safe area)
  → Book recipe (sections, cadence, page order, recto / verso)
  → Page modules (purpose: Meeting With God, Review, Goals, …)
  → Layouts (the design of a page)
  → Composition + decoration (roles, placements, spacing tokens)
  → Theme (type, color, surfaces)
  → Render / print
```

## Product families

The studio home names what can be made today and what comes next
(`src/presets/products/productFamilies.ts`).

| Family | Status | Foundation |
| --- | --- | --- |
| Planner | available | monthly / weekly layouts, date engine |
| Journal | available | writing pages, guided page |
| Planner + Journal | available | composite book recipe, hybrid spread |
| Notepad, Desk Pad | available | repeated master sheet |
| Custom Product | available | any size / binding / page sequence |
| Devotional | next | **Content Template Engine** (below) |
| Workbook | next | Content Template Engine + layout research |
| Worksheet | next | layout research |

A "next" family is shown on the home screen but is never clickable.

## Daily pages

- **Decoration on daily pages:** backgrounds and decorative elements work on
  every daily layout. The Luxury Daily Execution page now declares its date as
  the title and its divider as the title rule, so title accents (header
  sprigs, bouquet) anchor to them. Table-corner sprigs still need more space
  around the schedule table than most daily layouts leave. On the configurable
  page only the lower-right corner of the schedule has room.
- **Watercolor = the JCS Abstract watercolor** (Canva page 64, 14 layers,
  recolored per layer). The old procedural wash is retired; saved projects
  that used it now show the Abstract watercolor.

- **Daily Planner product** (studio home → Daily Planner): front matter →
  each month: calendar → each week: plan + Meeting With God spread → that
  week's daily pages → monthly review.
- **Daily planner page** (`src/layouts/planner/dailyConfigurable.ts`), from the
  original brief: choose any of schedule, top priorities, to-do, notes,
  gratitude, prayer, scripture, reflection and kingdom assignments, and their
  order (Layout panel). Default: schedule, top priorities and to-do. Wide
  pages put the schedule beside the lists, with extra lists in a band below.
  Narrow pages stack, splitting the schedule into two hour columns. Too many
  sections for a page is reported, never squeezed.
- **Daily notepads:** an undated daily planner sheet for larger pads, and a
  Daily To-Do (date line + to-do) for small pads.
- **Luxury Daily Execution** (`src/layouts/planner/dailyPlanner.ts`) is the
  daily page of the Meetings With God Luxury Planner 2026, built from the shape
  geometry measured in `Sydni_Howard_LuxuryPlanner_2026_WhitePurple_Edit.pptx`
  (8.5 × 11): dated header, verse + theme band, 15 time blocks (6 AM – 8 PM),
  top instructions, to-do, daily checklist, end-of-day reflection, notes /
  gratitude. Every label, and the checklist items, are wording keys.
- It needs Letter. Smaller trims report it incompatible. A compact daily
  design for 7 × 9, Half Letter and inserts is a separate, explicitly
  designed layout (not built yet).
- **Cadences are declared per page purpose** (`MODULE_CADENCES` in
  `src/presets/modules.ts`). Daily is offered for daily planner, Meeting With
  God, journal, notes, prayer, reflection, devotional, guided and custom pages
  (and declared for tracker / worksheet, which await layouts). It is not
  offered for monthly calendars, weekly planners, vision, mission, goals or
  reviews.

## Universal document foundation (in progress)

Product Studio is becoming a universal structured-document creator (devotionals,
workbooks, curricula, inventory notebooks, notary journals, intake forms,
maintenance logs, planners…) built from ONE set of components, not a generator
per product. Order of work:

0. **Protect existing work** — done: unsaved local branches backed up to
   `backup/*` on GitHub; `tests/golden-templates.test.ts` snapshots what every
   existing template prints (32 templates × 3 trims + every design preset).
   Refactors must leave it unchanged; a deliberate change updates it in the
   same commit and says why.
1. **Document model** — done (foundation only): `types/document.ts` (components
   with stable ids and typed fields; presentation hints kept apart; data;
   reserved requirements) and `engines/document/model.ts` (lossless conversion
   to/from today's PromptSet — every shipped prompt set prints identically after
   a round trip; a semantic fingerprint that ignores styling; per-requirement
   standings). Nothing is drawn from the model yet.
2. **Measurement and export readiness** — done: continuation pages are measured
   on both sides (mirrored binding margins; the usable page is the same size on
   both for every binding today, pinned by a test) and on the book's FINAL page
   count — a spine gutter grows in printer bands, so the count is re-measured
   until it settles. Export (button and the moment before printing) waits until
   the fonts are loaded and the pages were laid out with them
   (`engines/print/readiness.ts`). Tests: `tests/measurement.test.tsx`.
3. **Shared content pagination** — done: one paginator (`paginateZones`) splits
   sections in whole units through a `ZoneSplit` each section describes — body
   text by line (paragraph / sentence ends preferred, ≥ 2 lines either side),
   writing / checklist / table rows only when longer than a page (table header
   repeated), printed lists by item, records whole and numbered across the
   product (`engines/recipe/sequence.ts`); headings stay with what follows.
   Every piece reports its source section and range (`SolvedPage.fragments`).
   New sections: printed list and repeating record (`layouts/stationery/flowSurfaces.ts`).
   Export is blocked, with a warning, when a font used on the exported pages
   didn't load. Tests: `tests/content-pagination.test.tsx`.
4. **Data layer** — done: named lists of typed entries stored in the product
   (`ProductProject.data`; `engines/data/data.ts`), so they save, undo and sync
   with it. Entries have stable ids; values are read by their field's type and
   anything a type can't read is kept as typed and flagged, never dropped
   (changing a field's type or removing a field keeps every value). Editor area
   "Content data" (`components/editor/DataPanel.tsx`): forms built from each
   list's fields, add / edit / reorder / duplicate / delete, paste or CSV import
   with header detection, column matching and a preview. Online saving: every
   write is a compare-and-swap on `updated_at`, and a sync that finds a product
   changed on two devices keeps both (the newer as the product, the older as a
   named copy) using the version each device last agreed on
   (`persistence/sync.ts`). Pages don't read data yet, so nothing printed
   changed. Tests: `tests/data-collections.test.tsx`, `tests/cloud-sync.test.ts`.
   Deletion travels between devices: a deleted product's row is kept with
   `deleted_at` and listed to every device; a device with no unsynced edits
   removes it, unsynced edits become a "(recovered after deletion · saved …)"
   copy under a new id, the deleted id is never written back, deletions made
   offline are remembered until they reach the online copy, and a deletion
   never hides newer edits saved on another device. Copies are named neutrally
   (`persistence/copyNames.ts`: "<name> (other version · saved <time>)").
   Verified live against Supabase with `tests/live/cloud-live.ts` (run by hand
   in a signed-in dev page; 29/29) and in two signed-in browser sessions.
5. **First proof: a devotional from saved entries** — done. A book section
   repeats once per entry of a content list (`BookGroup.entries`), in the
   list's order, each entry's stable id in its page keys. Page sections name the
   field they print (`content.key`); `engines/data/bind.ts` fills them per entry
   (body text flows across pages through the shared paginator; questions print
   as a numbered list, or as written when already numbered; `{field}` / `{#}`
   in titles). Empty values leave their section out; nothing is shortened,
   rewritten, duplicated or moved between sections, and anything that prints
   entries can't be duplicated or repeated. `presets/devotionalStructures.ts`:
   three structures matched to a list's fields by key or label (unprinted
   fields are reported), chosen in Content data → Print as a devotional;
   switching structure, size or binding never touches the entries. Fixes found
   on the way: a start side no longer applies to continued pages, and a heading
   is never left alone above a section too short to split. Tests:
   `tests/devotional.test.ts` (7 / 40 / 365 days, short and very long entries,
   every structure, several sizes, landscape, perfect-bound and coil); a
   138-page Chrome PDF was checked word by word.
   **Accepted, with refinements to schedule (not built yet):**
   - *Paragraph spacing* — a configurable space between paragraphs of body
     text (a styling choice). Existing templates keep today's default (no
     extra space, so their snapshots don't move), and the paginator must
     measure the space it adds — a page break between paragraphs drops it.
   - *Clear structure switching* — before a devotional structure replaces
     pages, say which existing pages will be replaced (by name and count),
     keep compatible custom pages where possible (today only cover / divider /
     back cover pages are kept), and offer a plain Cancel, not only Undo.
   - *Several content lists in one book* — e.g. a devotional and a reading
     plan, or a workbook's lessons and its answer key. Plan how a book names
     which list each per-entry section reads, how page numbering and
     contents pages see them, and how the Your content area shows more than
     one; not implemented yet (one list per book today).

   **Devotional workflow review** (for someone who is not a designer or
   programmer). The intended path — choose a devotional → add or import the
   days → choose a design → preview → export — had gaps, now closed:
   - New product → Devotional asked for a fill-in page type and made 90 blank
     pages; making a devotional from your own words was only reachable by
     finding a separate content area. Now "How you'll make it" offers
     *Write my devotional here* first, which creates the list of days and
     its pages together and opens on the content.
   - Wording: "Content data", "fields" and "structure" became *Your
     content*, *What each entry has* and *Devotional design*; the preview's
     "This recipe produces no pages yet" now says what to do; the list
     picker and list settings are out of the way when there is one list; the
     paste box opens when there are no entries yet.
   - The export check listed the 24-page minimum twice (printer and binding
     say the same thing): issues that read the same are one row now, and its
     advice mentions adding days.
   - Still technical, and kept to advanced places: the Order & repeats
     editor (sections, `{title}` in page titles) and the field editor.
6. **Second proof: an inventory notebook** — done, with no new pagination or
   rendering engine and no inventory-specific layout: count sheets and item
   records are guided pages made of an info row, a table and a record
   section (`presets/layouts/recipePresets.ts` INVENTORY_PRESETS; New
   product → Inventory & Log Book). The table's columns are the data
   engine's "Inventory items" fields. Shared capabilities it needed, now
   available to every table or record section:
   - *Columns sized to what they hold* (`PromptTable.columnTypes`): the
     table solver's existing proportions, set from each column's value type
     (notes wide, numbers / dates / amounts narrow), never below the
     heading; untyped tables keep equal columns (snapshots unchanged).
   - *Numbered rows* (`PromptTable.numbering`): a "No." column counted in book
     order by the record sequence code, continuing across copies and
     continued pages, sized for its widest number (three digits at least).
   - *Fill the page* (`engines/recipe/fitRows.ts`): a numbered table's rows or
     a record section's records are measured with the shared paginator at
     the product's size and orientation — on creation, or "Fit rows / records
     to one page" in the editor.
   - Editors: what each column holds, reorder columns, number the rows (up
     to 200 rows); a record editor (blanks, count, label, first number).
   Found in real-font PDFs: three-digit numbers overflowed the "No." column
   (the approximate test measurer missed it) — fixed in the shared table.
   Tests: `tests/inventory.test.ts`; PDFs checked number by number.
7. **Layout alternatives and suggestions** — done.
   *Refinements:* page-filling tables and record sections (`fillPage`) are
   refitted in the same edit whenever the room on their page changes; typed
   counts are deliberate and never refitted; linked sections (`fillGroup`)
   share the smallest count that fits. Sections are named by what they are
   (`sectionName`). Column widths the maker sets are kept exactly.
   *Smart Layout Assistant* (`engines/layout/assistant.ts`, Print & export →
   Layout suggestions): deterministic; measures the product's own solved
   pages (errors, crowded columns, squeezed headings, mostly empty pages,
   unused space, pages, fillers) and offers alternatives — other
   orientation, columns sized to what they hold, three-line heading row, a
   wide table split across facing pages (same rows, numbers and row
   positions on both), record cards instead of a very wide table, rows /
   records that fill each page, a devotional's other designs — each
   measured the same way and kept only when better, with reasons and
   before → after outcomes, previewed before use. Shared additions:
   three-line table headings, full-height heading rows. Found in real-font
   checks: split halves fitted different row counts (heading wrap) — fixed
   with linked counts and a check that each half faces the other.
8. AI-generated document structures
   (same components, no coordinates); 9. Requirements Assistant (reserved in the
   model now; not built in these phases).

Rules: the collection owns words, the recipe owns order, pagination owns page
breaks, solvers own geometry, and preview and print draw the same pages.
Requirements are data about a document; they never decide layout, and the
studio never makes a blanket compliance claim.

## Content Template Engine (planned — not built)

Devotionals, workbooks, guided and prompt journals, and course companions
carry *content* (entries, lessons, questions) that should be swappable
without touching the layout or the book structure.

```text
Content
  → Content Template
  → Layout
  → Theme
  → Book Recipe
```

- **Content.** The user's material, for example 40 devotional entries.
- **Content Template.** The schema a kind of content follows. The reserved types are
  in `src/types/content.ts` (`ContentTemplate`, `ContentField`,
  `ContentCollection`, example `DevotionalEntry`):

  ```ts
  type DevotionalEntry = {
    day?: number;
    title: string;
    scripture?: string;
    devotionalText: string;
    reflectionQuestions?: string[];
    prayerPrompt?: string;
    actionStep?: string;
  };
  ```

- **Layout.** Binds to *fields* (title, scripture, text, questions), never to
  specific content, so the same devotional layout prints any devotional.
  Overflow rules (text fitting, continuation pages) belong to the layout.
- **Book recipe.** Decides which entry lands where. For example, a "daily" step
  consumes entry *n* on day *n*, and a lesson section repeats per lesson.

**Seam that already exists.** Layouts receive per-page content through
`LayoutContext.module` (title, period label, prompts), set by the book recipe
engine. A content entry will travel the same way, as one more field. The
engine, the layouts and the recipe stay separate.

**Separation rules.**
- Content never stores geometry.
- Layouts never store content.
- The recipe never stores either; it references a content collection and a
  cadence.

## Layout research before a layout library

Before building a large library of devotional, workbook or worksheet layouts,
research real, published layout conventions and base the presets on that
research, not on invented page structures:

- devotional journals
- guided journals
- workbooks and course workbooks
- worksheets
- reflection journals
- Bible study workbooks

Record what the research covers the same way `docs/research/` does for print
geometry: measurements, section proportions, prompt density, writing-space
ratios and their sources.

## Decoration

- **Roles.** Each asset declares its visual job (`DecorationRole`: background,
  frame, band, edge, corner, divider, rule accent, heading accent,
  header / footer flourish). Only role-appropriate placements are offered, and
  every placement attaches to a target (title rule, page edge, header, footer,
  content boundary).
- **Layers.** A page has a BACKGROUND / surface layer (marble, watercolor,
  stripes, solid) and a DECORATIVE ELEMENTS layer (florals, line art), each
  picked from a curated library with palette-recolored thumbnails
  (`design-library/catalog.ts`, `themes/layers.ts`). Projects saved with one
  combined decoration are migrated without any visual change.
- **Design library.** Synced to Journal Color Studio `main` `ba916ad`
  (`src/design-library/SNAPSHOT.md`): the four kintsugi marbles with their
  recolor model (`texScale`, the second stone under a transparent seam
  overlay, burgundy's whole-original source), three stripe patterns, the
  "As designed" marble palettes, the 11 color families, the line-art accent
  role and the floral "original colors" option.
- **Next library step.** Bold stripes, Scribble and Abstract arches wait for
  full-size Canva exports upstream (JCS marks their current maps as low
  resolution). Cover backgrounds (photo marbles, leathers, washes) wait for a
  cover product.
