# Product Studio — Control Audit

Debugging pass of 2026-09-25. Every interactive editor control traced end to end:

```
CONTROL → project state field → resolver consumer → engine/layout consumer → rendered effect → test
```

"Before" is the state found during this pass (verified against solved nodes,
not just state updates). "Now" is after the fixes. Tests live in
`tests/controls.test.tsx` unless noted. The Chromium audit
(`every visible select/checkbox → pixel diff of the preview`) was run on the
8 regression scenarios; results are summarized at the end.

## Root causes found

| # | Symptom | Root cause | Structural fix |
| - | ------- | ---------- | -------------- |
| A | Recipe layout showed "Monthly Calendar" while the page stayed a To-Do list | The solved-page cache key (`engines/document/resolve.ts`) was built from the page key (`recipeItemId:period`) and geometry, but **not the layout id**. Changing a step's layout hit the cached solution of the previous layout. The dropdown also listed every layout for every product. | Layout id is part of the cache key. Layouts declare `capability.supportedProductTypes`; the editor lists only those, and disables ones that don't `fit()` the size. Changing a layout adopts a repeat rule it supports and creates a date range if it needs one. |
| B | Dot grid selected, weekly day sections still ruled | `section(…, "lines")` forced `{ ...pattern, kind: "ruled" }`; the desk pad called `ruledLines()` directly. The pattern was consumed only by full journal pages. | One builder, `writingSurface()`, turns the pattern into nodes for every sectioned writing area (weekly sections, weekly rows, notes slots, monthly notes sidebar, desk-pad cells). Layouts declare `supportsPatterns`; the pattern control lists only supported kinds. |
| C | Franklin Compact monthly compressed and overlapping | The monthly layout used the 7 × 9 blueprint as-is: **fixed 1.4" sidebar** and **0.8" title** on a 3.0"-wide usable area → grid 1.4" wide, 0.149" columns. No minimum cell geometry, no size compatibility, and the validator only checked each label against its own box (it never measured label-to-label collisions). | Size-aware layout families: monthly **full / compact / micro** (declared min cell geometry), weekly **vertical / horizontal**. `fit()` picks the variant from solved usable geometry or reports the layout incompatible; the sidebar is offered only when the full grid still meets its minimum and takes ≤ 35 % of the width. Validation now measures text-to-text collisions, min cell, min writing area, sidebar balance and incompatibility. |

Punch/safe geometry was **not** applied twice: `computePageGeometry` produced
the correct ring-6 insert margins (0.75" bound, 0.5" outer). Weekday labels and
dates already used the solved column math; they collided because the solved
columns were too narrow.

## Inventory

Legend — WORKING · PARTIALLY WIRED · NOT WIRED · INCOMPATIBLE WITH CURRENT LAYOUT · PLACEBO (state only).

| Control | State field | Resolver consumer | Engine / layout consumer | Rendered effect | Before | Now | Test |
| ------- | ----------- | ----------------- | ------------------------ | --------------- | ------ | --- | ---- |
| Product type | `productType` | `resolveDocument` → product capabilities | recommended margins, allowed bindings, layout list | layout availability, margins | WORKING (wizard only) | WORKING (wizard only) | `Example A` |
| Trim size | `dimensions.sizePresetId/custom` | `resolveTrim` | `computePageGeometry`, every layout, `fit()` | page size, all geometry, variant choice | WORKING | WORKING | `trim size…`, `7 × 9 → Franklin Compact` |
| Orientation | `dimensions.orientation` | `resolveTrim` | geometry | page shape | WORKING | WORKING | `orientation…` |
| Binding | `production.bindingType` | `getBindingProfile` | margins, keep-outs, punch holes, page sides | margins, gutter mirroring | WORKING | WORKING (hidden when a product has one binding) | `binding…`, `binding changes production geometry` |
| Bound / glue edge | `production.boundEdge` | geometry | keep-out edge | margin side | WORKING | WORKING | `bound / glue edge…` |
| Printer profile | `production.printProfileId` | `getPrintProfile` | required margins, bleed rules, gutter table, validation | margins when requirements exceed studio defaults; validation; **requirement summary shown in panel** | WORKING (effect invisible when below studio margins) | WORKING + stated | `printer profile…` (KDP→IngramSpark) |
| Bleed | `production.includeBleed` | geometry | media box | page size / print media | WORKING | WORKING | `bleed…` |
| Double-sided (punched) | `production.duplex` | geometry sides | page-side logic | back pages mirror punched edge; **"Show a back page"** | WORKING (back pages only) | WORKING + navigation | `geometry-binding.test.ts` disc duplex |
| Sheets per pad | `production.sheetsPerPad` + repeated-sheet recipe | recipe | print plan | pad metadata, home-print repeat count (not the design) | WORKING (metadata) | WORKING (labelled as metadata) | `print.test.tsx` repeated sheets |
| Custom margins | `production.userMargins` | geometry | effective margin (never below required) | margins | WORKING | WORKING | `custom margins…` |
| Recipe layout | `recipe.items[].layoutId` | recipe + **solve cache** | layout solver | page structure | **PLACEBO** (stale cache; incompatible layouts offered) | WORKING (filtered + fit-checked) | `Example A` (2 tests) |
| Repeat mode | `recipe.items[].repeat` | `expandRecipe` | page list | page count / periods | PARTIALLY WIRED (offered rules the layout couldn't use, e.g. monthly on a pad) | WORKING (layout-declared repeats only) | `repeat mode…` |
| Page order | `recipe.ordering` | `orderUnits` | page list | page sequence | WORKING | WORKING (shown only with ≥ 2 steps + dates) | `page order…` |
| Start / end date | `calendar.startDate/endDate` | `getCalendar` | recipe + monthly/weekly | months/weeks generated | WORKING | WORKING (shown only when a layout needs dates) | `start date…` |
| Week start | `calendar.weekStart` | calendar / `weekStart` | monthly, weekly, desk pad | weekday order | WORKING | WORKING | `week start…` |
| Six-row months | `calendar.sixRowMonths` | calendar | monthly grid rows | row count in 4-/5-row months; **"Show February"** | WORKING (shown for weekly-only products too) | WORKING (monthly only) + navigation | `calendar.test.ts` six-row |
| Date placement | `layoutOptions.datePlacement` | — | monthly `calendarGrid` | date alignment in cells | PARTIALLY WIRED (shown for all layouts) | WORKING (monthly only) | `date placement…` |
| Sidebar | `layoutOptions.showSidebar` | `fit()` | monthly, weekly, desk pad | sidebar column | INCOMPATIBLE on small sizes (squashed grid) | WORKING; disabled with reason when it doesn't fit | `sidebar…`, `toggling the sidebar…` |
| Sidebar heading | `layoutOptions.sidebarContent` | wording | sidebar section title | heading text | WORKING | WORKING | `sidebar heading…` |
| Sidebar width | `layoutOptions.sidebarWidthIn` | `fit()` balance | monthly, desk pad | sidebar width | PARTIALLY WIRED (weekly ignores it) | WORKING (hidden when only weekly uses the sidebar) | `sidebar width…` |
| Sections per day | `layoutOptions.sectionsPerDay` | — | weekly vertical | day sections | PARTIALLY WIRED | WORKING (vertical weekly only) | `sections per day…` |
| Desk-pad rows | `layoutOptions.writingRowsPerDay` | — | desk pad | writing rows | PARTIALLY WIRED (shown everywhere) | WORKING (desk pad only) | `desk-pad writing rows…` |
| Page numbers | `layoutOptions.showPageNumbers` | — | `pageFrame` (all layouts) | footer page number | PARTIALLY WIRED (layouts disagreed) | WORKING (one footer rule for every layout) | `page numbers…` |
| Footer | `layoutOptions.showFooter` | — | `pageFrame` (all layouts) | footer title | PARTIALLY WIRED (journal/monthly/weekly ignored it) | WORKING | `footer…` |
| Writing pattern | `functionalPattern.kind` | — | `writingSurface` / `fillWritingRegion` | ruled / dot / graph / blank | **PARTIALLY WIRED** (journal only) | WORKING in every supported writing area | `Example B` (3 tests), `writing pattern…` |
| Ruling | `functionalPattern.rulingPreset` | — | line spacing | line count | PARTIALLY WIRED | WORKING | `ruling…` |
| Grid preset | `functionalPattern.gridPreset` | — | dot/graph pitch | grid density | PARTIALLY WIRED | WORKING | `grid preset…` |
| Dot size | `functionalPattern.dotSizePt` | — | dots | dot diameter | PARTIALLY WIRED | WORKING (dot grid only) | `dot size…` |
| Line weight | `functionalPattern.lineWeightPt` | — | lines, checklist lines | stroke | WORKING | WORKING (hidden for dot grid) | `line weight…` |
| Line opacity | `functionalPattern.opacity` | — | lines, dots | opacity | WORKING | WORKING | `line opacity…` |
| Spacing density | `spacing.density` | `resolveSpacing` | every layout | gaps, rows, padding | WORKING | WORKING | `spacing density…` |
| Cover font | `typography.fonts.cover` | — | **no layout renders a cover role** | none | **NOT WIRED** | HIDDEN until a cover layout exists | `cover, body and accent fonts are not offered` |
| Heading font | `typography.fonts.headings` | CSS var | text nodes (month/week/page titles) | heading typeface + measurement | WORKING | WORKING (hidden where no heading renders) | `heading font…`, `changing the heading font…` |
| Label font | `typography.fonts.subheadings` | CSS var | labels, dates, weekdays | label typeface | WORKING | WORKING | `label font…` |
| Body font | `typography.fonts.body` | — | **no layout renders the body role** (footer moved to label font) | none | **NOT WIRED** | HIDDEN | same test |
| Accent font | `typography.fonts.accent` | — | **no layout renders prompt/accent roles** | none | **NOT WIRED** | HIDDEN | same test |
| Typography sizes | `typography.roleOverrides` | `resolveTypography` | line boxes, text | size (validated) | PARTIALLY WIRED (body/prompt/time sizes had no text) | WORKING (only rendered roles listed) | `typography size…` |
| Palette | `colors.paletteId` | `resolveColors` | CSS vars, decoration rasters | all colors | PARTIALLY (Dove Blush ≡ Signature on pages that don't use accent/decoration tokens) | WORKING — brand palettes differ in rendered tokens; JCS palettes added | `palette…`, `a different palette…` |
| Color tokens | `colors.overrides[token]` | `resolveColors` | CSS vars | token color | PARTIALLY (secondary had no consumer) | WORKING (only tokens the page renders) | `individual color token…` |
| Writing-line strength | `colors.overrides.lineOpacity` | CSS var | functional lines | line darkness | WORKING | WORKING (shown when lines render) | `writing-line strength…` |
| Semantic wording | `wording[key]` | `resolveWording` | text nodes | label text | PARTIALLY (listed keys no layout rendered) | WORKING (only rendered keys) | `semantic wording…`, `only rendered wording keys` |
| Decoration style | `decorativeTheme.style/assetId` | `normalizeDecoration` | `planDecoration` → `DecorativeLayer` | design | **PLACEBO-QUALITY** — procedural placeholders; Image had no upload; Geometric/Abstract/Dots/Stripes/Minimal were not the approved visual language | WORKING — Journal Color Studio snapshot artwork | `decoration design…`, `selecting Floral…` |
| Decoration placement | `decorativeTheme.placement` | plan | region / corners / band | position | WORKING | WORKING (only placements the design supports) | `decoration placement…` |
| Decoration scale | `decorativeTheme.scale` | plan | art size / marble zoom | size | WORKING | WORKING | `decoration scale…` |
| Decoration opacity | `decorativeTheme.opacity` | plan | layer opacity | opacity | WORKING | WORKING | `decoration opacity…` |
| Decoration seed | `decorativeTheme.seed` | — | procedural placeholders only | random layout | WORKING (placeholder art) | REMOVED (snapshot art is fixed) | — |
| Decoration role colors | `decorativeTheme.colorA/B/C` | plan / raster recolor | marble stone/veins/highlights, floral leaves/gold/flowers, line art | recolor | PARTIALLY (2 roles) | WORKING (3 roles, labelled per design) | `decoration role color…`, `marble recolors…` |
| Extend under writing areas | `decorativeTheme.applyToInterior` | plan | safe-area mask | full-page decoration under writing | WORKING | WORKING (full page only) | `decoration never covers functional content` |
| Variants | `variants`, `activeVariantId` | `applyVariant` | colors/decoration/title | look | WORKING | WORKING | `variant…` |
| Variant "Capture current look" | variant overrides | — | — | — | WORKING | REMOVED (edits go straight to the active variant) | — |
| Spread view | editor state | — | preview only | two pages side by side | WORKING | WORKING (paged products only) | Chromium check |
| Zoom / fit / page nav | editor state | — | preview only | scale / page | WORKING | WORKING; editor now opens on the first real page (not a filler) | Chromium check |

## Chromium control audit (8 regression scenarios)

Every visible `<select>` was changed to another enabled option and every
visible checkbox toggled; the preview was pixel-compared, then reverted. When
nothing changed, the audit followed the control's **Show** link to the page it
applies to and re-tested there.

Result: every control produced a visible change on the page it applies to,
except these, which are correct by design and now say so in the panel:

- **Printer profile.** Its requirements are below the studio margins in these
  scenarios. The requirement summary is shown, and stricter profiles change
  the page (tested).
- **Sheets per pad.** Manufacturing metadata; changes export repeats.
- **Binding perfect → case.** Identical interior geometry; changes printer
  compatibility.
- **Repeat count.** Changes the page count, not page 1.
- **Six-row months on January 2027.** January already needs 6 rows; the
  "Show February" link demonstrates the change.
