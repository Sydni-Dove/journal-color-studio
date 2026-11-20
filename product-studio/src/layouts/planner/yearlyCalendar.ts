/**
 * Yearly calendar pages — the formats planners commonly use, all drawn with the studio's own frame, header and
 * connected-grid strokes:
 *   year-at-a-glance         12 mini month calendars on one page (3 × 4 portrait, 4 × 3 landscape)
 *   year-at-a-glance-spread  six mini months on each page of a two-page spread
 *   year-linear              one row per month, one column per day (1–31), weekends lightly shaded
 *   year-in-pixels           a tracker: 12 month columns × 31 day rows of small squares to color in
 *
 * The year: the page's own year when it repeats every year; otherwise the 12 months from the planner's start
 * (a July start shows July – June). Undated planners show the months without dates.
 * Mini months always print the whole month (the planner's range never cuts a month short on a year page).
 */
import { distributeEqual } from "../../engines/layout/math";
import { STUDIO_STROKES } from "../../presets/studioDefaults";
import type { Rect } from "../../types/geometry";
import type { LayoutMetric, LayoutNode, SolvedPage } from "../../types/layout";
import type { LayoutContext, LayoutDefinition, FitContext, FitResult } from "../shared/types";
import { headerTitle, pageFrame } from "../shared/components";
import { box, group, lineBoxIn, rule, text } from "../shared/nodes";
import { MONTH_NAMES } from "../../engines/calendar/calendar";

const SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));
type YM = { year: number; month: number };

/** The 12 months a year page shows, and its title. */
export function yearMonths(ctx: Pick<LayoutContext, "period" | "calendar">): { months: YM[]; title: string; dated: boolean } {
  const cal = ctx.calendar;
  const dated = !!cal && !cal.settings.undated;
  if (ctx.period.kind === "year") return { months: Array.from({ length: 12 }, (_, i) => ({ year: ctx.period.kind === "year" ? ctx.period.year : 0, month: i + 1 })), title: String(ctx.period.year), dated };
  if (dated && cal!.months.length) {
    const first = cal!.months[0];
    const months = Array.from({ length: 12 }, (_, i) => ({ year: first.year + Math.floor((first.month - 1 + i) / 12), month: ((first.month - 1 + i) % 12) + 1 }));
    const last = months[11];
    return { months, title: first.month === 1 ? String(first.year) : `${MONTH_NAMES[first.month - 1]} ${first.year} – ${MONTH_NAMES[last.month - 1]} ${last.year}`, dated };
  }
  return { months: Array.from({ length: 12 }, (_, i) => ({ year: 2001, month: i + 1 })), title: "", dated: false };
}

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const weekdayOf = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

/** Day numbers by week row for a mini month (null = blank), honoring the week start. */
export function miniMonthWeeks(y: number, m: number, weekStart: 0 | 1): (number | null)[][] {
  const lead = (weekdayOf(y, m, 1) - weekStart + 7) % 7;
  const n = daysIn(y, m);
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
}

function weekdayInitials(ctx: LayoutContext): string[] {
  if (ctx.calendar) return ctx.calendar.weekdayInitials;
  const base = ["S", "M", "T", "W", "T", "F", "S"];
  return ctx.weekStart === 1 ? [...base.slice(1), base[0]] : base;
}

/** One mini month: its name, weekday initials, and dates in a 7-column grid (6 rows, so all months match). */
function miniMonth(id: string, r: Rect, ym: YM, ctx: LayoutContext, dated: boolean): LayoutNode[] {
  const nameH = lineBoxIn(ctx.typography, "subheading") * 1.15;
  const headH = lineBoxIn(ctx.typography, "label") * 1.1;
  const gridRect: Rect = { x: r.x, y: r.y + nameH + headH, w: r.w, h: Math.max(0, r.h - nameH - headH) };
  const cols = distributeEqual(gridRect.x, gridRect.w, 7, 0);
  const rows = distributeEqual(gridRect.y, gridRect.h, 6, 0);
  const nodes: LayoutNode[] = [
    group(id, "Section", r),
    text(`${id}-name`, { x: r.x, y: r.y, w: r.w, h: nameH }, MONTH_NAMES[ym.month - 1], "subheading", { component: "SectionHeader", align: "center", semantic: "sectionHeading" }),
    ...weekdayInitials(ctx).map((l, i) => text(`${id}-wd${i}`, { x: cols.starts[i], y: r.y + nameH, w: cols.size, h: headH }, l, "label", { align: "center", component: "SectionHeader" })),
    group(`${id}-grid`, "Grid", gridRect, { columnEdges: cols.edges, rowEdges: rows.edges }),
  ];
  if (!dated) {
    // Undated: an empty ruled grid to write the dates in.
    nodes.push(box(`${id}-border`, gridRect, { component: "Grid", strokePt: STUDIO_STROKES.gridRulePt }));
    for (let c = 1; c < 7; c++) nodes.push(rule(`${id}-v${c}`, cols.starts[c], gridRect.y, cols.starts[c], gridRect.y + gridRect.h, { strokePt: STUDIO_STROKES.gridRulePt, component: "Grid" }));
    for (let k = 1; k < 6; k++) nodes.push(rule(`${id}-h${k}`, gridRect.x, rows.starts[k], gridRect.x + gridRect.w, rows.starts[k], { strokePt: STUDIO_STROKES.gridRulePt, component: "Grid" }));
    return nodes;
  }
  miniMonthWeeks(ym.year, ym.month, ctx.weekStart).forEach((week, ri) =>
    week.forEach((d, ci) => {
      if (d === null) return;
      nodes.push(text(`${id}-d${d}`, { x: cols.starts[ci], y: rows.starts[ri], w: cols.size, h: rows.size }, String(d), "label", { align: "center", component: "CalendarCell" }));
    }),
  );
  return nodes;
}

/** Mini months in a grid on one page. */
function miniMonthsPage(ctx: LayoutContext, pageIndex: number, months: YM[], title: string, dated: boolean, idp: string): SolvedPage {
  const s = ctx.spacing;
  const frame = pageFrame(ctx, pageIndex, { headerH: 0.7 });
  const head = headerTitle(`${idp}-header`, ctx, frame.zones, "pageTitle", title || ctx.wording.yearAtAGlance, "pageTitle", "header-center");
  const nodes: LayoutNode[] = [...frame.nodes, ...head.nodes];
  const b = frame.body;
  const landscape = b.w > b.h * 1.15;
  const colCount = months.length === 12 ? (landscape ? 4 : 3) : landscape ? 3 : 2;
  const rowCount = Math.ceil(months.length / colCount);
  const cols = distributeEqual(b.x, b.w, colCount, s.section);
  const rows = distributeEqual(b.y, b.h, rowCount, s.section);
  months.forEach((ym, i) => {
    const r: Rect = { x: cols.starts[i % colCount], y: rows.starts[Math.floor(i / colCount)], w: cols.size, h: rows.size };
    nodes.push(...miniMonth(`${idp}-m${i}`, r, ym, ctx, dated));
  });
  const diagnostics = [...frame.diagnostics, ...head.diagnostics];
  const cellW = cols.size / 7;
  if (cellW < 0.14) diagnostics.push({ severity: "warning", rule: "min-cell", componentId: idp, message: `Mini-month dates are ${cellW.toFixed(2)}" wide: small to read. A larger page or the two-page spread gives them more room.` });
  const metrics: LayoutMetric[] = [
    { label: "Months per page", value: months.length, unit: "count", provenance: { geometryClass: "studio-recommended", basis: `${colCount} × ${rowCount} grid` } },
    { label: "Mini-month date width", value: cellW, unit: "in", provenance: { geometryClass: "user-design", basis: "column ÷ 7" } },
  ];
  return { nodes, diagnostics, metrics, regions: { mainContent: b, calendar: b } };
}

const capability = {
  supportedProductTypes: ["planner", "insert", "deskpad", "journal", "custom"] as never,
  supportsPatterns: [],
  supportsLineStyle: false,
  supportsSidebar: false,
  supportsDatePlacement: false,
  supportsSectionsPerDay: false,
  supportsWritingRows: false,
  supportsPageNumbers: true,
  supportsFooter: true,
  requiresCalendar: false,
  usesWeekStart: true,
  wordingKeys: ["yearAtAGlance"] as never,
  repeats: ["once", "count"] as never,
  defaultRepeat: "once" as never,
};

const fitMin = (minW: number, minH: number, label: string) => (ctx: FitContext): FitResult =>
  ctx.page.usableWidthIn + 1e-6 >= minW && ctx.page.usableHeightIn + 1e-6 >= minH
    ? { ok: true, variant: "standard", variantLabel: label, sidebarAvailable: false }
    : { ok: false, reason: `${label} needs at least ${minW}" × ${minH}" of usable page.` };

export const yearAtAGlance: LayoutDefinition = {
  id: "year-at-a-glance",
  label: "Year at a glance (12 months, one page)",
  family: "planner",
  description: "All twelve months as small calendars on one page.",
  pages: 1,
  period: "none",
  capability,
  fit: fitMin(3, 4, "Year at a glance"),
  solve(ctx) {
    const y = yearMonths(ctx);
    return [miniMonthsPage(ctx, 0, y.months, y.title, y.dated, "year")];
  },
};

export const yearAtAGlanceSpread: LayoutDefinition = {
  id: "year-at-a-glance-spread",
  label: "Year at a glance (two-page spread)",
  family: "planner",
  description: "Six months on each facing page: bigger dates than the one-page year.",
  pages: 2,
  period: "none",
  capability,
  fit: fitMin(2.5, 3.5, "Year spread"),
  solve(ctx) {
    const y = yearMonths(ctx);
    return [miniMonthsPage(ctx, 0, y.months.slice(0, 6), y.title, y.dated, "yearL"), miniMonthsPage(ctx, 1, y.months.slice(6), y.title, y.dated, "yearR")];
  },
};

/** Linear year: a row per month, a column per day. */
export const yearLinear: LayoutDefinition = {
  id: "year-linear",
  label: "Linear year (a row for each month)",
  family: "planner",
  description: "Twelve rows of days 1–31, weekends shaded: plan the whole year at once.",
  pages: 1,
  period: "none",
  capability,
  fit: fitMin(4, 3, "Linear year"),
  solve(ctx) {
    const y = yearMonths(ctx);
    const s = ctx.spacing;
    const frame = pageFrame(ctx, 0, { headerH: 0.7 });
    const head = headerTitle("ylin-header", ctx, frame.zones, "pageTitle", y.title || ctx.wording.yearAtAGlance, "pageTitle", "header-center");
    const nodes: LayoutNode[] = [...frame.nodes, ...head.nodes];
    const b = frame.body;
    const labelW = Math.min(0.55, b.w * 0.1);
    const numH = lineBoxIn(ctx.typography, "label") * 1.2;
    // Labels keep the studio's clearance from the grid's border.
    const inset = s.labelToBorderInset;
    const grid: Rect = { x: b.x + labelW + Math.max(s.column, inset), y: b.y + numH + inset, w: b.w - labelW - Math.max(s.column, inset), h: b.h - numH - inset };
    const cols = distributeEqual(grid.x, grid.w, 31, 0);
    const rows = distributeEqual(grid.y, grid.h, 12, 0);
    const strokePt = STUDIO_STROKES.gridRulePt;
    nodes.push(group("ylin-grid", "Grid", grid, { columnEdges: cols.edges, rowEdges: rows.edges }), box("ylin-border", grid, { component: "Grid", strokePt }));
    for (let c = 1; c < 31; c++) nodes.push(rule(`ylin-v${c}`, cols.starts[c], grid.y, cols.starts[c], grid.y + grid.h, { strokePt, component: "Grid" }));
    for (let r = 1; r < 12; r++) nodes.push(rule(`ylin-h${r}`, grid.x, rows.starts[r], grid.x + grid.w, rows.starts[r], { strokePt, component: "Grid" }));
    for (let d = 1; d <= 31; d++) nodes.push(text(`ylin-n${d}`, { x: cols.starts[d - 1], y: b.y, w: cols.size, h: numH }, String(d), "label", { align: "center", component: "SectionHeader" }));
    y.months.forEach((ym, r) => {
      nodes.push(text(`ylin-m${r}`, { x: b.x, y: rows.starts[r], w: labelW, h: rows.size }, SHORT[ym.month - 1], "label", { component: "SectionHeader" }));
      const n = y.dated ? daysIn(ym.year, ym.month) : 31;
      for (let d = 1; d <= 31; d++) {
        const cell: Rect = { x: cols.starts[d - 1], y: rows.starts[r], w: cols.size, h: rows.size };
        // Days a month doesn't have are filled; weekends are lightly shaded so each week reads at a glance.
        if (d > n) nodes.push(box(`ylin-x${r}-${d}`, cell, { component: "Grid", stroke: null, fill: "lineArt", fillOpacity: 0.12 }));
        else if (y.dated && [0, 6].includes(weekdayOf(ym.year, ym.month, d))) nodes.push(box(`ylin-we${r}-${d}`, cell, { component: "Grid", stroke: null, fill: "lineArt", fillOpacity: 0.06 }));
      }
    });
    const diagnostics = [...frame.diagnostics, ...head.diagnostics];
    if (cols.size < 0.12) diagnostics.push({ severity: "warning", rule: "min-cell", componentId: "year-linear", message: `Day columns are ${cols.size.toFixed(2)}" wide. A landscape or larger page gives the linear year more room.` });
    return [{ nodes, diagnostics, metrics: [{ label: "Day column width", value: cols.size, unit: "in", provenance: { geometryClass: "user-design", basis: "grid ÷ 31" } }], regions: { mainContent: b, calendar: grid } }];
  },
};

/** Year in pixels: color one square per day. */
export const yearInPixels: LayoutDefinition = {
  id: "year-in-pixels",
  label: "Year in pixels (a square for every day)",
  family: "planner",
  description: "A tracker: twelve month columns of 31 squares, with a key to color by mood, habit or prayer.",
  pages: 1,
  period: "none",
  capability,
  fit: fitMin(3, 4, "Year in pixels"),
  solve(ctx) {
    const y = yearMonths(ctx);
    const s = ctx.spacing;
    const frame = pageFrame(ctx, 0, { headerH: 0.7 });
    const head = headerTitle("ypix-header", ctx, frame.zones, "pageTitle", y.title ? `${ctx.wording.yearInPixels} · ${y.title}` : ctx.wording.yearInPixels, "pageTitle", "header-center");
    const nodes: LayoutNode[] = [...frame.nodes, ...head.nodes];
    const b = frame.body;
    const keyH = Math.min(0.9, b.h * 0.14);
    const labelH = lineBoxIn(ctx.typography, "label") * 1.2;
    const inset = s.labelToBorderInset;
    const numW = Math.min(0.3, b.w * 0.07) + inset;
    const avail: Rect = { x: b.x + numW, y: b.y + labelH + inset, w: b.w - numW, h: b.h - labelH - inset - keyH - s.section };
    const size = Math.min(avail.w / 12, avail.h / 31);
    const grid: Rect = { x: avail.x + (avail.w - size * 12) / 2, y: avail.y, w: size * 12, h: size * 31 };
    const strokePt = STUDIO_STROKES.gridRulePt;
    nodes.push(group("ypix-grid", "Grid", grid), box("ypix-border", grid, { component: "Grid", strokePt }));
    for (let c = 1; c < 12; c++) nodes.push(rule(`ypix-v${c}`, grid.x + c * size, grid.y, grid.x + c * size, grid.y + grid.h, { strokePt, component: "Grid" }));
    for (let r = 1; r < 31; r++) nodes.push(rule(`ypix-h${r}`, grid.x, grid.y + r * size, grid.x + grid.w, grid.y + r * size, { strokePt, component: "Grid" }));
    y.months.forEach((ym, c) => {
      nodes.push(text(`ypix-m${c}`, { x: grid.x + c * size, y: b.y, w: size, h: labelH }, SHORT[ym.month - 1].slice(0, size < 0.3 ? 1 : 3), "label", { align: "center", component: "SectionHeader" }));
      const n = y.dated ? daysIn(ym.year, ym.month) : 31;
      for (let d = n + 1; d <= 31; d++) nodes.push(box(`ypix-x${c}-${d}`, { x: grid.x + c * size, y: grid.y + (d - 1) * size, w: size, h: size }, { component: "Grid", stroke: null, fill: "lineArt", fillOpacity: 0.12 }));
    });
    for (let d = 1; d <= 31; d++) nodes.push(text(`ypix-d${d}`, { x: grid.x - numW, y: grid.y + (d - 1) * size, w: numW - inset, h: size }, String(d), "label", { align: "right", component: "SectionHeader" }));
    // The key: five swatches with a line to name each.
    const key: Rect = { x: b.x, y: b.y + b.h - keyH, w: b.w, h: keyH };
    const kc = distributeEqual(key.x, key.w, 5, s.column);
    nodes.push(group("ypix-key", "Section", key), text("ypix-key-title", { x: key.x, y: key.y, w: key.w, h: labelH }, ctx.wording.colorKey, "label", { component: "SectionHeader" }));
    const sw = Math.min(0.22, keyH - labelH - s.labelToBorderInset);
    kc.starts.forEach((x, i) => {
      const yy = key.y + labelH + s.labelToBorderInset;
      nodes.push(box(`ypix-key-sw${i}`, { x, y: yy, w: sw, h: sw }, { component: "Grid", strokePt }));
      nodes.push(rule(`ypix-key-l${i}`, x + sw + 0.06, yy + sw, x + kc.size, yy + sw, { strokePt: ctx.pattern.lineWeightPt, component: "WritingLines" }));
    });
    const diagnostics = [...frame.diagnostics, ...head.diagnostics];
    if (size < 0.14) diagnostics.push({ severity: "warning", rule: "min-cell", componentId: "year-in-pixels", message: `Day squares are ${size.toFixed(2)}" across: small to color. A larger page gives bigger squares.` });
    return [{ nodes, diagnostics, metrics: [{ label: "Day square", value: size, unit: "in", provenance: { geometryClass: "user-design", basis: "min(width ÷ 12, height ÷ 31)" } }], regions: { mainContent: b, calendar: grid } }];
  },
};

export const YEARLY_LAYOUTS = [yearAtAGlance, yearAtAGlanceSpread, yearLinear, yearInPixels];
