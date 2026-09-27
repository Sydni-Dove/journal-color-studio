/**
 * STATIONERY PAGE MODEL — one LayoutDefinition per catalog recipe, generated
 * from data. The recipe says WHAT is on the page; this module only:
 *   1. takes the body rectangle the shared page frame solved from geometry,
 *   2. measures headings / prompts (typography),
 *   3. asks the geometry layer for zone rectangles and column widths,
 *   4. hands each zone to its surface renderer.
 * It invents no structure the recipe does not declare, and holds no
 * trim-specific constants.
 */
import { effectiveZones, resolveZones, type ZoneRequest } from "../../engines/stationery/geometry";
import { DEFAULT_FUNCTIONAL_PATTERN } from "../../engines/patterns/patterns";
import { getLayoutMeasurer, styleForRole } from "../../engines/typography/textMeasure";
import { findSizePreset } from "../../presets/sizes/sizePresets";
import { STUDIO_PLANNER } from "../../presets/studioDefaults";
import { DEFAULT_WORDING } from "../../presets/wording";
import { STATIONERY_RECIPES, stationeryLayoutId } from "../../presets/stationery/catalog";
import type { PageGeometry } from "../../types/geometry";
import type { LayoutDiagnostic, LayoutMetric, LayoutNode, SolvedPage, TextNode } from "../../types/layout";
import type { ProductType } from "../../types/product";
import type { StationeryCustomization, StationeryRecipe } from "../../types/stationery";
import { fitHeading, headerTitle, pageFrame } from "../shared/components";
import { group, lineBoxIn, text } from "../shared/nodes";
import type { FitContext, FitResult, LayoutContext, LayoutDefinition } from "../shared/types";
import { fillInIn, SURFACES } from "./surfaces";

/** Product types a family's pages can be used in (the page model is the same). */
const PRODUCT_TYPES_FOR: Record<StationeryRecipe["family"], ProductType[]> = {
  devotional: ["devotional", "journal", "notebook", "custom"],
  worksheet: ["worksheet", "tracker", "journal", "notebook", "custom"],
  journal: ["journal", "notebook", "custom"],
  planner: ["planner", "insert", "custom"],
};

export const customizationFor = (ctx: Pick<LayoutContext, "options">, comboId: string): StationeryCustomization => ctx.options.stationery?.[comboId] ?? {};

/** Greedy word wrap with the layout measurer (prompts are creator-editable and may be long). */
function wrap(value: string, width: number, ctx: LayoutContext): string[] {
  const m = getLayoutMeasurer().measure, st = styleForRole(ctx.typography, "prompt");
  const lines: string[] = [];
  let cur = "";
  for (const word of value.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && m(next, st) > width) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

function solveRecipePage(recipe: StationeryRecipe, pageIndex: number, ctx: LayoutContext): SolvedPage {
  const spec = recipe.pages[pageIndex];
  const custom = customizationFor(ctx, recipe.comboId);
  const frame = pageFrame(ctx, pageIndex, { headerH: spec.title ? STUDIO_PLANNER.weeklyTitle.valueIn : 0, headerRule: !!spec.title });
  const nodes: LayoutNode[] = [...frame.nodes];
  const diagnostics: LayoutDiagnostic[] = [...frame.diagnostics];
  const metrics: LayoutMetric[] = [];
  if (spec.title) {
    const title = custom.rename?.[`page${pageIndex}`] ?? spec.title;
    const head = headerTitle(`st${pageIndex}-header`, ctx, frame.zones, "pageTitle", title, "pageTitle", "header-left");
    nodes.push(...head.nodes);
    diagnostics.push(...head.diagnostics);
  }
  const body = frame.body;
  const s = ctx.spacing;
  const headingLine = lineBoxIn(ctx.typography, "sectionHeading"), promptLine = lineBoxIn(ctx.typography, "prompt");

  // Typography: what each zone's heading and prompt occupy (the geometry layer shares out the rest).
  const zones = effectiveZones(spec, pageIndex, custom);
  const measured = zones.map((zone) => {
    const heading = zone.label ? fitHeading(zone.label, "sectionHeading", { w: body.w, h: 2 * headingLine }, ctx) : null;
    const promptLines = zone.prompt ? wrap(zone.prompt, body.w, ctx) : [];
    const headingH = heading ? heading.heightIn : 0;
    const promptH = promptLines.length * promptLine;
    const overhead = headingH + (promptH ? s.block + promptH : 0) + (headingH || promptH ? s.headingToContentGap : 0);
    return { zone, heading, headingH, promptLines, promptH, overhead, promptText: headingH + promptH };
  });
  const reqs: ZoneRequest[] = measured.map((m) => (m.zone.surface === "fill-in" ? { zone: m.zone, overheadIn: 0, fixedIn: fillInIn(ctx) } : { zone: m.zone, overheadIn: m.overhead, promptTextIn: m.promptText }));
  // Each section carries its own heading, so sections sit a block gap apart (not a full section gap).
  const res = resolveZones(reqs, body, s.block, recipe.minResponseToPromptRatio ?? 0);
  diagnostics.push(...res.problems.map((message): LayoutDiagnostic => ({ severity: "error", rule: "stationery-fit", componentId: `st${pageIndex}`, message })));

  res.zones.forEach((z, i) => {
    const m = measured[i];
    const id = `st${pageIndex}-${z.zone.key}`;
    nodes.push(group(id, "Section", z.rect));
    if (z.head && m.heading) {
      const t = text(`${id}-title`, { x: z.rect.x, y: z.rect.y, w: z.rect.w, h: m.headingH }, z.zone.label, "sectionHeading", { component: "SectionHeader" });
      if (m.heading.lines.length > 1 || m.heading.sizePt !== ctx.typography.roles.sectionHeading.sizePt) t.fit = { sizePt: m.heading.sizePt, lineHeight: m.heading.lineHeight, lines: m.heading.lines };
      nodes.push(t);
    }
    if (m.promptLines.length) {
      const y = z.rect.y + m.headingH + (m.headingH ? s.block : 0);
      const p: TextNode = text(`${id}-prompt`, { x: z.rect.x, y, w: z.rect.w, h: m.promptH }, m.promptLines.join(" "), "prompt", { component: "Text", vAlign: "top", wrap: true });
      p.fit = { sizePt: ctx.typography.roles.prompt.sizePt, lineHeight: ctx.typography.roles.prompt.lineHeight, lines: m.promptLines };
      nodes.push(p);
    }
    const out = SURFACES[z.zone.surface](`${id}-surface`, z.response, z.zone, ctx);
    nodes.push(...out.nodes);
    diagnostics.push(...out.diagnostics);
    metrics.push(...out.metrics);
    if (z.zone.surface !== "fill-in") {
      metrics.push({ label: `"${z.zone.label || z.zone.key}" writing height`, value: z.response.h, unit: "in", provenance: { geometryClass: "user-design", basis: `recipe ${recipe.comboId}: weight ${z.zone.weight.toFixed(2)} of the page body` } });
    }
  });
  return { nodes, diagnostics, metrics, regions: { mainContent: body, writingArea: body } };
}

/** Trim check: the recipe is engineered for its listed trims (either orientation). */
function trimSupported(recipe: StationeryRecipe, page: PageGeometry): string | null {
  const ok = recipe.supportedTrims.some((id) => {
    const sp = findSizePreset(id);
    if (!sp) return false;
    const k = sp.unit === "mm" ? 1 / 25.4 : 1;
    const a = [sp.short * k, sp.long * k].sort((x, y) => x - y), b = [page.trimWidthIn, page.trimHeightIn].sort((x, y) => x - y);
    return Math.abs(a[0] - b[0]) < 0.02 && Math.abs(a[1] - b[1]) < 0.02;
  });
  if (ok) return null;
  const names = recipe.supportedTrims.map((id) => findSizePreset(id)?.label ?? id).join(", ");
  return `${recipe.label} is engineered for ${names}.`;
}

/** A probe context for fit(): the real solver on this page, so fit and solve never disagree. */
function probe(recipe: StationeryRecipe, f: FitContext): LayoutContext {
  return {
    pages: recipe.pages.map(() => f.page),
    pageNumbers: recipe.pages.map((_, i) => i + 1),
    spacing: f.spacing,
    typography: f.typography,
    options: f.options,
    wording: DEFAULT_WORDING,
    pattern: DEFAULT_FUNCTIONAL_PATTERN,
    calendar: null,
    weekStart: 1,
    period: { kind: "none" },
  };
}

export function stationeryLayout(recipe: StationeryRecipe): LayoutDefinition {
  const solve = (ctx: LayoutContext) => recipe.pages.map((_, i) => solveRecipePage(recipe, i, ctx));
  return {
    id: stationeryLayoutId(recipe.comboId),
    label: recipe.label,
    family: recipe.family === "devotional" ? "devotional" : recipe.family === "worksheet" ? "worksheet" : recipe.family,
    description: recipe.description,
    pages: recipe.pages.length === 2 ? 2 : 1,
    period: "none",
    capability: {
      supportedProductTypes: PRODUCT_TYPES_FOR[recipe.family],
      // Lined surfaces follow the ruling (or Blank); no recipe gains a dot grid from the notebook pattern.
      supportsPatterns: ["ruled", "blank"],
      supportsLineStyle: true,
      supportsSidebar: false,
      supportsDatePlacement: false,
      supportsSectionsPerDay: false,
      supportsWritingRows: false,
      supportsPageNumbers: true,
      supportsFooter: true,
      requiresCalendar: false,
      usesWeekStart: false,
      wordingKeys: [],
      repeats: ["count", "once"],
      defaultRepeat: "count",
    },
    fit: (f): FitResult => {
      const trim = trimSupported(recipe, f.page);
      if (trim) return { ok: false, reason: trim };
      const problems = solve(probe(recipe, f)).flatMap((p) => p.diagnostics.filter((d) => d.rule === "stationery-fit").map((d) => d.message));
      return problems.length ? { ok: false, reason: problems[0] } : { ok: true, variant: recipe.variant, variantLabel: recipe.label, sidebarAvailable: false };
    },
    solve,
  };
}

export const STATIONERY_LAYOUTS: LayoutDefinition[] = STATIONERY_RECIPES.map(stationeryLayout);
