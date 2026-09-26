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
- **Marble.** The current snapshot is Journal Color Studio `14e4e75`: veined,
  bold gold, gold leaf and white. The newer approved, polished marbles are on
  Journal Color Studio `main`:
  - `d7068ea`: four recolorable kintsugi marbles (Rose, Burgundy + blush,
    Black ember, Peach);
  - merged in `ba916ad`, 2026-09-26.

  They need two recolor-engine extensions Product Studio does not have yet:
  - a per-texture stone texture range (`texScale`);
  - a second-stone layer that stays visible under a transparent gold-seam
    overlay (`veinsAlpha`).

  Burgundy also keeps its whole original as a per-pixel tone-transfer source.
  Snapshotting them is the next marble step. It needs a faithful port of
  those two changes and a side-by-side check against Journal Color Studio,
  never a substitute marble.
