# Stationery recipes (Devotional, Worksheet)

A recipe is a reusable, pre-engineered page structure. Pick **family → recipe →
trim** and the page is solved: margins, safe area, section heights, writing
lines, table columns and footer clearance come from the engines, never from
the creator.

```
stationery recipe            presets/stationery/catalog.ts        WHAT: sections, order, weight, surface, pages, table columns
  → geometry resolution      engines/geometry (trim, binding, printer → safe area)
                             layouts/shared pageFrame (header / body / footer)
                             engines/stationery/geometry.ts       zone heights, column widths (pure math)
  → structured page model    layouts/stationery/stationeryLayout.ts + surfaces.ts   LayoutNodes
  → theme                    colors / typography / background / decoration        presentation only
  → renderer                 primitives/PrintablePage (unchanged) → preview / print / export
```

## Layers

| Layer | Owns | Must not |
|---|---|---|
| Catalog (`types/stationery.ts`, `presets/stationery/catalog.ts`) | combo id, family, type, variant, supported trims, zones (key, label, surface, weight, optional), page count, research table widths | hold margins, rects, colors or fonts |
| Geometry (`engines/stationery/geometry.ts`) | `effectiveZones` (customization), `resolveZones` (heights), `resolveColumns` (widths), `shareWithMinimums` | know about recipes by name, colors or fonts |
| Page model (`layouts/stationery`) | measuring headings / prompts, calling geometry, one renderer per surface | invent sections the recipe does not declare |
| Theme | colors, fonts, backgrounds, decoration | change structure (tested: `geometry / theme separation`) |

## Rules the geometry layer applies

- Headings and prompts take their measured height first; the remaining writing
  space is shared by weight. Every writing area keeps at least
  `MIN_RESPONSE_IN` (two writing lines); a section below its share is pinned to
  the minimum and the rest re-shared by weight.
- `minResponseToPromptRatio` (research: prompt : response ≈ 1 : 5): the page's
  writing space must be at least 5× its heading + prompt text.
- Table columns keep the research proportions, scaled to the usable width. A
  column narrower than its heading (at the studio's minimum heading size) is
  widened to exactly that, taken proportionally from the others.
- A trim that cannot hold the structure is refused with the reason. It is never
  squeezed. `supportedTrims` lists only trims where the full structure fits
  (tested).

## Creator customization (semantic only)

Stored per combo id in `layoutOptions.stationery`: rename, prompts, hide
optional sections, reorder writing sections, space (Less / Standard / More) and
balance (As designed / Equal sections). The recipe itself is never changed.
The editor's **Page sections** panel exposes these; it has no numeric inputs.

## MVP recipes

| Combo id | Pages | Structure |
|---|---|---|
| `devotional-daily-reflection.stacked` | 1 | Date + Day · Scripture · Reflection · Application · Stand Out Verse* · Thankful For* · Prayer |
| `devotional-soap.four-band` | 1 | Date* · Scripture · Observation · Application · Prayer (four equal bands) |
| `devotional-verse-mapping.spread` | 2 | Verse · Translations · Keywords / Cross References · Reflection · Prayer |
| `worksheet-prompt.prompt-response` | 1 | Prompt 1–4 (3–4 optional) with response areas |
| `worksheet-reading-tracker.table` | 1 | Book 2.20 · Chapters 2.60 · Started 1.00 · Completed 1.00 |
| `worksheet-prayer-log.table` | 1 | Date 1.10 · Request 4.30 · Answered 0.75 |

\* optional section.

## Adding a recipe

A new recipe is catalog data when it uses the existing surfaces (`blank`,
`lined`, `prompt-response`, `table`, `checkbox`, `fill-in`, `scripture`,
`reflection`, `prayer`) and one or two pages. Add the entry, list only the
trims `tests/stationery.test.ts` proves it fits, and it appears in the New
Product flow, the layout registry and the editor automatically.
