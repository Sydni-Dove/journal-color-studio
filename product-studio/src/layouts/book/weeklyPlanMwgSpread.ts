/**
 * WEEKLY PLAN + MEETING WITH GOD — the first same-spread hybrid: planner on
 * the verso, guided journal on the recto. Built from shared, modular blocks
 * (connected day rows, sections, writing surfaces) so the design can be
 * rearranged after review without touching the recipe or geometry engines.
 *
 *   verso  Week of …  | open day sections (heading + lines, hairline rules; Sat | Sun share a row) + Priorities checklist
 *   recto  Meeting With God | open writing | What did God say? | Response / action steps
 */
import { formatWeekRange } from "../../engines/calendar/calendar";
import { STUDIO_PLANNER, STUDIO_STROKES } from "../../presets/studioDefaults";
import type { CalendarDay, CalendarWeek } from "../../types/calendar";
import type { LayoutRegions } from "../../types/composition";
import type { Rect } from "../../types/geometry";
import type { LayoutDiagnostic, LayoutNode, SolvedPage } from "../../types/layout";
import { checklistRows, headerTitle, pageFrame, section, writingSurface } from "../shared/components";
import { group, lineBoxIn, rule, text } from "../shared/nodes";
import { getLayoutMeasurer, styleForRole } from "../../engines/typography/textMeasure";
import { gridPitchIn, lineSpacingIn } from "../../engines/patterns/patterns";
import { minimumAreaFit, type LayoutContext, type LayoutDefinition } from "../shared/types";
import { weightedStack } from "./guidedPage";

/** Recto writing blocks: open journal, What did God say?, Response / action steps. */
const RECTO_WEIGHTS = [2, 1.2, 1];
/** Priorities: a checklist closing the plan page — at least this many rows (it also takes lines the days cannot use). */
const PRIORITY_ROWS = 3;
/** A weekend day that runs full width (Sunday-start weeks) gets this share of a weekday's height. */
const WEEKEND_ROW_SHARE = 0.6;
/** Whitespace between Saturday and Sunday when they share a row (no rule between them). */
const MIN_GUTTER_IN = 0.25;
/** Space between a day's label column and its writing lines. */
const LABEL_GAP_IN = 0.14;
/** Clearance above and below a checkbox inside its row. */
const CHECK_CLEAR_IN = 0.05;

/** The writing pitch the page's pattern uses (line spacing, or the grid pitch for dots / graph). */
function pitchOf(ctx: LayoutContext): number {
  return ctx.pattern.kind === "dot-grid" || ctx.pattern.kind === "graph-grid" ? gridPitchIn(ctx.pattern) : lineSpacingIn(ctx.pattern);
}

/**
 * Whole lines per row: a share by weight for every row, then leftover lines in
 * whole rounds — every weekday row gains a line together (weekdays always
 * match), then the weekend rows. Lines that cannot make a whole round stay as
 * space above Priorities. No row gets fewer than `minLines` (its day label's
 * height) — a short weekend row is topped up from the weekday share.
 */
export function allotLines(total: number, rows: { weight: number; weekend: boolean }[], minLines = 1): number[] {
  const sum = rows.reduce((a, r) => a + r.weight, 0);
  const n = rows.map((r) => Math.floor((total * r.weight) / sum));
  const weekdays = rows.map((r, i) => (r.weekend ? -1 : i)).filter((i) => i >= 0);
  const weekend = rows.map((r, i) => (r.weekend ? i : -1)).filter((i) => i >= 0);
  // Equal counts within each group (rounding can differ), then whole rounds: weekdays first.
  for (const g of [weekdays, weekend]) if (g.length) { const min = Math.min(...g.map((i) => n[i])); g.forEach((i) => (n[i] = min)); }
  // Every row holds its label: raise short rows to the minimum, taking whole rounds back from the weekdays.
  weekend.forEach((i) => (n[i] = Math.max(n[i], minLines)));
  while (weekdays.length && n.reduce((a, b) => a + b, 0) > total && n[weekdays[0]] > minLines) weekdays.forEach((i) => n[i]--);
  weekdays.forEach((i) => (n[i] = Math.max(n[i], minLines)));
  let left = total - n.reduce((a, b) => a + b, 0);
  while (weekdays.length && left >= weekdays.length) weekdays.forEach((i) => n[i]++), (left -= weekdays.length);
  const cap = weekdays.length ? n[weekdays[0]] : Infinity; // a weekend day never gets more lines than a weekday
  while (weekend.length && left >= weekend.length && n[weekend[0]] < cap) weekend.forEach((i) => n[i]++), (left -= weekend.length);
  return n;
}

const isWeekend = (d: CalendarDay) => d.weekday === 0 || d.weekday === 6;

/**
 * The week's plan as open rows — no boxes, no heading rows. Each day's short
 * name and date sit in a narrow label column at the left of its row; the
 * writing lines fill the rest of the row, and the day's last line is a
 * full-width hairline rule that separates it from the next. Monday–Friday get
 * full-width rows (always the same number of lines); Saturday and Sunday share
 * the last row (half width each) when they sit together (a Monday-start week),
 * or take shorter full-width rows otherwise. Priorities close the page as a
 * checklist on the same line pitch.
 */
function planOpen(id: string, rect: Rect, ctx: LayoutContext, week: CalendarWeek) {
  const s = ctx.spacing;
  const short = ctx.calendar!.weekdayShortNames;
  const days = week.days;
  const nodes: LayoutNode[] = [];
  const diagnostics: LayoutDiagnostic[] = [];
  const rows: { days: number[]; weight: number; weekend: boolean }[] = isWeekend(days[5]) && isWeekend(days[6])
    ? [...[0, 1, 2, 3, 4].map((i) => ({ days: [i], weight: 1, weekend: false })), { days: [5, 6], weight: 1, weekend: true }]
    : days.map((d, i) => ({ days: [i], weight: isWeekend(d) ? WEEKEND_ROW_SHARE : 1, weekend: isWeekend(d) }));
  // Rows are measured in whole writing lines. A row n lines tall draws n − 1 writing lines, and its n-th line
  // is the day's divider rule — a full-width hairline you can still write on. Nothing is left over under a
  // day, and the next day's label starts the label clearance below that rule.
  const pitch = pitchOf(ctx);
  const inset = s.labelToBorderInset;
  // Priorities keep the page's rhythm: checkbox rows on the writing pitch (never tighter than a checkbox needs).
  const priRow = Math.max(pitch, s.checkbox + 2 * CHECK_CLEAR_IN);
  const priHeadH = lineBoxIn(ctx.typography, "subheading");
  const priFixed = priHeadH + s.headingToContentGap + inset;
  const daysH = rect.h - priFixed - PRIORITY_ROWS * priRow;
  // A row is at least as tall as its label, inset from the rules on both sides. Rows tall enough stack the
  // short name over the date; a shorter row (a weekend day on a small page) sets them on one line instead.
  const nameH = lineBoxIn(ctx.typography, "subheading"), dateH = lineBoxIn(ctx.typography, "pageTitle");
  const stackedH = 2 * inset + nameH + dateH, inlineH = 2 * inset + Math.max(nameH, dateH);
  const minLines = Math.max(1, Math.ceil((inlineH - 1e-9) / pitch));
  const lines = allotLines(Math.floor((daysH + 1e-9) / pitch), rows, minLines);
  // Lines too few for a whole round of weekdays become extra Priorities rows, so the page is used to the bottom.
  const used = lines.reduce((a, b) => a + b, 0) * pitch;
  const priRows = Math.floor((rect.h - used - priFixed + 1e-9) / priRow);
  const priH = priHeadH + s.headingToContentGap + priRows * priRow;
  const bands: { y: number; h: number }[] = [];
  let y = rect.y;
  for (const n of lines) bands.push({ y, h: n * pitch }), (y += n * pitch);
  const gutter = Math.max(s.section, MIN_GUTTER_IN);
  // The label column: as wide as the widest day name or date, plus a gap before the lines.
  const measure = getLayoutMeasurer().measure;
  const nameW = Math.max(...short.map((n) => measure(n, styleForRole(ctx.typography, "subheading"))));
  const dateW = measure("28", styleForRole(ctx.typography, "pageTitle"));
  const gap = Math.max(s.column * 2, LABEL_GAP_IN);
  const labelW = Math.max(nameW, dateW) + gap;
  const inlineW = nameW + s.column + dateW + gap;
  const divider = (key: string, y: number) => rule(`${id}-rule-${key}`, rect.x, y, rect.x + rect.w, y, { strokePt: STUDIO_STROKES.gridRulePt, component: "Divider" });
  rows.forEach((row, r) => {
    const band = bands[r];
    nodes.push(divider(String(r + 1), band.y + band.h)); // the day's last line
    const colW = (rect.w - gutter * (row.days.length - 1)) / row.days.length;
    row.days.forEach((i, k) => {
      const cell: Rect = { x: rect.x + k * (colW + gutter), y: band.y, w: colW, h: band.h };
      const did = `${id}-d${i}`;
      nodes.push(group(did, "Section", cell));
      const stacked = stackedH <= cell.h + 1e-6;
      const lw = stacked ? labelW : inlineW;
      if (stacked) {
        nodes.push(text(`${did}-title`, { x: cell.x, y: cell.y + inset, w: labelW, h: nameH }, short[i], "subheading", { component: "SectionHeader" }));
        nodes.push(text(`${did}-date`, { x: cell.x, y: cell.y + inset + nameH, w: labelW, h: dateH }, String(days[i].day), "pageTitle", { component: "SectionHeader" }));
      } else {
        const lineH = Math.max(nameH, dateH);
        nodes.push(text(`${did}-title`, { x: cell.x, y: cell.y + inset + (lineH - nameH) / 2, w: nameW, h: nameH }, short[i], "subheading", { component: "SectionHeader" }));
        nodes.push(text(`${did}-date`, { x: cell.x + nameW + s.column, y: cell.y + inset + (lineH - dateH) / 2, w: dateW, h: dateH }, String(days[i].day), "pageTitle", { component: "SectionHeader" }));
      }
      nodes.push(...writingSurface(`${did}-surface`, { x: cell.x + lw, y: cell.y, w: cell.w - lw, h: cell.h - pitch }, ctx));
      if (inlineH > cell.h + 1e-6) diagnostics.push({ severity: "error", rule: "layout-incompatible", componentId: did, message: `The ${short[i]} row is shorter than its day label at this size.` });
    });
  });
  const priorities: Rect = { x: rect.x, y: rect.y + rect.h - priH, w: rect.w, h: priH };
  nodes.push(group(`${id}-priorities`, "Section", priorities));
  nodes.push(text(`${id}-priorities-title`, { x: priorities.x, y: priorities.y, w: priorities.w, h: priHeadH }, ctx.wording.priorities, "subheading", { component: "SectionHeader" }));
  const list = checklistRows(`${id}-priorities-list`, { x: priorities.x, y: priorities.y + priHeadH + s.headingToContentGap, w: priorities.w, h: priRows * priRow }, ctx, priRow);
  nodes.push(...list.nodes);
  return { nodes, diagnostics, weekdayH: bands[0].h, priorities };
}

function solveSpread(ctx: LayoutContext): SolvedPage[] {
  if (ctx.period.kind !== "week" || !ctx.calendar) throw new Error("Weekly Plan + Meeting With God needs a date range and repeats every week.");
  const key = ctx.period.key;
  const week = ctx.calendar.weeks.find((w) => w.key === key);
  if (!week) throw new Error(`Week ${key} not in calendar.`);
  const s = ctx.spacing;
  const headerH = STUDIO_PLANNER.weeklyTitle.valueIn;

  // Verso — plan.
  const f0 = pageFrame(ctx, 0, { headerH });
  const t0 = headerTitle("mw0-header", ctx, f0.zones, "weekOf", `${ctx.wording.weekOf} ${formatWeekRange(week)}`, "weekTitle", "header-left");
  const plan = planOpen("mw0-days", f0.body, ctx, week);
  const verso: SolvedPage = {
    nodes: [...f0.nodes, ...t0.nodes, ...plan.nodes],
    diagnostics: [...f0.diagnostics, ...t0.diagnostics, ...plan.diagnostics],
    metrics: [
      { label: "Weekday section height (full width, open)", value: plan.weekdayH, unit: "in", provenance: { geometryClass: "user-design", basis: `body ${f0.body.h.toFixed(3)}" less Priorities, shared by Mon–Fri and the weekend row` } },
    ],
    regions: { mainContent: f0.body, calendar: f0.body, notes: plan.priorities } satisfies LayoutRegions,
  };

  // Recto — Meeting With God.
  const f1 = pageFrame(ctx, 1, { headerH });
  const t1 = headerTitle("mw1-header", ctx, f1.zones, "pageTitle", ctx.wording.meetingWithGod, "weekTitle", "header-left");
  const b = f1.body;
  const [open, said, resp] = weightedStack(b.y, b.h, RECTO_WEIGHTS, s.section).map((r) => ({ x: b.x, y: r.y, w: b.w, h: r.h }));
  const saidSec = section("mw1-said", said, ctx.wording.whatGodSaid, ctx, "surface", { titleRole: "sectionHeading" });
  const respSec = section("mw1-response", resp, ctx.wording.responseAction, ctx, "checklist", { titleRole: "sectionHeading" });
  const diagnostics: LayoutDiagnostic[] = [...f1.diagnostics, ...t1.diagnostics, ...saidSec.diagnostics, ...respSec.diagnostics];
  const recto: SolvedPage = {
    nodes: [...f1.nodes, ...t1.nodes, ...writingSurface("mw1-open", open, ctx), ...saidSec.nodes, ...respSec.nodes],
    diagnostics,
    metrics: [{ label: "Open journal share of the page", value: RECTO_WEIGHTS[0] / RECTO_WEIGHTS.reduce((a, c) => a + c, 0), unit: "count", provenance: { geometryClass: "user-design", basis: "recto weights 2 : 1.2 : 1" } }],
    regions: { mainContent: b, writingArea: b },
  };
  return [verso, recto];
}

export const weeklyPlanMwgSpread: LayoutDefinition = {
  id: "weekly-plan-mwg-spread",
  label: "Weekly Plan + Meeting With God Spread",
  family: "planner",
  description: "Hybrid spread: the week's plan and priorities on the left, a Meeting With God journal on the right.",
  pages: 2,
  period: "week",
  capability: {
    supportedProductTypes: ["planner", "insert", "journal", "custom"],
    supportsPatterns: ["ruled", "dot-grid", "graph-grid", "blank"],
    supportsLineStyle: true,
    supportsSidebar: false,
    supportsDatePlacement: false,
    supportsSectionsPerDay: false,
    supportsWritingRows: false,
    supportsPageNumbers: true,
    supportsFooter: true,
    requiresCalendar: true,
    usesWeekStart: true,
    wordingKeys: ["weekOf", "priorities", "meetingWithGod", "whatGodSaid", "responseAction"],
    repeats: ["every-week"],
    defaultRepeat: "every-week",
  },
  fit: minimumAreaFit(3.5, 5, "Plan + journal spread"),
  solve: solveSpread,
};
