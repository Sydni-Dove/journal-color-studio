/**
 * WEEKLY PLAN + MEETING WITH GOD — the first same-spread hybrid: planner on
 * the verso, guided journal on the recto. Built from shared, modular blocks
 * (connected day rows, sections, writing surfaces) so the design can be
 * rearranged after review without touching the recipe or geometry engines.
 *
 *   verso  Week of …  | 7 connected day rows (day + date | writing) | Priorities checklist
 *   recto  Meeting With God | open writing | What did God say? | Response / action steps
 */
import { formatWeekRange } from "../../engines/calendar/calendar";
import { STUDIO_PLANNER, STUDIO_STROKES, STUDIO_WEEKLY_VARIANTS } from "../../presets/studioDefaults";
import type { LayoutRegions } from "../../types/composition";
import type { Rect } from "../../types/geometry";
import type { LayoutDiagnostic, LayoutNode, SolvedPage } from "../../types/layout";
import { connectedTracks, headerTitle, pageFrame, section, writingSurface } from "../shared/components";
import { lineBoxIn, rule, text } from "../shared/nodes";
import { minimumAreaFit, type LayoutContext, type LayoutDefinition } from "../shared/types";
import { weightedStack } from "./guidedPage";

/** Share of the verso body given to the seven day rows (the rest is priorities). */
const DAYS_SHARE = 0.7;
/** Recto writing blocks: open journal, What did God say?, Response / action steps. */
const RECTO_WEIGHTS = [2, 1.2, 1];

function dayRows(id: string, rect: Rect, ctx: LayoutContext, names: string[], dates: number[]): LayoutNode[] {
  const s = ctx.spacing;
  const grid = connectedTracks(id, rect, 7, "rows");
  const labelW = STUDIO_WEEKLY_VARIANTS.horizontal.dayLabelW.valueIn;
  const nameH = lineBoxIn(ctx.typography, "subheading");
  const dateH = lineBoxIn(ctx.typography, "date");
  const nodes: LayoutNode[] = [...grid.nodes, rule(`${id}-label-rule`, rect.x + labelW, rect.y, rect.x + labelW, rect.y + rect.h, { strokePt: STUDIO_STROKES.gridRulePt, component: "Grid" })];
  grid.trackRects.forEach((r, i) => {
    const inset = s.labelToBorderInset;
    nodes.push(
      text(`${id}-d${i}-name`, { x: r.x + inset, y: r.y + inset, w: labelW - 2 * inset, h: nameH }, names[i], "subheading", { component: "SectionHeader", vAlign: "top" }),
      text(`${id}-d${i}-date`, { x: r.x + inset, y: r.y + inset + nameH, w: labelW - 2 * inset, h: dateH }, String(dates[i]), "date", { component: "SectionHeader", vAlign: "top" }),
      ...writingSurface(`${id}-d${i}-surface`, { x: r.x + labelW + s.boxPadding, y: r.y + s.boxPadding, w: r.w - labelW - 2 * s.boxPadding, h: r.h - 2 * s.boxPadding }, ctx),
    );
  });
  return nodes;
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
  const [daysR, priR] = weightedStack(f0.body.y, f0.body.h, [DAYS_SHARE, 1 - DAYS_SHARE], s.section).map((r) => ({ x: f0.body.x, y: r.y, w: f0.body.w, h: r.h }));
  const pri = section("mw0-priorities", priR, ctx.wording.priorities, ctx, "checklist", { titleRole: "sectionHeading" });
  const verso: SolvedPage = {
    nodes: [...f0.nodes, ...t0.nodes, ...dayRows("mw0-days", daysR, ctx, ctx.calendar.weekdayShortNames, week.days.map((d) => d.day)), ...pri.nodes],
    diagnostics: [...f0.diagnostics, ...t0.diagnostics, ...pri.diagnostics],
    metrics: [{ label: "Day row height = days area / 7 (connected rows)", value: daysR.h / 7, unit: "in", provenance: { geometryClass: "user-design", basis: `${daysR.h.toFixed(3)} / 7` } }],
    regions: { mainContent: f0.body, calendar: daysR, notes: priR } satisfies LayoutRegions,
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
