/**
 * DOCUMENT RESOLVER — turns structured project state into solved pages.
 *
 * Each stage is cached by ONLY the inputs it depends on:
 *   calendar  ← calendar settings                      (colors/fonts never touch it)
 *   recipe    ← recipe + calendar + binding paging      (fonts never touch it)
 *   geometry  ← trim + production + page count + side  (theme never touches it)
 *   layout    ← geometry + spacing + type sizes + wording + pattern + options + period
 * Colors, font families and decorative themes are applied at render time
 * only, so changing them never re-solves geometry or dates.
 */
import { getLayout, FILLER_LAYOUT_ID, LAYOUTS } from "../../layouts/registry";
import type { FitResult, LayoutContext, LayoutDefinition } from "../../layouts/shared/types";
import { getBindingProfile } from "../../presets/bindingProfiles/bindingProfiles";
import { getPrintProfile } from "../../presets/printProfiles/printProfiles";
import { PRODUCT_RECOMMENDED_MARGINS, PRODUCT_TYPES } from "../../presets/products/productTypes";
import { resolveSpacing } from "../../presets/spacing/spacingPresets";
import { resolveColors } from "../../presets/themes/palettes";
import { resolveTypography } from "../../presets/typography/typography";
import { resolveWording } from "../../presets/wording";
import type { BindingProfile } from "../../types/binding";
import type { CalendarData, WeekStart } from "../../types/calendar";
import type { PageGeometry } from "../../types/geometry";
import type { SolvedPage } from "../../types/layout";
import type { PrintProfile } from "../../types/print";
import type { ProductTypeDefinition } from "../../types/product";
import type { ProductProject } from "../../types/project";
import type { PageInstance } from "../../types/recipe";
import type { DecorativeTheme } from "../../types/theme";
import type { ColorTokens, SpacingTokens, TypographySettings, Wording } from "../../types/tokens";
import { getCalendar } from "../calendar/calendar";
import { resolveTrim, type ResolvedTrim } from "../geometry/dimensions";
import { computePageGeometry } from "../geometry/pageGeometry";
import { expandRecipe, type ExpandedRecipe } from "../recipe/recipe";
import { normalizeDecoration } from "../../themes/decorationPlan";
import { resolveComposition } from "../composition/composition";
import type { Composition } from "../../types/composition";
import { DEFAULT_DECORATIVE } from "../../presets/products/projectFactory";

// ─── Small keyed cache ─────────────────────────────────────────────────────
class KeyedCache<T> {
  private map = new Map<string, T>();
  constructor(private limit: number) {}
  get(key: string, make: () => T): T {
    const hit = this.map.get(key);
    if (hit !== undefined) {
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    const v = make();
    this.map.set(key, v);
    if (this.map.size > this.limit) this.map.delete(this.map.keys().next().value as string);
    return v;
  }
  clear() {
    this.map.clear();
  }
}

const recipeCache = new KeyedCache<ExpandedRecipe>(16);
const geometryCache = new KeyedCache<PageGeometry>(64);
const solveCache = new KeyedCache<SolvedPage[]>(400);

export function clearDocumentCaches() {
  recipeCache.clear();
  geometryCache.clear();
  solveCache.clear();
}

// ─── Variant resolution ────────────────────────────────────────────────────
/** Apply the active variant's overrides (colors/decoration/title only). */
export function applyVariant(project: ProductProject): ProductProject {
  const v = project.variants.find((x) => x.id === project.activeVariantId);
  if (!v) return project;
  return {
    ...project,
    colors: { ...project.colors, overrides: { ...project.colors.overrides, ...(v.overrides.colors ?? {}) } },
    decorativeTheme: { ...project.decorativeTheme, ...(v.overrides.decorativeTheme ?? {}) },
    wording: {
      ...project.wording,
      ...(v.overrides.title !== undefined ? { productTitle: v.overrides.title } : {}),
      ...(v.overrides.subtitle !== undefined ? { productSubtitle: v.overrides.subtitle } : {}),
    },
  };
}

// ─── Resolved document ─────────────────────────────────────────────────────
export type ResolvedDocument = {
  project: ProductProject;
  productType: ProductTypeDefinition;
  trim: ResolvedTrim;
  binding: BindingProfile;
  printProfile: PrintProfile;
  calendar: CalendarData | null;
  weekStart: WeekStart;
  recipe: ExpandedRecipe;
  spacing: SpacingTokens;
  typography: TypographySettings;
  colors: ColorTokens;
  wording: Wording;
  decorative: DecorativeTheme;
  duplex: boolean;
};

function isPaged(binding: BindingProfile, duplex: boolean): boolean {
  return binding.boundEdgeMode === "book-spine" || (binding.boundEdgeMode === "punched-leaf" && duplex);
}

export function resolveDocument(input: ProductProject): ResolvedDocument {
  const project = applyVariant(input);
  const productType = PRODUCT_TYPES[project.productType];
  const trim = resolveTrim(project.dimensions);
  const binding = getBindingProfile(project.production.bindingType);
  const printProfile = getPrintProfile(project.production.printProfileId);
  const calendar = project.calendar ? getCalendar(project.calendar) : null;
  const duplex = binding.boundEdgeMode === "book-spine" ? true : project.production.duplex;
  const paged = isPaged(binding, duplex);

  const recipeKey = JSON.stringify([project.recipe, project.calendar, paged]);
  const recipe = recipeCache.get(recipeKey, () =>
    expandRecipe(project.recipe, {
      calendar,
      paged,
      fillerLayoutId: FILLER_LAYOUT_ID,
      pagesPerInstance: (id) => getLayout(id).pages,
    }),
  );

  return {
    project,
    productType,
    trim,
    binding,
    printProfile,
    calendar,
    weekStart: project.calendar?.weekStart ?? 1,
    recipe,
    spacing: resolveSpacing(project.spacing.density, project.spacing.overrides),
    typography: resolveTypography(project.typography.fonts, project.typography.roleOverrides),
    colors: resolveColors(project.colors.paletteId, project.colors.overrides),
    wording: resolveWording(project.wording),
    // Projects saved before the design-library snapshot may carry retired
    // styles (geometric, abstract, …) or lack role colors: normalize them.
    decorative: normalizeDecoration({ ...DEFAULT_DECORATIVE, ...project.decorativeTheme }),
    duplex,
  };
}

export function geometryFor(doc: ResolvedDocument, page: Pick<PageInstance, "side">): PageGeometry {
  const p = doc.project.production;
  const key = JSON.stringify([doc.trim.widthIn, doc.trim.heightIn, doc.trim.orientation, p, doc.project.productType, doc.recipe.pageCount, page.side, doc.duplex]);
  return geometryCache.get(key, () =>
    computePageGeometry({
      trim: doc.trim,
      binding: doc.binding,
      boundEdge: p.boundEdge,
      printProfile: doc.printProfile,
      includeBleed: p.includeBleed,
      pageCount: doc.recipe.pageCount,
      side: page.side,
      duplex: doc.duplex,
      recommendedOverrides: PRODUCT_RECOMMENDED_MARGINS[doc.project.productType],
      userMargins: p.userMargins,
    }),
  );
}

/** Pages that belong to the same layout instance (1, or 2 for a spread). */
export function instancePages(doc: ResolvedDocument, index: number): PageInstance[] {
  const page = doc.recipe.pages[index];
  if (page.spreadPart === undefined) return [page];
  const first = page.spreadPart === 0 ? index : index - 1;
  return [doc.recipe.pages[first], doc.recipe.pages[first + 1]];
}

/** Solve the page at `index` (solving its whole spread when needed). */
export function solvePage(doc: ResolvedDocument, index: number): SolvedPage {
  const group = instancePages(doc, index);
  const layout = getLayout(group[0].layoutId);
  const geometries = group.map((p) => geometryFor(doc, p));
  const typeSizes = Object.fromEntries(Object.entries(doc.typography.roles).map(([k, r]) => [k, [r.sizePt, r.lineHeight]]));
  // The layout id is part of the key: two recipe steps (or one step whose
  // layout changed) can share a page key, and must never share solved output.
  const key = JSON.stringify([
    layout.id,
    group.map((p) => p.key + p.pageNumber),
    geometries.map((g) => [g.trimWidthIn, g.trimHeightIn, g.safe, g.side]),
    doc.spacing,
    typeSizes,
    doc.wording,
    doc.project.functionalPattern,
    doc.project.layoutOptions,
    doc.weekStart,
    doc.calendar?.settings,
  ]);
  const solved = solveCache.get(key, () => {
    const ctx: LayoutContext = {
      pages: geometries,
      pageNumbers: group.map((p) => p.pageNumber),
      spacing: doc.spacing,
      typography: doc.typography,
      wording: doc.wording,
      pattern: doc.project.functionalPattern,
      options: doc.project.layoutOptions,
      calendar: doc.calendar,
      weekStart: doc.weekStart,
      period: group[0].period,
    };
    try {
      return layout.solve(ctx);
    } catch (err) {
      return group.map(() => ({
        nodes: [],
        metrics: [],
        diagnostics: [{ severity: "error" as const, rule: "layout-solver", componentId: layout.id, message: (err as Error).message }],
      }));
    }
  });
  return solved[group.indexOf(doc.recipe.pages[index])];
}

// ─── Layout availability (drives the editor's layout / option controls) ────
export type LayoutAvailability = {
  layoutId: string;
  label: string;
  /** Offered for this product type at all. */
  supportedType: boolean;
  fit: FitResult;
};

/** Representative page for fit checks: the first recto (inside margin on the left). */
export function representativeGeometry(doc: ResolvedDocument): PageGeometry {
  const first = doc.recipe.pages.find((p) => !p.filler) ?? { side: "recto" as const };
  return geometryFor(doc, { side: first.side === "single" ? "single" : "recto" });
}

export function layoutAvailability(doc: ResolvedDocument): LayoutAvailability[] {
  const page = representativeGeometry(doc);
  return LAYOUTS.map((l) => ({
    layoutId: l.id,
    label: l.label,
    supportedType: l.capability.supportedProductTypes.includes(doc.project.productType),
    fit: l.fit({ page, spacing: doc.spacing, typography: doc.typography, options: doc.project.layoutOptions }),
  }));
}

/** Layouts actually used by the recipe, with their fit on this page size. */
export function recipeLayouts(doc: ResolvedDocument): { layout: LayoutDefinition; fit: FitResult }[] {
  const page = representativeGeometry(doc);
  const ids = [...new Set(doc.project.recipe.items.map((i) => i.layoutId))];
  return ids.map((id) => {
    const layout = getLayout(id);
    return { layout, fit: layout.fit({ page, spacing: doc.spacing, typography: doc.typography, options: doc.project.layoutOptions }) };
  });
}

/** Composition (regions + protected content) of a page — what the renderer and validation both use. */
export function compositionFor(doc: ResolvedDocument, index: number): Composition {
  return resolveComposition(geometryFor(doc, doc.recipe.pages[index]), solvePage(doc, index), doc.typography, doc.spacing);
}
