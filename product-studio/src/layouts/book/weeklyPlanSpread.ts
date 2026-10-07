/**
 * WEEKLY PLAN SPREAD and MEETING WITH GOD SPREAD — the week given room: the
 * plan runs across two facing pages instead of being fitted onto one, and
 * Meeting With God follows as its own spread.
 *
 *   Weekly plan      verso  Week of … | first three weekdays (+ a weekend day that starts the week) | Notes
 *                    recto  the week's dates | last two weekdays + weekend | Priorities checklist
 *   Meeting With God verso  Meeting With God | open writing
 *                    recto  What did God say? | Response / action steps
 *
 * Same open rows as the one-page plan (planAcross in weeklyPlanMwgSpread.ts):
 * whole lines on the writing pitch, a hairline as each day's last line, and
 * weekdays with the same number of lines on both pages.
 */
import { formatWeekRange, FILL_IN, isUndated } from "../../engines/calendar/calendar";
import type { CalendarWeek } from "../../types/calendar";

/** The week's dates; a fill-in line in an undated planner. */
const weekText = (ctx: { calendar: import("../../types/calendar").CalendarData | null }, week: CalendarWeek) => (isUndated(ctx.calendar) ? FILL_IN : formatWeekRange(week));
import { STUDIO_PLANNER } from "../../presets/studioDefaults";
import type { LayoutRegions } from "../../types/composition";
import type { LayoutDiagnostic, SolvedPage } from "../../types/layout";
import { headerTitle, pageFrame, section, writingSurface } from "../shared/components";
import { minimumAreaFit, type LayoutContext, type LayoutDefinition } from "../shared/types";
import { weightedStack } from "./guidedPage";
import { planAcross } from "./weeklyPlanMwgSpread";

/** Right-hand Meeting With God page: What did God say? : Response / action steps. */
const MWG_RECTO_WEIGHTS = [1.3, 1];

function weekOf(ctx: LayoutContext) {
  if (ctx.period.kind !== "week" || !ctx.calendar) throw new Error("This spread needs a date range and repeats every week.");
  const key = ctx.period.key;
  const week = ctx.calendar.weeks.find((w) => w.key === key);
  if (!week) throw new Error(`Week ${key} not in calendar.`);
  return week;
}

function solvePlanSpread(ctx: LayoutContext): SolvedPage[] {
  const week = weekOf(ctx);
  const headerH = STUDIO_PLANNER.weeklyTitle.valueIn;
  const f = [pageFrame(ctx, 0, { headerH }), pageFrame(ctx, 1, { headerH })] as const;
  const t0 = headerTitle("wp0-header", ctx, f[0].zones, "weekOf", `${ctx.wording.weekOf} ${weekText(ctx, week)}`, "weekTitle", "header-left");
  const t1 = headerTitle("wp1-header", ctx, f[1].zones, "weekOf", weekText(ctx, week), "weekTitle", "header-right");
  const plans = planAcross(["wp0-days", "wp1-days"], [f[0].body, f[1].body], ctx, week);
  return plans.map((plan, k): SolvedPage => {
    const t = k === 0 ? t0 : t1;
    return {
      nodes: [...f[k].nodes, ...t.nodes, ...plan.nodes],
      diagnostics: [...f[k].diagnostics, ...t.diagnostics, ...plan.diagnostics],
      metrics: [{ label: "Weekday section height (full width, open)", value: plan.weekdayH, unit: "in", provenance: { geometryClass: "user-design", basis: "whole writing lines, equal for every weekday across the spread" } }],
      regions: { mainContent: f[k].body, calendar: f[k].body, ...(plan.foot ? { notes: plan.foot } : {}) } satisfies LayoutRegions,
    };
  });
}

function solveMwgSpread(ctx: LayoutContext): SolvedPage[] {
  const s = ctx.spacing;
  const headerH = STUDIO_PLANNER.weeklyTitle.valueIn;
  const week = ctx.period.kind === "week" && ctx.calendar ? ctx.calendar.weeks.find((w) => ctx.period.kind === "week" && w.key === ctx.period.key) : undefined;
  // Verso — open writing for the time with God.
  const f0 = pageFrame(ctx, 0, { headerH });
  const t0 = headerTitle("mg0-header", ctx, f0.zones, "pageTitle", ctx.wording.meetingWithGod, "weekTitle", "header-left");
  const verso: SolvedPage = {
    nodes: [...f0.nodes, ...t0.nodes, ...writingSurface("mg0-open", f0.body, ctx)],
    diagnostics: [...f0.diagnostics, ...t0.diagnostics],
    metrics: [],
    regions: { mainContent: f0.body, writingArea: f0.body },
  };
  // Recto — what God said, and the response.
  const f1 = pageFrame(ctx, 1, { headerH });
  const t1 = headerTitle("mg1-header", ctx, f1.zones, "weekOf", week ? weekText(ctx, week) : ctx.wording.meetingWithGod, "weekTitle", "header-right");
  const b = f1.body;
  const [said, resp] = weightedStack(b.y, b.h, MWG_RECTO_WEIGHTS, s.section).map((r) => ({ x: b.x, y: r.y, w: b.w, h: r.h }));
  const saidSec = section("mg1-said", said, ctx.wording.whatGodSaid, ctx, "surface", { titleRole: "sectionHeading" });
  const respSec = section("mg1-response", resp, ctx.wording.responseAction, ctx, "checklist", { titleRole: "sectionHeading" });
  const diagnostics: LayoutDiagnostic[] = [...f1.diagnostics, ...t1.diagnostics, ...saidSec.diagnostics, ...respSec.diagnostics];
  const recto: SolvedPage = { nodes: [...f1.nodes, ...t1.nodes, ...saidSec.nodes, ...respSec.nodes], diagnostics, metrics: [], regions: { mainContent: b, writingArea: b } };
  return [verso, recto];
}

const capability = {
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
  repeats: ["every-week"],
  defaultRepeat: "every-week",
} as const;

export const weeklyPlanSpread: LayoutDefinition = {
  id: "weekly-plan-spread",
  label: "Weekly Plan Spread",
  family: "planner",
  description: "The week across two facing pages: three weekdays and Notes on the left; two weekdays, the weekend and Priorities on the right.",
  pages: 2,
  period: "week",
  capability: { ...capability, supportedProductTypes: [...capability.supportedProductTypes], supportsPatterns: [...capability.supportsPatterns], repeats: [...capability.repeats], wordingKeys: ["weekOf", "priorities", "notes"] },
  fit: minimumAreaFit(3.5, 5, "Weekly plan spread"),
  solve: solvePlanSpread,
};

export const meetingWithGodSpread: LayoutDefinition = {
  id: "meeting-with-god-spread",
  label: "Meeting With God Spread",
  family: "planner",
  description: "Meeting With God across two facing pages: open writing on the left; What did God say? and Response / action steps on the right.",
  pages: 2,
  period: "week",
  capability: { ...capability, supportedProductTypes: [...capability.supportedProductTypes], supportsPatterns: [...capability.supportsPatterns], repeats: [...capability.repeats], usesWeekStart: false, wordingKeys: ["meetingWithGod", "whatGodSaid", "responseAction", "weekOf"] },
  fit: minimumAreaFit(3.5, 5, "Meeting With God spread"),
  solve: solveMwgSpread,
};
