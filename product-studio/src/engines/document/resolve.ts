/**
 * DOCUMENT RESOLVER — turns structured project state into solved pages.
 *
 * Each stage is cached by ONLY the inputs it depends on:
 *   calendar  ← calendar settings                      (colors/fonts never touch it)
 *   recipe    ← recipe + calendar + binding paging      (fonts never touch it)
 *   geometry  ← trim + production + page count + side  (theme never touches it)
 *   layout    ← geometry + spacing + type styles + wording + pattern + options + period
 *               + the layout text measurer (headings are fitted to measured text,
 *               so the fonts and their metrics are part of the key)
 * Colors and decorative themes are applied at render time only, so changing
 * them never re-solves geometry or dates.
 */
import { getLayout, FILLER_LAYOUT_ID, BLANK_FILLER_LAYOUT_ID, LAYOUTS } from "../../layouts/registry";
import { fillerKindOf, monthlyArrangementOf, spreadModeOf } from "../../layouts/planner/plannerOptions";
import type { FitResult, LayoutContext, LayoutDefinition } from "../../layouts/shared/types";
import { getBindingProfile } from "../../presets/bindingProfiles/bindingProfiles";
import { getPrintProfile } from "../../presets/printProfiles/printProfiles";
import { PRODUCT_RECOMMENDED_MARGINS, PRODUCT_TYPES } from "../../presets/products/productTypes";
import { resolveSpacing } from "../../presets/spacing/spacingPresets";
import { resolveColors } from "../../presets/themes/palettes";
import { resolveTypography } from "../../presets/typography/typography";
import { isScriptFont, withLuxeCoverType } from "../../presets/coverLuxe";
import { resolveWording } from "../../presets/wording";
import type { BindingProfile } from "../../types/binding";
import type { CalendarData, WeekStart } from "../../types/calendar";
import type { PageGeometry, PageSide } from "../../types/geometry";
import { sidewaysGeometry } from "../geometry/turn";
import type { SolvedPage } from "../../types/layout";
import type { PrintProfile } from "../../types/print";
import type { ProductTypeDefinition } from "../../types/product";
import type { ProductProject } from "../../types/project";
import type { PageInstance } from "../../types/recipe";
import type { DecorativeTheme } from "../../types/theme";
import type { ColorTokens, SpacingTokens, TypographySettings, Wording } from "../../types/tokens";
import { getCalendar } from "../calendar/calendar";
import { getLayoutMeasurer } from "../typography/textMeasure";
import { resolveTrim, type ResolvedTrim } from "../geometry/dimensions";
import { computePageGeometry } from "../geometry/pageGeometry";
import { expandRecipe, recipeSteps, type ExpandedRecipe } from "../recipe/recipe";
import { sectionPageOrientationOf } from "../../layouts/planner/plannerOptions";
import { normalizeDecoration } from "../../themes/decorationPlan";
import { resolveComposition } from "../composition/composition";
import type { Composition } from "../../types/composition";
import { DEFAULT_DECORATIVE } from "../../presets/products/projectFactory";
import { NO_LAYER, splitLayers } from "../../themes/layers";

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
    ...(project.backgroundTheme || v.overrides.backgroundTheme
      ? { backgroundTheme: { ...(project.backgroundTheme ?? NO_LAYER), ...(v.overrides.backgroundTheme ?? {}) } }
      : {}),
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
  /** Decorative ELEMENTS layer (florals, line art). */
  decorative: DecorativeTheme;
  /** BACKGROUND / surface layer (solid, marble, pattern, watercolor), drawn under the elements. */
  background: DecorativeTheme;
  duplex: boolean;
  /**
   * The text measurer the pages were laid out with ("heuristic" until the real
   * fonts are loaded, then "canvas:…"). Export only proceeds when this is the
   * real-font measurer for the current fonts (engines/print/readiness.ts).
   */
  measurerId: string;
  /** Measurement notes from resolving (e.g. the page count did not settle). */
  resolveNotes: string[];
};

function isPaged(binding: BindingProfile, duplex: boolean): boolean {
  return binding.boundEdgeMode === "book-spine" || (binding.boundEdgeMode === "punched-leaf" && duplex);
}

/** Cover and divider pages drawn in a designed style (not "plain"): they carry that design's title type. */
export const designedCoverPage = (p: PageInstance) => (p.layoutId === "cover-page" || p.layoutId === "back-cover-page" || p.layoutId === "divider-page") && (p.module?.cover?.preset ?? "neutral-cheetah-luxe") === "neutral-cheetah-luxe";

/**
 * The document's typography: the project's, plus — when the book has Neutral
 * Cheetah Luxe covers or dividers — that design's script title and spaced
 * subtitle, so choosing the design gives its type without changing the
 * project's other fonts or colors.
 */
function bookTypography(project: ProductProject, recipe: ExpandedRecipe): TypographySettings {
  let t = resolveTypography(project.typography.fonts, project.typography.roleOverrides);
  // A script title is lettered as written: never forced into spaced capitals (the cover title's default style).
  if (isScriptFont(t.roles.coverTitle.family ?? t.fonts.cover)) {
    const own = project.typography.roleOverrides?.coverTitle ?? {};
    t = { ...t, roles: { ...t.roles, coverTitle: { ...t.roles.coverTitle, transform: own.transform ?? "none", trackingEm: own.trackingEm ?? 0 } } };
  }
  return recipe.pages.some(designedCoverPage) ? withLuxeCoverType(t, project.typography.roleOverrides) : t;
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

  const base = {
    calendar,
    paged,
    spreadMode: spreadModeOf(project.layoutOptions),
    fillerLayoutId: fillerKindOf(project.layoutOptions) === "blank" ? BLANK_FILLER_LAYOUT_ID : FILLER_LAYOUT_ID,
    pagesPerInstance: (id: string) => getLayout(id).pages,
    layoutPeriod: (id: string) => getLayout(id).period,
    layoutLabel: (id: string) => getLayout(id).label,
  };
  // The recipe key covers everything expansion reads: recipe, calendar,
  // paging, and the facing-page behavior (spread mode + filler kind).
  const recipeKey = JSON.stringify([project.recipe, project.calendar, paged, base.spreadMode, base.fillerLayoutId]);
  let recipe = recipeCache.get(recipeKey, () => expandRecipe(project.recipe, base));
  const resolveNotes: string[] = [];
  // Content that continues on more pages (prompt + response pages): measure it against this product's own pages,
  // then expand again with the continuation pages. Two things change what a page holds:
  //   · the side: left- and right-hand pages mirror the binding margins, so both are measured and the larger
  //     page count is used (they are the same width for every binding today; tests/measurement.test pins that);
  //   · the page count: a spine binding's gutter grows with the book's thickness in printer bands (KDP, Lulu), so
  //     continuation pages can push the book into a band with a wider gutter and a narrower page. The count is
  //     measured again until the pages it was measured on are the pages the book ends up with.
  if (recipe.pages.some((pg) => getLayout(pg.layoutId).flowPages)) {
    const spacing = resolveSpacing(project.spacing.density, project.spacing.overrides);
    // The type the pages are drawn with (incl. a designed cover's), so measuring and drawing agree.
    const typography = bookTypography(project, recipe);
    const sides: PageSide[] = paged ? ["recto", "verso"] : ["single"];
    const pagesAt = (pageCount: number) =>
      sides.map((side) =>
        computePageGeometry({
          trim,
          binding,
          boundEdge: project.production.boundEdge,
          printProfile,
          includeBleed: project.production.includeBleed,
          pageCount,
          side,
          duplex,
          recommendedOverrides: PRODUCT_RECOMMENDED_MARGINS[project.productType],
          userMargins: project.production.userMargins,
        }),
      );
    // What measuring depends on: the usable page on each side (not the count itself, so books in one band share a cache).
    const pageKey = (pages: PageGeometry[]) => JSON.stringify(pages.map((g) => [g.safeRect, g.trimWidthIn, g.trimHeightIn]));
    const measuredOn = (pages: PageGeometry[]) => {
      const fits = pages.map((page) => ({ page, spacing, typography, options: project.layoutOptions, pattern: project.functionalPattern }));
      const flowKey = JSON.stringify([recipeKey, pageKey(pages), project.productType, spacing, project.typography, project.layoutOptions, project.functionalPattern, getLayoutMeasurer().id]);
      return recipeCache.get(flowKey, () =>
        expandRecipe(project.recipe, { ...base, flowPages: (id, module) => Math.max(...fits.map((f) => getLayout(id).flowPages?.({ ...f, module }) ?? 1)) }),
      );
    };
    // The gutter only grows with the page count, and more continuation pages only follow from a narrower page,
    // so this settles in a step or two (bounded for safety).
    let measuredPages = pagesAt(recipe.pageCount);
    let settled = false;
    for (let round = 0; round < 8; round++) {
      const next = measuredOn(measuredPages);
      const finalPages = pagesAt(next.pageCount);
      recipe = next;
      if (pageKey(finalPages) === pageKey(measuredPages)) {
        settled = true;
        break;
      }
      measuredPages = finalPages;
    }
    if (!settled) resolveNotes.push("Continuation pages were measured on the final page size, but the page count did not settle; check pages that continue.");
  }

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
    typography: bookTypography(project, recipe),
    colors: resolveColors(project.colors.paletteId, project.colors.overrides, project.colors),
    wording: resolveWording(project.wording),
    // Projects saved before the design-library snapshot may carry retired
    // styles (geometric, abstract, …) or lack role colors: normalize them.
    ...(() => {
      const layers = splitLayers(project.backgroundTheme && { ...DEFAULT_DECORATIVE, ...project.backgroundTheme }, { ...DEFAULT_DECORATIVE, ...project.decorativeTheme });
      return { decorative: normalizeDecoration(layers.elements), background: normalizeDecoration(layers.background) };
    })(),
    duplex,
    measurerId: getLayoutMeasurer().id,
    resolveNotes,
  };
}

export function geometryFor(doc: ResolvedDocument, page: PageInstance | Pick<PageInstance, "side">, index?: number): PageGeometry {
  const p = doc.project.production;
  const trim = "layoutId" in page ? trimForPage(doc, page, index) : doc.trim;
  const key = JSON.stringify([trim.widthIn, trim.heightIn, trim.orientation, p, doc.project.productType, doc.recipe.pageCount, page.side, doc.duplex]);
  return geometryCache.get(key, () =>
    computePageGeometry({
      trim,
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

/**
 * The trim for one page. Planner sections can override the project's page
 * orientation (e.g. landscape monthlies in a portrait planner); the trim is
 * the project trim turned to that orientation. A filler page keeps a spread
 * open, so it takes the orientation of the spread it faces (the nearest
 * non-filler page, preferring the one after it).
 */
export function trimForPageLike(
  project: ProductProject,
  base: ResolvedTrim,
  page: PageInstance,
  pages: readonly PageInstance[],
  index?: number,
): ResolvedTrim {
  let layoutId = page.layoutId;
  if (page.filler) {
    const i = index ?? pages.indexOf(page);
    const next = pages.slice(i + 1).find((q) => !q.filler) ?? pages.slice(0, i).reverse().find((q) => !q.filler);
    if (next) layoutId = next.layoutId;
  }
  const want = sectionPageOrientationOf(project.layoutOptions, base.orientation, layoutId);
  if (want === base.orientation) return base;
  return { ...base, widthIn: base.heightIn, heightIn: base.widthIn, orientation: want, label: `${base.label} (${want})` };
}

/** The trim for one page of a resolved document. */
export function trimForPage(doc: ResolvedDocument, page: PageInstance, index?: number): ResolvedTrim {
  return trimForPageLike(doc.project, doc.trim, page, doc.recipe.pages, index);
}

/** Pages that belong to the same layout instance (1, 2 for a spread, or a page and its continuation pages). */
export function instancePages(doc: ResolvedDocument, index: number): PageInstance[] {
  const page = doc.recipe.pages[index];
  // Content continued on more pages is one instance.
  if (page.flowCount && page.flowPart !== undefined) {
    const first = index - page.flowPart;
    return doc.recipe.pages.slice(first, first + page.flowCount);
  }
  if (page.spreadPart === undefined) return [page];
  const first = page.spreadPart === 0 ? index : index - 1;
  return [doc.recipe.pages[first], doc.recipe.pages[first + 1]];
}

/**
 * FACING PAGES — the page opposite this one in the open book (a left-hand
 * page faces the next page, a right-hand page the one before), when that page
 * is a single-page layout that declares its header zone. Two-page spreads and
 * one-sided products have no separate facing page.
 */
export function facingIndex(doc: ResolvedDocument, index: number): number | null {
  const p = doc.recipe.pages[index];
  if (!p || p.side === "single" || p.spreadPart !== undefined) return null;
  const j = p.side === "verso" ? index + 1 : index - 1;
  const q = doc.recipe.pages[j];
  if (!q || q.spreadPart !== undefined || q.side === p.side) return null;
  return j;
}

function facingHeader(doc: ResolvedDocument, index: number): number | undefined {
  const j = facingIndex(doc, index);
  if (j === null) return undefined;
  const q = doc.recipe.pages[j];
  const other = getLayout(q.layoutId);
  if (!other.headerIn || other.pages !== 1) return undefined;
  const h = other.headerIn({ page: geometryFor(doc, q, j), spacing: doc.spacing, typography: doc.typography, options: doc.project.layoutOptions, pattern: doc.project.functionalPattern, module: q.module });
  return h > 0 ? h : undefined;
}

/**
 * True when the page's content is designed in landscape and rotated 90° onto
 * the portrait sheet (the rotated monthly calendar).
 */
export function isRotatedMonthly(doc: ResolvedDocument, page: PageInstance): boolean {
  return page.layoutId === "planner-monthly" && monthlyArrangementOf(doc.project.layoutOptions) === "rotated";
}

/**
 * The geometry a page's CONTENT is solved in. Rotated monthly pages solve in
 * landscape (the turned geometry); everything else solves in the paper
 * geometry. Renderers pair this with the solved nodes; the paper geometry
 * stays portrait for the sheet, preview frame, and print sizing.
 */
export function contentGeometryFor(doc: ResolvedDocument, page: PageInstance | Pick<PageInstance, "side">, index?: number): PageGeometry {
  const g = geometryFor(doc, page, index);
  return "layoutId" in page && isRotatedMonthly(doc, page as PageInstance) ? sidewaysGeometry(g) : g;
}

/** Solve the page at `index` (solving its whole spread when needed). */
export function solvePage(doc: ResolvedDocument, index: number): SolvedPage {
  const group = instancePages(doc, index);
  const layout = getLayout(group[0].layoutId);
  const geometries = group.map((p, k) => contentGeometryFor(doc, p, index + k));
  const typeSizes = Object.fromEntries(Object.entries(doc.typography.roles).map(([k, r]) => [k, [r.sizePt, r.lineHeight, r.group, r.weight, r.style, r.trackingEm, r.transform]]));
  const facingHeaderIn = layout.alignsHeader && group.length === 1 ? facingHeader(doc, index) : undefined;
  // The layout id is part of the key: two recipe steps (or one step whose
  // layout changed) can share a page key, and must never share solved output.
  const key = JSON.stringify([
    layout.id,
    group.map((p) => p.key + p.pageNumber),
    group[0].module ?? null,
    geometries.map((g) => [g.trimWidthIn, g.trimHeightIn, g.safe, g.side]),
    doc.spacing,
    typeSizes,
    doc.typography.fonts,
    getLayoutMeasurer().id,
    doc.wording,
    doc.project.functionalPattern,
    doc.project.layoutOptions,
    doc.weekStart,
    doc.calendar?.settings,
    facingHeaderIn ?? null,
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
      module: group[0].module,
      ...(facingHeaderIn ? { facingHeaderIn } : {}),
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
    fit: l.fit({ page, spacing: doc.spacing, typography: doc.typography, options: doc.project.layoutOptions, pattern: doc.project.functionalPattern }),
  }));
}

/** Layouts actually used by the recipe, with their fit on this page size. */
export function recipeLayouts(doc: ResolvedDocument): { layout: LayoutDefinition; fit: FitResult }[] {
  const page = representativeGeometry(doc);
  const ids = [...new Set(recipeSteps(doc.project.recipe).map((i) => i.layoutId))];
  return ids.map((id) => {
    const layout = getLayout(id);
    return { layout, fit: layout.fit({ page, spacing: doc.spacing, typography: doc.typography, options: doc.project.layoutOptions, pattern: doc.project.functionalPattern }) };
  });
}

/** Composition (regions + protected content) of a page — what the renderer and validation both use. */
export function compositionFor(doc: ResolvedDocument, index: number): Composition {
  return resolveComposition(contentGeometryFor(doc, doc.recipe.pages[index], index), solvePage(doc, index), doc.typography, doc.spacing);
}
