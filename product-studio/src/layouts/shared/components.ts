/**
 * Composite layout builders shared by templates. Each builder receives a
 * rectangle already solved from PageGeometry and fills it mathematically.
 */
import { distributeEqual, fitCount, solveStack, type StackModule } from "../../engines/layout/math";
import { fillWritingRegion, lineSpacingIn } from "../../engines/patterns/patterns";
import { STUDIO_STROKES } from "../../presets/studioDefaults";
import type { CalendarMonth } from "../../types/calendar";
import type { Rect } from "../../types/geometry";
import type { LayoutDiagnostic, LayoutMetric, LayoutNode } from "../../types/layout";
import type { LayoutPlacement } from "../../types/project";
import type { TextAlign } from "../../types/tokens";
import type { LayoutContext } from "./types";
import { box, checkbox, group, lineBoxIn, rule, stackDiagnostic, text } from "./nodes";

export type FrameResult = {
  header: Rect;
  body: Rect;
  footer: Rect | null;
  nodes: LayoutNode[];
  diagnostics: LayoutDiagnostic[];
};

/**
 * Standard page frame inside the safe area:
 *   header (fixed) · header gap · body (elastic) · footer gap · footer (fixed)
 */
export function pageFrame(
  ctx: LayoutContext,
  pageIndex: number,
  opts: { headerH: number; forceFooter?: boolean },
): FrameResult {
  // Footer zone exists when the user turned on page numbers or the footer
  // (or the layout requires one); both options are honored by every layout.
  const footerOn = !!opts.forceFooter || ctx.options.showFooter || ctx.options.showPageNumbers;
  const footerText = ctx.options.showFooter ? ctx.wording.productTitle : undefined;
  const g = ctx.pages[pageIndex];
  const s = ctx.spacing;
  const area: Rect = {
    x: g.safeRect.x + s.page,
    y: g.safeRect.y + s.page,
    w: g.safeRect.w - 2 * s.page,
    h: g.safeRect.h - 2 * s.page,
  };
  const footerH = footerOn ? lineBoxIn(ctx.typography, "footer") : 0;
  const modules: StackModule[] = [
    { id: "header", kind: "fixed", size: opts.headerH },
    { id: "headerGap", kind: "fixed", size: opts.headerH > 0 ? s.headerGap : 0 },
    { id: "body", kind: "elastic", min: 0 },
    { id: "footerGap", kind: "fixed", size: footerOn ? s.footerGap : 0 },
    { id: "footer", kind: "fixed", size: footerH },
  ];
  const st = solveStack(area.y, area.h, modules, 0);
  const header = { x: area.x, y: st.byId.header.start, w: area.w, h: st.byId.header.size };
  const body = { x: area.x, y: st.byId.body.start, w: area.w, h: st.byId.body.size };
  const footer = footerOn ? { x: area.x, y: st.byId.footer.start, w: area.w, h: footerH } : null;

  const nodes: LayoutNode[] = [group(`p${pageIndex}-header`, "PageHeader", header)];
  if (footer) {
    nodes.push(group(`p${pageIndex}-footer`, "PageFooter", footer));
    const pn = ctx.options.showPageNumbers ? String(ctx.pageNumbers[pageIndex] ?? "") : "";
    const label = [footerText, pn].filter(Boolean).join("  ·  ");
    if (label) nodes.push(text(`p${pageIndex}-footer-text`, footer, label, "footer", { component: "PageFooter" }));
  }
  return { header, body, footer, nodes, diagnostics: stackDiagnostic(st, `p${pageIndex}-frame`, "Header + footer") };
}

/** Title text inside a header rect, with a rule under it. */
export function headerTitle(id: string, header: Rect, title: string, role: "monthTitle" | "weekTitle" | "pageTitle" | "productTitle", align?: TextAlign): LayoutNode[] {
  return [
    text(`${id}-title`, header, title, role, { component: "PageHeader", align, vAlign: "middle" }),
    rule(`${id}-rule`, header.x, header.y + header.h, header.x + header.w, header.y + header.h, { strokePt: STUDIO_STROKES.headerRulePt, component: "PageHeader" }),
  ];
}

/** Checklist rows: checkbox + writing line, row count solved from height. */
export function checklistRows(
  id: string,
  rect: Rect,
  ctx: LayoutContext,
  rowH = ctx.spacing.listRow,
): { nodes: LayoutNode[]; rows: number; metrics: LayoutMetric[] } {
  const s = ctx.spacing;
  const rows = fitCount(rect.h, rowH);
  const nodes: LayoutNode[] = [
    group(id, "Grid", rect, { rowEdges: Array.from({ length: rows + 1 }, (_, i) => rect.y + i * rowH) }),
  ];
  const lineX0 = rect.x + s.checkbox + s.checkboxGap;
  const lineX1 = rect.x + rect.w;
  const lineYs: number[] = [];
  for (let i = 0; i < rows; i++) {
    const rowTop = rect.y + i * rowH;
    const rowRect = { x: rect.x, y: rowTop, w: rect.w, h: rowH };
    nodes.push(group(`${id}-row${i}`, "ChecklistRow", rowRect));
    // Checkbox sits on the writing line's baseline zone: bottom-aligned with a
    // clearance equal to the row's leftover split evenly.
    const cbY = rowTop + (rowH - s.checkbox) / 2;
    nodes.push(checkbox(`${id}-cb${i}`, { x: rect.x, y: cbY, w: s.checkbox, h: s.checkbox }));
    lineYs.push(rowTop + rowH);
  }
  if (rows > 0) {
    nodes.push({
      type: "lines",
      id: `${id}-lines`,
      component: "WritingLines",
      rect: { x: lineX0, y: rect.y, w: lineX1 - lineX0, h: rows * rowH },
      functional: true,
      orientation: "horizontal",
      positions: lineYs,
      from: lineX0,
      to: lineX1,
      strokePt: ctx.pattern.lineWeightPt,
      color: ctx.pattern.color,
      opacity: ctx.pattern.opacity,
    });
  }
  return {
    nodes,
    rows,
    metrics: [
      { label: "Checklist rows (floor(height ÷ row))", value: rows, unit: "count", provenance: { geometryClass: "user-design", basis: `floor(${rect.h.toFixed(3)} ÷ ${rowH})` } },
      { label: "Checklist row height", value: rowH, unit: "in", provenance: { geometryClass: "user-design", basis: "spacing token listRow (research range 0.32–0.40\")" } },
      { label: "Checkbox size", value: s.checkbox, unit: "in", provenance: { geometryClass: "user-design", basis: "spacing token checkbox (research range 0.14–0.18\")" } },
    ],
  };
}

/** Patterns a sectioned writing area can take (margin rules belong to full pages). */
export const SECTION_PATTERNS = ["ruled", "dot-grid", "graph-grid", "blank"] as const;

/**
 * A writing area filled with the project's functional pattern. This is the
 * ONE place sectioned layouts turn the writing-surface setting into nodes, so
 * Dot grid / Graph / Blank reach every supported writing area.
 */
export function writingSurface(id: string, rect: Rect, ctx: LayoutContext): LayoutNode[] {
  const kind = (SECTION_PATTERNS as readonly string[]).includes(ctx.pattern.kind) ? ctx.pattern.kind : "ruled";
  return fillWritingRegion(id, rect, { ...ctx.pattern, kind: kind as typeof ctx.pattern.kind });
}

/** Section: heading label + content (lines / checklist / pattern / blank). */
export function section(
  id: string,
  rect: Rect,
  title: string,
  ctx: LayoutContext,
  content: "surface" | "checklist" | "blank",
  opts: { boxed?: boolean; titleRole?: "sectionHeading" | "subheading" | "label" } = {},
): { nodes: LayoutNode[]; diagnostics: LayoutDiagnostic[] } {
  const s = ctx.spacing;
  const titleRole = opts.titleRole ?? "sectionHeading";
  const pad = opts.boxed ? s.boxPadding : 0;
  const inner: Rect = { x: rect.x + pad, y: rect.y + pad, w: rect.w - 2 * pad, h: rect.h - 2 * pad };
  const titleH = title ? lineBoxIn(ctx.typography, titleRole) : 0;
  const st = solveStack(inner.y, inner.h, [
    { id: "title", kind: "fixed", size: titleH },
    { id: "content", kind: "elastic", min: 0 },
  ], title ? s.boxPadding : 0);
  const nodes: LayoutNode[] = [group(id, "Section", rect)];
  if (opts.boxed) nodes.push(box(`${id}-box`, rect, { component: "Section", strokePt: STUDIO_STROKES.boxRulePt }));
  if (title) nodes.push(text(`${id}-title`, { x: inner.x, y: st.byId.title.start, w: inner.w, h: titleH }, title, titleRole, { component: "SectionHeader" }));
  const contentRect: Rect = { x: inner.x, y: st.byId.content.start, w: inner.w, h: st.byId.content.size };
  if (content === "surface") {
    nodes.push(...writingSurface(`${id}-surface`, contentRect, ctx));
  } else if (content === "checklist") {
    nodes.push(...checklistRows(`${id}-list`, contentRect, ctx).nodes);
  } else {
    nodes.push(group(`${id}-notes`, "NotesArea", contentRect));
  }
  return { nodes, diagnostics: stackDiagnostic(st, id, `Section "${title}"`) };
}

export const PLACEMENT_ALIGN: Record<LayoutPlacement, TextAlign> = {
  "top-left": "left",
  "top-right": "right",
  "top-center": "center",
};

/**
 * Month grid: 7 equal columns × N equal rows.
 *   colW = (gridW − 6 × colGap) / 7
 *   rowH = (gridH − (N − 1) × rowGap) / N
 */
export function calendarGrid(
  id: string,
  rect: Rect,
  month: CalendarMonth,
  ctx: LayoutContext,
  dateRole: "date" | "number" | "label" = "date",
): { nodes: LayoutNode[]; metrics: LayoutMetric[] } {
  const s = ctx.spacing;
  const cols = distributeEqual(rect.x, rect.w, 7, s.column);
  const rows = distributeEqual(rect.y, rect.h, month.rows, s.row);
  const dateH = lineBoxIn(ctx.typography, dateRole);
  const align = PLACEMENT_ALIGN[ctx.options.datePlacement];
  const nodes: LayoutNode[] = [group(id, "Grid", rect, { columnEdges: cols.edges, rowEdges: rows.edges })];
  month.grid.forEach((week, r) =>
    week.forEach((cell, c) => {
      const cellRect: Rect = { x: cols.starts[c], y: rows.starts[r], w: cols.size, h: rows.size };
      const cid = `${id}-r${r}c${c}`;
      nodes.push(box(cid, cellRect, { component: "CalendarCell", strokePt: STUDIO_STROKES.gridRulePt }));
      if (cell.inMonth) {
        nodes.push(
          text(
            `${cid}-date`,
            { x: cellRect.x + s.boxPadding, y: cellRect.y + s.boxPadding, w: cellRect.w - 2 * s.boxPadding, h: dateH },
            String(cell.day.day),
            dateRole,
            { component: "CalendarCell", align, vAlign: "top" },
          ),
        );
      }
    }),
  );
  const derived = { geometryClass: "user-design" as const };
  return {
    nodes,
    metrics: [
      { label: "Calendar columns", value: 7, unit: "count", provenance: { geometryClass: "studio-recommended", basis: "7 weekday columns" } },
      { label: "Calendar rows", value: month.rows, unit: "count", provenance: { geometryClass: "studio-recommended", basis: ctx.calendar?.settings.sixRowMonths ? "6-row universal grid (research 1.4)" : `natural rows for ${month.name}` } },
      { label: "Column width = (W − 6·gap) / 7", value: cols.size, unit: "in", provenance: { ...derived, basis: `(${rect.w.toFixed(3)} − 6 × ${s.column}) / 7` } },
      { label: "Row height = (H − (n−1)·gap) / n", value: rows.size, unit: "in", provenance: { ...derived, basis: `(${rect.h.toFixed(3)} − ${month.rows - 1} × ${s.row}) / ${month.rows}` } },
      { label: "Cell padding", value: s.boxPadding, unit: "in", provenance: { ...derived, basis: "spacing token boxPadding (research 0.06–0.12\")" } },
    ],
  };
}

/** Weekday labels over equal columns. */
export function weekdayHeader(id: string, rect: Rect, labels: string[], ctx: LayoutContext, role: "subheading" | "label" = "subheading"): LayoutNode[] {
  // Same column math as the grid below, so every label is centred on its solved column.
  const cols = distributeEqual(rect.x, rect.w, labels.length, ctx.spacing.column);
  return [
    group(id, "Grid", rect, { columnEdges: cols.edges }),
    ...labels.map((l, i) =>
      text(`${id}-${i}`, { x: cols.starts[i], y: rect.y, w: cols.size, h: rect.h }, l, role, { align: "center", component: "SectionHeader" }),
    ),
  ];
}

export { lineSpacingIn };
