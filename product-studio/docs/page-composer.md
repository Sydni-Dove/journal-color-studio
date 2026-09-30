# Page Composer (Phase 1)

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

* `tests/page-composer.test.ts` — every piece at three sizes stays inside the
  safe area without errors; heading / spacer / divider specifics; reordering;
  field vs list; saved designs.
* `tests/browser/page-composer.browser.ts` — desktop and phone: add seven
  pieces, rename the heading, save the design, add it three times from Pages;
  no sideways scrolling on a phone.
