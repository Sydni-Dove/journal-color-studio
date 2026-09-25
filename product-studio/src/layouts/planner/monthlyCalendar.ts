/**
 * Monthly calendar — a size-aware layout FAMILY, not one blueprint scaled
 * to every page.
 *
 *   full     B1 structure (7 × 9 coil): title 0.8, weekday row 0.35,
 *            12 pt dates, optional outer notes sidebar
 *   compact  small inserts (Franklin Compact, A6): title 0.6, weekday 0.3,
 *            9 pt numerals, no sidebar
 *   micro    pocket inserts (Filofax Personal): title 0.5, initials,
 *            7 pt numerals, no sidebar
 *
 * The variant is chosen from the solved usable geometry against each
 * variant's minimum cell dimensions. When nothing fits, the layout is
 * reported incompatible — cells are never compressed below their minimum.
 */
import { distributeEqual, solveStack } from "../../engines/layout/math";
import { STUDIO_MONTHLY_VARIANTS } from "../../presets/studioDefaults";
import type { Rect } from "../../types/geometry";
import type { LayoutMetric, LayoutNode, SolvedPage } from "../../types/layout";
import { CALENDAR_GRID_GAP_IN, calendarGrid, headerTitle, pageFrame, section, weekdayHeader } from "../shared/components";
import { lineBoxIn, stackDiagnostic } from "../shared/nodes";
import type { FitContext, FitResult, LayoutDefinition } from "../shared/types";
import { MONTH_NAMES } from "../../engines/calendar/calendar";
import { heuristicMeasurer, styleForRole } from "../../engines/typography/textMeasure";

/** Widest month title any month can produce ("September 2027"), measured in the title role. */
function widestTitleIn(ctx: FitContext): number {
  const style = styleForRole(ctx.typography, "monthTitle");
  return Math.max(...MONTH_NAMES.map((m) => heuristicMeasurer(`${m} 2027`, style)));
}

/** Month grids are sized for the universal 6-row case so every month fits the same structure. */
const WORST_CASE_ROWS = 6;

type VariantId = "full" | "compact" | "micro";
type Variant = {
  id: VariantId;
  label: string;
  zones: (typeof STUDIO_MONTHLY_VARIANTS)[VariantId];
  dateRole: "date" | "number" | "label";
  weekdayRole: "subheading" | "label";
  weekdayLabels: "short" | "initial";
  allowsSidebar: boolean;
};

const VARIANTS: Variant[] = [
  { id: "full", label: "Full monthly", zones: STUDIO_MONTHLY_VARIANTS.full, dateRole: "date", weekdayRole: "subheading", weekdayLabels: "short", allowsSidebar: true },
  { id: "compact", label: "Compact monthly (insert)", zones: STUDIO_MONTHLY_VARIANTS.compact, dateRole: "number", weekdayRole: "label", weekdayLabels: "short", allowsSidebar: false },
  { id: "micro", label: "Micro monthly (pocket insert)", zones: STUDIO_MONTHLY_VARIANTS.micro, dateRole: "label", weekdayRole: "label", weekdayLabels: "initial", allowsSidebar: false },
];

type Measure = { colW: number; rowH: number; gridW: number };

/** Cell size a variant would get on this page — the same arithmetic the solver uses. */
function measure(ctx: FitContext, v: Variant, withSidebar: boolean): Measure {
  const s = ctx.spacing;
  const g = ctx.page;
  const footer = ctx.options.showFooter || ctx.options.showPageNumbers ? lineBoxIn(ctx.typography, "footer") + s.footerGap : 0;
  const gridW = g.usableWidthIn - 2 * s.page - (withSidebar ? s.section + ctx.options.sidebarWidthIn : 0);
  const gridH = g.usableHeightIn - 2 * s.page - v.zones.titleH.valueIn - s.headerGap - v.zones.weekdayH.valueIn - footer;
  return {
    gridW,
    colW: (gridW - 6 * CALENDAR_GRID_GAP_IN) / 7,
    rowH: (gridH - (WORST_CASE_ROWS - 1) * CALENDAR_GRID_GAP_IN) / WORST_CASE_ROWS,
  };
}

const fits = (m: Measure, v: Variant) => m.colW + 1e-6 >= v.zones.minCellW.valueIn && m.rowH + 1e-6 >= v.zones.minCellH.valueIn;
/** The month title must fit the page width — a variant is never offered if its title would overflow. */
const titleFits = (ctx: FitContext) => widestTitleIn(ctx) <= ctx.page.usableWidthIn - 2 * ctx.spacing.page + 1e-6;

function sidebarBalanced(ctx: FitContext): boolean {
  return ctx.options.sidebarWidthIn <= ctx.page.usableWidthIn * STUDIO_MONTHLY_VARIANTS.maxSidebarShare + 1e-6;
}

export function fitMonthly(ctx: FitContext): FitResult {
  const full = VARIANTS[0];
  const sidebarFits = sidebarBalanced(ctx) && fits(measure(ctx, full, true), full);
  const sidebarReason = sidebarFits
    ? undefined
    : !sidebarBalanced(ctx)
      ? `A ${ctx.options.sidebarWidthIn}" sidebar would take more than ${Math.round(STUDIO_MONTHLY_VARIANTS.maxSidebarShare * 100)}% of this page's width.`
      : "The page is too narrow for a sidebar beside a full 7-column grid.";
  for (const v of VARIANTS) {
    if (titleFits(ctx) && fits(measure(ctx, v, v.allowsSidebar && ctx.options.showSidebar && sidebarFits), v)) {
      return { ok: true, variant: v.id, variantLabel: v.label, sidebarAvailable: v.allowsSidebar && sidebarFits, sidebarReason: v.allowsSidebar ? sidebarReason : `${v.label} has no sidebar.` };
    }
  }
  const m = measure(ctx, VARIANTS[VARIANTS.length - 1], false);
  if (!titleFits(ctx)) {
    return { ok: false, reason: `Too narrow for a monthly calendar: the month title needs ${widestTitleIn(ctx).toFixed(2)}" but the page has ${ctx.page.usableWidthIn.toFixed(2)}" of usable width.` };
  }
  return {
    ok: false,
    reason: `Too small for a monthly calendar: cells would be ${m.colW.toFixed(2)}" × ${m.rowH.toFixed(2)}" (minimum ${STUDIO_MONTHLY_VARIANTS.micro.minCellW.valueIn}" × ${STUDIO_MONTHLY_VARIANTS.micro.minCellH.valueIn}").`,
  };
}

export const monthlyCalendar: LayoutDefinition = {
  id: "planner-monthly",
  label: "Monthly Calendar",
  family: "planner",
  description: "Month title, weekday row, 7-column grid; full / compact / micro variants chosen by page size.",
  pages: 1,
  period: "month",
  capability: {
    supportedProductTypes: ["planner", "insert", "custom"],
    supportsPatterns: ["ruled", "dot-grid", "graph-grid", "blank"],
    supportsLineStyle: true,
    supportsSidebar: true,
    supportsDatePlacement: true,
    supportsSectionsPerDay: false,
    supportsWritingRows: false,
    supportsPageNumbers: true,
    supportsFooter: true,
    requiresCalendar: true,
    usesWeekStart: true,
    wordingKeys: [],
    repeats: ["every-month"],
    defaultRepeat: "every-month",
  },
  fit: fitMonthly,
  solve(ctx): SolvedPage[] {
    if (ctx.period.kind !== "month" || !ctx.calendar) throw new Error("Monthly Calendar needs a date range and repeats every month.");
    const monthKey = ctx.period.key;
    const month = ctx.calendar.months.find((m) => m.key === monthKey);
    if (!month) throw new Error(`Month ${monthKey} not in calendar.`);
    const g = ctx.pages[0];
    const s = ctx.spacing;
    const fit = fitMonthly({ page: g, spacing: s, typography: ctx.typography, options: ctx.options });
    if (!fit.ok) {
      return [{ nodes: [], metrics: [], diagnostics: [{ severity: "error", rule: "layout-incompatible", componentId: "planner-monthly", message: fit.reason }] }];
    }
    const v = VARIANTS.find((x) => x.id === fit.variant)!;
    const showSidebar = ctx.options.showSidebar && fit.sidebarAvailable;

    const frame = pageFrame(ctx, 0, { headerH: v.zones.titleH.valueIn });
    const nodes: LayoutNode[] = [...frame.nodes, ...headerTitle("month-header", frame.header, `${month.name} ${month.year}`, "monthTitle")];
    const diagnostics = [...frame.diagnostics];
    if (ctx.options.showSidebar && !showSidebar) {
      diagnostics.push({ severity: "info", rule: "sidebar-unavailable", componentId: "month-sidebar", message: `Sidebar hidden: ${fit.sidebarReason}` });
    }

    // Grid (elastic) + optional sidebar (fixed) on the OUTER side.
    const outerIsLeft = g.boundEdge === "right";
    let gridArea: Rect = frame.body;
    let sidebarRect: Rect | null = null;
    if (showSidebar) {
      const mods = [
        { id: "grid", kind: "elastic" as const, min: 0 },
        { id: "gap", kind: "fixed" as const, size: s.section },
        { id: "sidebar", kind: "fixed" as const, size: ctx.options.sidebarWidthIn },
      ];
      const st = solveStack(frame.body.x, frame.body.w, outerIsLeft ? [...mods].reverse() : mods, 0);
      diagnostics.push(...stackDiagnostic(st, "month-columns", "Monthly sidebar"));
      gridArea = { ...frame.body, x: st.byId.grid.start, w: st.byId.grid.size };
      sidebarRect = { ...frame.body, x: st.byId.sidebar.start, w: st.byId.sidebar.size };
    }

    const vs = solveStack(gridArea.y, gridArea.h, [
      { id: "weekdays", kind: "fixed", size: v.zones.weekdayH.valueIn },
      { id: "grid", kind: "elastic", min: 0 },
    ], 0);
    diagnostics.push(...stackDiagnostic(vs, "month-grid", "Weekday header"));
    const weekdayRect = { ...gridArea, y: vs.byId.weekdays.start, h: vs.byId.weekdays.size };
    const gridRect = { ...gridArea, y: vs.byId.grid.start, h: vs.byId.grid.size };

    const labels = v.weekdayLabels === "initial" ? ctx.calendar.weekdayInitials : ctx.calendar.weekdayShortNames;
    nodes.push(...weekdayHeader("month-weekdays", weekdayRect, labels, ctx, v.weekdayRole, CALENDAR_GRID_GAP_IN));
    const grid = calendarGrid("month-grid", gridRect, month, ctx, v.dateRole);
    nodes.push(...grid.nodes);

    // Solved cells must honor the variant minimum (guards against solver drift).
    const colW = distributeEqual(gridRect.x, gridRect.w, 7, CALENDAR_GRID_GAP_IN).size;
    const rowH = distributeEqual(gridRect.y, gridRect.h, month.rows, CALENDAR_GRID_GAP_IN).size;
    if (colW + 1e-6 < v.zones.minCellW.valueIn || rowH + 1e-6 < v.zones.minCellH.valueIn) {
      diagnostics.push({
        severity: "error",
        rule: "min-cell",
        componentId: "month-grid",
        message: `Calendar cells are ${colW.toFixed(3)}" × ${rowH.toFixed(3)}", below the ${v.label} minimum ${v.zones.minCellW.valueIn}" × ${v.zones.minCellH.valueIn}".`,
        measurement: { actualIn: Math.min(colW, rowH), limitIn: Math.min(v.zones.minCellW.valueIn, v.zones.minCellH.valueIn) },
      });
    }

    if (sidebarRect) {
      const sb = section("month-sidebar", sidebarRect, ctx.wording[ctx.options.sidebarContent], ctx, "surface", { boxed: false });
      nodes.push(...sb.nodes);
      diagnostics.push(...sb.diagnostics);
    }

    const metrics: LayoutMetric[] = [
      { label: "Variant", value: VARIANTS.indexOf(v), unit: "count", provenance: { geometryClass: "studio-recommended", basis: `${v.label} — chosen from usable ${g.usableWidthIn.toFixed(2)}" × ${g.usableHeightIn.toFixed(2)}"` } },
      { label: "Title zone", value: v.zones.titleH.valueIn, unit: "in", provenance: v.zones.titleH.provenance },
      { label: "Weekday header", value: v.zones.weekdayH.valueIn, unit: "in", provenance: v.zones.weekdayH.provenance },
      { label: "Minimum cell width", value: v.zones.minCellW.valueIn, unit: "in", provenance: v.zones.minCellW.provenance },
      { label: "Grid area width", value: gridRect.w, unit: "in", provenance: { geometryClass: "user-design", basis: "usable width − sidebar − gap" } },
      { label: "Grid area height", value: gridRect.h, unit: "in", provenance: { geometryClass: "user-design", basis: "usable height − title − weekday header − gaps" } },
      ...grid.metrics,
    ];
    if (sidebarRect) metrics.push({ label: "Sidebar width", value: sidebarRect.w, unit: "in", provenance: { geometryClass: "user-design", basis: "layout option (studio default 1.4\")" } });
    return [{ nodes, diagnostics, metrics }];
  },
};
