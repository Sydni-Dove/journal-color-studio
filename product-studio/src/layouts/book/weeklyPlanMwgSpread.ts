/**
 * WEEKLY PLAN + MEETING WITH GOD — the first same-spread hybrid: planner on
 * the verso, guided journal on the recto. Built from shared, modular blocks
 * (connected day rows, sections, writing surfaces) so the design can be
 * rearranged after review without touching the recipe or geometry engines.
 *
 *   verso  Week of …  | 2 × 4 connected grid: seven day cells (day + date, writing lines) + Priorities checklist
 *   recto  Meeting With God | open writing | What did God say? | Response / action steps
 */
import { formatWeekRange } from "../../engines/calendar/calendar";
import { STUDIO_PLANNER } from "../../presets/studioDefaults";
import type { LayoutRegions } from "../../types/composition";
import type { Rect } from "../../types/geometry";
import type { LayoutDiagnostic, LayoutNode, SolvedPage } from "../../types/layout";
import { connectedGrid, headerTitle, pageFrame, section, writingSurface } from "../shared/components";
import { minimumAreaFit, type LayoutContext, type LayoutDefinition } from "../shared/types";
import { weightedStack } from "./guidedPage";

/** Verso grid: two columns × four rows — seven day cells, the eighth holds the week's priorities. */
const PLAN_COLS = 2;
const PLAN_ROWS = 4;
/** Recto writing blocks: open journal, What did God say?, Response / action steps. */
const RECTO_WEIGHTS = [2, 1.2, 1];

/**
 * The week's plan as one connected grid. Each day is a writing cell headed by
 * its day and date (a half-page column gives every day several full writing
 * lines, where seven stacked rows left one); the last cell is Priorities.
 */
function planGrid(id: string, rect: Rect, ctx: LayoutContext, names: string[], dates: number[]) {
  const grid = connectedGrid(id, rect, PLAN_COLS, PLAN_ROWS);
  const nodes: LayoutNode[] = [...grid.nodes];
  const diagnostics: LayoutDiagnostic[] = [];
  const cell = (i: number): Rect => {
    const c = Math.floor(i / PLAN_ROWS), r = i % PLAN_ROWS; // fill down the first column, then the second
    return { x: grid.cols.starts[c], y: grid.rows.starts[r], w: grid.cols.size, h: grid.rows.size };
  };
  names.forEach((name, i) => {
    const sec = section(`${id}-d${i}`, cell(i), `${name} ${dates[i]}`, ctx, "surface", { padded: true, titleRole: "subheading", headingKind: "Day heading" });
    nodes.push(...sec.nodes);
    diagnostics.push(...sec.diagnostics);
  });
  const pri = section(`${id}-priorities`, cell(7), ctx.wording.priorities, ctx, "checklist", { padded: true, titleRole: "subheading" });
  nodes.push(...pri.nodes);
  diagnostics.push(...pri.diagnostics);
  return { nodes, diagnostics, cell: { w: grid.cols.size, h: grid.rows.size }, priorities: cell(7) };
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
  const plan = planGrid("mw0-days", f0.body, ctx, ctx.calendar.weekdayNames, week.days.map((d) => d.day));
  const verso: SolvedPage = {
    nodes: [...f0.nodes, ...t0.nodes, ...plan.nodes],
    diagnostics: [...f0.diagnostics, ...t0.diagnostics, ...plan.diagnostics],
    metrics: [
      { label: "Day cell = body ÷ 2 columns × 4 rows (connected grid)", value: plan.cell.h, unit: "in", provenance: { geometryClass: "user-design", basis: `${f0.body.w.toFixed(3)} / 2 × ${f0.body.h.toFixed(3)} / 4` } },
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
