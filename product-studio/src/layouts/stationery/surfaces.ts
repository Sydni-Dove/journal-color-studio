/**
 * WRITING SURFACES — one renderer per surface kind, shared by every
 * stationery recipe. A recipe asks for a surface by name; it never draws one.
 *
 * Surfaces read the project's writing-line style (ruling, weight, color
 * token) and structural strokes; colors stay tokens resolved by the theme.
 * No surface adds a dot grid on its own.
 */
import { fillWritingRegion } from "../../engines/patterns/patterns";
import { tableRows, resolveColumns } from "../../engines/stationery/geometry";
import { STUDIO_STROKES } from "../../presets/studioDefaults";
import type { Rect } from "../../types/geometry";
import type { LayoutDiagnostic, LayoutMetric, LayoutNode } from "../../types/layout";
import type { StationeryZone, SurfaceKind } from "../../types/stationery";
import { getLayoutMeasurer, styleForRole } from "../../engines/typography/textMeasure";
import { checklistRows, fitHeading, HEADING_MIN_PT } from "../shared/components";
import { box, group, lineBoxIn, rule, text } from "../shared/nodes";
import type { LayoutContext } from "../shared/types";

export type SurfaceResult = { nodes: LayoutNode[]; diagnostics: LayoutDiagnostic[]; metrics: LayoutMetric[] };
type SurfaceRenderer = (id: string, rect: Rect, zone: StationeryZone, ctx: LayoutContext) => SurfaceResult;

const empty = (nodes: LayoutNode[]): SurfaceResult => ({ nodes, diagnostics: [], metrics: [] });

/** Ruled writing lines at the project's ruling (lined surfaces are always ruled, whatever the notebook pattern). */
function lined(id: string, rect: Rect, ctx: LayoutContext): LayoutNode[] {
  const kind = ctx.pattern.kind === "blank" ? "blank" : "ruled";
  return [group(id, "NotesArea", rect), ...fillWritingRegion(`${id}-lines`, rect, { ...ctx.pattern, kind })];
}

const measureW = (ctx: LayoutContext, value: string, role: "label" | "prompt" | "sectionHeading") => getLayoutMeasurer().measure(value, styleForRole(ctx.typography, role));

/** Table writing row: the list-row token (research range 0.32–0.40″). */
export const tableRowIn = (ctx: Pick<LayoutContext, "spacing">) => ctx.spacing.listRow;
/** Fill-in row (Date ____ Day ____): one label line plus breathing room. */
export const fillInIn = (ctx: Pick<LayoutContext, "typography" | "spacing">) => lineBoxIn(ctx.typography, "label") + 2 * ctx.spacing.labelToBorderInset;
/**
 * Smallest width a table column may take: its heading at the studio's minimum
 * heading size (headings shrink / wrap like every other heading), plus the
 * label inset on both sides. The longest word decides (headings may take two lines).
 */
export const columnMinIn = (ctx: LayoutContext, label: string) => {
  const st = { ...styleForRole(ctx.typography, "label"), sizePt: HEADING_MIN_PT };
  const widest = Math.max(...label.split(/\s+/).map((w) => getLayoutMeasurer().measure(w, st)));
  return widest + 2 * ctx.spacing.labelToBorderInset;
};

function table(id: string, rect: Rect, zone: StationeryZone, ctx: LayoutContext): SurfaceResult {
  const spec = zone.table!;
  const inset = ctx.spacing.labelToBorderInset;
  // Geometry first (column widths from the research proportions), then the headings fitted to those widths.
  const cols = resolveColumns(spec.columns, rect.x, rect.w, (c) => columnMinIn(ctx, c.label));
  const labelLine = lineBoxIn(ctx.typography, "label");
  const heads = cols.columns.map((c) => fitHeading(c.column.label, "label", { w: Math.max(0, c.w - 2 * inset), h: 2 * labelLine }, ctx));
  const headerH = Math.max(labelLine, ...heads.map((f) => f.heightIn)) + 2 * inset;
  const rowH = tableRowIn(ctx);
  const rows = tableRows(rect.h, headerH, rowH);
  const h = headerH + rows * rowH;
  const t: Rect = { x: rect.x, y: rect.y, w: rect.w, h };
  const stroke = STUDIO_STROKES.gridRulePt;
  const rowEdges = [t.y, ...Array.from({ length: rows + 1 }, (_, i) => t.y + headerH + i * rowH)];
  const nodes: LayoutNode[] = [
    group(id, "Grid", t, { columnEdges: [...cols.columns.map((c) => c.x), t.x + t.w], rowEdges }),
    box(`${id}-border`, t, { component: "Grid", strokePt: stroke }),
  ];
  cols.columns.forEach((c, i) => {
    if (i > 0) nodes.push(rule(`${id}-v${i}`, c.x, t.y, c.x, t.y + h, { strokePt: stroke, component: "Grid" }));
    const f = heads[i];
    const head = text(`${id}-h-${c.column.key}`, { x: c.x + inset, y: t.y + inset, w: c.w - 2 * inset, h: headerH - 2 * inset }, c.column.label, "label", { component: "SectionHeader", vAlign: "middle" });
    if (f.lines.length > 1 || f.sizePt !== ctx.typography.roles.label.sizePt) head.fit = { sizePt: f.sizePt, lineHeight: f.lineHeight, lines: f.lines, ...(f.ok ? {} : { failed: true }) };
    nodes.push(head);
  });
  // Header rule, then one rule under every writing row.
  for (let i = 0; i < rows; i++) {
    const y = t.y + headerH + i * rowH;
    nodes.push(rule(`${id}-r${i}`, t.x, y, t.x + t.w, y, { strokePt: i === 0 ? STUDIO_STROKES.headerRulePt : stroke, component: "Grid" }));
  }
  const diagnostics: LayoutDiagnostic[] = cols.problems.map((message) => ({ severity: "error", rule: "stationery-fit", componentId: id, message }));
  if (rows < 1) diagnostics.push({ severity: "error", rule: "stationery-fit", componentId: id, message: "No room for a single table row." });
  const metrics: LayoutMetric[] = [
    { label: "Table rows (floor((height − header) ÷ row))", value: rows, unit: "count", provenance: { geometryClass: "user-design", basis: `row ${rowH.toFixed(3)}" (list-row token)` } },
    { label: "Column scale (usable width ÷ research widths)", value: cols.scale, unit: "count", provenance: { geometryClass: "user-design", basis: spec.basis } },
    ...cols.columns.map((c): LayoutMetric => ({ label: `Column "${c.column.label}" (research ${c.column.referenceWidthIn.toFixed(2)}")`, value: c.w, unit: "in", provenance: { geometryClass: "user-design", basis: spec.basis } })),
  ];
  return { nodes, diagnostics, metrics };
}

function fillIn(id: string, rect: Rect, zone: StationeryZone, ctx: LayoutContext): SurfaceResult {
  const fields = zone.fields?.length ? zone.fields : [zone.label];
  const gap = ctx.spacing.column + ctx.spacing.block;
  const w = (rect.w - gap * (fields.length - 1)) / fields.length;
  const nodes: LayoutNode[] = [group(id, "Section", rect)];
  fields.forEach((f, i) => {
    const x = rect.x + i * (w + gap);
    const lw = Math.min(w * 0.5, measureW(ctx, f, "label"));
    nodes.push(text(`${id}-f${i}-label`, { x, y: rect.y, w: lw, h: rect.h }, f, "label", { component: "SectionHeader", vAlign: "bottom" }));
    const lx = x + lw + ctx.spacing.checkboxGap;
    nodes.push(rule(`${id}-f${i}-line`, lx, rect.y + rect.h, x + w, rect.y + rect.h, { strokePt: ctx.pattern.lineWeightPt, component: "WritingLines" }));
  });
  return empty(nodes);
}

function scripture(id: string, rect: Rect, z: StationeryZone, ctx: LayoutContext): SurfaceResult {
  const treatment = z.treatment ?? "framed";
  if (treatment === "open") return empty(lined(id, rect, ctx));
  if (treatment === "callout") {
    // One hairline quote bar in the quiet writing-line color; the lines start a padding in from it.
    const p = ctx.spacing.boxPadding;
    const lines = lined(id, { x: rect.x + p, y: rect.y, w: rect.w - p, h: rect.h }, ctx);
    const ys = lines.flatMap((n) => (n.type === "lines" ? n.positions : []));
    // The bar spans the writing lines: from three quarters of a line above the first line to the last line.
    const pitch = ys.length > 1 ? ys[1] - ys[0] : rect.h;
    const top = ys.length ? Math.min(...ys) - pitch * 0.75 : rect.y;
    const bottom = ys.length ? Math.max(...ys) : rect.y + rect.h;
    return empty([...lines, rule(`${id}-callout`, rect.x, Math.max(rect.y, top), rect.x, bottom, { strokePt: ctx.pattern.lineWeightPt, color: ctx.pattern.color, component: "WritingLines" })]);
  }
  // A framed passage area: the verse is copied inside the frame, on its own ruled lines.
  const p = ctx.spacing.boxPadding;
  const inner = { x: rect.x + p, y: rect.y + p, w: rect.w - 2 * p, h: rect.h - 2 * p };
  return empty([box(`${id}-frame`, rect, { component: "Section", strokePt: STUDIO_STROKES.boxRulePt }), ...lined(id, inner, ctx)]);
}

/** The renderer for each surface kind (independent of any recipe). */
export const SURFACES: Record<SurfaceKind, SurfaceRenderer> = {
  blank: (id, rect) => empty([group(id, "NotesArea", rect)]),
  lined: (id, rect, _z, ctx) => empty(lined(id, rect, ctx)),
  "prompt-response": (id, rect, _z, ctx) => empty(lined(id, rect, ctx)),
  reflection: (id, rect, _z, ctx) => empty(lined(id, rect, ctx)),
  prayer: (id, rect, _z, ctx) => empty(lined(id, rect, ctx)),
  scripture,
  checkbox: (id, rect, _z, ctx) => empty(checklistRows(id, rect, ctx).nodes),
  "fill-in": fillIn,
  table,
};
