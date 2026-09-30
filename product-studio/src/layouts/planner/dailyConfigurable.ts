/**
 * DAILY PLANNER — configurable sections (original Product Studio brief:
 * "Support configurable sections such as date, schedule, priorities, to-do,
 * notes, gratitude, prayer, scripture, reflection, kingdom assignments. These
 * labels must come from semantic wording keys").
 *
 *   header   Friday, January 1                                   2027     (dated)
 *            Daily Plan                                  Date ________     (undated pad)
 *   body     Schedule (hour rows)  |  Top Priorities (3)                   (two columns when wide
 *                                  |  To Do / Notes / Prayer / …            enough and the schedule
 *                                                                           shares the page)
 *            … otherwise every chosen section stacks, in the chosen order.
 *
 * The date header is always present. Sections, their order and the schedule
 * hours come from LayoutOptions (dailySections, hourStart, hourEnd, halfHours);
 * every heading is a wording key. Nothing is shrunk below writable minimums:
 * too many sections for the page is reported, and late hours are trimmed (and
 * reported) before an hour row drops below one handwritten line.
 *
 * One solver, two layouts: the dated daily page (one per day, planners) and
 * the undated daily planner sheet (glued notepads).
 */
import { FILL_IN, isUndated, MONTH_NAMES, WEEKDAY_NAMES } from "../../engines/calendar/calendar";
import { getLayoutMeasurer, styleForRole } from "../../engines/typography/textMeasure";
import { STUDIO_PLANNER, STUDIO_STROKES } from "../../presets/studioDefaults";
import type { Rect } from "../../types/geometry";
import type { LayoutDiagnostic, LayoutMetric, LayoutNode, SolvedPage } from "../../types/layout";
import type { LayoutOptions } from "../../types/project";
import type { SpacingTokens, TypographySettings, WordingKey } from "../../types/tokens";
import { headerTitle, pageFrame, section } from "../shared/components";
import { group, lineBoxIn, rule, text } from "../shared/nodes";
import { distributeEqual } from "../../engines/layout/math";
import type { FitContext, FitResult, LayoutContext, LayoutDefinition } from "../shared/types";

/** The sections a daily page can carry (each is also its heading's wording key). */
export const DAILY_SECTIONS = ["schedule", "topPriorities", "toDo", "notes", "gratitude", "prayer", "scripture", "reflection", "kingdomAssignments"] as const satisfies readonly WordingKey[];
export type DailySection = (typeof DAILY_SECTIONS)[number];
/** Default for new daily planners: the planning core. */
export const DEFAULT_DAILY_SECTIONS: DailySection[] = ["schedule", "topPriorities", "toDo"];

type Kind = "hours" | "checklist" | "surface";
/** How each section is drawn and how much room it takes relative to the others. */
const SECTION_SPEC: Record<DailySection, { kind: Kind; weight: number; fixedRows?: number }> = {
  schedule: { kind: "hours", weight: 2.4 },
  topPriorities: { kind: "checklist", weight: 0, fixedRows: 3 },
  toDo: { kind: "checklist", weight: 1.3 },
  notes: { kind: "surface", weight: 1.1 },
  gratitude: { kind: "surface", weight: 0.7 },
  prayer: { kind: "surface", weight: 1 },
  scripture: { kind: "surface", weight: 0.7 },
  reflection: { kind: "surface", weight: 1 },
  kingdomAssignments: { kind: "checklist", weight: 1 },
};
/** A schedule hour must hold one handwritten line. */
export const DAILY_MIN_HOUR_ROW_IN = 0.26;
/** Two columns (schedule | lists) from this body width; narrower pages stack. */
const TWO_COLUMN_MIN_W = 4.4;
// The schedule is the page's main writing area: it takes most of the width; the lists keep about 2" of line.
const SCHEDULE_SHARE = 0.62;
/** Each column of a split schedule needs at least this width (time label + writing). */
const SPLIT_COL_MIN_W = 1.7;
/** Every section keeps room for its heading plus this many rows. */
const MIN_ROWS = 2;
/** Fewest schedule hours before the page reports that it cannot fit the schedule. */
const MIN_HOURS = 6;

/** The chosen sections, in order, without unknown or repeated keys ("priorities" is read as Top Priorities). */
export function dailySectionsOf(options: Pick<LayoutOptions, "dailySections">): DailySection[] {
  const out: DailySection[] = [];
  for (const raw of options.dailySections ?? DEFAULT_DAILY_SECTIONS) {
    const k = (raw === "priorities" ? "topPriorities" : raw) as DailySection;
    if ((DAILY_SECTIONS as readonly string[]).includes(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

const hourLabel = (h: number, half = false) => `${h % 12 === 0 ? 12 : h % 12}${half ? ":30" : ""} ${h < 12 ? "AM" : "PM"}`;

type Frame = {
  body: Rect;
  twoCol: boolean;
  /** Rect per section, in order. */
  rects: { key: DailySection; rect: Rect }[];
  hours: number;
  rowH: number;
  /** 1, or 2 when a narrow schedule splits its hours into two side-by-side columns. */
  hourCols: number;
};

/** A schedule row keeps one handwritten line AND the studio label inset around its hour label. */
function hourRowMin(sp: SpacingTokens, ty: TypographySettings) {
  return Math.max(DAILY_MIN_HOUR_ROW_IN, lineBoxIn(ty, "time") + 2 * sp.labelToBorderInset + 0.005);
}

function minHeight(key: DailySection, sp: SpacingTokens, ty: TypographySettings) {
  const head = lineBoxIn(ty, "sectionHeading") + sp.headingToContentGap;
  const spec = SECTION_SPEC[key];
  if (spec.kind === "hours") return head + MIN_HOURS * hourRowMin(sp, ty);
  return head + (spec.fixedRows ?? MIN_ROWS) * sp.listRow + 0.01;
}

type Placed = { key: DailySection; rect: Rect }[];

/** Stack sections in `area` by weight; fixed-row sections take exactly their rows. Returns the sections that don't fit. */
function stack(keys: DailySection[], area: Rect, sp: SpacingTokens, ty: TypographySettings): Placed | DailySection[] {
  if (!keys.length) return [];
  // Every section first gets its minimum (fixed-row sections: exactly their rows); the rest is shared by weight.
  const mins = keys.map((k) => minHeight(k, sp, ty));
  const gaps = sp.section * (keys.length - 1);
  const extra = area.h - gaps - mins.reduce((a, b) => a + b, 0);
  if (extra < -1e-9) {
    // Report the sections that would not get their minimum, filling in order.
    let used = 0;
    return keys.filter((_, i) => (used += mins[i] + (i ? sp.section : 0)) > area.h + 1e-9);
  }
  const weights = keys.map((k) => (SECTION_SPEC[k].fixedRows ? 0 : SECTION_SPEC[k].weight));
  const total = weights.reduce((a, b) => a + b, 0);
  let y = area.y;
  return keys.map((key, i) => {
    const h = mins[i] + (total ? (extra * weights[i]) / total : 0);
    const r = { key, rect: { x: area.x, y, w: area.w, h } };
    y += h + sp.section;
    return r;
  });
}

/** Sections in `cols` columns (filled in reading order, balanced by count). */
function columns(keys: DailySection[], area: Rect, cols: number, sp: SpacingTokens, ty: TypographySettings): Placed | DailySection[] {
  const gap = sp.column * 2;
  const colW = (area.w - gap * (cols - 1)) / cols;
  const per = Math.ceil(keys.length / cols);
  const placed: Placed = [];
  const short: DailySection[] = [];
  for (let c = 0; c < cols; c++) {
    const part = keys.slice(c * per, (c + 1) * per);
    const r = stack(part, { x: area.x + c * (colW + gap), y: area.y, w: colW, h: area.h }, sp, ty);
    if (r.length && typeof (r as Placed)[0] === "object") placed.push(...(r as Placed));
    else short.push(...(r as DailySection[]));
  }
  return short.length ? short : placed;
}
const fits = (r: Placed | DailySection[]): r is Placed => !r.length || typeof r[0] === "object";

/**
 * Arrange the chosen sections, preferring (in order):
 *   wide pages   schedule | lists beside it → schedule | some lists, the rest in a band below
 *   any page     everything stacked → schedule on top, the lists in two columns below
 * and only then report that the page cannot hold them all.
 */
function dailyFrame(body: Rect, sp: SpacingTokens, ty: TypographySettings, options: LayoutOptions): { ok: true; frame: Frame } | { ok: false; reason: string } {
  const keys = dailySectionsOf(options);
  if (!keys.length) return { ok: false, reason: "Choose at least one daily section." };
  const hasSchedule = keys.includes("schedule");
  const others = keys.filter((k) => k !== "schedule");
  const schedMin = hasSchedule ? minHeight("schedule", sp, ty) : 0;
  let rects: Placed | null = null;
  let twoCol = false;
  if (hasSchedule && others.length && body.w >= TWO_COLUMN_MIN_W) {
    const w0 = (body.w - sp.column * 2) * SCHEDULE_SHARE;
    const listX = body.x + w0 + sp.column * 2;
    for (let k = 0; k <= others.length && !rects; k++) {
      const side = others.slice(0, others.length - k), band = others.slice(others.length - k);
      const bandCols = Math.min(band.length, 3);
      const bandRows = band.length ? Math.ceil(band.length / bandCols) : 0;
      const bandH = band.length ? bandRows * (Math.max(...band.map((x) => minHeight(x, sp, ty))) + 0.45) + (bandRows - 1) * sp.section : 0;
      const topH = body.h - bandH - (band.length ? sp.section : 0);
      if (topH < schedMin) break;
      const sideR = stack(side, { x: listX, y: body.y, w: body.x + body.w - listX, h: topH }, sp, ty);
      const bandR = band.length ? columns(band, { x: body.x, y: body.y + topH + sp.section, w: body.w, h: bandH }, bandCols, sp, ty) : [];
      if (fits(sideR) && fits(bandR)) {
        rects = [{ key: "schedule", rect: { x: body.x, y: body.y, w: w0, h: topH } }, ...sideR, ...bandR];
        twoCol = true;
      }
    }
  }
  if (!rects) {
    const all = stack(keys, body, sp, ty);
    if (fits(all)) rects = all;
  }
  if (!rects && others.length > 1 && body.w >= 3.4) {
    const schedH = hasSchedule ? Math.max(schedMin, body.h * 0.45) : 0;
    const below: Rect = { x: body.x, y: body.y + (schedH ? schedH + sp.section : 0), w: body.w, h: body.h - (schedH ? schedH + sp.section : 0) };
    const two = columns(others, below, 2, sp, ty);
    if (fits(two)) rects = [...(hasSchedule ? [{ key: "schedule" as DailySection, rect: { x: body.x, y: body.y, w: body.w, h: schedH } }] : []), ...two];
  }
  if (!rects) return { ok: false, reason: `Too many daily sections for this page (${keys.length} chosen). Remove a section or choose a larger size.` };
  // Order rects as chosen (placement may have moved some into a band).
  rects.sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key));
  // Schedule rows: the chosen hour range (and half hours), trimmed from the evening only if a row would drop below its minimum.
  const sched = rects.find((r) => r.key === "schedule");
  const head = lineBoxIn(ty, "sectionHeading") + sp.headingToContentGap;
  const perHour = options.halfHours && options.scheduleTimes !== "blank" ? 2 : 1;
  const wanted = Math.max(1, (options.hourEnd - options.hourStart + 1) * perHour);
  const minRow = hourRowMin(sp, ty);
  let rows = wanted, hourCols = 1;
  if (sched) {
    const avail = sched.rect.h - head;
    // A full-width schedule too short for every hour splits into two columns (morning | afternoon) before any hour is dropped.
    if (avail / wanted < minRow && sched.rect.w >= 2 * SPLIT_COL_MIN_W && avail / Math.ceil(wanted / 2) >= minRow) hourCols = 2;
    else while (rows > Math.min(MIN_HOURS, wanted) && avail / rows < minRow) rows--;
  }
  const rowH = sched ? (sched.rect.h - head) / Math.ceil(rows / hourCols) : 0;
  if (sched && rowH + 1e-9 < minRow) return { ok: false, reason: "The schedule needs more height on this page. Remove a section or choose a larger size." };
  return { ok: true, frame: { body, twoCol, rects, hours: rows, rowH, hourCols } };
}

/** Body rect for fit checks (the same frame the solver builds). */
function fitBody(ctx: FitContext): Rect {
  const s = ctx.spacing, g = ctx.page;
  const footerOn = ctx.options.showFooter || ctx.options.showPageNumbers;
  const top = g.safeRect.y + s.page + STUDIO_PLANNER.dailyDateHeader.valueIn + s.headerGap;
  const bottom = g.safeRect.y + g.safeRect.h - s.page - (footerOn ? lineBoxIn(ctx.typography, "footer") + s.footerGap : 0);
  return { x: g.safeRect.x + s.page, y: top, w: g.safeRect.w - 2 * s.page, h: bottom - top };
}

function fit(ctx: FitContext): FitResult {
  const r = dailyFrame(fitBody(ctx), ctx.spacing, ctx.typography, ctx.options);
  if (!r.ok) return r;
  return { ok: true, variant: r.frame.twoCol ? "two-column" : "stacked", variantLabel: r.frame.twoCol ? "Schedule beside the lists" : "Sections stacked", sidebarAvailable: false };
}

function scheduleNodes(rect: Rect, f: Frame, ctx: LayoutContext): { nodes: LayoutNode[]; diagnostics: LayoutDiagnostic[] } {
  const s = ctx.spacing, o = ctx.options;
  const titleH = lineBoxIn(ctx.typography, "sectionHeading");
  const head = section("dy-schedule", { ...rect, h: titleH + s.headingToContentGap }, ctx.wording.schedule, ctx, "blank", { titleRole: "sectionHeading" });
  const grid: Rect = { x: rect.x, y: rect.y + titleH + s.headingToContentGap, w: rect.w, h: rect.h - titleH - s.headingToContentGap };
  const perHour = o.halfHours && o.scheduleTimes !== "blank" ? 2 : 1;
  const labels = Array.from({ length: f.hours }, (_, i) => hourLabel(o.hourStart + Math.floor(i / perHour), o.halfHours && i % 2 === 1));
  const diagnostics: LayoutDiagnostic[] = [...head.diagnostics];
  const wanted = (o.hourEnd - o.hourStart + 1) * perHour;
  const blank = o.scheduleTimes === "blank";
  if (f.hours < wanted) {
    diagnostics.push({ severity: "info", rule: "min-cell", componentId: "dy-schedule", message: blank ? `Schedule shows ${f.hours} of ${wanted} rows so each row keeps a writable line.` : `Schedule shows ${labels[0]} – ${labels[labels.length - 1]} so each row keeps a writable line.` });
  }
  const measure = getLayoutMeasurer().measure, style = styleForRole(ctx.typography, "time");
  const lh = lineBoxIn(ctx.typography, "time");
  const nodes: LayoutNode[] = [...head.nodes];
  // One grid per hour column (two when a narrow schedule splits morning | afternoon).
  const perCol = Math.ceil(f.hours / f.hourCols);
  const gap = f.hourCols > 1 ? s.column * 2 : 0;
  const colW = (grid.w - gap * (f.hourCols - 1)) / f.hourCols;
  for (let c = 0; c < f.hourCols; c++) {
    const part = labels.slice(c * perCol, (c + 1) * perCol);
    const g: Rect = { x: grid.x + c * (colW + gap), y: grid.y, w: colW, h: f.rowH * part.length };
    const id = c ? `dy-hours${c + 1}` : "dy-hours";
    // Open schedule: no box around it. Each hour is a writing line of its own (a hairline under the slot,
    // in the writing-line color), and a light rule sets the times apart — the time divisions stay, the table goes.
    const tracks = distributeEqual(g.y, g.h, part.length, 0);
    const t = { trackRects: tracks.starts.map((y): Rect => ({ x: g.x, y, w: g.w, h: tracks.size })) };
    const labelW = Math.min(g.w * 0.4, Math.max(STUDIO_PLANNER.timeColumn.valueIn * 0.7, Math.max(...labels.map((l) => measure(l, style))) + 2 * s.labelToBorderInset + 0.02));
    nodes.push(group(id, "Grid", g, { rowEdges: tracks.edges }));
    t.trackRects.forEach((r, i) => nodes.push(rule(`${id}-h${i + 1}`, g.x, r.y + r.h, g.x + g.w, r.y + r.h, { strokePt: STUDIO_STROKES.writingLinePt, color: "line", component: "Grid" })));
    nodes.push(rule(`${id}-label-rule`, g.x + labelW, g.y, g.x + labelW, g.y + g.h, { strokePt: STUDIO_STROKES.gridRulePt, color: "line", component: "Grid" }));
    // Blank schedules keep the (empty) time column for handwritten times.
    if (!blank) t.trackRects.forEach((r, i) => {
      nodes.push(text(`dy-hour-${c * perCol + i}`, { x: r.x + s.labelToBorderInset, y: r.y + Math.max(0, (r.h - lh) / 2), w: labelW - 2 * s.labelToBorderInset, h: Math.min(lh, r.h) }, part[i], "time", { component: "SectionHeader", align: "left", vAlign: "middle" }));
    });
  }
  return { nodes, diagnostics };
}

function solveDaily(ctx: LayoutContext, dated: boolean): SolvedPage {
  const s = ctx.spacing;
  const frameP = pageFrame(ctx, 0, { headerH: STUDIO_PLANNER.dailyDateHeader.valueIn });
  const nodes: LayoutNode[] = [...frameP.nodes];
  const diagnostics: LayoutDiagnostic[] = [...frameP.diagnostics];
  const z = frameP.zones.header;
  const right = (id: string, value: string) => text(id, { x: z.x, y: z.y, w: z.w, h: z.h - s.titleToRuleGap }, value, "label", { component: "PageHeader", align: "right", vAlign: "bottom" });
  if (dated) {
    if (ctx.period.kind !== "day" || !ctx.calendar) throw new Error("The daily planner needs a date range and repeats every day.");
    const iso = ctx.period.iso;
    const day = ctx.calendar.days.find((d) => d.iso === iso);
    if (!day) throw new Error(`Day ${iso} not in calendar.`);
    // An undated planner's day: fill-in lines for the date and the weekday; the rest of the page is unchanged.
    const undated = isUndated(ctx.calendar);
    const t = headerTitle("dy-header", ctx, frameP.zones, "pageTitle", undated ? `${ctx.wording.date} ${FILL_IN}` : `${WEEKDAY_NAMES[day.weekday]}, ${MONTH_NAMES[day.month - 1]} ${day.day}`, "weekTitle", "header-left");
    nodes.push(...t.nodes, undated ? right("dy-day", `Day ${FILL_IN}`) : right("dy-year", String(day.year)));
    diagnostics.push(...t.diagnostics);
  } else {
    // Undated sheet: the pad's title, and a date line the writer fills in.
    // The date line fills the header's free width; on a narrow pad the date line IS the header.
    const m = getLayoutMeasurer().measure;
    const titleW = m(ctx.wording.dailyPlan, styleForRole(ctx.typography, "weekTitle"));
    const labelStyle = styleForRole(ctx.typography, "label");
    const line = (w: number) => {
      let u = "____";
      while (m(`${ctx.wording.date} ${u}__`, labelStyle) <= w) u += "__";
      return `${ctx.wording.date} ${u}`;
    };
    const room = z.w - titleW - 0.25;
    if (room >= m(`${ctx.wording.date} ______________`, labelStyle)) {
      const t = headerTitle("dy-header", ctx, frameP.zones, "pageTitle", ctx.wording.dailyPlan, "weekTitle", "header-left");
      nodes.push(...t.nodes, right("dy-date", line(Math.min(room, 2.2))));
      diagnostics.push(...t.diagnostics);
    } else {
      const titleStyle = styleForRole(ctx.typography, "pageTitle");
      let u = "____";
      while (m(`${ctx.wording.date} ${u}__`, titleStyle) <= Math.min(z.w * 0.85, 2.8)) u += "__";
      const t = headerTitle("dy-header", ctx, frameP.zones, "pageTitle", `${ctx.wording.date} ${u}`, "pageTitle", "header-left");
      nodes.push(...t.nodes);
      diagnostics.push(...t.diagnostics);
    }
  }
  const r = dailyFrame(frameP.body, s, ctx.typography, ctx.options);
  if (!r.ok) return { nodes, metrics: [], diagnostics: [...diagnostics, { severity: "error", rule: "layout-incompatible", componentId: "daily-sections", message: r.reason }] };
  const f = r.frame;
  for (const { key, rect } of f.rects) {
    if (key === "schedule") {
      const sc = scheduleNodes(rect, f, ctx);
      nodes.push(...sc.nodes);
      diagnostics.push(...sc.diagnostics);
      continue;
    }
    const spec = SECTION_SPEC[key];
    const sec = section(`dy-${key}`, rect, ctx.wording[key], ctx, spec.kind === "checklist" ? "checklist" : "surface", { titleRole: "sectionHeading" });
    nodes.push(...sec.nodes);
    diagnostics.push(...sec.diagnostics);
  }
  const metrics: LayoutMetric[] = [
    { label: "Daily sections", value: f.rects.length, unit: "count", provenance: { geometryClass: "user-design", basis: f.rects.map((x) => x.key).join(" · ") } },
  ];
  if (f.rowH) metrics.push({ label: "Schedule row height", value: f.rowH, unit: "in", provenance: { geometryClass: "user-design", basis: `schedule height ÷ ${f.hours} rows, min ${DAILY_MIN_HOUR_ROW_IN}"` } });
  const sched = f.rects.find((x) => x.key === "schedule")?.rect;
  return { nodes, diagnostics, metrics, regions: { mainContent: f.body, ...(sched ? { calendar: sched } : {}), writingArea: f.body } };
}

const capability = (dated: boolean): LayoutDefinition["capability"] => ({
  supportedProductTypes: dated ? ["planner", "insert", "journal", "custom"] : ["notepad", "custom"],
  supportsPatterns: ["ruled", "dot-grid", "graph-grid", "blank"],
  supportsLineStyle: true,
  supportsSidebar: false,
  supportsDatePlacement: false,
  supportsSectionsPerDay: false,
  supportsWritingRows: false,
  supportsPageNumbers: true,
  supportsFooter: true,
  supportsDailySections: true,
  supportsScheduleTimes: true,
  requiresCalendar: dated,
  usesWeekStart: false,
  wordingKeys: dated ? [] : ["dailyPlan", "date"],
  repeats: dated ? ["every-day"] : ["repeated-sheet", "count", "once"],
  defaultRepeat: dated ? "every-day" : "repeated-sheet",
});

export const dailyPlanner: LayoutDefinition = {
  id: "planner-daily",
  label: "Daily planner (choose sections)",
  family: "planner",
  description: "One dated page per day. Choose the sections — schedule, top priorities, to-do, notes, gratitude, prayer, scripture, reflection, kingdom assignments — and their order.",
  pages: 1,
  period: "day",
  capability: capability(true),
  fit,
  solve: (ctx) => [solveDaily(ctx, true)],
};

export const dailyPlannerSheet: LayoutDefinition = {
  id: "notepad-daily",
  label: "Daily planner sheet (undated)",
  family: "notepad",
  description: "Undated daily planner pad: a date line and the sections you choose.",
  pages: 1,
  period: "none",
  capability: capability(false),
  fit,
  solve: (ctx) => [solveDaily(ctx, false)],
};
