/**
 * Monthly calendar (Test Product 3). Blueprint reference B1 (7 × 9 coil):
 * title zone 0.80, weekday header 0.35, 7 × 6 grid, optional notes sidebar
 * 1.4 + gap. Cells are solved by equal distribution — never hand-placed.
 * The sidebar sits on the page's OUTER side so it mirrors with the binding.
 */
import { solveStack } from "../../engines/layout/math";
import { STUDIO_PLANNER } from "../../presets/studioDefaults";
import type { Rect } from "../../types/geometry";
import type { LayoutMetric, LayoutNode, SolvedPage } from "../../types/layout";
import { calendarGrid, headerTitle, pageFrame, section, weekdayHeader } from "../shared/components";
import { stackDiagnostic } from "../shared/nodes";
import type { LayoutDefinition } from "../shared/types";

export const monthlyCalendar: LayoutDefinition = {
  id: "planner-monthly",
  label: "Monthly Calendar",
  family: "planner",
  description: "Month title, weekday row, 7-column grid (6-row universal option), optional outer sidebar.",
  pages: 1,
  period: "month",
  solve(ctx): SolvedPage[] {
    if (ctx.period.kind !== "month" || !ctx.calendar) throw new Error("planner-monthly requires a month period and calendar data.");
    const monthKey = ctx.period.key;
    const month = ctx.calendar.months.find((m) => m.key === monthKey);
    if (!month) throw new Error(`Month ${monthKey} not in calendar.`);
    const g = ctx.pages[0];
    const s = ctx.spacing;

    const frame = pageFrame(ctx, 0, { headerH: STUDIO_PLANNER.monthlyTitle.valueIn, footer: ctx.options.showPageNumbers });
    const nodes: LayoutNode[] = [...frame.nodes, ...headerTitle("month-header", frame.header, `${month.name} ${month.year}`, "monthTitle")];
    const diagnostics = [...frame.diagnostics];

    // Horizontal split: grid (elastic) + optional sidebar (fixed) on the outer side.
    const outerIsLeft = g.boundEdge === "right";
    let gridArea: Rect = frame.body;
    let sidebarRect: Rect | null = null;
    if (ctx.options.showSidebar) {
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

    // Vertical split of the grid area: weekday header + grid.
    const v = solveStack(gridArea.y, gridArea.h, [
      { id: "weekdays", kind: "fixed", size: STUDIO_PLANNER.weekdayHeader.valueIn },
      { id: "grid", kind: "elastic", min: 0 },
    ], 0);
    diagnostics.push(...stackDiagnostic(v, "month-grid", "Weekday header"));
    const weekdayRect = { ...gridArea, y: v.byId.weekdays.start, h: v.byId.weekdays.size };
    const gridRect = { ...gridArea, y: v.byId.grid.start, h: v.byId.grid.size };

    const labels = ctx.calendar.weekdayShortNames;
    nodes.push(...weekdayHeader("month-weekdays", weekdayRect, labels, ctx));
    const grid = calendarGrid("month-grid", gridRect, month, ctx);
    nodes.push(...grid.nodes);

    if (sidebarRect) {
      const sb = section("month-sidebar", sidebarRect, ctx.wording[ctx.options.sidebarContent], ctx, "lines", { boxed: false });
      nodes.push(...sb.nodes);
      diagnostics.push(...sb.diagnostics);
    }

    const metrics: LayoutMetric[] = [
      { label: "Title zone", value: STUDIO_PLANNER.monthlyTitle.valueIn, unit: "in", provenance: STUDIO_PLANNER.monthlyTitle.provenance },
      { label: "Weekday header", value: STUDIO_PLANNER.weekdayHeader.valueIn, unit: "in", provenance: STUDIO_PLANNER.weekdayHeader.provenance },
      { label: "Grid area width", value: gridRect.w, unit: "in", provenance: { geometryClass: "user-design", basis: "usable width − sidebar − gap" } },
      { label: "Grid area height", value: gridRect.h, unit: "in", provenance: { geometryClass: "user-design", basis: "usable height − title − weekday header − gaps" } },
      ...grid.metrics,
    ];
    if (sidebarRect) metrics.push({ label: "Sidebar width", value: sidebarRect.w, unit: "in", provenance: { geometryClass: "user-design", basis: "layout option (studio default 1.4\")" } });
    return [{ nodes, diagnostics, metrics }];
  },
};
