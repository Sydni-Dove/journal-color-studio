/**
 * LUXURY DAILY EXECUTION — the daily page of Sydni's "Meetings With God
 * Luxury Planner 2026" (source: Sydni_Howard_LuxuryPlanner_2026_WhitePurple_Edit.pptx,
 * 8.5 × 11 portrait; shape positions measured from the PPTX and supplied by Sydni).
 *
 *   DATE                                                   MEETINGS WITH GOD
 *   DAILY EXECUTION PAGE
 *   ─────────────────────────────────────────────────────────────────────────
 *   [ WEEKDAY        [Verse Placeholder]    Theme: ______________ ]
 *   ┌ TIME BLOCKS ───────────────────────┐  ┌ TOP INSTRUCTIONS ─┐
 *   │ TIME  | SCHEDULE / TASKS / NOTES    │  │ 4 lines           │
 *   │ 6:00 AM … 8:00 PM (15 rows)         │  ├ TO-DO ────────────┤ 5 rows
 *   │                                     │  ├ DAILY CHECKLIST ──┤ 7 items
 *   │                                     │  ├ END-OF-DAY REFL. ─┤ 3 lines
 *   └─────────────────────────────────────┘  └───────────────────┘
 *   [ NOTES / GRATITUDE ______________________________________________ ]
 *                              June Daily Planner
 *
 * The SOURCE measurements below are the design. Product Studio places them
 * inside its own print-safe / binding-safe usable area (never on the literal
 * PPTX coordinates): header, band, strip and footer keep their measured
 * physical sizes; the body keeps the measured column split (4.65 : 0.22 : 2.47)
 * and panel proportions; row pitches follow the body height and are never
 * allowed below writable minimums — a page too small for the full structure is
 * reported incompatible, never squashed.
 */
import { MONTH_NAMES, WEEKDAY_NAMES } from "../../engines/calendar/calendar";
import { getLayoutMeasurer, styleForRole } from "../../engines/typography/textMeasure";
import { STUDIO_STROKES } from "../../presets/studioDefaults";
import type { PageGeometry, Rect } from "../../types/geometry";
import type { LayoutDiagnostic, LayoutNode, SolvedPage } from "../../types/layout";
import type { LayoutOptions } from "../../types/project";
import type { SpacingTokens, TypographySettings } from "../../types/tokens";
import { box, checkbox, group, lineBoxIn, rule, text } from "../shared/nodes";
import type { FitContext, FitResult, LayoutContext, LayoutDefinition } from "../shared/types";

// ─── Source geometry (inches, 8.5 × 11 Letter PPTX) ─────────────────────────
export const LUXURY_DAILY_SOURCE = {
  page: { w: 8.5, h: 11, frame: { x: 0.24, y: 0.22, w: 8.02, h: 10.56 } },
  header: { top: 0.48, dateW: 5.55, dateH: 0.42, subtitleY: 0.92, subtitleH: 0.26, dividerY: 1.22, dividerX: 0.52, dividerW: 7.46, brand: { x: 6.35, y: 0.58, w: 1.45, h: 0.24 } },
  band: { x: 0.58, y: 1.38, w: 7.34, h: 0.48, weekday: { x: 0.78, w: 1.55 }, verse: { x: 2.65, w: 5.0 } },
  body: { y: 2.02, h: 7.42 },
  left: { x: 0.58, w: 4.65 },
  gutter: 0.22,
  right: { x: 5.45, w: 2.47 },
  panelHeading: { dx: 0.12, dy: 0.1, h: 0.22 },
  table: { dx: 0.18, top: 0.5, headH: 0.28, timeW: 0.85, width: 4.29, firstHour: 6, hours: 15, rowH: 0.43, bottomPad: 0.19 },
  /** Right-column panels, top to bottom: outer height, first row offset from the panel top, row pitch, rows. */
  panels: {
    topInstructions: { h: 1.62, first: 0.51, pitch: 0.25, rows: 4 },
    toDo: { h: 2.02, first: 0.52, pitch: 0.28, rows: 5 },
    checklist: { h: 1.84, first: 0.46, pitch: 0.2, rows: 7 },
    reflection: { h: 1.33, first: 0.46, pitch: 0.23, rows: 3 },
  },
  /** Gaps between the right-column panels (3.83 − 3.64, 6.06 − 5.85, 8.11 − 7.90). */
  panelGaps: [0.19, 0.21, 0.21],
  /** Writing lines: x from the panel's left edge, right inset. */
  lineInset: { left: 0.21, right: 0.18 },
  /** Lists: checkbox and task-line x from the panel's left edge. */
  list: { checkboxDx: 0.17, lineDx: 0.37, rightInset: 0.26, checkbox: 0.11 },
  strip: { gapAbove: 0.21, h: 0.47, lineDx: 1.7, lineW: 5.4 },
  footer: { gapAbove: 0.22, h: 0.18 },
} as const;

/** Writable minimums: below these the full structure does not fit (reported, never squeezed). */
export const LUXURY_DAILY_MIN = { hourRow: 0.3, line: 0.21, listRow: 0.24, checklistRow: 0.17, leftW: 3.2, rightW: 2.0 } as const;

const S = LUXURY_DAILY_SOURCE;
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;
export const checklistItems = (raw: string) =>
  raw
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);

type PanelKey = keyof typeof S.panels;
type Panel = { key: PanelKey; rect: Rect; first: number; pitch: number; rows: number };
export type LuxuryDailyFrame = {
  area: Rect;
  header: Rect;
  dividerY: number;
  band: Rect;
  left: Rect;
  right: Rect;
  panels: Panel[];
  hourRowH: number;
  strip: Rect;
  footer: Rect | null;
};

/**
 * Solve the Luxury Daily frame inside a page's usable area. Pure: shared by the
 * fit check and the solver, so "fits" and "renders" can never disagree.
 */
export function luxuryDailyFrame(
  page: PageGeometry,
  spacing: SpacingTokens,
  typography: TypographySettings,
  options: Pick<LayoutOptions, "showFooter" | "showPageNumbers">,
  checklistRows: number = S.panels.checklist.rows,
): { ok: true; frame: LuxuryDailyFrame } | { ok: false; reason: string } {
  const area: Rect = { x: page.safeRect.x + spacing.page, y: page.safeRect.y + spacing.page, w: page.safeRect.w - 2 * spacing.page, h: page.safeRect.h - 2 * spacing.page };
  // Header block: date → subtitle → divider → band → body, at the measured offsets from the date's top.
  const header: Rect = { x: area.x, y: area.y, w: area.w, h: S.header.dividerY - S.header.top };
  const dividerY = area.y + (S.header.dividerY - S.header.top);
  // Panels sit 0.06" inside the divider's ends (0.58 vs 0.52; 7.92 vs 7.98).
  const inset = S.band.x - S.header.dividerX;
  const px = area.x + inset, pw = area.w - 2 * inset;
  const band: Rect = { x: px, y: area.y + (S.band.y - S.header.top), w: pw, h: S.band.h };
  const bodyY = area.y + (S.body.y - S.header.top);
  const footerOn = options.showFooter || options.showPageNumbers;
  const footer: Rect | null = footerOn ? { x: area.x, y: area.y + area.h - S.footer.h, w: area.w, h: S.footer.h } : null;
  const strip: Rect = { x: px, y: (footer ? footer.y - S.footer.gapAbove : area.y + area.h) - S.strip.h, w: pw, h: S.strip.h };
  const bodyH = strip.y - S.strip.gapAbove - bodyY;
  // Columns: the measured 4.65 : 0.22 : 2.47 split of the panel width.
  const leftW = ((pw - S.gutter) * S.left.w) / (S.left.w + S.right.w);
  const rightW = pw - S.gutter - leftW;
  if (leftW < LUXURY_DAILY_MIN.leftW || rightW < LUXURY_DAILY_MIN.rightW) {
    const need = ((LUXURY_DAILY_MIN.rightW * (S.left.w + S.right.w)) / S.right.w + S.gutter + 2 * inset).toFixed(2);
    return { ok: false, reason: `Luxury Daily Execution needs a usable width of about ${need}" for its schedule and execution columns; this page has ${area.w.toFixed(2)}". It is designed for Letter (8.5 × 11).` };
  }
  const left: Rect = { x: px, y: bodyY, w: leftW, h: bodyH };
  const right: Rect = { x: px + leftW + S.gutter, y: bodyY, w: rightW, h: bodyH };
  // Hour rows: the table keeps its measured top offset, heading row and bottom padding; the 15 rows share the rest.
  // (The heading row grows only if its labels would sit closer than the studio's label inset to the table border.)
  const headH = tableHeadH(spacing, typography);
  const hourRowH = (bodyH - S.table.top - headH - S.table.bottomPad) / S.table.hours;
  // Right column: panels keep their measured proportions of the column height; gaps stay physical.
  const keys = Object.keys(S.panels) as PanelKey[];
  const gaps = S.panelGaps.reduce((a, b) => a + b, 0);
  const srcSum = keys.reduce((a, k) => a + S.panels[k].h, 0);
  const k = (bodyH - gaps) / srcSum;
  let y = bodyY;
  const panels: Panel[] = keys.map((key, i) => {
    const src = S.panels[key];
    const h = src.h * k;
    const rows = key === "checklist" ? checklistRows : src.rows;
    // Rows keep the measured first-row offset; the pitch scales with the panel and is capped so the last row
    // keeps its measured bottom clearance (labels: at least the studio label inset from the border).
    const lb = lineBoxIn(typography, "body");
    const pitch = Math.min(
      src.pitch * k,
      key === "checklist"
        ? // each label is centred in its row: the last one ends half a label below its row's middle
          (h - src.first - spacing.labelToBorderInset - lb / 2) / Math.max(0.5, rows - 0.5)
        : key === "toDo"
          ? (h - src.first - (src.h - src.first - src.rows * src.pitch)) / rows
          : (h - src.first - (src.h - src.first - (src.rows - 1) * src.pitch)) / Math.max(1, rows - 1),
    );
    const p: Panel = { key, rect: { x: right.x, y, w: rightW, h }, first: src.first, pitch, rows };
    y += h + (S.panelGaps[i] ?? 0);
    return p;
  });
  const short = [
    hourRowH < LUXURY_DAILY_MIN.hourRow ? `hour rows ${hourRowH.toFixed(2)}" (min ${LUXURY_DAILY_MIN.hourRow}")` : "",
    ...panels.map((p) => {
      const min = p.key === "toDo" ? LUXURY_DAILY_MIN.listRow : p.key === "checklist" ? LUXURY_DAILY_MIN.checklistRow : LUXURY_DAILY_MIN.line;
      return p.pitch < min - 1e-9 ? `${p.key} rows ${p.pitch.toFixed(2)}" (min ${min}")` : "";
    }),
  ].filter(Boolean);
  if (short.length) return { ok: false, reason: `Luxury Daily Execution needs a taller page: ${short.join(", ")}. It is designed for Letter (8.5 × 11); smaller sizes need a compact daily design.` };
  return { ok: true, frame: { area, header, dividerY, band, left, right, panels, hourRowH, strip, footer } };
}

function fit(ctx: FitContext): FitResult {
  const r = luxuryDailyFrame(ctx.page, ctx.spacing, ctx.typography, ctx.options);
  return r.ok ? { ok: true, variant: "luxury", variantLabel: "Luxury Daily Execution", sidebarAvailable: false } : { ok: false, reason: r.reason };
}

/** Table heading row: the measured 0.28", or taller if its labels need the studio label inset above and below. */
function tableHeadH(spacing: SpacingTokens, typography: TypographySettings) {
  return Math.max(S.table.headH, lineBoxIn(typography, "label") + 2 * spacing.labelToBorderInset + 0.005);
}

function panelHeading(id: string, p: Rect, title: string): LayoutNode {
  return text(id, { x: p.x + S.panelHeading.dx, y: p.y + S.panelHeading.dy, w: p.w - 2 * S.panelHeading.dx, h: S.panelHeading.h }, title, "sectionHeading", { component: "SectionHeader", vAlign: "middle" });
}

function linesNode(id: string, x0: number, x1: number, ys: number[], ctx: LayoutContext): LayoutNode {
  return {
    type: "lines",
    id,
    component: "WritingLines",
    rect: { x: x0, y: Math.min(...ys), w: x1 - x0, h: Math.max(...ys) - Math.min(...ys) },
    functional: true,
    orientation: "horizontal",
    positions: ys,
    from: x0,
    to: x1,
    strokePt: ctx.pattern.lineWeightPt,
    color: ctx.pattern.color,
    opacity: ctx.pattern.opacity,
  };
}

const widthOf = (value: string, role: "body" | "sectionHeading" | "label", typography: TypographySettings) => getLayoutMeasurer().measure(value, styleForRole(typography, role));

function solveDaily(ctx: LayoutContext): SolvedPage {
  if (ctx.period.kind !== "day" || !ctx.calendar) throw new Error("Luxury Daily Execution needs a date range and repeats every day.");
  const iso = ctx.period.iso;
  const day = ctx.calendar.days.find((d) => d.iso === iso);
  if (!day) throw new Error(`Day ${iso} not in calendar.`);
  const w = ctx.wording;
  const items = checklistItems(w.dailyChecklistItems);
  const solved = luxuryDailyFrame(ctx.pages[0], ctx.spacing, ctx.typography, ctx.options, Math.max(1, items.length));
  if (!solved.ok) return { nodes: [], metrics: [], diagnostics: [{ severity: "error", rule: "layout-incompatible", componentId: "daily-luxury", message: solved.reason }] };
  const f = solved.frame;
  const diagnostics: LayoutDiagnostic[] = [];
  const nodes: LayoutNode[] = [group("p0-header", "PageHeader", f.header)];

  // ── Header: date, subtitle, brand heading, divider ──
  const a = f.area;
  const kx = a.w / S.header.dividerW;
  nodes.push(
    text("dl-date", { x: a.x, y: a.y, w: S.header.dateW * kx, h: S.header.dateH }, `${MONTH_NAMES[day.month - 1]} ${day.day}, ${day.year}`, "weekTitle", { component: "PageHeader", vAlign: "bottom" }),
    text("dl-subtitle", { x: a.x + 0.02, y: a.y + (S.header.subtitleY - S.header.top), w: S.header.dateW * kx, h: S.header.subtitleH }, w.dailyExecutionPage, "subheading", { component: "PageHeader", vAlign: "middle" }),
  );
  // Brand heading: right end 0.18" inside the divider's end (7.80 vs 7.98), as in the source.
  const brandRight = a.x + a.w - (S.header.dividerX + S.header.dividerW - (S.header.brand.x + S.header.brand.w));
  const brandW = Math.max(S.header.brand.w, widthOf(w.brandHeading, "sectionHeading", ctx.typography) + 0.02);
  nodes.push(
    text("dl-brand", { x: brandRight - brandW, y: a.y + (S.header.brand.y - S.header.top), w: brandW, h: S.header.brand.h }, w.brandHeading, "sectionHeading", { component: "PageHeader", align: "right", vAlign: "middle" }),
    rule("dl-divider", a.x, f.dividerY, a.x + a.w, f.dividerY, { strokePt: STUDIO_STROKES.headerRulePt, component: "PageHeader" }),
  );

  // ── Weekday / verse / theme band ──
  const b = f.band;
  const kb = b.w / S.band.w;
  const verseX = b.x + (S.band.verse.x - S.band.x) * kb;
  nodes.push(
    box("dl-band", b, { component: "Section" }),
    text("dl-weekday", { x: b.x + (S.band.weekday.x - S.band.x) * kb, y: b.y, w: S.band.weekday.w * kb, h: b.h }, WEEKDAY_NAMES[day.weekday], "subheading", { component: "SectionHeader", vAlign: "middle" }),
    text("dl-verse", { x: verseX, y: b.y, w: Math.min(S.band.verse.w * kb, b.x + b.w - verseX - 0.1), h: b.h }, `${w.versePlaceholder}\u2003\u2003\u2003${w.themeLabel} ____________________`, "body", { component: "Text", vAlign: "middle" }),
  );

  // ── Time blocks ──
  const L = f.left;
  nodes.push(box("dl-time-panel", L, { component: "Section" }), panelHeading("dl-time-heading", L, w.timeBlocks));
  const tx = L.x + S.table.dx, tw = L.w - 2 * S.table.dx;
  const pad = ctx.spacing.labelToBorderInset;
  // The time column keeps its measured 0.85" unless the widest time label needs more.
  const timeW = Math.max(S.table.timeW * Math.min(1, tw / S.table.width), widthOf("10:00 AM", "body", ctx.typography) + 2 * pad + 0.02);
  const ty = L.y + S.table.top;
  const headH = tableHeadH(ctx.spacing, ctx.typography);
  const rowsTop = ty + headH;
  const tableH = headH + S.table.hours * f.hourRowH;
  const edges = [ty, ...Array.from({ length: S.table.hours + 1 }, (_, i) => rowsTop + i * f.hourRowH)];
  nodes.push(
    group("dl-hours", "Grid", { x: tx, y: ty, w: tw, h: tableH }, { rowEdges: edges, columnEdges: [tx, tx + timeW, tx + tw] }),
    box("dl-hours-border", { x: tx, y: ty, w: tw, h: tableH }, { component: "Grid", strokePt: STUDIO_STROKES.gridRulePt }),
    rule("dl-hours-col", tx + timeW, ty, tx + timeW, ty + tableH, { strokePt: STUDIO_STROKES.gridRulePt, component: "Grid" }),
  );
  for (let i = 0; i < S.table.hours; i++) nodes.push(rule(`dl-hours-h${i}`, tx, rowsTop + i * f.hourRowH, tx + tw, rowsTop + i * f.hourRowH, { strokePt: STUDIO_STROKES.gridRulePt, component: "Grid" }));
  nodes.push(
    text("dl-col-time", { x: tx + pad, y: ty, w: timeW - 2 * pad, h: headH }, w.timeColumn, "label", { component: "SectionHeader", vAlign: "middle" }),
    text("dl-col-schedule", { x: tx + timeW + pad, y: ty, w: tw - timeW - 2 * pad, h: headH }, w.scheduleColumn, "label", { component: "SectionHeader", vAlign: "middle" }),
  );
  const bodyLine = lineBoxIn(ctx.typography, "body");
  // "Blank" schedule times keep the empty TIME column for handwritten times.
  if (ctx.options.scheduleTimes !== "blank") for (let i = 0; i < S.table.hours; i++) {
    const y = rowsTop + i * f.hourRowH;
    nodes.push(text(`dl-hour-${i}`, { x: tx + pad, y: y + (f.hourRowH - bodyLine) / 2, w: timeW - 2 * pad, h: bodyLine }, hourLabel(S.table.firstHour + i), "body", { component: "Text", vAlign: "middle" }));
  }

  // ── Right execution column ──
  const titles: Record<PanelKey, string> = { topInstructions: w.topInstructions, toDo: w.toDo, checklist: w.dailyChecklist, reflection: w.endOfDayReflection };
  for (const p of f.panels) {
    const r = p.rect;
    nodes.push(box(`dl-${p.key}`, r, { component: "Section" }), panelHeading(`dl-${p.key}-heading`, r, titles[p.key]));
    const y0 = r.y + p.first;
    if (p.key === "topInstructions" || p.key === "reflection") {
      // Source lines sit AT the measured y values (2.53, 2.78, …): first line at the first-row offset.
      nodes.push(linesNode(`dl-${p.key}-lines`, r.x + S.lineInset.left, r.x + r.w - S.lineInset.right, Array.from({ length: p.rows }, (_, i) => y0 + i * p.pitch), ctx));
    } else if (p.key === "toDo") {
      const ys: number[] = [];
      for (let i = 0; i < p.rows; i++) {
        const top = y0 + i * p.pitch;
        nodes.push(checkbox(`dl-todo-cb${i}`, { x: r.x + S.list.checkboxDx, y: top + (p.pitch - S.list.checkbox) / 2, w: S.list.checkbox, h: S.list.checkbox }));
        ys.push(top + p.pitch);
      }
      nodes.push(linesNode("dl-todo-lines", r.x + S.list.lineDx, r.x + r.w - S.list.rightInset, ys, ctx));
    } else {
      const labelW = r.w - S.list.lineDx - 0.12;
      items.slice(0, p.rows).forEach((item, i) => {
        const top = y0 + i * p.pitch;
        nodes.push(
          checkbox(`dl-check-cb${i}`, { x: r.x + S.list.checkboxDx, y: top + (p.pitch - S.list.checkbox) / 2, w: S.list.checkbox, h: S.list.checkbox }),
          text(`dl-check-${i}`, { x: r.x + S.list.lineDx, y: top + (p.pitch - bodyLine) / 2, w: labelW, h: bodyLine }, item, "body", { component: "Text", vAlign: "middle" }),
        );
        if (widthOf(item, "body", ctx.typography) > labelW + 1e-6) diagnostics.push({ severity: "warning", rule: "text-overflow", componentId: `dl-check-${i}`, message: `Daily checklist item "${item}" is wider than its row.` });
      });
    }
  }

  // ── Notes / gratitude strip (compact, as in the source) ──
  const st = f.strip;
  const ks = st.w / S.band.w;
  // The heading keeps its measured slot (the line starts at 2.28"), widened only if the wording needs it.
  const headW = Math.max(S.strip.lineDx * ks - 2 * S.panelHeading.dx, widthOf(w.notesGratitude, "sectionHeading", ctx.typography) + 0.02);
  nodes.push(box("dl-strip", st, { component: "Section" }), panelHeading("dl-strip-heading", { ...st, w: headW + 2 * S.panelHeading.dx }, w.notesGratitude));
  const lineY = st.y + S.panelHeading.dy + S.panelHeading.h;
  const lineX0 = st.x + Math.max(S.strip.lineDx * ks, S.panelHeading.dx + headW + 0.1);
  nodes.push(linesNode("dl-strip-line", lineX0, st.x + Math.min(st.w - 0.12, (S.strip.lineDx + S.strip.lineW) * ks), [lineY], ctx));

  // ── Footer: "<Month> Daily Planner" (+ page number) through the footer / page-number options ──
  if (f.footer) {
    nodes.push(group("p0-footer", "PageFooter", f.footer));
    const label = [ctx.options.showFooter ? `${MONTH_NAMES[day.month - 1]} ${w.dailyPlannerFooter}` : "", ctx.options.showPageNumbers ? String(ctx.pageNumbers[0] ?? "") : ""].filter(Boolean).join("  ·  ");
    if (label) nodes.push(text("p0-footer-text", f.footer, label, "footer", { component: "PageFooter", align: "center", vAlign: "middle" }));
  }

  return {
    nodes,
    diagnostics,
    metrics: [
      { label: "Hour row height (source 0.43\")", value: f.hourRowH, unit: "in", provenance: { geometryClass: "user-design", basis: "Luxury Planner PPTX: 15 rows × 0.43\" from 2.80\", fitted to the usable body height" } },
      { label: "Schedule column share (source 4.65 : 2.47)", value: f.left.w / (f.left.w + f.right.w), unit: "count", provenance: { geometryClass: "user-design", basis: "Luxury Planner PPTX panel widths" } },
    ],
    regions: { mainContent: { x: f.left.x, y: f.left.y, w: f.right.x + f.right.w - f.left.x, h: f.left.h }, calendar: f.left, notes: f.right, writingArea: f.left },
  };
}

export const luxuryDailyExecution: LayoutDefinition = {
  id: "daily-luxury-execution",
  label: "Luxury Daily Execution",
  family: "planner",
  description:
    "The Meetings With God Luxury Planner daily page: dated header, verse + theme band, 6 AM – 8 PM time blocks, top instructions, to-do, daily checklist, end-of-day reflection, notes / gratitude.",
  pages: 1,
  period: "day",
  capability: {
    supportedProductTypes: ["planner", "insert", "journal", "custom"],
    supportsPatterns: [],
    supportsLineStyle: true,
    supportsSidebar: false,
    supportsDatePlacement: false,
    supportsSectionsPerDay: false,
    supportsWritingRows: false,
    supportsScheduleTimes: true,
    supportsPageNumbers: true,
    supportsFooter: true,
    requiresCalendar: true,
    usesWeekStart: false,
    wordingKeys: ["dailyExecutionPage", "brandHeading", "versePlaceholder", "themeLabel", "timeBlocks", "timeColumn", "scheduleColumn", "topInstructions", "toDo", "dailyChecklist", "dailyChecklistItems", "endOfDayReflection", "notesGratitude", "dailyPlannerFooter"],
    repeats: ["every-day"],
    defaultRepeat: "every-day",
  },
  fit,
  solve: (ctx) => [solveDaily(ctx)],
};
