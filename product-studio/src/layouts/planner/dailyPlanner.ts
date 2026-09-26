/** Dated daily page. Calendar/recipe supplies the day; this solver only
 * allocates the safe body to an hourly schedule and priorities/tasks/notes.
 * Uses researched date-header, time-column and minimum hourly-row geometry.
 * Preview and print consume the same solved nodes, as for every layout.
 */
import { MONTH_NAMES, WEEKDAY_NAMES } from "../../engines/calendar/calendar";
import { PLANNER_INTERNALS } from "../../data/research/layoutConventions";
import { STUDIO_PLANNER, STUDIO_STROKES } from "../../presets/studioDefaults";
import { moduleTitle } from "../../presets/modules";
import type { LayoutNode, SolvedPage } from "../../types/layout";
import { weightedStack } from "../book/guidedPage";
import { connectedTracks, headerTitle, pageFrame, section } from "../shared/components";
import { lineBoxIn, rule, text } from "../shared/nodes";
import type { FitContext, FitResult, LayoutContext, LayoutDefinition } from "../shared/types";

function timeline(options: FitContext["options"]): number[] | null {
  const { hourStart: start, hourEnd: end, halfHours } = options;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 23 || end < start) return null;
  const step = halfHours ? 0.5 : 1;
  return Array.from({ length: (end - start) / step + 1 }, (_, i) => start + i * step);
}

function fitDaily(ctx: FitContext): FitResult {
  const hours = timeline(ctx.options);
  if (!hours) return { ok: false, reason: "Daily schedule hours must be whole hours from 0 to 23, with the end at or after the start." };
  const s = ctx.spacing;
  const footerH = ctx.options.showFooter || ctx.options.showPageNumbers ? lineBoxIn(ctx.typography, "footer") + s.footerGap : 0;
  const h = ctx.page.usableHeightIn - 2 * s.page - STUDIO_PLANNER.dailyDateHeader.valueIn - s.headerGap - footerH;
  const dateH = lineBoxIn(ctx.typography, "label") + s.section;
  const scheduleH = h - dateH - lineBoxIn(ctx.typography, "sectionHeading") - s.headingToContentGap;
  const minRow = Math.max(PLANNER_INTERNALS.hourlyRowHeight.min * (ctx.options.halfHours ? 0.5 : 1), lineBoxIn(ctx.typography, "label") + 2 * s.labelToBorderInset);
  const w = ctx.page.usableWidthIn - 2 * s.page;
  if (w < 4.2 || scheduleH / hours.length + 1e-6 < minRow || h - dateH < 3.6) {
    return { ok: false, reason: `Daily planner needs at least 4.2" usable width and ${minRow.toFixed(2)}" per schedule row. Choose a taller page or fewer schedule hours; rows are never squeezed to fit.` };
  }
  return { ok: true, variant: "daily", variantLabel: "Dated schedule + priorities, tasks and notes", sidebarAvailable: false };
}

function solveDaily(ctx: LayoutContext): SolvedPage[] {
  if (ctx.period.kind !== "day" || !ctx.calendar) throw new Error("Daily Planner needs a date range and repeats every day.");
  const iso = ctx.period.iso;
  const day = ctx.calendar.days.find((d) => d.iso === iso && d.inRange);
  if (!day) throw new Error(`Day ${iso} not in the selected date range.`);
  const fit = fitDaily({ ...ctx, page: ctx.pages[0] });
  if (!fit.ok) return [{ nodes: [], metrics: [], diagnostics: [{ severity: "error", rule: "layout-incompatible", componentId: "planner-daily", message: fit.reason }] }];
  const s = ctx.spacing;
  const frame = pageFrame(ctx, 0, { headerH: STUDIO_PLANNER.dailyDateHeader.valueIn });
  const title = ctx.module && ctx.module.title !== moduleTitle("daily-planner", "day") ? ctx.module.title : ctx.wording.dailyPlan;
  const header = headerTitle("daily-header", ctx, frame.zones, "pageTitle", title, "pageTitle", "header-left");
  const dateH = lineBoxIn(ctx.typography, "label");
  const date = `${WEEKDAY_NAMES[day.weekday]}, ${MONTH_NAMES[day.month - 1]} ${day.day}, ${day.year}`;
  const b = frame.body;
  const body = { ...b, y: b.y + dateH + s.section, h: b.h - dateH - s.section };
  // Adjacent headings must keep their label inset from the schedule border.
  const columnGap = Math.max(s.column, s.sectionHeadingInset, s.labelToBorderInset);
  const scheduleW = (body.w - columnGap) * 0.55;
  const schedule = { ...body, w: scheduleW };
  const right = { ...body, x: body.x + scheduleW + columnGap, w: body.w - scheduleW - columnGap };
  const scheduleSection = section("daily-schedule", schedule, ctx.wording.schedule, ctx, "blank", { semantic: "sectionHeading" });
  const rows = scheduleSection.nodes.find((n) => n.id === "daily-schedule-notes")!.rect;
  const hours = timeline(ctx.options)!;
  const grid = connectedTracks("daily-hours", rows, hours.length, "rows");
  const timeW = STUDIO_PLANNER.timeColumn.valueIn;
  const nodes: LayoutNode[] = [
    ...frame.nodes, ...header.nodes,
    text("daily-date", { ...b, h: dateH }, date, "label", { component: "PageHeader" }),
    ...scheduleSection.nodes, ...grid.nodes,
    rule("daily-time-rule", rows.x + timeW, rows.y, rows.x + timeW, rows.y + rows.h, { strokePt: STUDIO_STROKES.gridRulePt, component: "Grid" }),
  ];
  hours.forEach((hour, i) => {
    const whole = Math.floor(hour);
    const label = `${whole % 12 || 12}:${hour % 1 ? "30" : "00"} ${whole < 12 ? "AM" : "PM"}`;
    const r = grid.trackRects[i];
    nodes.push(text(`daily-hour-${i}`, { x: r.x + s.labelToBorderInset, y: r.y, w: timeW - 2 * s.labelToBorderInset, h: r.h }, label, "label", { component: "TimeLabel" }));
  });
  const diagnostics = [...frame.diagnostics, ...header.diagnostics, ...scheduleSection.diagnostics];
  const rects = weightedStack(right.y, right.h, [1, 1.5, 2], s.section).map((r) => ({ ...right, ...r }));
  (["priorities", "toDo", "notes"] as const).forEach((key, i) => {
    const sec = section(`daily-${key}`, rects[i], ctx.wording[key], ctx, key === "notes" ? "surface" : "checklist", { semantic: "sectionHeading" });
    nodes.push(...sec.nodes);
    diagnostics.push(...sec.diagnostics);
  });
  return [{ nodes, diagnostics, regions: { mainContent: b, writingArea: body, notes: rects[2] }, metrics: [
    { label: "Daily schedule row height", value: rows.h / hours.length, unit: "in", provenance: { geometryClass: "user-design", basis: "available schedule height / selected time slots; research 1.4 minimum hourly row 0.3 inches" } },
    { label: "Daily date header", value: STUDIO_PLANNER.dailyDateHeader.valueIn, unit: "in", provenance: STUDIO_PLANNER.dailyDateHeader.provenance },
  ] }];
}

export const dailyPlanner: LayoutDefinition = {
  id: "planner-daily", label: "Daily Planner", family: "planner",
  description: "One dated page per day: hourly schedule, priorities, tasks and generous notes.",
  pages: 1, period: "day",
  capability: {
    supportedProductTypes: ["planner", "insert", "journal", "custom"],
    supportsPatterns: ["ruled", "dot-grid", "graph-grid", "blank"], supportsLineStyle: true,
    supportsSidebar: false, supportsDatePlacement: false, supportsSectionsPerDay: false, supportsWritingRows: false,
    supportsPageNumbers: true, supportsFooter: true, requiresCalendar: true, usesWeekStart: false,
    wordingKeys: ["dailyPlan", "schedule", "priorities", "toDo", "notes"], repeats: ["every-day"], defaultRepeat: "every-day",
  },
  fit: fitDaily, solve: solveDaily,
};
