/**
 * Composite layout builders shared by templates. Each builder receives a
 * rectangle already solved from PageGeometry and fills it mathematically.
 */
import { distributeEqual, fitCount, solveStack, type StackModule } from "../../engines/layout/math";
import { fillWritingRegion, lineSpacingIn } from "../../engines/patterns/patterns";
import { STUDIO_STROKES } from "../../presets/studioDefaults";
import { ptToIn } from "../../engines/units/units";
import type { CalendarMonth } from "../../types/calendar";
import type { Rect } from "../../types/geometry";
import type { ElementPosition, LayoutDiagnostic, LayoutMetric, LayoutNode, SemanticTextKey, TextAnchor, TextFit, TextNode } from "../../types/layout";
import type { LayoutPlacement } from "../../types/project";
import type { TextAlign, TypographyRole } from "../../types/tokens";
import { applyTransform, getLayoutMeasurer, heuristicMeasurer, styleForRole, type TextMeasurer } from "../../engines/typography/textMeasure";
import type { LayoutContext } from "./types";
import { box, checkbox, group, lineBoxIn, rule, stackDiagnostic, text } from "./nodes";

export type FrameResult = {
  header: Rect;
  body: Rect;
  footer: Rect | null;
  /** Where semantic text may be placed on this page. */
  zones: TextZones;
  nodes: LayoutNode[];
  diagnostics: LayoutDiagnostic[];
};

/**
 * Text zones of a page. `belowHeaderY` is the top of whatever sits under the
 * header (its rule, or the content), which titles keep `titleToRuleGap` from.
 */
export type TextZones = { header: Rect; footer: Rect | null; safe: Rect; belowHeaderY: number };

export const PAGE_TEXT_ANCHORS: TextAnchor[] = [
  "header-left",
  "header-center",
  "header-right",
  "above-content-left",
  "above-content-center",
  "above-content-right",
  "footer-left",
  "footer-center",
  "footer-right",
];
export const SECTION_TEXT_ANCHORS: TextAnchor[] = ["above-content-left", "above-content-center", "above-content-right"];
export const FOOTER_TEXT_ANCHORS: TextAnchor[] = ["footer-left", "footer-center", "footer-right"];

/** Anchors a semantic text element supports on a page with these zones. */
export function anchorsFor(key: SemanticTextKey, zones: Pick<TextZones, "footer">): TextAnchor[] {
  if (key === "sectionHeading") return SECTION_TEXT_ANCHORS;
  if (key === "footer") return zones.footer ? FOOTER_TEXT_ANCHORS : [];
  return zones.footer ? PAGE_TEXT_ANCHORS : PAGE_TEXT_ANCHORS.filter((a) => !a.startsWith("footer"));
}

const alignOf = (a: TextAnchor): TextAlign => (a.endsWith("left") ? "left" : a.endsWith("right") ? "right" : "center");

/**
 * Place a semantic text element (the user decides the anchor and fine
 * offsets; the system keeps it inside the print-safe area).
 *   header-*         centred in the header zone, never closer than titleToRuleGap to what is below
 *   above-content-*  sitting titleToRuleGap above the rule / content
 *   footer-*         centred in the footer zone
 * `trailingIn` reserves width after the text that moves with it (e.g. a write-in line).
 */
export function positionText(
  ctx: LayoutContext,
  key: SemanticTextKey,
  zones: TextZones,
  id: string,
  value: string,
  role: TypographyRole,
  defaultAnchor: TextAnchor,
  opts: { component?: TextNode["component"]; trailingIn?: number } = {},
): { node: TextNode; ink: Rect; anchor: TextAnchor; diagnostics: LayoutDiagnostic[] } {
  const s = ctx.spacing;
  const supported = anchorsFor(key, zones);
  const want: ElementPosition | undefined = ctx.options.textPositions?.[key];
  const diagnostics: LayoutDiagnostic[] = [];
  let anchor = want && supported.includes(want.anchor) ? want.anchor : defaultAnchor;
  if (!supported.includes(anchor)) anchor = supported[0] ?? defaultAnchor;
  if (want && want.anchor !== anchor) {
    diagnostics.push({ severity: "info", rule: "text-position", componentId: id, message: `"${value}" cannot use ${want.anchor} on this page; placed at ${anchor}.` });
  }
  const lineH = lineBoxIn(ctx.typography, role);
  const inkW = heuristicMeasurer(value, styleForRole(ctx.typography, role)) + (opts.trailingIn ?? 0);
  const inFooter = anchor.startsWith("footer") && zones.footer;
  const zone = inFooter ? zones.footer! : zones.header;
  // The zone must hold the text: a header title also keeps titleToRuleGap above what follows.
  const roomH = inFooter ? zone.h : zones.belowHeaderY - s.titleToRuleGap - zone.y;
  if (lineH > roomH + 1e-6) {
    diagnostics.push({ severity: "error", rule: "text-overflow", componentId: id, message: `"${value}" is ${lineH.toFixed(3)}" tall but its ${inFooter ? "footer" : "header"} zone holds ${Math.max(0, roomH).toFixed(3)}".`, measurement: { actualIn: lineH, limitIn: roomH } });
  }
  if (inkW > zones.safe.w + 1e-6) {
    diagnostics.push({ severity: "error", rule: "text-overflow", componentId: id, message: `"${value}" is ${inkW.toFixed(3)}" wide; the safe area is ${zones.safe.w.toFixed(3)}".`, measurement: { actualIn: inkW, limitIn: zones.safe.w } });
  }
  let y: number;
  if (inFooter) y = zone.y + (zone.h - lineH) / 2;
  else if (anchor.startsWith("above-content")) y = zones.belowHeaderY - s.titleToRuleGap - lineH;
  else y = Math.min(zone.y + (zone.h - lineH) / 2, zones.belowHeaderY - s.titleToRuleGap - lineH);
  const align = alignOf(anchor);
  let x = align === "left" ? zone.x : align === "right" ? zone.x + zone.w - inkW : zone.x + (zone.w - inkW) / 2;
  // Fine offsets, limited to the print-safe area.
  const safe = zones.safe;
  const ox = want?.offsetXIn ?? 0, oy = want?.offsetYIn ?? 0;
  const tx = Math.min(Math.max(x + ox, safe.x), safe.x + safe.w - inkW);
  const ty = Math.min(Math.max(y + oy, safe.y), safe.y + safe.h - lineH);
  if (Math.abs(tx - (x + ox)) > 1e-6 || Math.abs(ty - (y + oy)) > 1e-6) {
    diagnostics.push({ severity: "info", rule: "text-position", componentId: id, message: `"${value}" offset limited to keep it inside the print-safe area.` });
  }
  x = tx;
  y = ty;
  // The node spans to the safe edge on its open side, so real glyph widths keep the chosen alignment.
  const textW = inkW - (opts.trailingIn ?? 0);
  let rect: Rect;
  if (align === "left") rect = { x, y, w: safe.x + safe.w - x, h: lineH };
  else if (align === "right") rect = { x: safe.x, y, w: x + inkW - (opts.trailingIn ?? 0) - safe.x, h: lineH };
  else {
    const cx = x + textW / 2, half = Math.min(cx - safe.x, safe.x + safe.w - cx);
    rect = { x: cx - half, y, w: 2 * half, h: lineH };
  }
  const node: TextNode = { ...text(id, rect, value, role, { component: opts.component ?? "PageHeader", align, vAlign: "middle", semantic: key }), placement: { anchor, defaultAnchor } };
  return { node, ink: { x, y, w: inkW, h: lineH }, anchor, diagnostics };
}

/**
 * Standard page frame inside the safe area:
 *   header (fixed) · header gap · body (elastic) · footer gap · footer (fixed)
 */
export function pageFrame(
  ctx: LayoutContext,
  pageIndex: number,
  /** headerRule: false when nothing rules off the header (titles keep their gap from the content instead). */
  opts: { headerH: number; forceFooter?: boolean; headerRule?: boolean },
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

  const zones: TextZones = { header, footer, safe: g.safeRect, belowHeaderY: header.y + header.h + (opts.headerRule === false ? s.headerGap : 0) };
  const nodes: LayoutNode[] = [group(`p${pageIndex}-header`, "PageHeader", header)];
  const diagnostics = stackDiagnostic(st, `p${pageIndex}-frame`, "Header + footer");
  if (footer) {
    nodes.push(group(`p${pageIndex}-footer`, "PageFooter", footer));
    const pn = ctx.options.showPageNumbers ? String(ctx.pageNumbers[pageIndex] ?? "") : "";
    const label = [footerText, pn].filter(Boolean).join("  ·  ");
    if (label) {
      const t = positionText(ctx, "footer", zones, `p${pageIndex}-footer-text`, label, "footer", "footer-center", { component: "PageFooter" });
      nodes.push(t.node);
      diagnostics.push(...t.diagnostics);
    }
  }
  return { header, body, footer, zones, nodes, diagnostics };
}

/** Page title (a positionable semantic element) with the header rule under the header zone. */
export function headerTitle(
  id: string,
  ctx: LayoutContext,
  zones: TextZones,
  key: SemanticTextKey,
  title: string,
  role: "monthTitle" | "weekTitle" | "pageTitle" | "productTitle",
  defaultAnchor: TextAnchor,
): { nodes: LayoutNode[]; diagnostics: LayoutDiagnostic[] } {
  const h = zones.header;
  const t = positionText(ctx, key, zones, `${id}-title`, title, role, defaultAnchor);
  return {
    nodes: [t.node, rule(`${id}-rule`, h.x, h.y + h.h, h.x + h.w, h.y + h.h, { strokePt: STUDIO_STROKES.headerRulePt, component: "PageHeader" })],
    diagnostics: t.diagnostics,
  };
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


/**
 * HEADING FIT — shared by every section / sidebar heading, so user-entered
 * wording of any length fits cleanly instead of overflowing its border.
 *
 * Ordered strategy (first that fits wins; widths keep the heading inset on
 * both sides, heights stay inside the heading area):
 *   1. the role's normal size on one line
 *   2. the normal size on two balanced lines, when the area is tall enough
 *   3. 0.5 pt steps down to HEADING_MIN_PT — one line, then two, at each size
 *   4. otherwise report exactly how much the heading is too wide (never
 *      endless shrinking, never silent clipping)
 * Multi-line capitals use a tight 1.0 leading (no descenders to collide);
 * mixed case uses 1.1.
 */
export const HEADING_MIN_PT = 7;
const HEADING_STEP_PT = 0.5;

export type HeadingFit = TextFit & { ok: boolean; heightIn: number; widthIn: number; excessIn: number };

export function fitHeading(value: string, role: TypographyRole, area: { w: number; h: number }, ctx: Pick<LayoutContext, "typography">, measure: TextMeasurer = getLayoutMeasurer().measure): HeadingFit {
  const r = ctx.typography.roles[role];
  const base = styleForRole(ctx.typography, role);
  const caps = r.transform === "uppercase" || r.transform === "small-caps";
  const multiLead = caps ? 1.0 : 1.1;
  const words = value.trim().split(/\s+/).filter(Boolean);
  const minPt = Math.min(r.sizePt, HEADING_MIN_PT);
  const widthAt = (t: string, pt: number) => measure(t, { ...base, sizePt: pt });
  // The two-line split whose longer line is shortest.
  const split = (pt: number): string[] | null => {
    if (words.length < 2) return null;
    let best: string[] | null = null, bestW = Infinity;
    for (let k = 1; k < words.length; k++) {
      const a = words.slice(0, k).join(" "), b = words.slice(k).join(" ");
      const w = Math.max(widthAt(a, pt), widthAt(b, pt));
      if (w < bestW) (bestW = w), (best = [a, b]);
    }
    return best;
  };
  const tryAt = (pt: number, lines: string[], lead: number) => {
    const widthIn = Math.max(...lines.map((l) => widthAt(l, pt)));
    const heightIn = ptToIn(pt * lead) * lines.length;
    return { sizePt: pt, lineHeight: lead, lines, widthIn, heightIn, fitsW: widthIn <= area.w + 1e-9, fitsH: heightIn <= area.h + 1e-9 };
  };
  for (let pt = r.sizePt; pt >= minPt - 1e-9; pt -= HEADING_STEP_PT) {
    const one = tryAt(pt, [value], r.lineHeight);
    if (one.fitsW && one.fitsH) return { ...one, ok: true, excessIn: 0 };
    const two = split(pt);
    if (two) {
      const t = tryAt(pt, two, multiLead);
      if (t.fitsW && t.fitsH) return { ...t, ok: true, excessIn: 0 };
    }
  }
  // Nothing fits: draw at the minimum (the best split if two lines fit the height) and report the excess width.
  const two = split(minPt);
  const tTwo = two ? tryAt(minPt, two, multiLead) : null;
  const f = tTwo && tTwo.fitsH ? tTwo : tryAt(minPt, [value], r.lineHeight);
  return { ...f, ok: false, excessIn: Math.max(0, f.widthIn - area.w) };
}

/** The layout diagnostic for a heading that cannot fit (page + element come with the issue). */
export function headingFitDiagnostic(id: string, kind: string, value: string, role: TypographyRole, area: { w: number; h: number }, f: HeadingFit, ctx: Pick<LayoutContext, "typography">): LayoutDiagnostic {
  const shown = applyTransform(value, ctx.typography.roles[role].transform);
  const byW = f.excessIn > 0;
  return {
    severity: "error",
    rule: "heading-fit",
    componentId: id,
    message: byW
      ? `${kind} heading "${shown}" exceeds the available heading width by ${f.excessIn.toFixed(2)}" (${f.widthIn.toFixed(2)}" needed, ${area.w.toFixed(2)}" available) even at the ${f.sizePt} pt minimum${f.lines.length > 1 ? " on two lines" : ""}. Shorten the wording.`
      : `${kind} heading "${shown}" needs ${f.heightIn.toFixed(2)}" of height but its heading area is ${area.h.toFixed(2)}" at the ${f.sizePt} pt minimum. Shorten the wording.`,
    measurement: byW ? { actualIn: f.widthIn, limitIn: area.w } : { actualIn: f.heightIn, limitIn: area.h },
  };
}

/** Section: heading label + content (lines / checklist / pattern / blank). */
export function section(
  id: string,
  rect: Rect,
  title: string,
  ctx: LayoutContext,
  content: "surface" | "checklist" | "blank",
  /**
   * boxed  — the section draws its own border (a free-standing card).
   * padded — inset like a boxed section but WITHOUT a border, for sections
   *          that live inside a connected grid whose rules are drawn once by
   *          the grid itself.
   */
  opts: { boxed?: boolean; padded?: boolean; titleRole?: "sectionHeading" | "subheading" | "label"; semantic?: "sectionHeading"; headingKind?: string } = {},
): { nodes: LayoutNode[]; diagnostics: LayoutDiagnostic[] } {
  const s = ctx.spacing;
  const titleRole = opts.titleRole ?? "sectionHeading";
  // Content keeps box padding; the heading keeps its own (larger) inset from the section's edges.
  const pad = opts.boxed || opts.padded ? s.boxPadding : 0;
  const hin = opts.boxed || opts.padded ? s.sectionHeadingInset : 0;
  const inner: Rect = { x: rect.x + pad, y: rect.y + pad, w: rect.w - 2 * pad, h: rect.h - 2 * pad };
  const headRect: Rect = { x: rect.x + hin, y: rect.y + hin, w: rect.w - 2 * hin, h: rect.h - 2 * hin };
  // Headings fit their width (one line, two lines, then down to HEADING_MIN_PT); two lines take room from the content.
  const headArea = { w: headRect.w, h: 2 * lineBoxIn(ctx.typography, titleRole) };
  const fitted = title ? fitHeading(title, titleRole, headArea, ctx) : null;
  const titleH = fitted ? fitted.heightIn : 0;
  const top = title ? headRect.y : inner.y;
  const st = solveStack(top, rect.y + rect.h - pad - top, [
    { id: "title", kind: "fixed", size: titleH },
    { id: "content", kind: "elastic", min: 0 },
  ], title ? s.headingToContentGap : 0);
  const nodes: LayoutNode[] = [group(id, "Section", rect)];
  const diagnostics: LayoutDiagnostic[] = [];
  if (opts.boxed) nodes.push(box(`${id}-box`, rect, { component: "Section", strokePt: STUDIO_STROKES.boxRulePt }));
  if (title) {
    let tRect: Rect = { x: headRect.x, y: st.byId.title.start, w: headRect.w, h: titleH };
    let align: TextAlign | undefined;
    if (opts.semantic) {
      // User-positionable heading: alignment within the section + offsets kept inside the section.
      const want = ctx.options.textPositions?.[opts.semantic];
      const anchor = want && SECTION_TEXT_ANCHORS.includes(want.anchor) ? want.anchor : "above-content-left";
      align = alignOf(anchor);
      const inkW = Math.min(headRect.w, fitted!.widthIn);
      const baseX = align === "left" ? headRect.x : align === "right" ? headRect.x + headRect.w - inkW : headRect.x + (headRect.w - inkW) / 2;
      const x = Math.min(Math.max(baseX + (want?.offsetXIn ?? 0), headRect.x), headRect.x + headRect.w - inkW);
      const y = Math.min(Math.max(tRect.y + (want?.offsetYIn ?? 0), headRect.y), st.byId.content.start - titleH);
      if (want && (Math.abs(x - baseX - want.offsetXIn) > 1e-6 || Math.abs(y - tRect.y - want.offsetYIn) > 1e-6)) {
        diagnostics.push({ severity: "info", rule: "text-position", componentId: `${id}-title`, message: `"${title}" offset limited to keep it inside its section.` });
      }
      tRect = align === "left" ? { x, y, w: headRect.x + headRect.w - x, h: titleH } : align === "right" ? { x: headRect.x, y, w: x + inkW - headRect.x, h: titleH } : { x: x + inkW / 2 - Math.min(x + inkW / 2 - headRect.x, headRect.x + headRect.w - x - inkW / 2), y, w: 2 * Math.min(x + inkW / 2 - headRect.x, headRect.x + headRect.w - x - inkW / 2), h: titleH };
    }
    const t = text(`${id}-title`, tRect, title, titleRole, { component: "SectionHeader", align, semantic: opts.semantic });
    if (fitted && (fitted.lines.length > 1 || fitted.sizePt !== ctx.typography.roles[titleRole].sizePt || !fitted.ok)) t.fit = { sizePt: fitted.sizePt, lineHeight: fitted.lineHeight, lines: fitted.lines, ...(fitted.ok ? {} : { failed: true }) };
    if (fitted && !fitted.ok) diagnostics.push(headingFitDiagnostic(t.id, opts.headingKind ?? "Section", title, titleRole, headArea, fitted, ctx));
    if (opts.semantic) {
      const want = ctx.options.textPositions?.[opts.semantic];
      t.placement = { anchor: want && SECTION_TEXT_ANCHORS.includes(want.anchor) ? want.anchor : "above-content-left", defaultAnchor: "above-content-left" };
    }
    nodes.push(t);
  }
  const contentRect: Rect = { x: inner.x, y: st.byId.content.start, w: inner.w, h: st.byId.content.size };
  if (content === "surface") {
    nodes.push(...writingSurface(`${id}-surface`, contentRect, ctx));
  } else if (content === "checklist") {
    nodes.push(...checklistRows(`${id}-list`, contentRect, ctx).nodes);
  } else {
    nodes.push(group(`${id}-notes`, "NotesArea", contentRect));
  }
  return { nodes, diagnostics: [...diagnostics, ...stackDiagnostic(st, id, `Section "${title}"`)] };
}

export const PLACEMENT_ALIGN: Record<LayoutPlacement, TextAlign> = {
  "top-left": "left",
  "top-right": "right",
  "top-center": "center",
};

/**
 * Traditional month grids are ONE continuous connected grid: adjacent cells
 * share borders, with zero internal gap in both directions.
 */
export const CALENDAR_GRID_GAP_IN = 0;

/**
 * Month grid: 7 equal columns × N equal rows, contiguous.
 *   colW = W / 7    rowH = H / N     (internal gap = CALENDAR_GRID_GAP_IN = 0)
 * Cells are geometry-only regions (CalendarCell groups). The grid is stroked
 * once — outer border + shared interior rules — so no border is ever doubled
 * and no cell reads as an individual card.
 */
export function calendarGrid(
  id: string,
  rect: Rect,
  month: CalendarMonth,
  ctx: LayoutContext,
  dateRole: "date" | "number" | "label" = "date",
): { nodes: LayoutNode[]; metrics: LayoutMetric[] } {
  const s = ctx.spacing;
  const cols = distributeEqual(rect.x, rect.w, 7, CALENDAR_GRID_GAP_IN);
  const rows = distributeEqual(rect.y, rect.h, month.rows, CALENDAR_GRID_GAP_IN);
  const dateH = lineBoxIn(ctx.typography, dateRole);
  const align = PLACEMENT_ALIGN[ctx.options.datePlacement];
  const strokePt = STUDIO_STROKES.gridRulePt;
  const nodes: LayoutNode[] = [
    group(id, "Grid", rect, { columnEdges: cols.edges, rowEdges: rows.edges }),
    box(`${id}-border`, rect, { component: "Grid", strokePt }),
  ];
  // Shared interior rules: one line per boundary between adjacent columns / rows.
  for (let c = 1; c < 7; c++) {
    const x = cols.starts[c];
    nodes.push(rule(`${id}-v${c}`, x, rect.y, x, rect.y + rect.h, { strokePt, component: "Grid" }));
  }
  for (let r = 1; r < month.rows; r++) {
    const y = rows.starts[r];
    nodes.push(rule(`${id}-h${r}`, rect.x, y, rect.x + rect.w, y, { strokePt, component: "Grid" }));
  }
  month.grid.forEach((week, r) =>
    week.forEach((cell, c) => {
      const cellRect: Rect = { x: cols.starts[c], y: rows.starts[r], w: cols.size, h: rows.size };
      const cid = `${id}-r${r}c${c}`;
      nodes.push(group(cid, "CalendarCell", cellRect));
      if (cell.inMonth) {
        nodes.push(
          text(
            `${cid}-date`,
            { x: cellRect.x + s.dateToCellInset, y: cellRect.y + s.dateToCellInset, w: cellRect.w - 2 * s.dateToCellInset, h: dateH },
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
      { label: "Column width = W / 7 (connected grid)", value: cols.size, unit: "in", provenance: { ...derived, basis: `${rect.w.toFixed(3)} / 7, zero internal gap` } },
      { label: "Row height = H / n (connected grid)", value: rows.size, unit: "in", provenance: { ...derived, basis: `${rect.h.toFixed(3)} / ${month.rows}, zero internal gap` } },
      { label: "Date inset", value: s.dateToCellInset, unit: "in", provenance: { ...derived, basis: "spacing token dateToCellInset (research box padding 0.06–0.12\")" } },
    ],
  };
}

/**
 * Planner grids (weekly spreads and any other multi-slot planner page) follow
 * the same connected-grid rule as month grids: zero gap between tracks.
 */
export const PLANNER_GRID_GAP_IN = CALENDAR_GRID_GAP_IN;

/**
 * N equal contiguous tracks (columns or rows) stroked ONCE: an outer border
 * plus one shared rule per boundary between neighbouring tracks. Content
 * placed in the tracks must not draw its own border.
 */
export function connectedTracks(
  id: string,
  rect: Rect,
  count: number,
  axis: "columns" | "rows",
  strokePt: number = STUDIO_STROKES.gridRulePt,
): { tracks: ReturnType<typeof distributeEqual>; trackRects: Rect[]; nodes: LayoutNode[] } {
  const cols = axis === "columns";
  const tracks = distributeEqual(cols ? rect.x : rect.y, cols ? rect.w : rect.h, count, PLANNER_GRID_GAP_IN);
  const trackRects = tracks.starts.map((t): Rect => (cols ? { x: t, y: rect.y, w: tracks.size, h: rect.h } : { x: rect.x, y: t, w: rect.w, h: tracks.size }));
  const nodes: LayoutNode[] = [
    group(id, "Grid", rect, cols ? { columnEdges: tracks.edges } : { rowEdges: tracks.edges }),
    box(`${id}-border`, rect, { component: "Grid", strokePt }),
  ];
  for (let i = 1; i < count; i++) {
    const t = tracks.starts[i];
    nodes.push(
      cols
        ? rule(`${id}-v${i}`, t, rect.y, t, rect.y + rect.h, { strokePt, component: "Grid" })
        : rule(`${id}-h${i}`, rect.x, t, rect.x + rect.w, t, { strokePt, component: "Grid" }),
    );
  }
  return { tracks, trackRects, nodes };
}

/**
 * Connected 2-D planner grid (columns × rows), zero gap in both directions:
 * one outer border + one shared rule per interior column and row boundary.
 * Cells are geometry only — callers must not stroke them.
 */
export function connectedGrid(
  id: string,
  rect: Rect,
  columns: number,
  rows: number,
  strokePt: number = STUDIO_STROKES.gridRulePt,
): { cols: ReturnType<typeof distributeEqual>; rows: ReturnType<typeof distributeEqual>; nodes: LayoutNode[] } {
  const c = connectedTracks(id, rect, columns, "columns", strokePt);
  const r = distributeEqual(rect.y, rect.h, rows, PLANNER_GRID_GAP_IN);
  const grid = c.nodes[0];
  if (grid.type === "group") grid.rowEdges = r.edges;
  const nodes = [...c.nodes];
  for (let i = 1; i < rows; i++) nodes.push(rule(`${id}-h${i}`, rect.x, r.starts[i], rect.x + rect.w, r.starts[i], { strokePt, component: "Grid" }));
  return { cols: c.tracks, rows: r, nodes };
}

/** Group consecutive indices where `pred` holds into [first, last] runs. */
export function runsOf(count: number, pred: (i: number) => boolean): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    if (!pred(i)) continue;
    if (runs.length && runs[runs.length - 1][1] === i - 1) runs[runs.length - 1][1] = i;
    else runs.push([i, i]);
  }
  return runs;
}

/** Weekday labels over equal columns. */
export function weekdayHeader(
  id: string,
  rect: Rect,
  labels: string[],
  ctx: LayoutContext,
  role: "subheading" | "label" = "subheading",
  gap: number = ctx.spacing.column,
): LayoutNode[] {
  // Same column math as the grid below (pass the grid's gap), so every label
  // is centred on exactly its solved column.
  const cols = distributeEqual(rect.x, rect.w, labels.length, gap);
  // Centred in the header row, but never closer than labelToBorderInset to the grid below it.
  const lineH = lineBoxIn(ctx.typography, role);
  const y = Math.min(rect.y + (rect.h - lineH) / 2, rect.y + rect.h - ctx.spacing.labelToBorderInset - lineH);
  return [
    group(id, "Grid", rect, { columnEdges: cols.edges }),
    ...labels.map((l, i) =>
      text(`${id}-${i}`, { x: cols.starts[i], y, w: cols.size, h: lineH }, l, role, { align: "center", component: "SectionHeader" }),
    ),
  ];
}

export { lineSpacingIn };
