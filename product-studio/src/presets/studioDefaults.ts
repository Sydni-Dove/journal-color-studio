/**
 * RECOMMENDED PRODUCT STUDIO GEOMETRY.
 *
 * These are Dove Expressions Product Studio defaults — chosen for comfortable
 * handwriting, polish, and production safety. They come from the research's
 * "Recommended Product Studio Defaults" sections (1.4, 2.4, 3.4) and the
 * worked blueprints. They are NOT printer requirements and must never be
 * presented as such; printer profiles and binding keep-outs always win when
 * they are larger.
 */
import type { MeasurementConfidence, Provenance } from "../types/measurement";

export type StudioValue = { valueIn: number; provenance: Provenance };

function studio(valueIn: number, basis: string, confidence?: MeasurementConfidence): StudioValue {
  return {
    valueIn,
    provenance: { geometryClass: "studio-recommended", basis, confidence, source: "researchDerivation" },
  };
}

export const STUDIO_MARGINS = {
  /** 2.4: punched products bound-edge margin 0.75" (0.5" hard keep-out + 0.25" writing comfort). */
  punchedBoundEdge: studio(0.75, "0.5\" printer keep-out + 0.25\" writing comfort (research 1.4 / 2.4)"),
  /** 1.4: outer/top/bottom 0.5". */
  outer: studio(0.5, "planner outer/top/bottom 0.5\" (research 1.4)"),
  /** 2.4: default print target live margin 0.5" all sides. */
  liveMargin: studio(0.5, "default print target live margin 0.5\" all sides (research 2.4)"),
  /** 2.4: book gutter = printer page-count table + 0.125" comfort. */
  bookGutterComfort: studio(0.125, "added to the printer gutter table (research 2.4)"),
  /** 2.4: saddle stitch min inner margin 0.375". */
  saddleInner: studio(0.375, "saddle-stitch minimum inner margin (research 2.4)"),
  /** 3.4 / 2.4: notepads — 0.5" clearance from glued edge. */
  padGlueEdge: studio(0.5, "0.375\" glue band + 0.125\" live-start offset (A-B5; matches 0.5\" UPrinting clearance)"),
  /** N-B1 (5×7 to-do pad) side/bottom margins 0.4". Applied to all notepad sizes. */
  padOtherEdges: studio(0.4, "N-B1 5×7 notepad side/bottom margins, applied to all pad sizes"),
  /** 1.4 / B6: desk pads top glue zone 0.75". */
  deskPadGlueZone: studio(0.75, "desk pad top glue zone 0.75\" (research 1.4, blueprint B6)"),
  /** B6: desk pad sides/bottom 0.5". */
  deskPadOtherEdges: studio(0.5, "desk pad sides/bottom 0.5\" (blueprint B6)"),
  /** A-B4: 6-ring content keep-out 15 mm; studio uses the punched default 0.75". */
  ringBoundEdge: studio(0.75, "punched-product default 0.75\" (≥ 0.6\" ring content keep-out, research 2.4)"),
} as const;

export const STUDIO_PAD = {
  /** 3.4: top glue 0.375 band. */
  glueBand: studio(0.375, "notepad glue band (research 3.4 / A-B5)", "derived-calculation"),
  /** 3.4: default 50 sheets (options 25/50/100). */
  defaultSheets: 50,
  sheetOptions: [25, 50, 100] as const,
  /** Desk pads: retail weekly pad 52 sheets (Manufacturer Published, michaels.com). */
  deskPadSheets: 52,
} as const;

/** 1.4 planner layout defaults (derived layout defaults). */
export const STUDIO_PLANNER = {
  monthlyTitle: studio(0.8, "monthly title 0.7–0.8\" (research 1.4; B1 uses 0.80)"),
  weekdayHeader: studio(0.35, "weekday header 0.35\" (research 1.4)"),
  monthlyRows: 6,
  monthlySidebar: studio(1.4, "monthly notes sidebar 1.4\" when used (research 1.4, B1 variant B)"),
  weeklyTitle: studio(0.6, "week title 0.60\" (blueprint B2)"),
  dayHeader: studio(0.4, "day-name header 0.40\" (blueprint B2)"),
  sectionsPerDay: 3,
  timeColumn: studio(0.8, "hourly time column 0.8\" (research 1.4)"),
  hourStart: 6,
  hourEnd: 21,
  dailyDateHeader: studio(0.6, "daily date header 0.6\" (research 1.4)"),
  prioritiesBoxMin: studio(1.0, "priorities box ≥ 1.0\" (research 1.4)"),
  notesBoxMin: studio(1.2, "notes box ≥ 1.2\" (research 1.4)"),
  deskPadHeader: studio(0.8, "desk pad header 0.8\" (blueprint B6)"),
  deskPadWeekdayHeader: studio(0.4, "desk pad weekday header 0.4\" (blueprint B6)"),
  deskPadWritingRows: 4,
  deskPadRowMin: studio(1.75, "weekly pad rows ≥ 1.75\" tall (research 1.4)"),
  deskPadLineSpacing: studio(0.3, "ruled lines every 0.30\" (blueprint B6)"),
} as const;

/**
 * Size-aware monthly calendar variants. Full = the B1 planner structure.
 * Compact / micro are designed for small inserts (Franklin Compact,
 * Filofax Personal, A6) — they are distinct structures, not a squashed B1.
 * Minimum cell geometry is what keeps dates legible and writable:
 *   full    ≥ 0.50" × 0.60"  (B1 variant B produces 0.54" columns)
 *   compact ≥ 0.34" × 0.45"  (9 pt numerals + 2 × cell padding)
 *   micro   ≥ 0.26" × 0.32"  (7 pt numerals, weekday initials)
 */
export const STUDIO_MONTHLY_VARIANTS = {
  full: {
    titleH: studio(0.8, "monthly title 0.8\" (research 1.4 / B1)"),
    weekdayH: studio(0.35, "weekday header 0.35\" (research 1.4)"),
    minCellW: studio(0.5, "full monthly minimum cell width"),
    minCellH: studio(0.6, "full monthly minimum cell height"),
  },
  compact: {
    titleH: studio(0.6, "compact insert title 0.6\" (bottom of observed 0.6–0.9\" range)"),
    weekdayH: studio(0.3, "compact weekday header 0.3\" (bottom of observed 0.3–0.4\" range)"),
    minCellW: studio(0.34, "compact minimum cell width (9 pt numerals + padding)"),
    minCellH: studio(0.45, "compact minimum cell height"),
  },
  micro: {
    titleH: studio(0.5, "micro insert title 0.5\" (below planner range; pocket inserts)"),
    weekdayH: studio(0.25, "micro weekday header 0.25\" (weekday initials)"),
    minCellW: studio(0.26, "micro minimum cell width (7 pt numerals)"),
    minCellH: studio(0.32, "micro minimum cell height"),
  },
  /** Sidebar may take at most this share of the usable width (sidebar/grid balance). */
  maxSidebarShare: 0.35,
} as const;

/**
 * Weekly variants. Vertical = B2-style day columns (8 slots / spread).
 * Horizontal = day rows, for inserts too narrow for columns.
 */
export const STUDIO_WEEKLY_VARIANTS = {
  vertical: {
    minSlotW: studio(0.95, "vertical weekly minimum day-column width"),
    minSectionH: studio(0.7, "vertical weekly minimum section height"),
  },
  horizontal: {
    dayLabelW: studio(0.55, "horizontal weekly day-label column"),
    minRowH: studio(0.8, "horizontal weekly minimum day-row height"),
    minWritingW: studio(1.5, "horizontal weekly minimum writing width"),
  },
} as const;

/** Grocery list pad (research 3.2.3: header 0.7, category subheads 0.35, row 0.35, checkbox 0.16). */
export const STUDIO_GROCERY = {
  header: studio(0.7, "grocery header 0.7\" (research 3.2.3)"),
  categoryHead: studio(0.35, "category subhead 0.35\" (research 3.2.3)"),
  row: studio(0.35, "grocery row 0.35\" (research 3.2.3)"),
  twoColumnMinWidth: studio(3.6, "two grocery columns need ≥ 3.6\" usable width"),
} as const;

export const STUDIO_JOURNAL = {
  /** 3.4: first line 1.0" from top, last line 0.75" from bottom. */
  firstLineFromTop: studio(1.0, "first ruled line 1.0\" from top (research 3.4)"),
  lastLineFromBottom: studio(0.75, "last ruled line 0.75\" from bottom (research 3.4)"),
  promptZone: studio(1.5, "guided prompt zone 1.5\" (blueprint J-B4)"),
  headingZone: studio(0.5, "heading zone 0.5\" (blueprint J-B4)"),
} as const;

export const STUDIO_NOTEPAD = {
  header: studio(0.9, "to-do pad header 0.9\" (blueprint N-B1; research range 0.7–1.0)"),
  checkbox: studio(0.16, "checkbox 0.16\" square (research 3.4)"),
  checkboxGap: studio(0.12, "checkbox → text gap 0.12\" (research 3.4)"),
  row: studio(0.36, "to-do row 0.36\" (blueprint N-B1; research range 0.32–0.40)"),
  lineSpacing: studio(0.3, "notepad line spacing 0.3\" (research 3.4)"),
} as const;

/** Stroke weights (pt) — research 1.4: grid rules 0.5–0.75 pt, header rules 1–1.5 pt. */
export const STUDIO_STROKES = {
  gridRulePt: 0.5,
  boxRulePt: 0.75,
  headerRulePt: 1,
  writingLinePt: 0.5,
  checkboxPt: 0.75,
  /** 3.4: dots 0.6 pt. */
  dotPt: 0.6,
  graphLinePt: 0.5,
} as const;
