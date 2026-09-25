/**
 * Weekly desk pad (Test Product 5) — undated, landscape, glued.
 * Blueprint reference B6 (11 × 17): glue zone 0.75, header 0.8, weekday
 * header 0.4, 7 day columns, 4 writing rows, ruled every 0.30.
 * Optional priorities strip on the right (B6 option: 2.5" + gap).
 *
 * The 7 × N week is ONE connected grid (connectedGrid, zero gap): B6's 0.08"
 * column gap is a card-style convention, not a mechanical requirement, and
 * is replaced by shared rules drawn once. The priorities strip stays a
 * separate boxed panel (B6 option), outside the day grid.
 */
import { WEEKDAY_NAMES, weekdayOrder } from "../../engines/calendar/calendar";
import { fitCount, solveStack } from "../../engines/layout/math";
import { gridPitchIn, lineSpacingIn } from "../../engines/patterns/patterns";
import { STUDIO_PLANNER, STUDIO_STROKES } from "../../presets/studioDefaults";
import type { Rect } from "../../types/geometry";
import type { LayoutMetric, LayoutNode, SolvedPage } from "../../types/layout";
import { connectedGrid, pageFrame, PLANNER_GRID_GAP_IN, section, weekdayHeader, writingSurface } from "../shared/components";
import { group, lineBoxIn, rule, stackDiagnostic, text } from "../shared/nodes";
import { minimumAreaFit, type LayoutDefinition } from "../shared/types";

/** Desk pads are large-format products; a 10" × 6" usable area is the smallest that holds 7 writable day columns. */
const DESK_PAD_MIN_USABLE = { w: 10, h: 6 };

export const weeklyDeskPad: LayoutDefinition = {
  id: "deskpad-weekly",
  label: "Weekly Desk Pad",
  family: "deskpad",
  description: "Undated week: header, weekday row, 7 columns × writing rows, optional priorities strip.",
  pages: 1,
  period: "none",
  capability: {
    supportedProductTypes: ["deskpad"],
    supportsPatterns: ["ruled", "dot-grid", "graph-grid", "blank"],
    supportsLineStyle: true,
    supportsSidebar: true,
    supportsDatePlacement: false,
    supportsSectionsPerDay: false,
    supportsWritingRows: true,
    supportsPageNumbers: false,
    supportsFooter: true,
    requiresCalendar: false,
    usesWeekStart: true,
    wordingKeys: ["weekOf", "productTitle"],
    repeats: ["repeated-sheet"],
    defaultRepeat: "repeated-sheet",
  },
  fit: minimumAreaFit(DESK_PAD_MIN_USABLE.w, DESK_PAD_MIN_USABLE.h, "Weekly desk pad"),
  solve(ctx): SolvedPage[] {
    const s = ctx.spacing;
    const frame = pageFrame(ctx, 0, { headerH: STUDIO_PLANNER.deskPadHeader.valueIn });
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
    nodes.push(...weekdayHeader("dp-weekdays", weekdayRect, names, ctx, "subheading", PLANNER_GRID_GAP_IN));

    const rowsN = Math.max(1, ctx.options.writingRowsPerDay);
    const grid = connectedGrid("dp-grid", gridRect, 7, rowsN);
    const { cols, rows } = grid;
    nodes.push(...grid.nodes);
    cols.starts.forEach((x, c) =>
      rows.starts.forEach((y, r) => {
        const cell = { x, y, w: cols.size, h: rows.size };
        const inner = { x: x + s.boxPadding, y: y + s.boxPadding, w: cols.size - 2 * s.boxPadding, h: rows.size - 2 * s.boxPadding };
        nodes.push(group(`dp-c${c}r${r}`, "GridCell", cell));
        nodes.push(...writingSurface(`dp-c${c}r${r}-surface`, inner, ctx));
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
      { label: "Day column = W / 7 (connected grid)", value: cols.size, unit: "in", provenance: { geometryClass: "user-design", basis: `${gridRect.w.toFixed(3)} / 7, zero internal gap` } },
      { label: "Writing row height = H / n (connected grid)", value: rows.size, unit: "in", provenance: { geometryClass: "user-design", basis: `${gridRect.h.toFixed(3)} / ${rowsN}, zero internal gap` } },
      ctx.pattern.kind === "dot-grid" || ctx.pattern.kind === "graph-grid"
        ? { label: "Grid cells per row (height)", value: fitCount(rows.size - 2 * s.boxPadding, gridPitchIn(ctx.pattern)), unit: "count", provenance: { geometryClass: "user-design", basis: `floor(row inner ÷ ${gridPitchIn(ctx.pattern).toFixed(4)})` } }
        : { label: "Ruled lines per row", value: fitCount(rows.size - 2 * s.boxPadding, lineSpacingIn(ctx.pattern)), unit: "count", provenance: { geometryClass: "user-design", basis: `floor(row inner ÷ ${lineSpacingIn(ctx.pattern).toFixed(4)})` } },
    ];
    return [{ nodes, diagnostics, metrics }];
  },
};
