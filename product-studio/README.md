# Dove Expressions Product Studio

Internal production tool for printable paper products: planners, journals,
notebooks, notepads, desk pads, inserts, worksheets and trackers.

> **The user decides. The system executes.** The user chooses the product,
> size, binding, printer, layout, wording, colors and fonts. Product Studio
> handles trim, bleed, safe zones, binding/glue keep-outs, grids, rows,
> columns, line counts, dates, page order and print preparation.

This is a **standalone app**. It shares a Git repository with Journal Color
Studio only for organization. It does not import, copy or depend on any
Journal Color Studio file, and Journal Color Studio does not depend on it.

## Run

```bash
cd product-studio
npm install
npm run dev        # editor at http://localhost:5173
npm test           # automated tests (engine, layouts, controls, print parity)
npm run build      # typecheck + production build → dist/
```

## Architecture

```
src/
  data/research/     Normalized "Print Product Geometry Library" v1.0 (2026-09-24)
  types/             Measurement, geometry, binding, print, calendar, recipe, layout, project…
  presets/           Studio defaults, sizes, binding & print profiles, product types,
                     spacing, typography, palettes, wording, recipe presets, test products
  engines/
    units/           in ↔ mm ↔ pt (inches are canonical)
    geometry/        Dimension engine · binding page-side logic · PAGE GEOMETRY ENGINE
    layout/          Equal distribution, pitch fitting, fixed/elastic stack solver
    calendar/        Date-only calendar engine (leap years, week starts, 6-row months)
    recipe/          Recipe expansion, chronological ordering, spread fillers, sheet metadata
    patterns/        Ruled / dot / graph / margin-ruled as mathematical definitions
    typography/      Text measurement (canvas + heuristic)
    validation/      Pre-export validation engine
    print/           Print plan (@page box, scope, repeated sheets)
    document/        Staged, cached resolver: project → geometry → solved pages
  layouts/           Pure layout solvers → positioned nodes (inches)
  primitives/        PrintablePage + node primitives (WritingLines, DotGrid, Checkbox, …)
  design-library/    One-way snapshot of Journal Color Studio artwork + palettes (see SNAPSHOT.md)
  themes/            Decoration planner, raster recolor engine, decorative layer
  components/        Editor, wizard, preview, debug overlay, geometry info, export
  persistence/       localStorage project store (structured JSON only)
```

### Source rules

- Research values live in `src/data/research/` as typed `Measurement` /
  `MeasurementRange` objects that keep the research's five confidence
  classes: Manufacturer Published, Printer Standard, Canva Published,
  Observed / Estimated, and Derived Calculation. A value is never relabelled
  (for example, the Happy Planner sizes stay Observed / Estimated).
- Every resolved margin keeps three geometry classes apart:
  **Required** (printer, manufacturer or binding), **Studio Default**
  (`presets/studioDefaults.ts`) and **User Design**.
  Effective = max(required, user ?? studio). A studio default can never
  override a printer requirement.
- Mechanical anchors (trim, bleed, keep-outs) never shrink. When a layout
  doesn't fit, the elastic modules shrink and validation reports the deficit.

### Preview = Print

Layouts are pure functions that return positioned nodes in inches. The editor
preview, the print output and the validator all consume the **same** nodes.
`PrintablePage` renders them in CSS inches, and the preview only applies a
CSS `scale()`. The tests assert identical markup in editor and print modes.

### Page layers

1 Background · 2 Decorative theme · 3 Functional pattern · 4 Layout structure ·
5 Text · 6 User content (reserved) · plus the debug overlay, which is
editor-only and never printed.

## Layout compatibility

Each layout declares `capability` (supported product types, patterns,
options, repeats) and a `fit()` check on the solved page geometry:

- **Monthly calendar:** full / compact / micro, with a minimum cell size for
  each. Franklin Compact uses compact, Filofax Personal uses micro, and
  Filofax Pocket is reported incompatible.
- **Weekly spread:** vertical day columns, or horizontal day rows on narrow
  inserts.

The editor offers only layouts made for the product type, disables layouts
that don't fit the size, and shows only controls that something on the page
consumes. See `docs/control-audit.md`.

## Decoration

Decoration styles come from Journal Color Studio snapshots: marble (veined,
bold gold, gold leaf, white), floral (bouquet, corners, header sprigs), line
art (topo, flowing, arcs, ribbon, dots, stripes) and watercolor. Everything
recolors with the palette. Decoration never enters the safe (writing) area
unless you choose "full page" and turn on "extend under writing areas". Print
waits until every recolored raster is ready.

## Milestone 1 — geometry proof (done)

| # | Product | Proves |
| - | ------- | ------ |
| 1 | 5 × 7 top-glued to-do notepad | glue keep-out, header, checklist, dynamic row count |
| 2 | 6 × 9 lined journal (KDP) | KDP page-count gutter, mirrored pages, 25 college lines (J-B1) |
| 3 | 7 × 9 monthly coil planner | coil keep-out, 7 × 6 grid, month generation, date placement |
| 4 | 7 × 9 weekly spread | two-page spread, 8 equal slots across both pages, weekly generation |
| 5 | 11 × 17 weekly desk pad | landscape, 0.75" glue zone, 7 columns × writing rows (B6) |

All five pass validation with zero errors. They were verified in Chromium:
the editor page and the PDF page both measure exactly the trim size, and the
editor and print markup are identical.

Tests reproduce the research's own worked numbers: the line-count table
(3.2.2), blueprints B1, B6, A-B1–A-B4, J-B1–J-B4 and N-B1, and the KDP gutter
bands.

## Deployment (separate Vercel project)

Product Studio deploys on its own and is separate from Journal Color Studio.

- **Vercel project:** a new project (e.g. `dove-product-studio`) linked to
  `Sydni-Dove/journal-color-studio`
- **Root Directory:** `product-studio`
- **Framework / build / output:** from `product-studio/vercel.json`
  (Vite, `npm run build`, `dist`)
- `ignoreCommand` skips a Product Studio deploy when a commit doesn't touch
  `product-studio/`

## Integration hooks (prepared, not connected)

- `ProductTheme` / `ExternalThemePackage` (`types/theme.ts`): a generic theme
  interface that Journal Color Studio could supply later.
- `ProjectOrigin` (`types/project.ts`): prepared for a future
  Dove Command Center → Product Studio → Export → Attach Result flow.
- `ProjectStore` interface (`persistence/`): swappable for a backend later.
