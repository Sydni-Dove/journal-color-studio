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
