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
import { effectiveZones } from "../../engines/stationery/geometry";
import { blocksToZones, countZonePages, probeContext, promptGap, solveZonePages, type ZonePageSpec } from "../shared/promptPages";
import type { PromptSet } from "../../types/prompts";
import { findSizePreset } from "../../presets/sizes/sizePresets";
import { STATIONERY_RECIPES, stationeryLayoutId } from "../../presets/stationery/catalog";
import type { PageGeometry } from "../../types/geometry";
import type { SolvedPage } from "../../types/layout";
import type { ProductType } from "../../types/product";
import type { StationeryCustomization, StationeryRecipe, StationerySizeVariant, StationeryZone } from "../../types/stationery";
import type { FitContext, FitResult, LayoutContext, LayoutDefinition } from "../shared/types";

/** Product types a family's pages can be used in (the page model is the same). */
const PRODUCT_TYPES_FOR: Record<StationeryRecipe["family"], ProductType[]> = {
  devotional: ["devotional", "journal", "notebook", "custom"],
  worksheet: ["worksheet", "tracker", "journal", "notebook", "custom"],
  journal: ["journal", "notebook", "custom"],
  planner: ["planner", "insert", "custom"],
};

export const customizationFor = (ctx: Pick<LayoutContext, "options">, comboId: string): StationeryCustomization => ctx.options.stationery?.[comboId] ?? {};

/**
 * The zones of one recipe page: the creator's prompt blocks when set for this
 * page (fixed rows such as the date line stay), otherwise the recipe's zones
 * with the older rename / hide / order / space customization.
 */
export function recipePageZones(recipe: StationeryRecipe, pageIndex: number, custom: StationeryCustomization): StationeryZone[] {
  const spec = recipe.pages[pageIndex];
  const set = custom.promptPages?.[pageIndex];
  if (!set) return effectiveZones(spec, pageIndex, custom);
  const fixed = effectiveZones({ ...spec, zones: spec.zones.filter((z) => z.surface === "fill-in" || z.surface === "table") }, pageIndex, custom);
  const own = new Map(spec.zones.map((z) => [z.key, z]));
  return [...fixed, ...blocksToZones(set, (b) => ({ surface: own.get(b.id)?.surface ?? "lined", treatment: own.get(b.id)?.treatment }))];
}

/** The recipe page's default prompt set: its writing zones as prompt blocks (what the editor starts from). */
export function recipePromptSet(recipe: StationeryRecipe, pageIndex: number, custom: StationeryCustomization): PromptSet {
  const existing = custom.promptPages?.[pageIndex];
  if (existing) return existing;
  const zones = effectiveZones(recipe.pages[pageIndex], pageIndex, custom).filter((z) => z.surface !== "fill-in" && z.surface !== "table");
  return { blocks: zones.map((z) => ({ id: z.key, label: z.label, weight: z.weight })) };
}

/** The shared prompt page spec for one recipe page (or a single-page recipe with its continuation pages). */
function recipeSpec(recipe: StationeryRecipe, pageIndex: number, ctx: Pick<LayoutContext, "options" | "spacing">): ZonePageSpec {
  const custom = customizationFor(ctx, recipe.comboId);
  const set = custom.promptPages?.[pageIndex];
  const title = pageIndex === 0 ? custom.title ?? custom.rename?.page0 ?? recipe.pages[0].title : custom.rename?.[`page${pageIndex}`] ?? recipe.pages[pageIndex].title;
  return {
    idPrefix: "st",
    title,
    instructions: set?.instructions,
    zones: recipePageZones(recipe, pageIndex, custom),
    // Each section carries its own heading, so sections sit a block gap apart (not a full section gap).
    gapIn: promptGap(ctx.spacing.block, set),
    ratio: recipe.minResponseToPromptRatio ?? 0,
    lineSnap: recipe.composition?.lineSnap,
    // Single-page recipes continue on another page when the creator's prompts don't fit; spreads keep their two pages.
    flow: recipe.pages.length === 1,
    fewerLines: set?.whenFull === "fewer-lines",
    emptySurface: "lined",
    basis: `recipe ${recipe.comboId}`,
  };
}

/** Solve a recipe: a spread page by page, or a single page with any continuation pages. */
function solveRecipe(recipe: StationeryRecipe, ctx: LayoutContext): SolvedPage[] {
  if (recipe.pages.length > 1) return recipe.pages.flatMap((_, i) => solveZonePages({ ...recipeSpec(recipe, i, ctx), flow: false }, ctx, [i]));
  return solveZonePages(recipeSpec(recipe, 0, ctx), ctx, ctx.pages.map((_, i) => i));
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

/** A probe context for fit(): the real solver on this page (with any continuation pages), so fit and solve never disagree. */
function probe(recipe: StationeryRecipe, f: FitContext): LayoutContext {
  const pages = recipe.pages.length > 1 ? recipe.pages.length : countZonePages(recipeSpec(recipe, 0, f), f);
  return probeContext(f, pages);
}

/** The structure a size variant produces: the recipe with the variant's sections left out. */
export function variantStructure(recipe: StationeryRecipe, v: StationerySizeVariant): StationeryRecipe {
  const pages = recipe.pages.map((p) => ({ ...p, zones: p.zones.filter((z) => !v.omit.includes(z.key)) }));
  const names = pages.flatMap((p) => p.zones.map((z) => (z.fields?.length ? z.fields.join(" and ") : z.label))).filter(Boolean);
  return {
    ...recipe,
    variant: v.id,
    label: v.label,
    description: `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} — sized for smaller pages.`,
    supportedTrims: v.supportedTrims,
    pages,
  };
}

type Choice = { structure: StationeryRecipe; ok: true } | { ok: false; reason: string };

/**
 * Size-aware structure choice (the same fit → variant mechanism every layout
 * uses): the full recipe when it fits this trim, otherwise the first size
 * variant that does. The full structure's reason is kept so the editor can
 * say why it was not used.
 */
function chooseStructure(recipe: StationeryRecipe, f: FitContext): Choice & { fullReason?: string } {
  const attempt = (r: StationeryRecipe): string | null => {
    const trim = trimSupported(r, f.page);
    if (trim) return trim;
    const problems = solveRecipe(r, probe(r, f)).flatMap((p) => p.diagnostics.filter((d) => d.rule === "stationery-fit" || d.rule === "prompt-fit").map((d) => d.message));
    return problems[0] ?? null;
  };
  const fullReason = attempt(recipe);
  if (!fullReason) return { ok: true, structure: recipe };
  for (const v of recipe.sizeVariants ?? []) {
    const structure = variantStructure(recipe, v);
    if (!attempt(structure)) return { ok: true, structure, fullReason };
  }
  return { ok: false, reason: fullReason };
}

export function stationeryLayout(recipe: StationeryRecipe): LayoutDefinition {
  const solve = (ctx: LayoutContext) => {
    const choice = chooseStructure(recipe, { page: ctx.pages[0], spacing: ctx.spacing, typography: ctx.typography, options: ctx.options });
    // Nothing fits: solve the full structure so its problems are reported (never squeezed).
    const structure = choice.ok ? choice.structure : recipe;
    const pages = solveRecipe(structure, ctx);
    if (choice.ok && structure !== recipe) {
      const left = recipe.sizeVariants!.find((v) => v.id === structure.variant)!.omit.map((k) => recipe.pages.flatMap((p) => p.zones).find((z) => z.key === k)?.label ?? k);
      pages[0].diagnostics.push({
        severity: "info",
        rule: "stationery-variant",
        componentId: "st0",
        message: `The full ${recipe.label} page doesn't leave enough writing room at this size, so the ${structure.label} is used (without ${left.join(" and ")}). ${choice.fullReason}`,
      });
    }
    return pages;
  };
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
      const choice = chooseStructure(recipe, f);
      if (!choice.ok) return { ok: false, reason: choice.reason };
      return { ok: true, variant: choice.structure.variant, variantLabel: choice.structure.label, sidebarAvailable: false };
    },
    solve,
    // A single-page recipe whose prompts don't fit continues on another page.
    flowPages: (f) => {
      if (recipe.pages.length > 1) return 1;
      const choice = chooseStructure(recipe, f);
      return countZonePages(recipeSpec(choice.ok ? choice.structure : recipe, 0, f), f);
    },
  };
}

export const STATIONERY_LAYOUTS: LayoutDefinition[] = STATIONERY_RECIPES.map(stationeryLayout);
