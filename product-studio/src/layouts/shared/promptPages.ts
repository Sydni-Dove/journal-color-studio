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
import { requestedLines, spaceOf, SPACING_FACTOR, type GuidedHeader, type PromptBlock, type PromptSet, type ResponseStyle } from "../../types/prompts";
import type { StationeryZone, SurfaceKind } from "../../types/stationery";
import { fillInIn, SURFACES, tableHeaderIn } from "../stationery/surfaces";
import { fitHeading, headerTitle, pageFrame } from "./components";
import { group, lineBoxIn, rule, text } from "./nodes";
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

const RESPONSE_SURFACE: Record<ResponseStyle, SurfaceKind> = { ruled: "lined", blank: "blank", "dot-grid": "dot-grid", checkboxes: "checkbox", table: "table" };

/**
 * Prompt blocks as page zones. `surfaceOf` gives a block's surface when the
 * creator kept "the page's own style" (a recipe zone's surface, or the
 * project's writing lines).
 */
export function blocksToZones(set: PromptSet, surfaceOf: (b: PromptBlock) => { surface: SurfaceKind; treatment?: StationeryZone["treatment"] }): StationeryZone[] {
  return set.blocks.map((b) => {
    const own = surfaceOf(b);
    const lines = requestedLines(set, b);
    return {
      key: b.id,
      label: b.label,
      ...(b.prompt?.trim() ? { prompt: b.prompt.trim() } : {}),
      ...(lines === undefined && spaceOf(b) === "equal" ? { equal: true } : {}),
      surface: b.responseStyle ? RESPONSE_SURFACE[b.responseStyle] : own.surface,
      ...(b.responseStyle ? {} : own.treatment ? { treatment: own.treatment } : {}),
      ...(b.responseStyle === "checkboxes" ? { taskMarker: b.taskMarker ?? "square", taskMarkerPosition: b.taskMarkerPosition ?? "left" } : {}),
      ...(b.responseStyle === "table"
        ? {
            table: {
              columns: (b.table?.columns?.length ? b.table.columns : ["Column 1", "Column 2"]).map((label, i) => ({ key: `c${i + 1}`, label, referenceWidthIn: 1 })),
              basis: "Custom page table — equal columns",
              showHeader: b.table?.showHeader !== false,
              borders: b.table?.borders ?? "grid",
            },
          }
        : {}),
      weight: b.weight ?? 1,
      optional: true,
      ...(lines !== undefined ? { lines: Math.max(0, Math.round(lines)) } : {}),
      ...(b.minLines !== undefined ? { minLines: b.minLines } : {}),
    };
  });
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

type Measured = { zone: StationeryZone; heading: ReturnType<typeof fitHeading> | null; headingH: number; promptLines: string[]; promptH: number; overhead: number; promptText: number };

function measure(zones: StationeryZone[], width: number, ctx: LayoutContext): Measured[] {
  const s = ctx.spacing;
  const headingLine = lineBoxIn(ctx.typography, "sectionHeading"), promptLine = lineBoxIn(ctx.typography, "prompt");
  return zones.map((zone) => {
    const heading = zone.label ? fitHeading(zone.label, "sectionHeading", { w: width, h: 2 * headingLine }, ctx) : null;
    const promptLines = zone.prompt ? wrapText(zone.prompt, width, ctx) : [];
    const headingH = heading ? heading.heightIn : 0;
    const promptH = promptLines.length * promptLine;
    const overhead = headingH + (promptH ? s.block + promptH : 0) + (headingH || promptH ? s.headingToContentGap : 0);
    return { zone, heading, headingH, promptLines, promptH, overhead, promptText: headingH + promptH };
  });
}

const requestOf = (m: Measured, ctx: LayoutContext, width = 0): ZoneRequest =>
  m.zone.surface === "fill-in"
    ? { zone: m.zone, overheadIn: 0, fixedIn: fillInIn(ctx) }
    : {
        zone: m.zone,
        overheadIn: m.overhead,
        promptTextIn: m.promptText,
        lines: m.zone.lines,
        minLines: m.zone.minLines,
        ...(m.zone.surface === "checkbox" || m.zone.surface === "table" ? { rowIn: ctx.spacing.listRow } : {}),
        // A table draws its header row above the requested rows.
        ...(m.zone.surface === "table" ? { headIn: tableHeaderIn(m.zone, width, ctx) } : {}),
      };

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
  if (first && spec.intro) {
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
  const reqs = measured.map((m) => requestOf(m, ctx, bodies[0]?.w ?? 0));
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
    res.zones.forEach((z) => {
      const m = p.byZone.get(z.zone)!;
      const id = `${spec.idPrefix}${pi}-${z.zone.key}`;
      nodes.push(group(id, "Section", z.rect));
      if (z.head && m.heading) {
        const t = text(`${id}-title`, { x: z.rect.x, y: z.rect.y, w: z.rect.w, h: m.headingH }, z.zone.label, "sectionHeading", { component: "SectionHeader" });
        if (m.heading.lines.length > 1 || m.heading.sizePt !== ctx.typography.roles.sectionHeading.sizePt || !m.heading.ok) t.fit = { sizePt: m.heading.sizePt, lineHeight: m.heading.lineHeight, lines: m.heading.lines, ...(m.heading.ok ? {} : { failed: true }) };
        nodes.push(t);
      }
      if (m.promptLines.length) {
        const y = z.rect.y + m.headingH + (m.headingH ? s.block : 0);
        const pt: TextNode = text(`${id}-prompt`, { x: z.rect.x, y, w: z.rect.w, h: m.promptH }, m.promptLines.join(" "), "prompt", { component: "Text", vAlign: "top", wrap: true });
        pt.fit = { sizePt: ctx.typography.roles.prompt.sizePt, lineHeight: ctx.typography.roles.prompt.lineHeight, lines: m.promptLines };
        nodes.push(pt);
      }
      const out = SURFACES[z.zone.surface](`${id}-surface`, z.response, z.zone, ctx);
      nodes.push(...out.nodes);
      diagnostics.push(...out.diagnostics);
      metrics.push(...out.metrics);
      if (z.zone.surface !== "fill-in") {
        metrics.push({ label: `"${z.zone.label || z.zone.key}" writing height`, value: z.response.h, unit: "in", provenance: { geometryClass: "user-design", basis: `${spec.basis}: ${z.zone.lines !== undefined ? `${z.zone.lines} lines requested` : `weight ${z.zone.weight.toFixed(2)} of the page body`}` } });
      }
    });
    return { nodes, diagnostics, metrics, regions: { mainContent: f.body, writingArea: f.body } };
  });
}

/**
 * "This page does not have enough room for 6 prompts with 5 writing lines each."
 * "This page does not have enough room for 4 sections with the selected writing lines."
 */
export function promptFitMessage(zones: StationeryZone[], noun: "prompt" | "section" = "prompt"): string {
  const prompts = zones.filter((z) => z.surface !== "fill-in" && z.surface !== "table");
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
