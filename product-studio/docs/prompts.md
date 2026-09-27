# Prompt + response

One content model for every page section that is "a prompt, then room to
answer it". Used by guided book pages (Meeting With God, vision, goals,
reviews, prayer, reflection, devotional, guided, custom), devotional recipes
(Daily Reflection, SOAP, Verse Mapping) and worksheets. Locked structures
(hourly schedules, calendars, weekly grids, tables) are not prompt blocks.

## Model (`src/types/prompts.ts`)

```ts
type PromptBlock = { id; label; responseStyle?: "ruled" | "blank" | "dot-grid" | "checkboxes"; lineCount?; minLines?; weight? };
type PromptSet   = { blocks: PromptBlock[]; sameLines?; spacing?: "tight" | "standard" | "roomy"; instructions?; whenFull?: "continue" | "fewer-lines"; legacyWeights? };
```

- `lineCount` blank = fill the space left on the page (shared by `weight`).
- `sameLines` = "Use the same number of lines for every prompt".
- `responseStyle` blank = the page's own style (a recipe zone's surface, or the
  product's writing lines on guided pages).
- Wording is content: changing it never changes the page type.

Where it lives: `BookStep.promptSet` (guided pages in a book) and
`layoutOptions.stationery[comboId].promptPages[page]` (recipes / worksheets).

## Layout

`layouts/shared/promptPages.ts` (one solver) → `engines/stationery/geometry.ts`
(`paginateZones`, `resolveZones`: pure math) → `layouts/stationery/surfaces.ts`.

1. Headings, prompts and instructions are measured; fixed line counts take
   `lines × line spacing` (checklists: `lines × row height`); "fill the space"
   prompts share the rest by weight.
2. When the prompts don't fit, they **continue on another page** (default).
   "Use fewer lines first" lowers requested lines down to each prompt's minimum
   before continuing. Line spacing is never reduced.
3. Continuation pages are added by the recipe engine (`LayoutDefinition.flowPages`,
   `PageInstance.flowPart / flowCount`), measured on the product's own page size —
   A5 needs more pages than Letter for the same content.
4. Two-page spreads can't continue; the page check says, in plain words,
   "This page does not have enough room for 6 prompts with 12 writing lines each."
   with "Use fewer prompts / Use fewer lines" actions.

## Migration

- A saved plain prompt list (`BookStep.prompts`, module defaults) becomes a
  prompt set with `legacyWeights` (every prompt fills the space, the first of
  three or more gets twice the room, no minimum): the same wording and the
  same visible line counts as before (tested against recorded counts).
- Recipe customizations saved before prompt blocks (rename / hide / order /
  space) still apply until the creator edits the prompts.

## Editor

`components/editor/PromptEditor.tsx`: Number of prompts · Prompt N wording ·
Writing lines (blank = fill the space) · Answer area · Use the same number of
lines for every prompt · Add / Remove / reorder · Space between prompts ·
When the prompts don't fit. Shown under Book structure (guided steps) and
Page sections (recipes, worksheets with instructions).
