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
import { TABLE_MAX_STRETCH } from "../../types/prompts";
import { getLayoutMeasurer, styleForRole } from "../../engines/typography/textMeasure";
import { checklistRows, fitHeading, HEADING_MIN_PT, writingSurface } from "../shared/components";
import { box, group, lineBoxIn, rule, text } from "../shared/nodes";
import type { LayoutContext } from "../shared/types";
import { drawList, drawRecords } from "./flowSurfaces";

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
/** The shortest blank worth writing on after a label (a date, a short status). */
export const MIN_BLANK_IN = 0.9;

/**
 * How an info row's blanks sit at this width: as many per row as keep every
 * label whole and every blank at least MIN_BLANK_IN; the rest wrap to another
 * row (never squeezed, never overlapping).
 */
export function fillInRows(fields: string[], width: number, ctx: LayoutContext): { perRow: number; rows: number; heightIn: number } {
  const gap = ctx.spacing.column + ctx.spacing.block;
  const need = (f: string) => measureW(ctx, f, "label") + ctx.spacing.checkboxGap + MIN_BLANK_IN;
  const n = Math.max(1, fields.length);
  let perRow = n;
  while (perRow > 1) {
    const w = (width - gap * (perRow - 1)) / perRow;
    if (fields.every((f) => need(f) <= w + 1e-6)) break;
    perRow--;
  }
  const rows = Math.ceil(n / perRow);
  return { perRow, rows, heightIn: rows * fillInIn(ctx) + (rows - 1) * ctx.spacing.block };
}
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

/** A table's column headings at this width, and the header row's height (0 when the header is hidden). */
function tableHead(spec: NonNullable<StationeryZone["table"]>, rect: Pick<Rect, "x" | "w">, ctx: LayoutContext) {
  const inset = ctx.spacing.labelToBorderInset;
  // Geometry first (column widths from the research proportions), then the headings fitted to those widths.
  // A numbered table's "No." column is never narrower than the widest number it prints (drawn in the label role).
  const numberMin = spec.numbers ? getLayoutMeasurer().measure(spec.numbers.widest, styleForRole(ctx.typography, "label")) + 2 * inset : 0;
  const cols = resolveColumns(spec.columns, rect.x, rect.w, (c) => (spec.numbers && c.key === "no" ? Math.max(columnMinIn(ctx, c.label), numberMin) : columnMinIn(ctx, c.label)));
  const labelLine = lineBoxIn(ctx.typography, "label");
  const heads = cols.columns.map((c) => fitHeading(c.column.label, "label", { w: Math.max(0, c.w - 2 * inset), h: (spec.headerLines ?? 2) * labelLine }, ctx, undefined, spec.headerLines ?? 2));
  const headerH = spec.showHeader !== false ? Math.max(labelLine, ...heads.map((f) => f.heightIn), spec.headerFull ? (spec.headerLines ?? 2) * labelLine : 0) + 2 * inset : 0;
  return { cols, heads, headerH };
}

/** The header row a table surface draws above its rows (so a requested number of rows can be reserved exactly). */
export const tableHeaderIn = (zone: StationeryZone, width: number, ctx: LayoutContext) => (zone.table ? tableHead(zone.table, { x: 0, w: width }, ctx).headerH : 0);

function table(id: string, rect: Rect, zone: StationeryZone, ctx: LayoutContext): SurfaceResult {
  const spec = zone.table!;
  const inset = ctx.spacing.labelToBorderInset;
  const { cols, heads, headerH } = tableHead(spec, rect, ctx);
  const showHeader = spec.showHeader !== false;
  const baseRow = tableRowIn(ctx) * (spec.rowScale ?? 1);
  let rowH = baseRow;
  let rows: number;
  if (zone.lines !== undefined) rows = Math.max(1, Math.min(Math.round(zone.lines), tableRows(rect.h, headerH, rowH)));
  else if (spec.minRows) {
    // Fill the space: the chosen rows stretch evenly; past TABLE_MAX_STRETCH × their height, more rows keep them comfortable.
    const room = Math.max(0, rect.h - headerH);
    const most = tableRows(rect.h, headerH, baseRow);
    rows = Math.min(most, Math.max(spec.minRows, Math.ceil(room / (TABLE_MAX_STRETCH * baseRow) - 1e-6)));
    rowH = rows > 0 ? room / rows : baseRow;
  } else rows = tableRows(rect.h, headerH, rowH);
  const h = headerH + rows * rowH;
  const t: Rect = { x: rect.x, y: rect.y, w: rect.w, h };
  const stroke = STUDIO_STROKES.gridRulePt;
  const rowEdges = [t.y, ...Array.from({ length: rows + 1 }, (_, i) => t.y + headerH + i * rowH)];
  const borderStyle = spec.borders ?? "grid";
  const nodes: LayoutNode[] = [
    group(id, "Grid", t, { columnEdges: [...cols.columns.map((c) => c.x), t.x + t.w], rowEdges }),
  ];
  if (borderStyle === "grid" || borderStyle === "minimal") nodes.push(box(`${id}-border`, t, { component: "Grid", strokePt: stroke }));
  cols.columns.forEach((c, i) => {
    if (i > 0 && borderStyle === "grid") nodes.push(rule(`${id}-v${i}`, c.x, t.y, c.x, t.y + h, { strokePt: stroke, component: "Grid" }));
    if (showHeader) {
      const f = heads[i];
      const head = text(`${id}-h-${c.column.key}`, { x: c.x + inset, y: t.y + inset, w: c.w - 2 * inset, h: headerH - 2 * inset }, c.column.label, "label", { component: "SectionHeader", vAlign: "middle" });
      if (f.lines.length > 1 || f.sizePt !== ctx.typography.roles.label.sizePt) head.fit = { sizePt: f.sizePt, lineHeight: f.lineHeight, lines: f.lines, ...(f.ok ? {} : { failed: true }) };
      nodes.push(head);
    }
  });
  // Header rule, then one rule under every writing row.
  if (showHeader && borderStyle !== "none") {
    const y = t.y + headerH;
    nodes.push(rule(`${id}-header-rule`, t.x, y, t.x + t.w, y, { strokePt: STUDIO_STROKES.headerRulePt, component: "Grid" }));
  }
  if (borderStyle !== "none") {
    for (let i = 1; i <= rows; i++) {
      const y = t.y + headerH + i * rowH;
      nodes.push(rule(`${id}-r${i}`, t.x, y, t.x + t.w, y, { strokePt: stroke, component: "Grid" }));
    }
  }
  // Numbered rows: the first column counts on from this instance's start (a continued piece from its first row).
  const numberCol = spec.numbers ? cols.columns.find((c) => c.column.key === "no") : undefined;
  if (spec.numbers && numberCol) {
    const first = spec.numbers.start + (zone.range?.from ?? 0);
    for (let i = 0; i < rows; i++) {
      const y = t.y + headerH + i * rowH;
      nodes.push(text(`${id}-n${first + i}`, { x: numberCol.x + inset, y, w: Math.max(0, numberCol.w - 2 * inset), h: rowH }, String(first + i), "label", { component: "Text", vAlign: "middle", align: "center" }));
    }
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
  const { perRow } = fillInRows(fields, rect.w, ctx);
  const rowH = fillInIn(ctx);
  const w = (rect.w - gap * (perRow - 1)) / perRow;
  const nodes: LayoutNode[] = [group(id, "Section", rect)];
  fields.forEach((f, i) => {
    const x = rect.x + (i % perRow) * (w + gap);
    const y = rect.y + Math.floor(i / perRow) * (rowH + ctx.spacing.block);
    const lw = Math.min(w * 0.5, measureW(ctx, f, "label"));
    nodes.push(text(`${id}-f${i}-label`, { x, y, w: lw, h: rowH }, f, "label", { component: "SectionHeader", vAlign: "bottom" }));
    const lx = x + lw + ctx.spacing.checkboxGap;
    if (zone.fieldStyles?.[i] === "box") {
      // An open box to write in, the height of the row, after the label.
      const inset = ctx.spacing.labelToBorderInset / 2;
      nodes.push(box(`${id}-f${i}-box`, { x: lx, y: y + inset, w: x + w - lx, h: rowH - inset }, { component: "WritingLines", stroke: ctx.pattern.color, strokePt: ctx.pattern.lineWeightPt, radiusIn: 0.04 }));
    } else {
      nodes.push(rule(`${id}-f${i}-line`, lx, y + rowH, x + w, y + rowH, { strokePt: ctx.pattern.lineWeightPt, component: "WritingLines" }));
    }
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
  checkbox: (id, rect, z, ctx) => empty(checklistRows(id, rect, ctx, undefined, { marker: z.taskMarker, markerPosition: z.taskMarkerPosition, lines: z.taskLines }).nodes),
  "fill-in": fillIn,
  table,
  "dot-grid": (id, rect, _z, ctx) => empty([group(id, "NotesArea", rect), ...fillWritingRegion(`${id}-dots`, rect, { ...ctx.pattern, kind: "dot-grid", gridPreset: ctx.pattern.kind === "dot-grid" ? ctx.pattern.gridPreset : "dot-5mm" })]),
  "graph-grid": (id, rect, _z, ctx) => empty([group(id, "NotesArea", rect), ...fillWritingRegion(`${id}-grid`, rect, { ...ctx.pattern, kind: "graph-grid", gridPreset: ctx.pattern.kind === "graph-grid" ? ctx.pattern.gridPreset : "graph-5mm" })]),
  pattern: (id, rect, _z, ctx) => empty([group(id, "NotesArea", rect), ...writingSurface(`${id}-lines`, rect, ctx)]),
  // A thin rule across the section's width, centred in its band.
  divider: (id, rect, _z, ctx) => empty([group(id, "Section", rect), rule(`${id}-rule`, rect.x, rect.y + rect.h / 2, rect.x + rect.w, rect.y + rect.h / 2, { strokePt: Math.max(0.5, ctx.pattern.lineWeightPt), component: "Section" })]),
  spacer: (id, rect) => empty([group(id, "Section", rect)]),
  // Sequences of whole units that may continue across pages (layouts/stationery/flowSurfaces.ts).
  list: (id, rect, z, ctx) => empty(drawList(id, rect, z, ctx)),
  record: (id, rect, z, ctx) => empty(drawRecords(id, rect, z, ctx)),
};

/** Surfaces with a fixed height instead of writing space: fill-in rows, dividers and spacers. */
export const isFixedSurface = (s: SurfaceKind) => s === "fill-in" || s === "divider" || s === "spacer";
