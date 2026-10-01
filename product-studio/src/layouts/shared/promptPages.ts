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
import type { ColorToken, TypographyRole } from "../../types/tokens";
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
      return {
        ...base,
        label: b.label,
        ...(b.textStyle === "title" ? { labelRole: "pageTitle" as const } : {}),
        ...(b.prompt?.trim() ? { prompt: b.prompt.trim() } : {}),
        ...(b.headingAlign && b.headingAlign !== "left" ? { headingAlign: b.headingAlign } : {}),
        ...(b.headingRule ? { headingRule: true } : {}),
        ...(b.headingFont ? { headingFont: b.headingFont } : {}),
        ...(b.headingSizePt ? { headingSizePt: b.headingSizePt } : {}),
      };
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
    ...(b.badge?.trim() ? { badge: b.badge.trim() } : {}),
    ...(b.headingAlign && b.headingAlign !== "left" ? { headingAlign: b.headingAlign } : {}),
    ...(b.headingRule ? { headingRule: true } : {}),
    ...(b.headingFont ? { headingFont: b.headingFont } : {}),
    ...(b.headingSizePt ? { headingSizePt: b.headingSizePt } : {}),
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
  /** The number circle's diameter (0 = none). */
  badge?: number;
};

/**
 * Inner padding of a framed section (outline or panel): the box padding, and
 * never less than headings and labels keep from a border. Open and
 * divider-only sections have none.
 */
export const framePadIn = (frame: SectionFrame | undefined, ctx: Pick<LayoutContext, "spacing">) =>
  frame === "outline" || frame === "panel" || frame === "rounded" ? Math.max(ctx.spacing.boxPadding, ctx.spacing.sectionHeadingInset, ctx.spacing.labelToBorderInset) : 0;

/** A section's insets on each side: the frame padding all round, or — with a line at the left — a left indent only. */
export function frameInsets(frame: SectionFrame | undefined, ctx: Pick<LayoutContext, "spacing">): { l: number; r: number; t: number; b: number } {
  if (frame === "rule") {
    const l = 2 * Math.max(ctx.spacing.boxPadding, ctx.spacing.sectionHeadingInset);
    return { l, r: 0, t: 0, b: 0 };
  }
  const p = framePadIn(frame, ctx);
  return { l: p, r: p, t: p, b: p };
}

/** Diameter of a section's number circle: about two heading lines. */
export const badgeIn = (ctx: Pick<LayoutContext, "typography">) => Math.max(0.28, 2 * lineBoxIn(ctx.typography, "sectionHeading"));

/** The gap between two sections side by side. */
const pairGapIn = (ctx: Pick<LayoutContext, "spacing">) => ctx.spacing.column + ctx.spacing.block;
/** The width of each of two sections side by side. */
export const halfWidthIn = (width: number, ctx: Pick<LayoutContext, "spacing">) => Math.max(0, (width - pairGapIn(ctx)) / 2);

function measureOne(zone: StationeryZone, width: number, ctx: LayoutContext): Measured {
  const s = ctx.spacing;
  const ins = frameInsets(zone.frame, ctx);
  // A number circle sits at the left of the heading; the heading and prompt take the width beside it.
  const badge = zone.badge?.trim() ? badgeIn(ctx) : 0;
  const inner = Math.max(0, width - ins.l - ins.r - (badge ? badge + s.column : 0));
  const role = zone.labelRole ?? "sectionHeading", pRole = zone.promptRole ?? "prompt";
  const promptLine = lineBoxIn(ctx.typography, pRole);
  // A heading in its own font is measured in that font.
  // A heading in its own font or size is measured in it (the size is where fitting starts; it never overflows).
  const own = { ...(zone.headingFont ? { family: zone.headingFont } : {}), ...(zone.headingSizePt ? { sizePt: zone.headingSizePt } : {}) };
  const hctx = Object.keys(own).length ? { ...ctx, typography: { ...ctx.typography, roles: { ...ctx.typography.roles, [role]: { ...ctx.typography.roles[role], ...own } } } } : ctx;
  const heading = zone.label ? fitHeading(zone.label, role, { w: inner, h: 2 * lineBoxIn(hctx.typography, role) }, hctx) : null;
  const promptLines = zone.prompt ? wrapText(zone.prompt, inner, ctx, pRole) : [];
  // A line under the heading takes a block's space (half above it, half below).
  const headingH = heading ? heading.heightIn + (zone.headingRule ? s.block : 0) : 0;
  const promptH = promptLines.length * promptLine;
  const textH = headingH + (promptH ? s.block + promptH : 0);
  const overhead = Math.max(textH, badge) + (headingH || promptH || badge ? s.headingToContentGap : 0);
  return { zone, heading, headingH, promptLines, promptH, overhead, promptText: headingH + promptH, badge };
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
  const ins = frameInsets(m.zone.frame, ctx);
  const inner = Math.max(0, width - ins.l - ins.r);
  if (m.zone.surface === "fill-in") return { zone: m.zone, overheadIn: 0, fixedIn: fillInRows(m.zone.fields?.length ? m.zone.fields : [m.zone.label], inner, ctx).heightIn + ins.t + ins.b };
  if (m.zone.surface === "divider" || m.zone.surface === "spacer") return { zone: m.zone, overheadIn: 0, fixedIn: m.zone.heightIn ?? ctx.spacing.section };
  return {
    zone: m.zone,
    // A framed section's padding sits above its heading and below its writing.
    overheadIn: m.overhead + ins.t + ins.b,
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
/** Writing room under a detail's label when the label sits above its line (small pages). */
export const HEADER_WRITE_IN = 0.22;
/**
 * Display sizes of the composed header, as multiples of the Style's own roles
 * (so a typography change follows): the main title and the step number are
 * display type; the subtitle a spaced serif line. They shrink to fit their zone.
 */
export const HEADER_TITLE_SCALE = 2.6; // × monthTitle
export const HEADER_NUMBER_SCALE = 0.92; // × the main title's size
export const HEADER_SUBTITLE_SCALE = 0.78; // × weekTitle

/**
 * A COMPOSED PAGE HEADER — one measured region, three zones:
 *
 *   STEP TWO │        DISCERN         │      FROM
 *   02       │      T H E  W O R D    │  REVELATION TO
 *            │ SEEK UNDERSTANDING • … │    EXECUTION
 *
 * Left: the step label over a large step number (in the palette's line-art
 * color). Centre: overline, the main title in display type, the subtitle as
 * a spaced serif line, a small spaced tagline. Right: a short mark between
 * two short rules, and/or details to fill in (each its own label and line,
 * lines aligned). Thin rules divide the zones. Sizes derive from the Style's
 * typography roles and shrink to fit; on a narrow page the right side drops
 * below the titles. Measured once; the sections start below it.
 */
/** Space above and below the gold rule under a header (in section spaces): it reads as a divider, not an underline. */
const RULE_AIR = 1.6;
function composedHeader(id: string, h: GuidedHeader, body: Rect, ctx: LayoutContext, nodes: LayoutNode[], diagnostics: LayoutDiagnostic[]): number {
  const s = ctx.spacing;
  const measure = getLayoutMeasurer().measure;
  const roles = ctx.typography.roles;
  const ptIn = (pt: number, lh: number) => (pt * lh) / 72;
  const widthAt = (v: string, role: TypographyRole, sizePt?: number, trackingEm?: number) =>
    measure(v, { ...styleForRole(ctx.typography, role), ...(sizePt ? { sizePt } : {}), ...(trackingEm !== undefined ? { trackingEm } : {}) });
  /** The largest size ≤ `max` (and ≥ `min`) at which `v` fits `w` on one line. */
  const sizeToFit = (v: string, role: TypographyRole, w: number, max: number, min: number, trackingEm?: number) => {
    let pt = max;
    while (pt > min && widthAt(v, role, pt, trackingEm) > w) pt = Math.max(min, pt - 0.5);
    return pt;
  };
  /** Greedy word wrap at a given size and tracking (for spaced header lines that don't fit on one line). */
  const wrapAt = (v: string, role: TypographyRole, w: number, pt: number, trackingEm?: number) => {
    const out: string[] = [];
    let cur = "";
    for (const word of v.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && widthAt(next, role, pt, trackingEm) > w) {
        out.push(cur);
        cur = word;
      } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  };
  const gap = s.column + 2 * s.block;
  const tight = s.block / 2;
  const clean = (v?: string) => v?.trim() || "";
  const meta = (h.meta ?? []).map(clean).filter(Boolean);
  const typedMark = clean(h.mark) ? clean(h.mark).split(/\n+/).map((l) => l.trim().toUpperCase()).filter(Boolean) : [];
  const dividers = h.dividers !== false;
  const draw: (() => void)[] = [];
  const put = (key: string, rect: Rect, value: string, role: TypographyRole, o: { sizePt?: number; trackingEm?: number; align?: "left" | "center" | "right"; color?: ColorToken; component?: "PageHeader" | "SectionHeader"; vAlign?: "top" | "bottom"; lines?: string[] } = {}) => {
    draw.push(() => {
      const t = text(`${id}-${key}`, rect, value, role, { component: o.component ?? "PageHeader", align: o.align ?? "left", vAlign: o.vAlign ?? "top", ...(o.color ? { color: o.color } : {}), ...(o.lines && o.lines.length > 1 ? { wrap: true } : {}) });
      if (o.sizePt !== undefined || o.trackingEm !== undefined || (o.lines && o.lines.length > 1)) t.fit = { sizePt: o.sizePt ?? roles[role].sizePt, lineHeight: roles[role].lineHeight, lines: o.lines ?? [value], ...(o.trackingEm !== undefined ? { trackingEm: o.trackingEm } : {}) };
      nodes.push(t);
    });
  };

  // ── Sizes: the main title first (display type, fitted), the step number from it.
  const titleText = clean(h.title);
  const titleMax = roles.monthTitle.sizePt * HEADER_TITLE_SCALE * Math.min(1, body.w / 6.5);
  // ── Left zone.
  const eyebrow = clean(h.eyebrow), number = clean(h.number);
  const labelTrack = Math.max(roles.label.trackingEm, 0.28);
  let numberPt = number ? Math.max(roles.weekTitle.sizePt, titleMax * HEADER_NUMBER_SCALE) : 0;
  const leftCap = body.w * 0.26;
  if (number && widthAt(number, "weekTitle", numberPt) > leftCap) numberPt = sizeToFit(number, "weekTitle", leftCap, numberPt, roles.weekTitle.sizePt);
  // The step label keeps its spacing when it fits; on a narrow column it tightens, then takes two lines ("STEP / THREE").
  let eyebrowTrack = labelTrack;
  let eyebrowLines = eyebrow ? [eyebrow.toUpperCase()] : [];
  if (eyebrow && widthAt(eyebrowLines[0], "label", undefined, eyebrowTrack) > leftCap) {
    eyebrowTrack = roles.label.trackingEm;
    if (widthAt(eyebrowLines[0], "label", undefined, eyebrowTrack) > leftCap) eyebrowLines = wrapAt(eyebrowLines[0], "label", leftCap, roles.label.sizePt, eyebrowTrack);
  }
  const leftW = Math.min(leftCap, Math.max(eyebrowLines.length ? Math.max(...eyebrowLines.map((l) => widthAt(l, "label", undefined, eyebrowTrack))) : 0, number ? widthAt(number, "weekTitle", numberPt) : 0));
  // ── Right zone: the mark and / or the details.
  const markTrack = 0.3;
  const markPt = roles.label.sizePt * 1.25;
  // A mark typed on one long line ("FROM REVELATION TO EXECUTION") is set as a short stacked column, the way the
  // reference sets it; lines the user broke themselves are kept (and wrapped only if still too wide).
  const longestWord = Math.max(0, ...typedMark.flatMap((l) => l.split(/\s+/)).map((w) => widthAt(w, "label", markPt, markTrack)));
  const markWrapW = Math.min(body.w * 0.4, Math.max(longestWord, body.w * 0.16));
  const markLines = typedMark.flatMap((l) => wrapAt(l, "label", markWrapW, markPt, markTrack));
  const markW = markLines.length ? Math.max(...markLines.map((l) => widthAt(l, "label", markPt, markTrack))) : 0;
  const rowH = fillInIn(ctx);
  const labelW = meta.length ? Math.max(...meta.map((f) => widthAt(f, "label"))) : 0;
  const metaRight = h.metaPlace === "right";
  const metaW = meta.length && metaRight ? labelW + s.checkboxGap + HEADER_META_LINE_IN : 0;
  const centerX = body.x + leftW + (leftW ? gap : 0);
  const centerFor = (w: number) => body.x + body.w - centerX - (w ? w + gap : 0);
  // Beside the titles: the mark and the details together when both fit; else the mark alone (the details go
  // below the band); else everything below the titles.
  let side = { mark: markLines.length > 0, meta: meta.length > 0 && metaRight };
  let rightW = Math.min(body.w * 0.4, Math.max(markW, metaW));
  if (rightW && centerFor(rightW) < HEADER_CENTER_MIN_IN && side.mark && side.meta && centerFor(markW) >= HEADER_CENTER_MIN_IN) {
    side = { mark: true, meta: false };
    rightW = markW;
  }
  if (rightW && centerFor(rightW) < HEADER_CENTER_MIN_IN) {
    side = { mark: false, meta: false };
    rightW = 0;
  }
  const centerW = centerFor(rightW);
  const below = { mark: markLines.length > 0 && !side.mark, meta: meta.length > 0 && !side.meta };
  const rightBelow = below.mark || below.meta;

  // ── Left zone: step label over the large number.
  let ly = body.y;
  if (eyebrow) {
    const lh = lineBoxIn(ctx.typography, "label") * eyebrowLines.length;
    put("eyebrow", { x: body.x, y: ly, w: leftW, h: lh }, eyebrow.toUpperCase(), "label", { trackingEm: eyebrowTrack, align: "center", lines: eyebrowLines });
    ly += lh + tight;
  }
  if (number) {
    const lh = ptIn(numberPt, roles.weekTitle.lineHeight);
    put("number", { x: body.x, y: ly, w: leftW, h: lh }, number, "weekTitle", { sizePt: numberPt, align: "center", color: "goldInk" });
    ly += lh;
  }

  // ── Centre zone: overline, display title, spaced subtitle, tagline — centred.
  let cy = body.y;
  const overline = clean(h.overline);
  if (overline) {
    const lh = lineBoxIn(ctx.typography, "label");
    put("overline", { x: centerX, y: cy, w: centerW, h: lh }, overline.toUpperCase(), "label", { trackingEm: labelTrack, align: "center" });
    cy += lh + tight;
  }
  if (titleText) {
    const pt = sizeToFit(titleText, "monthTitle", centerW, titleMax, roles.pageTitle.sizePt);
    const lh = ptIn(pt, roles.monthTitle.lineHeight);
    put("title", { x: centerX, y: cy, w: centerW, h: lh }, titleText, "monthTitle", { sizePt: pt, align: "center" });
    cy += lh + tight;
    if (widthAt(titleText, "monthTitle", pt) > centerW + 1e-6) diagnostics.push({ severity: "error", rule: "heading-fit", componentId: `${id}-title`, message: `“${titleText}” is too long for the header at this page size. Shorten it.` });
  }
  const subtitle = clean(h.subtitle);
  if (subtitle) {
    const track = 0.42;
    const minPt = Math.max(roles.label.sizePt, roles.sectionHeading.sizePt);
    const pt = sizeToFit(subtitle.toUpperCase(), "weekTitle", centerW, Math.max(roles.sectionHeading.sizePt * 1.2, roles.weekTitle.sizePt * HEADER_SUBTITLE_SCALE), minPt, track);
    const lines = wrapAt(subtitle.toUpperCase(), "weekTitle", centerW, pt, track);
    const lh = ptIn(pt, roles.weekTitle.lineHeight) * lines.length;
    put("subtitle", { x: centerX, y: cy, w: centerW, h: lh }, subtitle.toUpperCase(), "weekTitle", { sizePt: pt, trackingEm: track, align: "center", lines });
    cy += lh + tight;
  }
  const tagline = clean(h.tagline);
  if (tagline) {
    const pt = sizeToFit(tagline.toUpperCase(), "label", centerW, roles.label.sizePt * 1.1, roles.label.sizePt, labelTrack);
    const lines = wrapAt(tagline.toUpperCase(), "label", centerW, pt, labelTrack);
    const lh = ptIn(pt, roles.label.lineHeight) * lines.length;
    put("tagline", { x: centerX, y: cy, w: centerW, h: lh }, tagline.toUpperCase(), "label", { sizePt: pt, trackingEm: labelTrack, align: "center", lines });
    cy += lh + tight;
  }
  const reference = clean(h.reference);
  if (reference) {
    const lines = wrapText(reference, centerW, ctx, "prompt");
    const lh = lineBoxIn(ctx.typography, "prompt") * lines.length;
    const y = cy;
    draw.push(() => {
      const t = text(`${id}-reference`, { x: centerX, y, w: centerW, h: lh }, lines.join(" "), "prompt", { component: "PageHeader", align: "center", vAlign: "top", wrap: lines.length > 1 });
      if (lines.length > 1) t.fit = { sizePt: roles.prompt.sizePt, lineHeight: roles.prompt.lineHeight, lines };
      nodes.push(t);
    });
    cy += lh + tight;
  }
  const centerH = Math.max(0, cy - body.y - (cy > body.y ? tight : 0));

  // ── Right zone (beside the titles, or below them on a narrow page).
  const rightBlock = (x: number, w: number, y0: number, align: "right" | "left", what: { mark: boolean; meta: boolean }): number => {
    let y = y0;
    const markLines$ = what.mark ? markLines : [], meta$ = what.meta ? meta : [];
    if (markLines$.length && align === "right") {
      const ruleW = Math.min(w, 0.8);
      // Centred in the column, the rules above and below it, as in the reference.
      const rx0 = x + (w - ruleW) / 2;
      const top = y;
      draw.push(() => nodes.push(rule(`${id}-mark-top`, rx0, top, rx0 + ruleW, top, { component: "PageHeader", color: "goldInk", strokePt: 1 })));
      y += s.block;
      const lh = ptIn(markPt, roles.label.lineHeight);
      markLines$.forEach((l, i) => {
        put(`mark${i}`, { x, y: y + i * lh, w, h: lh }, l, "label", { sizePt: markPt, trackingEm: markTrack, align: "center", color: "text" });
      });
      y += markLines$.length * lh + s.block;
      const yy = y;
      draw.push(() => nodes.push(rule(`${id}-mark-bottom`, rx0, yy, rx0 + ruleW, yy, { component: "PageHeader", color: "goldInk", strokePt: 1 })));
      y += meta$.length ? s.block : 0;
    } else if (markLines$.length) {
      // Below the titles on a narrow page: the mark as one centred line between two short rules.
      const line = markLines$.join(" ");
      const pt = sizeToFit(line, "label", Math.max(0, w - 2 * 0.5 - 2 * s.column), markPt, roles.label.sizePt * 0.8, markTrack);
      const lh = ptIn(pt, roles.label.lineHeight);
      const tw = Math.min(w, widthAt(line, "label", pt, markTrack));
      const cx = x + w / 2;
      const yy = y + lh / 2;
      const room = (w - tw) / 2 - s.column;
      if (room >= 0.2) {
        const len = Math.min(0.5, room);
        draw.push(() => {
          nodes.push(rule(`${id}-mark-left`, cx - tw / 2 - s.column - len, yy, cx - tw / 2 - s.column, yy, { component: "PageHeader", color: "goldInk", strokePt: 1 }));
          nodes.push(rule(`${id}-mark-right`, cx + tw / 2 + s.column, yy, cx + tw / 2 + s.column + len, yy, { component: "PageHeader", color: "goldInk", strokePt: 1 }));
        });
      }
      put("mark0", { x, y, w, h: lh }, line, "label", { sizePt: pt, trackingEm: markTrack, align: "center", color: "text" });
      y += lh + (meta$.length ? s.block : 0);
    }
    if (meta$.length) {
      if (align === "right") {
        // The details never reach past their zone: the writing lines take what is left after the labels.
        const rx = x + w - Math.min(metaW, w);
        const lx = rx + labelW + s.checkboxGap;
        meta$.forEach((f, i) => {
          const yy = y + i * rowH;
          put(`meta${i}-label`, { x: rx, y: yy, w: labelW, h: rowH }, f, "label", { component: "SectionHeader", vAlign: "bottom" });
          draw.push(() => nodes.push(rule(`${id}-meta${i}-line`, lx, yy + rowH, x + w, yy + rowH, { strokePt: ctx.pattern.lineWeightPt, component: "WritingLines" })));
        });
        y += meta$.length * rowH;
      } else {
        // Below the titles: two aligned columns when the labels leave room for a line, else one.
        const colGap = s.column + s.block;
        const cols = (w - colGap) / 2 >= labelW + s.checkboxGap + 0.6 ? 2 : 1;
        const cellW = (w - colGap) / 2;
        if (cols === 1 && meta$.length > 1 && cellW >= Math.max(labelW, 0.9)) {
          // Small page: a grid of two, each label above its own writing line.
          const cellH = lineBoxIn(ctx.typography, "label") + HEADER_WRITE_IN;
          meta$.forEach((f, i) => {
            const cx0 = x + (i % 2) * (cellW + colGap);
            const yy = y + Math.floor(i / 2) * (cellH + s.block);
            put(`meta${i}-label`, { x: cx0, y: yy, w: cellW, h: lineBoxIn(ctx.typography, "label") }, f, "label", { component: "SectionHeader" });
            draw.push(() => nodes.push(rule(`${id}-meta${i}-line`, cx0, yy + cellH, cx0 + cellW, yy + cellH, { strokePt: ctx.pattern.lineWeightPt, component: "WritingLines" })));
          });
          const rowsN = Math.ceil(meta$.length / 2);
          return y + rowsN * cellH + (rowsN - 1) * s.block - y0;
        }
        const colW = (w - colGap * (cols - 1)) / cols;
        const perCol = Math.ceil(meta$.length / cols);
        meta$.forEach((f, i) => {
          const c = Math.floor(i / perCol), r = i % perCol;
          const cx0 = x + c * (colW + colGap);
          const yy = y + r * rowH;
          const lx = cx0 + labelW + s.checkboxGap;
          put(`meta${i}-label`, { x: cx0, y: yy, w: labelW, h: rowH }, f, "label", { component: "SectionHeader", vAlign: "bottom" });
          draw.push(() => nodes.push(rule(`${id}-meta${i}-line`, lx, yy + rowH, cx0 + colW, yy + rowH, { strokePt: ctx.pattern.lineWeightPt, component: "WritingLines" })));
        });
        y += perCol * rowH;
      }
    }
    return y - y0;
  };
  let rightH = 0;
  if (rightW) rightH = rightBlock(body.x + body.w - rightW, rightW, body.y, "right", side);
  let used = Math.max(ly - body.y, centerH, rightH);

  // Thin rules between the zones, the height of the band.
  if (dividers && used > 0) {
    if (leftW && (titleText || subtitle || overline)) {
      const x = body.x + leftW + gap / 2;
      nodes.push(rule(`${id}-divider-left`, x, body.y, x, body.y + used, { component: "PageHeader", color: "goldInk", strokePt: 1.5 }));
    }
    if (rightW) {
      const x = body.x + body.w - rightW - gap / 2;
      nodes.push(rule(`${id}-divider-right`, x, body.y, x, body.y + used, { component: "PageHeader", color: "goldInk", strokePt: 1.5 }));
    }
  }
  // Narrow page: the right side below the titles.
  if (rightBelow) {
    const y = body.y + used + s.block;
    used = y - body.y + rightBlock(body.x, body.w, y, "left", below);
  }
  draw.forEach((f) => f());
  if (h.rule) {
    // Clear of the details' writing lines above it (they are lines too): a section's space, not a block's.
    const y = body.y + used + (below.meta ? RULE_AIR * s.section : s.block);
    nodes.push(rule(`${id}-rule`, body.x, y, body.x + body.w, y, { component: "PageHeader", color: "goldInk" }));
    return y - body.y + RULE_AIR * s.section;
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
  // The page header: on the first page, or on every page of a page that continues (header.repeat).
  const header = first || spec.intro?.repeat === "every";
  if (header && spec.intro && isComposedHeader(spec.intro)) {
    const used = composedHeader(`${id}-intro`, spec.intro, body, ctx, nodes, diagnostics);
    body = { ...body, y: body.y + used, h: Math.max(0, body.h - used) };
  } else if (header && spec.intro) {
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
      nodes.push(rule(`${id}-intro-rule`, body.x, y, body.x + w, y, { component: "PageHeader", color: "goldInk" }));
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
      const ins = frameInsets(z.frame, ctx);
      nodes.push(group(id, "Section", rect));
      nodes.push(...frameNodes(`${id}-frame`, rect, z.frame, ctx));
      const inner = { x: rect.x + ins.l, y: rect.y + ins.t, w: Math.max(0, rect.w - ins.l - ins.r), h: Math.max(0, rect.h - ins.t - ins.b) };
      // Fixed rows (info rows, dividers, spacers) carry no heading of their own.
      const fixed = isFixedSurface(z.surface);
      // The number circle, and the heading and prompt beside it (centred on it when shorter).
      const d = !fixed ? m.badge ?? 0 : 0;
      const textH = m.headingH + (m.promptLines.length ? s.block + m.promptH : 0);
      const tx = inner.x + (d ? d + s.column : 0), tw = Math.max(0, inner.w - (d ? d + s.column : 0));
      const ty = inner.y + (d > textH ? (d - textH) / 2 : 0);
      if (d) {
        nodes.push(box(`${id}-badge`, { x: inner.x, y: inner.y, w: d, h: d }, { component: "Section", stroke: null, fill: "accent", fillOpacity: 0.16, radiusIn: d / 2 }));
        const num = text(`${id}-badge-number`, { x: inner.x, y: inner.y, w: d, h: d }, z.badge!.trim(), "weekTitle", { component: "PageHeader", align: "center", vAlign: "middle" });
        num.fit = { sizePt: Math.min(ctx.typography.roles.weekTitle.sizePt, (d * 72) / 1.9), lineHeight: 1, lines: [z.badge!.trim()] };
        nodes.push(num);
      }
      if (!fixed && m.heading && m.headingH) {
        const role = z.labelRole ?? "sectionHeading";
        const ruleH = z.headingRule ? s.block : 0;
        const t = text(`${id}-title`, { x: tx, y: ty, w: tw, h: m.headingH - ruleH }, z.label, role, { component: "SectionHeader", align: z.headingAlign ?? "left" });
        if (z.headingFont) t.family = z.headingFont;
        if (z.headingRule) {
          const ry = ty + m.headingH - ruleH / 2;
          nodes.push(rule(`${id}-heading-rule`, tx, ry, tx + tw, ry, { component: "SectionHeader", color: "goldInk", strokePt: 1 }));
        }
        if (m.heading.lines.length > 1 || m.heading.sizePt !== ctx.typography.roles[role].sizePt || !m.heading.ok) t.fit = { sizePt: m.heading.sizePt, lineHeight: m.heading.lineHeight, lines: m.heading.lines, ...(m.heading.ok ? {} : { failed: true }) };
        nodes.push(t);
      }
      if (!fixed && m.promptLines.length) {
        const y = ty + m.headingH + (m.headingH ? s.block : 0);
        const pRole = z.promptRole ?? "prompt";
        const pt: TextNode = text(`${id}-prompt`, { x: tx, y, w: tw, h: m.promptH }, m.promptLines.join(" "), pRole, { component: "Text", vAlign: "top", wrap: true, align: z.headingAlign ?? "left" });
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
      const pad = frameInsets(z.zone.frame, ctx).b;
      if (m.halves) {
        // Side by side: both columns share the band; their writing starts on the same line.
        const half = halfWidthIn(z.rect.w, ctx);
        const reqs2 = m.halves.map((h) => requestOne(h, ctx, half));
        const top = Math.max(...reqs2.map((r) => r.overheadIn));
        const pitch = pitchOf(ctx);
        m.halves.forEach((h, k) => {
          const r = reqs2[k];
          const hp = frameInsets(h.zone.frame, ctx).b;
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
    case "rule":
      // A line down the left side, in the palette's line-art color.
      return [rule(id, rect.x + 0.01, rect.y, rect.x + 0.01, rect.y + rect.h, { component: "Section", color: "goldInk", strokePt: 1.25 })];
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
