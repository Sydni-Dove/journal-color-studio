# Prompt + response

One content model for every page section that is "a prompt, then room to
answer it". Used by guided book pages (Meeting With God, vision, goals,
reviews, prayer, reflection, devotional, guided, custom), devotional recipes
(Daily Reflection, SOAP, Verse Mapping) and worksheets. Locked structures
(hourly schedules, calendars, weekly grids, tables) are not prompt blocks.

## Model (`src/types/prompts.ts`)

```ts
type PromptBlock = { id; label /* heading, may be empty */; prompt? /* instruction under it */; space?: "fixed" | "fill" | "equal";
                     responseStyle?: "ruled" | "blank" | "dot-grid" | "checkboxes"; lineCount?; minLines?; weight? };
type PromptSet   = { blocks: PromptBlock[]; header?: GuidedHeader; sameLines?; spacing?: "tight" | "standard" | "roomy"; instructions?;
                     whenFull?: "continue" | "fewer-lines" | "stop"; legacyWeights? };
type GuidedHeader = { eyebrow? /* STEP TWO */; number? /* 02 */; subtitle?; reference?; rule?; fields? /* ["Date", "Source"] */ };
```

- Writing space per section: **fixed** (`lineCount` lines), **fill** (the space
  the others leave, shared by `weight`), **equal** (every equal section on the
  page gets the same whole number of lines; a part-line left over goes between
  the sections). Older blocks: fixed when they have `lineCount`, else fill.
- Heading and prompt are separate fields: heading only, heading + prompt, or
  prompt only.
- `header` is measured before the sections (first page only); its fields are a
  fill-in row before the first section.
- `whenFull: "stop"` keeps one page and reports "This page does not have enough
  room for 4 sections with the selected writing lines." with Use fewer lines /
  Continue on another page / Remove a section.

**Guided Lined Page** (page type `guided-lined`, `RecipePreset` in
`presets/layouts/recipePresets.ts`): a book step of purpose "guided" with a
prompt set, starting as a Full Page Prompt. Starter structures
(`PROMPT_STARTERS`): Full Page Prompt, Two Prompt Reflection, Three Prompt
Response, Four Prompt Review — editable starting points, not locked layouts.

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

`components/editor/PromptEditor.tsx`: sections as compact rows ("My Response ·
8 lines", "Prayer · Fills space · 14 lines · page 2") showing the real lines each
gets at this size (`sectionLineCounts`, `sectionPages`); a row opens to edit
Heading · Prompt · Writing space (Fixed lines with − / + · Fill remaining space ·
Equal share) · Never fewer than · Writing area · Move up / down · Duplicate ·
Remove. Plus + Add section, Start from a structure, Page header (guided pages),
More section options (same lines for every section, space between sections)
and When the sections don't fit. Shown under Book structure (guided steps) and
Page sections (recipes, worksheets with instructions).
