# Page Composer

The Page Composer is not a separate editor. It is the Custom Page's section
list (Add to page / Writing), made able to hold structured pieces, plus saved
page designs that the Pages builder can add many times.

## Pieces

| Piece (Add to page) | Block `kind` | Drawn as | Height |
|---|---|---|---|
| Heading / text | `heading` | heading + optional text under it, no writing lines | its text |
| Info row | `info` | a row of labelled blanks (`fields`, default "Date") | one row |
| Prompt + writing space | `prompt` (default) | prompt + lines / grid / dots / blank | fixed, fill, or equal share |
| Table | `prompt`, response `table` | rows × columns | as prompts |
| Task list / checklist | `prompt`, response `checkboxes` | check boxes with lines | as prompts |
| Writing lines | `prompt`, response `lines` | lines | as prompts |
| Divider line | `divider` | a rule across the page | fixed (section spacing) |
| Spacer / open space | `spacer` | nothing | small ¼″ · medium ½″ · large 1″ |

Existing decorations still come from the Style area.

Each piece can be added, reordered (up / down), duplicated, removed, renamed,
and — for writing pieces — given more or less room. Everything stays in the
page's safe area. The solver (`layouts/shared/promptPages.ts`) places fixed
pieces first (`ZoneRequest.fixedIn`), then shares the rest; if the pieces do
not fit, the page says so in plain words instead of overlapping.

## Refinement (build-first editor)

A Custom Page (or a page made from a saved design) opens in **Add to page**
with **Build your page** first: the pieces as buttons, grouped Writing,
Planning, Prompts, Organization. Then **Your page** (the sections, each a
row that opens to edit), then **Page options** (collapsed): start from a
structure, page header, instructions, section style for the whole page, same
lines for every section, space between sections, and what happens when the
sections don't fit. The piece just added opens, in view; the others close.

Per section, in plain words:

| Control | Choices | Stored as |
|---|---|---|
| Writing area | Your writing lines style, Ruled lines, Blank, Dotted, Grid, Checklist, Table | `responseStyle` (`graph-grid` → surface `graph-grid`) |
| Writing space | Compact (3 lines), Standard (6), Spacious (10), Fill remaining space | `space` + `lineCount` (`WRITING_AMOUNTS`); exact lines, equal share and "never fewer than" under **More** |
| Checklist / task list | Rows, Marker (circle / square / none), Position (left / right), Writing line (on / off) | `lineCount`, `taskMarker`, `taskMarkerPosition`, `taskLines` |
| Heading / text | Text style: Page title, Section heading, Body text (the typography roles `pageTitle`, `sectionHeading`, `body`; no point sizes of its own). The first heading added to a page starts as its title. | `textStyle` (pages saved before: section heading) |
| Table | One box per column label (+ Add column / Remove), Rows, Lines (grid / horizontal / minimal / none), Header row, Table space: Compact / Standard / Spacious rows (0.85× / 1× / 1.35× the list-row token) or Fill remaining space | `table.columns`, `table.rows`, `table.rowSpace`; fill = `space: "fill"` |
| Info row | 1–3 blanks, each a label and "A line" or "A box" | `fields`, `fieldStyles` |
| Beside the section above | two writing sections as two columns | `beside` |
| Section style | Same as the page, Open, Line below, Soft outline, Filled panel, Rounded panel | `frame` (page default: `PromptSet.frame`) |

Geometry stays automatic:

* **Side by side** (`layouts/shared/promptPages.ts`): two writing sections
  share one band. Fixed + fixed → the taller one's height; otherwise the band
  shares the page's free space and is never shorter than the taller one's
  minimum (`ZoneRequest.minIn`). Both columns' writing starts on the same line.
* **Section styles** draw with the palette's semantic tokens only (`border`,
  `accent` at low opacity), so they follow Style; the padding inside a frame
  is never less than the heading / label border insets, so the studio's own
  spacing checks pass.
* **Tables that fill** keep the chosen rows as their minimum and stretch
  them evenly to the next section or the bottom of the page; rows never grow
  past 1.6× their normal height (`TABLE_MAX_STRETCH`) — beyond that a few more
  rows are drawn so each stays a comfortable writing height. They never
  overlap what follows; when the rows can't fit, the page continues.
* **Info rows** (`fillInRows` in `layouts/stationery/surfaces.ts`) keep every
  label whole and every blank at least 0.9″; blanks that don't fit wrap to
  another row instead of being squeezed.

No dragging, free positioning, overlap, rotation, resize handles or layers.

## Future Fill Mode: field vs list

Every block records what it holds (`PromptBlock.content`, read with
`contentOf`):

* `field` — one answer (a prompt with lines, an info blank);
* `list` — many entries (tables, checklists).

`content.key` (defaults to the block id) is the stable name a later Fill Mode
will store answers under. Phase 1 only records it; nothing is filled in yet.

## Saved page designs

"Save page design" (under the section list) stores the page's title and
sections on the project (`project.pageDesigns`), replacing a design with the
same name. In **Pages → Your page designs**, a design can be added any number
of times (copies), before the end cover, each copy an independent page (a deep
copy, so editing one page does not change the others or the design). This is
how a book like "Cover → Master Dashboard → Project Snapshot × 8 → …" is
built.

Code: `engines/recipe/pageDesigns.ts`, `components/editor/BookPanels.tsx`
(`SaveDesign`), `components/editor/PagesBuilder.tsx` (`PageDesigns`).

## Not in Phase 1

Drag and drop, free positioning, and filling answers in (Fill Mode).

## Tests

* `tests/composer-qa.test.ts` — Project Snapshot, Revelation to Execution
  and Master Dashboard (`tests/fixtures/composerPages.ts`, pieces only) at
  Letter, 7 × 9 and 5.5 × 8.5: inside the safe area, no errors, no
  overlapping sections; side-by-side alignment; section styles; info rows
  (1–3 blanks, line / box, wrapping on a Filofax Personal page); grid;
  checklist without lines; theme change moves nothing.

* `tests/page-composer.test.ts` — every piece at three sizes stays inside the
  safe area without errors; heading / spacer / divider specifics; reordering;
  field vs list; saved designs.
* `tests/browser/page-composer.browser.ts` — desktop and phone: add seven
  pieces, rename the heading, save the design, add it three times from Pages;
  no sideways scrolling on a phone. A new Custom Page opens on Build your
  page, with Page options below and closed. Revelation to Execution built by
  tapping pieces and typing (plain amounts, a boxed blank, two columns, a
  panel), page OK.
