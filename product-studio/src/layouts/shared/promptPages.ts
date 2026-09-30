/**
 * PROMPT + RESPONSE PAGES — the one page solver behind every page made of
 * "prompt, then room to answer": guided pages (Meeting With God, vision,
 * goals, reviews, prayer, custom…) and stationery recipes (Daily Reflection,
 * SOAP, Verse Mapping, worksheets).
 *
 *   content (PromptSet / recipe zones)  →  measured headings (typography)
 *   →  paginateZones + resolveZones (engines/stationery/geometry: pure math)
 *   →  one surface renderer per zone (layouts/stationery/surfaces)
 *
 * The creator chooses the content; this decides whether it fits. When it
 * doesn't, the prompts continue on another page — writing lines are never
 * squeezed below the page's line spacing.
 */
import { DEFAULT_FUNCTIONAL_PATTERN, lineSpacingIn } from "../../engines/patterns/patterns";
import { paginateZones, resolveZones, type ZoneRequest } from "../../engines/stationery/geometry";
import { getLayoutMeasurer, styleForRole } from "../../engines/typography/textMeasure";
import { STUDIO_PLANNER } from "../../presets/studioDefaults";
import { DEFAULT_WORDING } from "../../presets/wording";
import type { Rect } from "../../types/geometry";
import type { LayoutDiagnostic, LayoutMetric, LayoutNode, SolvedPage, TextNode } from "../../types/layout";
import { minZoneHeight } from "../../engines/stationery/geometry";
import { canSitBeside, frameOf as sectionFrameOf, isComposedHeader, kindOf, requestedLines, TABLE_ROW_SCALE, spaceOf, SPACER_HEIGHTS, SPACING_FACTOR, type GuidedHeader, type PromptBlock, type PromptSet, type ResponseStyle, type SectionFrame } from "../../types/prompts";
import type { StationeryZone, SurfaceKind } from "../../types/stationery";
import { fillInIn, fillInRows, isFixedSurface, SURFACES, tableHeaderIn } from "../stationery/surfaces";
import { fitHeading, headerTitle, pageFrame } from "./components";
import { box, group, lineBoxIn, rule, text } from "./nodes";
import type { FitContext, LayoutContext } from "./types";

export type ZonePageSpec = {
  /** Node id prefix ("st", "gp"). */
  idPrefix: string;
  /** Page title ("" = no header). Continuation pages repeat it. */
  title: string;
  /** Text at the right of the header (e.g. the period, "January 2027"). */
  headerRight?: string;
  /** Instructions under the header (first page only). */
  instructions?: string;
  /** A designed header above the sections (first page only): step label and number, subtitle, reference, rule. */
  intro?: GuidedHeader;
  /** What the sections are called in messages ("prompt" — default — or "section"). */
  noun?: "prompt" | "section";
  /** Every zone of this page instance, in order (split across pages when they don't fit). */
  zones: StationeryZone[];
  /** Gap between sections (inches). */
  gapIn: number;
  /** Research prompt : response ratio for pages whose writing is shared (0 = none). */
  ratio?: number;
  /** Whole-line snapping with the remainder spread between sections. */
  lineSnap?: boolean;
  /** Pages saved before prompt blocks: whole sections share by weight, as before. */
  legacyWeights?: boolean;
  /** Continue on more pages when the zones don't fit (single-page layouts). */
  flow: boolean;
  /** Try fewer lines (down to each prompt's minimum) before continuing on another page. */
  fewerLines?: boolean;
  /** Surface for a page with no zones at all (zero prompts). */
  emptySurface: SurfaceKind;
  /** Metric provenance ("recipe devotional-soap.four-band", "guided page"). */
  basis: string;
};

const RESPONSE_SURFACE: Record<ResponseStyle, SurfaceKind> = { ruled: "lined", blank: "blank", "dot-grid": "dot-grid", "graph-grid": "graph-grid", checkboxes: "checkbox", table: "table" };

/**
 * Prompt blocks as page zones. `surfaceOf` gives a block's surface when the
 * creator kept "the page's own style" (a recipe zone's surface, or the
 * project's writing lines).
 */
export function blocksToZones(set: PromptSet, surfaceOf: (b: PromptBlock) => { surface: SurfaceKind; treatment?: StationeryZone["treatment"] }): StationeryZone[] {
  const zones = set.blocks.map((b): StationeryZone => {
    const zone = blockZone(set, b, surfaceOf);
    const frame = sectionFrameOf(set, b);
    return frame === "open" || zone.surface === "divider" || zone.surface === "spacer" ? zone : { ...zone, frame };
  });
  // Two writing sections side by side: one band holding both.
  const out: StationeryZone[] = [];
  zones.forEach((z, i) => {
    if (set.blocks[i].beside && canSitBeside(set.blocks, i) && out.length) {
      const a = out.pop()!;
      out.push({ key: `${a.key}__${z.key}`, label: "", surface: a.surface, weight: Math.max(a.weight, z.weight), optional: true, pair: [a, z] });
    } else out.push(z);
  });
  return out;
}

/** One block as a page zone. */
function blockZone(set: PromptSet, b: PromptBlock, surfaceOf: (b: PromptBlock) => { surface: SurfaceKind; treatment?: StationeryZone["treatment"] }): StationeryZone {
  // Page Composer sections without writing space.
  switch (kindOf(b)) {
    case "heading": {
      // A heading and its optional text line, with no writing space below; in the page title, section heading or body text role.
      const base = { key: b.id, surface: "blank" as const, weight: 0, optional: true, lines: 0, minLines: 0 };
      if (b.textStyle === "body") {
        const body = [b.label.trim(), b.prompt?.trim()].filter(Boolean).join("\n");
        return { ...base, label: "", ...(body ? { prompt: body } : {}), promptRole: "body" };
      }
      return { ...base, label: b.label, ...(b.textStyle === "title" ? { labelRole: "pageTitle" as const } : {}), ...(b.prompt?.trim() ? { prompt: b.prompt.trim() } : {}) };
    }
    case "info": {
      // Blanks keep their style by position; empty labels are skipped.
      const kept = (b.fields ?? []).map((f, i) => ({ f: f.trim(), style: b.fieldStyles?.[i] ?? "line" })).filter((x) => x.f);
      const fields = kept.length ? kept : [{ f: "Date", style: "line" as const }];
      return { key: b.id, label: "", surface: "fill-in", weight: 0, optional: true, fields: fields.map((x) => x.f), ...(fields.some((x) => x.style === "box") ? { fieldStyles: fields.map((x) => x.style) } : {}) };
    }
    case "divider":
      return { key: b.id, label: "", surface: "divider", weight: 0, optional: true };
    case "spacer":
      return { key: b.id, label: "", surface: "spacer", weight: 0, optional: true, heightIn: SPACER_HEIGHTS[b.spacer ?? "medium"] };
  }
  const own = surfaceOf(b);
  const lines = requestedLines(set, b);
  return {
    key: b.id,
    label: b.label,
    ...(b.prompt?.trim() ? { prompt: b.prompt.trim() } : {}),
    ...(lines === undefined && spaceOf(b) === "equal" ? { equal: true } : {}),
    surface: b.responseStyle ? RESPONSE_SURFACE[b.responseStyle] : own.surface,
    ...(b.responseStyle ? {} : own.treatment ? { treatment: own.treatment } : {}),
    ...(b.responseStyle === "checkboxes" ? { taskMarker: b.taskMarker ?? "square", taskMarkerPosition: b.taskMarkerPosition ?? "left", ...(b.taskLines === false ? { taskLines: false } : {}) } : {}),
    ...(b.responseStyle === "table"
      ? {
          table: {
            columns: (b.table?.columns?.length ? b.table.columns : ["Column 1", "Column 2"]).map((label, i) => ({ key: `c${i + 1}`, label, referenceWidthIn: 1 })),
            basis: "Custom page table — equal columns",
            showHeader: b.table?.showHeader !== false,
            borders: b.table?.borders ?? "grid",
            ...(b.table?.rowSpace && b.table.rowSpace !== "standard" ? { rowScale: TABLE_ROW_SCALE[b.table.rowSpace] } : {}),
            // Filling the space: the chosen rows are the least it draws.
            ...(lines === undefined ? { minRows: Math.max(1, b.table?.rows ?? b.lineCount ?? 6) } : {}),
          },
        }
      : {}),
    weight: b.weight ?? 1,
    optional: true,
    ...(lines !== undefined ? { lines: Math.max(0, Math.round(lines)) } : {}),
    ...(b.minLines !== undefined ? { minLines: b.minLines } : {}),
  };
}

/** Section gap for a prompt set's spacing choice. */
export const promptGap = (base: number, set?: PromptSet) => base * SPACING_FACTOR[set?.spacing ?? "standard"];

/** Greedy word wrap with the layout measurer (prompts and instructions are creator-editable and may be long). */
export function wrapText(value: string, width: number, ctx: Pick<LayoutContext, "typography">, role: "prompt" | "body" = "prompt"): string[] {
  const m = getLayoutMeasurer().measure, st = styleForRole(ctx.typography, role);
  const lines: string[] = [];
  for (const para of value.split("\n")) {
    let cur = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && m(next, st) > width) {
        lines.push(cur);
        cur = word;
      } else cur = next;
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

type Measured = {
  zone: StationeryZone;
  heading: ReturnType<typeof fitHeading> | null;
  headingH: number;
  promptLines: string[];
  promptH: number;
  overhead: number;
  promptText: number;
  /** Two sections side by side: each measured at its column's width. */
  halves?: [Measured, Measured];
};

/**
 * Inner padding of a framed section (outline or panel): the box padding, and
 * never less than headings and labels keep from a border. Open and
 * divider-only sections have none.
 */
export const framePadIn = (frame: SectionFrame | undefined, ctx: Pick<LayoutContext, "spacing">) =>
  frame === "outline" || frame === "panel" || frame === "rounded" ? Math.max(ctx.spacing.boxPadding, ctx.spacing.sectionHeadingInset, ctx.spacing.labelToBorderInset) : 0;

/** The gap between two sections side by side. */
const pairGapIn = (ctx: Pick<LayoutContext, "spacing">) => ctx.spacing.column + ctx.spacing.block;
/** The width of each of two sections side by side. */
export const halfWidthIn = (width: number, ctx: Pick<LayoutContext, "spacing">) => Math.max(0, (width - pairGapIn(ctx)) / 2);

function measureOne(zone: StationeryZone, width: number, ctx: LayoutContext): Measured {
  const s = ctx.spacing;
  const inner = Math.max(0, width - 2 * framePadIn(zone.frame, ctx));
  const role = zone.labelRole ?? "sectionHeading", pRole = zone.promptRole ?? "prompt";
  const headingLine = lineBoxIn(ctx.typography, role), promptLine = lineBoxIn(ctx.typography, pRole);
  const heading = zone.label ? fitHeading(zone.label, role, { w: inner, h: 2 * headingLine }, ctx) : null;
  const promptLines = zone.prompt ? wrapText(zone.prompt, inner, ctx, pRole) : [];
  const headingH = heading ? heading.heightIn : 0;
  const promptH = promptLines.length * promptLine;
  const overhead = headingH + (promptH ? s.block + promptH : 0) + (headingH || promptH ? s.headingToContentGap : 0);
  return { zone, heading, headingH, promptLines, promptH, overhead, promptText: headingH + promptH };
}

function measure(zones: StationeryZone[], width: number, ctx: LayoutContext): Measured[] {
  return zones.map((zone) => {
    if (!zone.pair) return measureOne(zone, width, ctx);
    const half = halfWidthIn(width, ctx);
    const halves: [Measured, Measured] = [measureOne(zone.pair[0], half, ctx), measureOne(zone.pair[1], half, ctx)];
    return { ...measureOne({ ...zone, label: "", prompt: undefined }, width, ctx), halves };
  });
}

function requestOne(m: Measured, ctx: LayoutContext, width: number): ZoneRequest {
  const pad = framePadIn(m.zone.frame, ctx);
  const inner = Math.max(0, width - 2 * pad);
  if (m.zone.surface === "fill-in") return { zone: m.zone, overheadIn: 0, fixedIn: fillInRows(m.zone.fields?.length ? m.zone.fields : [m.zone.label], inner, ctx).heightIn + 2 * pad };
  if (m.zone.surface === "divider" || m.zone.surface === "spacer") return { zone: m.zone, overheadIn: 0, fixedIn: m.zone.heightIn ?? ctx.spacing.section };
  return {
    zone: m.zone,
    // A framed section's padding sits above its heading and below its writing.
    overheadIn: m.overhead + 2 * pad,
    promptTextIn: m.promptText,
    lines: m.zone.lines,
    minLines: m.zone.minLines,
    ...(m.zone.surface === "checkbox" ? { rowIn: ctx.spacing.listRow } : {}),
    // A table draws its header row above the requested rows; filling the space, it never gets fewer than its chosen rows.
    ...(m.zone.surface === "table"
      ? { rowIn: ctx.spacing.listRow * (m.zone.table?.rowScale ?? 1), headIn: tableHeaderIn(m.zone, inner, ctx), ...(m.zone.table?.minRows ? { minLines: m.zone.table.minRows } : {}) }
      : {}),
  };
}

/**
 * A zone's request. Two sections side by side take one band: fixed when both
 * ask for lines (the taller one's height), otherwise shared like any writing
 * section, never shorter than the taller one's minimum.
 */
function requestOf(m: Measured, ctx: LayoutContext, width: number, pitch: number): ZoneRequest {
  if (!m.halves) return requestOne(m, ctx, width);
  const half = halfWidthIn(width, ctx);
  const [a, b] = m.halves.map((h) => requestOne(h, ctx, half));
  const need = Math.max(minZoneHeight(a, pitch), minZoneHeight(b, pitch));
  if (a.lines !== undefined && b.lines !== undefined) return { zone: m.zone, overheadIn: 0, fixedIn: need };
  const overheadIn = Math.max(a.overheadIn, b.overheadIn);
  return { zone: m.zone, overheadIn, promptTextIn: Math.max(a.promptTextIn ?? a.overheadIn, b.promptTextIn ?? b.overheadIn), minIn: Math.max(0, need - overheadIn) };
}

/** Narrowest the header's centre (its titles) may get before the details move below it. */
export const HEADER_CENTER_MIN_IN = 1.6;
/** Room a header detail's writing line gets after its label. */
export const HEADER_META_LINE_IN = 1.1;

/**
 * A COMPOSED PAGE HEADER — one measured region, three zones:
 *
 *   [ step label ]   [   overline    ]   [ Date     ________ ]
 *   [ step number]   [  MAIN TITLE   ]   [ Time     ________ ]
 *                    [   subtitle    ]   [ Type     ________ ]
 *
 * The step sits at the left, the titles centred, the details at the right —
 * each with its own label and writing line, lines aligned. When the page is
 * too narrow for the titles between them, the details drop below as rows of
 * blanks (wrapping, never squeezed). Everything is measured once in the
 * typography roles (label, weekTitle, monthTitle, subheading, prompt); the
 * height used — band, details and the gap after — is returned, and the page's
 * sections start below it.
 */
function composedHeader(id: string, h: GuidedHeader, body: Rect, ctx: LayoutContext, nodes: LayoutNode[], diagnostics: LayoutDiagnostic[]): number {
  const s = ctx.spacing;
  const measure = getLayoutMeasurer().measure;
  const widthOf = (v: string, role: "label" | "weekTitle") => measure(v, styleForRole(ctx.typography, role));
  const gap = s.column + s.block;
  const tight = s.block / 2;
  const clean = (v?: string) => v?.trim() || "";
  const meta = (h.meta ?? []).map(clean).filter(Boolean);

  // Left: step label over the step number.
  const left = [
    ...(clean(h.eyebrow) ? [{ key: "eyebrow", v: clean(h.eyebrow), role: "label" as const }] : []),
    ...(clean(h.number) ? [{ key: "number", v: clean(h.number), role: "weekTitle" as const }] : []),
  ];
  const leftW = left.length ? Math.min(body.w * 0.3, Math.max(...left.map((i) => widthOf(i.v, i.role)))) : 0;
  // Right: the details, one label + line each; labels share one width so the lines align.
  const rowH = fillInIn(ctx);
  const labelW = meta.length ? Math.max(...meta.map((f) => widthOf(f, "label"))) : 0;
  let rightW = meta.length ? Math.min(body.w * 0.42, labelW + s.checkboxGap + HEADER_META_LINE_IN) : 0;
  const centerX = body.x + leftW + (leftW ? gap : 0);
  let centerW = body.x + body.w - centerX - (rightW ? rightW + gap : 0);
  let metaBelow = false;
  if (meta.length && centerW < HEADER_CENTER_MIN_IN) {
    metaBelow = true;
    rightW = 0;
    centerW = body.x + body.w - centerX;
  }

  // Left column.
  let ly = body.y;
  left.forEach((it, k) => {
    const lh = lineBoxIn(ctx.typography, it.role);
    nodes.push(text(`${id}-${it.key}`, { x: body.x, y: ly, w: leftW, h: lh }, it.v, it.role, { component: "PageHeader", vAlign: "top" }));
    ly += lh + (k < left.length - 1 ? tight : 0);
  });

  // Centre column: overline, main title (fitted, up to two lines), subtitle, reference.
  let cy = body.y;
  const center: (() => void)[] = [];
  const push = (key: string, value: string, role: "label" | "subheading" | "prompt") => {
    const lines = role === "label" ? [value] : wrapText(value, centerW, ctx, role === "prompt" ? "prompt" : "body");
    const lh = lineBoxIn(ctx.typography, role);
    const y = cy;
    center.push(() => {
      const t = text(`${id}-${key}`, { x: centerX, y, w: centerW, h: lh * lines.length }, lines.join(" "), role, { component: "PageHeader", align: "center", vAlign: "top", wrap: lines.length > 1 });
      if (lines.length > 1) t.fit = { sizePt: ctx.typography.roles[role].sizePt, lineHeight: ctx.typography.roles[role].lineHeight, lines };
      nodes.push(t);
    });
    cy += lh * lines.length + tight;
  };
  if (clean(h.overline)) push("overline", clean(h.overline), "label");
  if (clean(h.title)) {
    const role = "monthTitle" as const;
    const fit = fitHeading(clean(h.title), role, { w: centerW, h: 2 * lineBoxIn(ctx.typography, role) }, ctx);
    const y = cy;
    center.push(() => {
      const t = text(`${id}-title`, { x: centerX, y, w: centerW, h: fit.heightIn }, clean(h.title), role, { component: "PageHeader", align: "center", vAlign: "top" });
      if (fit.lines.length > 1 || fit.sizePt !== ctx.typography.roles[role].sizePt || !fit.ok) t.fit = { sizePt: fit.sizePt, lineHeight: fit.lineHeight, lines: fit.lines, ...(fit.ok ? {} : { failed: true }) };
      nodes.push(t);
    });
    cy += fit.heightIn + tight;
  }
  if (clean(h.subtitle)) push("subtitle", clean(h.subtitle), "subheading");
  if (clean(h.reference)) push("reference", clean(h.reference), "prompt");
  const centerH = Math.max(0, cy - body.y - (cy > body.y ? tight : 0));
  center.forEach((f) => f());

  // Right column.
  let rightH = 0;
  if (meta.length && !metaBelow) {
    const rx = body.x + body.w - rightW;
    const lx = rx + labelW + s.checkboxGap;
    meta.forEach((f, i) => {
      const y = body.y + i * rowH;
      nodes.push(text(`${id}-meta${i}-label`, { x: rx, y, w: labelW, h: rowH }, f, "label", { component: "SectionHeader", vAlign: "bottom" }));
      nodes.push(rule(`${id}-meta${i}-line`, lx, y + rowH, body.x + body.w, y + rowH, { strokePt: ctx.pattern.lineWeightPt, component: "WritingLines" }));
    });
    rightH = meta.length * rowH;
  }
  let used = Math.max(ly - body.y, centerH, rightH);

  // Narrow page: the details as rows of blanks below the step and titles.
  if (meta.length && metaBelow) {
    const y = body.y + used + (used ? s.block : 0);
    const rows = fillInRows(meta, body.w, ctx);
    const out = SURFACES["fill-in"](`${id}-meta`, { x: body.x, y, w: body.w, h: rows.heightIn }, { key: "meta", label: "", surface: "fill-in", weight: 0, fields: meta }, ctx);
    nodes.push(...out.nodes);
    diagnostics.push(...out.diagnostics);
    used = y + rows.heightIn - body.y;
  }
  if (h.rule) {
    const y = body.y + used + s.block;
    nodes.push(rule(`${id}-rule`, body.x, y, body.x + body.w, y, { component: "PageHeader", color: "lineArt" }));
    used = y - body.y;
  }
  return used + s.section;
}

/** The page frame, header and (first page) instructions; returns the body left for the zones. */
function frameOf(spec: ZonePageSpec, ctx: LayoutContext, pageIndex: number, first: boolean) {
  const frame = pageFrame(ctx, pageIndex, { headerH: spec.title ? STUDIO_PLANNER.weeklyTitle.valueIn : 0, headerRule: !!spec.title });
  const nodes: LayoutNode[] = [...frame.nodes];
  const diagnostics: LayoutDiagnostic[] = [...frame.diagnostics];
  const id = `${spec.idPrefix}${pageIndex}`;
  if (spec.title) {
    const head = headerTitle(`${id}-header`, ctx, frame.zones, "pageTitle", spec.title, "pageTitle", "header-left");
    nodes.push(...head.nodes);
    diagnostics.push(...head.diagnostics);
  }
  const right = first ? spec.headerRight : spec.headerRight ? `${spec.headerRight} · continued` : spec.title ? "continued" : undefined;
  if (right) {
    const z = frame.zones.header;
    nodes.push(text(`${id}-period`, { x: z.x, y: z.y, w: z.w, h: z.h - ctx.spacing.titleToRuleGap }, right, "label", { component: "PageHeader", align: "right", vAlign: "bottom" }));
  }
  let body: Rect = frame.body;
  if (first && spec.intro && isComposedHeader(spec.intro)) {
    const used = composedHeader(`${id}-intro`, spec.intro, body, ctx, nodes, diagnostics);
    body = { ...body, y: body.y + used, h: Math.max(0, body.h - used) };
  } else if (first && spec.intro) {
    // The designed header: each line measured in its role, stacked; the sections get what is left below it.
    const h = spec.intro;
    const items: { key: string; value: string; role: "label" | "weekTitle" | "subheading" | "prompt" }[] = [];
    if (h.eyebrow?.trim()) items.push({ key: "eyebrow", value: h.eyebrow.trim(), role: "label" });
    if (h.number?.trim()) items.push({ key: "number", value: h.number.trim(), role: "weekTitle" });
    if (h.subtitle?.trim()) items.push({ key: "subtitle", value: h.subtitle.trim(), role: "subheading" });
    if (h.reference?.trim()) items.push({ key: "reference", value: h.reference.trim(), role: "prompt" });
    let y = body.y;
    items.forEach((it, k) => {
      const lines = it.role === "subheading" || it.role === "prompt" ? wrapText(it.value, body.w, ctx, it.role === "prompt" ? "prompt" : "body") : [it.value];
      const role = it.role;
      const lh = lineBoxIn(ctx.typography, role);
      const t: TextNode = text(`${id}-intro-${it.key}`, { x: body.x, y, w: body.w, h: lh * lines.length }, lines.join(" "), role, { component: "PageHeader", vAlign: "top", wrap: lines.length > 1 });
      if (lines.length > 1) t.fit = { sizePt: ctx.typography.roles[role].sizePt, lineHeight: ctx.typography.roles[role].lineHeight, lines };
      nodes.push(t);
      y += lh * lines.length + (k < items.length - 1 ? ctx.spacing.block : 0);
    });
    if (h.rule) {
      if (items.length) y += ctx.spacing.block;
      const w = Math.min(body.w, 0.9);
      nodes.push(rule(`${id}-intro-rule`, body.x, y, body.x + w, y, { component: "PageHeader", color: "lineArt" }));
    }
    const used = y - body.y + (items.length || h.rule ? ctx.spacing.section : 0);
    body = { ...body, y: body.y + used, h: Math.max(0, body.h - used) };
  }
  if (first && spec.instructions?.trim()) {
    const lines = wrapText(spec.instructions, body.w, ctx, "body");
    const h = lines.length * lineBoxIn(ctx.typography, "body");
    const t: TextNode = text(`${id}-instructions`, { x: body.x, y: body.y, w: body.w, h }, lines.join(" "), "body", { component: "Text", vAlign: "top", wrap: true });
    t.fit = { sizePt: ctx.typography.roles.body.sizePt, lineHeight: ctx.typography.roles.body.lineHeight, lines };
    nodes.push(t);
    const used = h + ctx.spacing.section;
    body = { ...body, y: body.y + used, h: Math.max(0, body.h - used) };
  }
  return { nodes, diagnostics, body };
}

const pitchOf = (ctx: LayoutContext) => lineSpacingIn(ctx.pattern.kind === "blank" ? DEFAULT_FUNCTIONAL_PATTERN : ctx.pattern);

/** Split the spec's zones over as many pages as the content needs (flow), or keep them on one. */
function plan(spec: ZonePageSpec, ctx: LayoutContext, bodies: Rect[], maxPages: number) {
  const measured = measure(spec.zones, bodies[0]?.w ?? 0, ctx);
  const byZone = new Map(measured.map((m) => [m.zone, m]));
  const reqs = measured.map((m) => requestOf(m, ctx, bodies[0]?.w ?? 0, pitchOf(ctx)));
  const heightOf = (i: number) => (bodies[Math.min(i, bodies.length - 1)] ?? { h: 0 }).h;
  const paged = paginateZones(reqs, heightOf, spec.gapIn, pitchOf(ctx), { flow: spec.flow, fewerLines: spec.fewerLines, maxPages });
  return { byZone, ...paged };
}

/** How many pages one instance needs (for the recipe engine), measured on this page size. */
export function countZonePages(spec: ZonePageSpec, f: FitContext): number {
  if (!spec.flow || !spec.zones.length) return 1;
  const ctx = probeContext(f, 1);
  const first = frameOf(spec, ctx, 0, true).body, next = frameOf(spec, ctx, 0, false).body;
  return plan(spec, ctx, [first, next], Infinity).pages.length;
}

/** A context for measuring without a document (fit / flow counting). */
export function probeContext(f: FitContext, pages: number): LayoutContext {
  return {
    pages: Array.from({ length: pages }, () => f.page),
    pageNumbers: Array.from({ length: pages }, (_, i) => i + 1),
    spacing: f.spacing,
    typography: f.typography,
    options: f.options,
    wording: DEFAULT_WORDING,
    pattern: f.pattern ?? DEFAULT_FUNCTIONAL_PATTERN,
    calendar: null,
    weekStart: 1,
    period: { kind: "none" },
    module: f.module,
  };
}

/**
 * Solve the spec over ctx.pages[pageIndexes]: the zones are split across the
 * pages in order; each page is laid out by the geometry layer and drawn by
 * the surface renderers.
 */
export function solveZonePages(spec: ZonePageSpec, ctx: LayoutContext, pageIndexes: number[]): SolvedPage[] {
  const frames = pageIndexes.map((pi, k) => frameOf(spec, ctx, pi, k === 0));
  const bodies = frames.map((f) => f.body);
  const s = ctx.spacing;
  if (!spec.zones.length) {
    // Zero prompts: the page is one open writing area.
    return frames.map((f, k) => {
      const out = SURFACES[spec.emptySurface](`${spec.idPrefix}${pageIndexes[k]}-writing`, f.body, { key: "writing", label: "", surface: spec.emptySurface, weight: 1 }, ctx);
      return { nodes: [...f.nodes, ...out.nodes], diagnostics: [...f.diagnostics, ...out.diagnostics], metrics: out.metrics, regions: { mainContent: f.body, writingArea: f.body } };
    });
  }
  const p = plan(spec, ctx, bodies, pageIndexes.length);
  const pitch = pitchOf(ctx);
  return frames.map((f, k) => {
    const pi = pageIndexes[k];
    const nodes = [...f.nodes];
    const diagnostics = [...f.diagnostics];
    const metrics: LayoutMetric[] = [];
    const reqs = p.pages[k] ?? [];
    if (!reqs.length) {
      // A continuation page the content no longer needs (e.g. after fewer prompts): open writing space.
      const out = SURFACES[spec.emptySurface](`${spec.idPrefix}${pi}-writing`, f.body, { key: "writing", label: "", surface: spec.emptySurface, weight: 1 }, ctx);
      return { nodes: [...nodes, ...out.nodes], diagnostics, metrics, regions: { mainContent: f.body, writingArea: f.body } };
    }
    const anyFixed = reqs.some((r) => r.lines !== undefined);
    const res = resolveZones(reqs, f.body, spec.gapIn, anyFixed ? 0 : spec.ratio ?? 0, {
      snapPitch: spec.lineSnap && ctx.pattern.kind !== "blank" ? pitch : 0,
      linePitch: pitch,
      legacyWeights: spec.legacyWeights,
    });
    diagnostics.push(...res.problems.map((message): LayoutDiagnostic => ({ severity: "error", rule: "stationery-fit", componentId: `${spec.idPrefix}${pi}`, message })));
    if (k === frames.length - 1 && p.overflow) {
      diagnostics.push({ severity: "error", rule: "prompt-fit", componentId: `${spec.idPrefix}${pi}`, message: promptFitMessage(spec.zones, spec.noun) });
    }
    const draw = (m: Measured, rect: Rect, responseTop: number, responseH: number) => {
      const z = m.zone;
      const id = `${spec.idPrefix}${pi}-${z.key}`;
      const pad = framePadIn(z.frame, ctx);
      nodes.push(group(id, "Section", rect));
      nodes.push(...frameNodes(`${id}-frame`, rect, z.frame, ctx));
      const inner = { x: rect.x + pad, y: rect.y + pad, w: Math.max(0, rect.w - 2 * pad), h: Math.max(0, rect.h - 2 * pad) };
      // Fixed rows (info rows, dividers, spacers) carry no heading of their own.
      const fixed = isFixedSurface(z.surface);
      if (!fixed && m.heading && m.headingH) {
        const role = z.labelRole ?? "sectionHeading";
        const t = text(`${id}-title`, { x: inner.x, y: inner.y, w: inner.w, h: m.headingH }, z.label, role, { component: "SectionHeader" });
        if (m.heading.lines.length > 1 || m.heading.sizePt !== ctx.typography.roles[role].sizePt || !m.heading.ok) t.fit = { sizePt: m.heading.sizePt, lineHeight: m.heading.lineHeight, lines: m.heading.lines, ...(m.heading.ok ? {} : { failed: true }) };
        nodes.push(t);
      }
      if (!fixed && m.promptLines.length) {
        const y = inner.y + m.headingH + (m.headingH ? s.block : 0);
        const pRole = z.promptRole ?? "prompt";
        const pt: TextNode = text(`${id}-prompt`, { x: inner.x, y, w: inner.w, h: m.promptH }, m.promptLines.join(" "), pRole, { component: "Text", vAlign: "top", wrap: true });
        pt.fit = { sizePt: ctx.typography.roles[pRole].sizePt, lineHeight: ctx.typography.roles[pRole].lineHeight, lines: m.promptLines };
        nodes.push(pt);
      }
      const response = fixed ? inner : { x: inner.x, y: responseTop, w: inner.w, h: Math.max(0, responseH) };
      const out = SURFACES[z.surface](`${id}-surface`, response, z, ctx);
      nodes.push(...out.nodes);
      diagnostics.push(...out.diagnostics);
      metrics.push(...out.metrics);
      if (!isFixedSurface(z.surface)) {
        metrics.push({ label: `"${z.label || z.key}" writing height`, value: response.h, unit: "in", provenance: { geometryClass: "user-design", basis: `${spec.basis}: ${z.lines !== undefined ? `${z.lines} lines requested` : `weight ${z.weight.toFixed(2)} of the page body`}` } });
      }
    };
    res.zones.forEach((z, zi) => {
      const m = p.byZone.get(z.zone)!;
      const pad = framePadIn(z.zone.frame, ctx);
      if (m.halves) {
        // Side by side: both columns share the band; their writing starts on the same line.
        const half = halfWidthIn(z.rect.w, ctx);
        const reqs2 = m.halves.map((h) => requestOne(h, ctx, half));
        const top = Math.max(...reqs2.map((r) => r.overheadIn));
        const pitch = pitchOf(ctx);
        m.halves.forEach((h, k) => {
          const r = reqs2[k];
          const hp = framePadIn(h.zone.frame, ctx);
          const rect = { x: z.rect.x + k * (half + pairGapIn(ctx)), y: z.rect.y, w: half, h: z.rect.h };
          const responseTop = rect.y + top - hp;
          const own = r.lines !== undefined ? (r.headIn ?? 0) + r.lines * (r.rowIn ?? pitch) : rect.y + rect.h - hp - responseTop;
          draw(h, rect, responseTop, Math.min(own, rect.y + rect.h - hp - responseTop));
        });
      } else {
        draw(m, z.rect, z.response.y - pad, z.response.h);
      }
      // Divider-only treatment: one rule midway into the gap below (not after the page's last section).
      const next = res.zones[zi + 1];
      if (z.zone.frame === "divider" && next) {
        const y = (z.rect.y + z.rect.h + next.rect.y) / 2;
        nodes.push(rule(`${spec.idPrefix}${pi}-${z.zone.key}-divider`, z.rect.x, y, z.rect.x + z.rect.w, y, { strokePt: Math.max(0.5, ctx.pattern.lineWeightPt), component: "Divider" }));
      }
    });
    return { nodes, diagnostics, metrics, regions: { mainContent: f.body, writingArea: f.body } };
  });
}

/**
 * A framed section's outline or panel, in the palette's semantic colors (so it
 * follows the product's Style): soft outline in the border color, a subtle
 * panel tinted with the accent, a rounded panel with both.
 */
function frameNodes(id: string, rect: Rect, frame: SectionFrame | undefined, ctx: LayoutContext): LayoutNode[] {
  const r = ctx.spacing.boxPadding;
  switch (frame) {
    case "outline":
      return [box(id, rect, { component: "Section", stroke: "border", strokePt: Math.max(0.5, ctx.pattern.lineWeightPt) })];
    case "panel":
      return [box(id, rect, { component: "Section", stroke: null, fill: "accent", fillOpacity: 0.08 })];
    case "rounded":
      return [box(id, rect, { component: "Section", stroke: "border", strokePt: Math.max(0.5, ctx.pattern.lineWeightPt), fill: "accent", fillOpacity: 0.06, radiusIn: r })];
    default:
      return [];
  }
}

/**
 * "This page does not have enough room for 6 prompts with 5 writing lines each."
 * "This page does not have enough room for 4 sections with the selected writing lines."
 */
export function promptFitMessage(zones: StationeryZone[], noun: "prompt" | "section" = "prompt"): string {
  const prompts = zones.filter((z) => !isFixedSurface(z.surface) && z.surface !== "table");
  const counts = [...new Set(prompts.map((z) => z.lines))];
  const n = prompts.length;
  const each =
    counts.length === 1 && counts[0] !== undefined ? ` with ${counts[0]} writing line${counts[0] === 1 ? "" : "s"} each` : prompts.some((z) => z.lines !== undefined) ? " with the selected writing lines" : "";
  return `This page does not have enough room for ${n} ${noun}${n === 1 ? "" : "s"}${each}.`;
}

/** The (0-based) page of an instance each section starts on, read from the solved pages. */
export function sectionPages(pages: SolvedPage[], idPrefix: string): Record<string, number> {
  const out: Record<string, number> = {};
  const re = new RegExp(`^${idPrefix}\\d+-(.+?)-surface`);
  pages.forEach((page, k) => {
    for (const n of page.nodes) {
      const m = re.exec(n.id);
      if (m && out[m[1]] === undefined) out[m[1]] = k;
    }
  });
  return out;
}

/**
 * The writing lines (or checklist items) each section actually got, read from
 * the solved pages: `{ [section key]: count }`, summed over continuation pages.
 */
export function sectionLineCounts(pages: SolvedPage[], idPrefix: string): Record<string, number> {
  const out: Record<string, number> = {};
  const re = new RegExp(`^${idPrefix}\\d+-(.+?)-surface`);
  for (const page of pages)
    for (const n of page.nodes) {
      const m = re.exec(n.id);
      if (!m) continue;
      if (n.type === "lines") out[m[1]] = (out[m[1]] ?? 0) + n.positions.length;
      else if (n.type === "checkbox") out[m[1]] = (out[m[1]] ?? 0) + 1;
    }
  return out;
}
