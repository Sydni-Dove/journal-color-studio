/**
 * Weekly desk pad (Test Product 5) — undated, landscape, glued.
 * Blueprint reference B6 (11 × 17): glue zone 0.75, header 0.8, weekday
 * header 0.4, 7 day columns (gap 0.08), 4 writing rows, ruled every 0.30.
 * Optional priorities strip on the right (B6 option: 2.5" + gap).
 */
import { WEEKDAY_NAMES, weekdayOrder } from "../../engines/calendar/calendar";
import { distributeEqual, fitCount, solveStack } from "../../engines/layout/math";
import { ruledLines } from "../../engines/patterns/patterns";
import { STUDIO_PLANNER, STUDIO_STROKES } from "../../presets/studioDefaults";
import type { Rect } from "../../types/geometry";
import type { LayoutMetric, LayoutNode, SolvedPage } from "../../types/layout";
import { pageFrame, section, weekdayHeader } from "../shared/components";
import { box, group, lineBoxIn, rule, stackDiagnostic, text } from "../shared/nodes";
import type { LayoutDefinition } from "../shared/types";

export const weeklyDeskPad: LayoutDefinition = {
  id: "deskpad-weekly",
  label: "Weekly Desk Pad",
  family: "deskpad",
  description: "Undated week: header, weekday row, 7 columns × writing rows, optional priorities strip.",
  pages: 1,
  period: "none",
  solve(ctx): SolvedPage[] {
    const s = ctx.spacing;
    const frame = pageFrame(ctx, 0, { headerH: STUDIO_PLANNER.deskPadHeader.valueIn, footer: ctx.options.showFooter, footerText: ctx.wording.productTitle });
    const nodes: LayoutNode[] = [...frame.nodes];
    const diagnostics = [...frame.diagnostics];

    // Header: week-of label with a write-in line, product title on the right.
    const h = frame.header;
    const labelH = lineBoxIn(ctx.typography, "weekTitle");
    const labelW = h.w * 0.25;
    nodes.push(
      text("dp-weekof", { x: h.x, y: h.y + h.h - labelH, w: labelW, h: labelH }, ctx.wording.weekOf, "weekTitle", { component: "PageHeader", vAlign: "bottom" }),
      rule("dp-weekof-line", h.x + labelW, h.y + h.h - s.boxPadding, h.x + h.w * 0.55, h.y + h.h - s.boxPadding, { strokePt: STUDIO_STROKES.writingLinePt, color: "line" }),
      text("dp-title", { x: h.x + h.w * 0.6, y: h.y + h.h - labelH, w: h.w * 0.4, h: labelH }, ctx.wording.productTitle, "pageTitle", { component: "PageHeader", align: "right", vAlign: "bottom" }),
    );

    // Columns: week grid (elastic) + optional priorities strip (fixed).
    let gridArea: Rect = frame.body;
    if (ctx.options.showSidebar) {
      const st = solveStack(frame.body.x, frame.body.w, [
        { id: "grid", kind: "elastic", min: 0 },
        { id: "gap", kind: "fixed", size: s.section },
        { id: "strip", kind: "fixed", size: ctx.options.sidebarWidthIn },
      ], 0);
      diagnostics.push(...stackDiagnostic(st, "dp-columns", "Priorities strip"));
      gridArea = { ...frame.body, w: st.byId.grid.size };
      const strip = { ...frame.body, x: st.byId.strip.start, w: st.byId.strip.size };
      const sec = section("dp-priorities", strip, ctx.wording[ctx.options.sidebarContent], ctx, "checklist", { boxed: true });
      nodes.push(group("dp-strip", "Sidebar", strip), ...sec.nodes);
      diagnostics.push(...sec.diagnostics);
    }

    const v = solveStack(gridArea.y, gridArea.h, [
      { id: "weekdays", kind: "fixed", size: STUDIO_PLANNER.deskPadWeekdayHeader.valueIn },
      { id: "grid", kind: "elastic", min: 0 },
    ], 0);
    diagnostics.push(...stackDiagnostic(v, "dp-grid", "Weekday header"));
    const weekdayRect = { ...gridArea, y: v.byId.weekdays.start, h: v.byId.weekdays.size };
    const gridRect = { ...gridArea, y: v.byId.grid.start, h: v.byId.grid.size };
    const names = weekdayOrder(ctx.weekStart).map((d) => WEEKDAY_NAMES[d]);
    nodes.push(...weekdayHeader("dp-weekdays", weekdayRect, names, ctx));

    const cols = distributeEqual(gridRect.x, gridRect.w, 7, s.column);
    const rowsN = Math.max(1, ctx.options.writingRowsPerDay);
    const rows = distributeEqual(gridRect.y, gridRect.h, rowsN, s.row);
    nodes.push(group("dp-grid", "Grid", gridRect, { columnEdges: cols.edges, rowEdges: rows.edges }));
    const lineSpacing = STUDIO_PLANNER.deskPadLineSpacing.valueIn;
    cols.starts.forEach((x, c) =>
      rows.starts.forEach((y, r) => {
        const cell = { x, y, w: cols.size, h: rows.size };
        const inner = { x: x + s.boxPadding, y: y + s.boxPadding, w: cols.size - 2 * s.boxPadding, h: rows.size - 2 * s.boxPadding };
        nodes.push(box(`dp-c${c}r${r}`, cell, { component: "GridCell", strokePt: STUDIO_STROKES.gridRulePt }));
        nodes.push(ruledLines(`dp-c${c}r${r}-lines`, inner, lineSpacing, ctx.pattern));
      }),
    );

    if (rows.size < STUDIO_PLANNER.deskPadRowMin.valueIn) {
      diagnostics.push({
        severity: "warning",
        rule: "studio-minimum",
        componentId: "dp-grid",
        message: `Writing rows are ${rows.size.toFixed(2)}" tall; the studio recommends ≥ ${STUDIO_PLANNER.deskPadRowMin.valueIn}" for weekly desk pads.`,
        measurement: { actualIn: rows.size, limitIn: STUDIO_PLANNER.deskPadRowMin.valueIn },
      });
    }

    const metrics: LayoutMetric[] = [
      { label: "Header", value: STUDIO_PLANNER.deskPadHeader.valueIn, unit: "in", provenance: STUDIO_PLANNER.deskPadHeader.provenance },
      { label: "Weekday header", value: STUDIO_PLANNER.deskPadWeekdayHeader.valueIn, unit: "in", provenance: STUDIO_PLANNER.deskPadWeekdayHeader.provenance },
      { label: "Day column = (W − 6·gap) / 7", value: cols.size, unit: "in", provenance: { geometryClass: "user-design", basis: `(${gridRect.w.toFixed(3)} − 6 × ${s.column}) / 7` } },
      { label: "Writing row height", value: rows.size, unit: "in", provenance: { geometryClass: "user-design", basis: `(${gridRect.h.toFixed(3)} − ${rowsN - 1} × ${s.row}) / ${rowsN}` } },
      { label: "Ruled lines per row", value: fitCount(rows.size - 2 * s.boxPadding, lineSpacing), unit: "count", provenance: { geometryClass: "user-design", basis: `floor(row inner ÷ ${lineSpacing})` } },
    ];
    return [{ nodes, diagnostics, metrics }];
  },
};
