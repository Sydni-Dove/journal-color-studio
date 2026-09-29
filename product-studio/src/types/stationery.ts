/**
 * STATIONERY RECIPES — the semantic structure of a page (or spread), with no
 * physical measurements beyond research reference values (table columns).
 *
 *   stationery recipe  (this file: WHAT sections exist, their order, weight, surface)
 *   → geometry         (engines/stationery: trim → usable body → zone rects, column widths)
 *   → page model       (layouts/stationery: LayoutNodes)
 *   → theme            (colors / fonts / decoration — never structure)
 *   → renderer         (primitives/PrintablePage — unchanged)
 *
 * A recipe is a reusable, pre-engineered product structure: choosing a recipe
 * and a trim produces a properly proportioned page with no manual margins,
 * section heights or column widths.
 */

/** Stationery families the catalog is organised by (the studio home shows the same families). */
export type StationeryFamily = "planner" | "journal" | "devotional" | "worksheet";

/**
 * Writing surfaces a zone may request. Surfaces are rendered by one registry
 * (layouts/stationery/surfaces.ts), independent of any recipe.
 */
export type SurfaceKind =
  | "blank"
  | "lined"
  | "prompt-response"
  | "table"
  | "checkbox"
  | "fill-in"
  | "scripture"
  | "reflection"
  | "prayer"
  | "dot-grid"
  /** The project's own writing style (ruled, dot grid, graph or blank): guided pages. */
  | "pattern";

/** A research table column: reference width in inches, scaled by the geometry layer to the page. */
export type TableColumn = { key: string; label: string; referenceWidthIn: number };

export type TableSpec = {
  columns: TableColumn[];
  /** Where the reference widths come from (shown in metrics / docs). */
  basis: string;
  /** Show column headings; defaults to true. */
  showHeader?: boolean;
  /** Visual rules only; geometry stays the same. */
  borders?: "grid" | "horizontal" | "minimal" | "none";
};

export type StationeryZone = {
  /** Stable semantic key (customizations and wording refer to it). */
  key: string;
  /** Default heading. */
  label: string;
  /** Optional guidance line under the heading (prompt-response surfaces). */
  prompt?: string;
  surface: SurfaceKind;
  /**
   * Relative share of the page's flexible space (importance). Fixed-height
   * surfaces (fill-in) ignore it.
   */
  weight: number;
  /** Optional sections may be removed by the creator. Default: required. */
  optional?: boolean;
  /** Fill-in surfaces: the labelled blanks on one row (e.g. ["Date", "Day"]). */
  fields?: string[];
  /** Table surfaces. */
  table?: TableSpec;
  /** Checklist/task marker options. */
  taskMarker?: import("./prompts").TaskMarker;
  taskMarkerPosition?: import("./prompts").TaskMarkerPosition;
  /**
   * Scripture surfaces: framed (a bordered passage area — the default),
   * open (the same open ruled lines as the other sections) or callout (open
   * lines with one hairline quote bar). Composition, not theme: it is part of
   * the recipe's design language.
   */
  treatment?: "framed" | "open" | "callout";
  /** Prompt blocks: writing lines requested (undefined = share the page's free space). */
  lines?: number;
  /** Prompt blocks: the fewest lines the section may get. */
  minLines?: number;
  /** Prompt blocks: an equal share — every "equal" section on the page gets the same number of whole lines. */
  equal?: boolean;
};

export type StationeryPageSpec = {
  /** Page heading (e.g. "SOAP"). Empty = no header. */
  title: string;
  zones: StationeryZone[];
};

export type StationeryRecipe = {
  /** Stable combo id: `<family>-<type>.<variant>`, e.g. `devotional-soap.four-band`. */
  comboId: string;
  family: StationeryFamily;
  /** Stationery type within the family (e.g. "soap", "reading-tracker"). */
  stationeryType: string;
  /** Layout variant of that type (e.g. "four-band", "table"). */
  variant: string;
  label: string;
  description: string;
  /** Size preset ids this structure is engineered for. */
  supportedTrims: string[];
  /** One page, or a two-page spread (verso, recto). */
  pages: StationeryPageSpec[];
  /**
   * Minimum response : prompt height ratio (research: ~5 : 1 for guided
   * devotional prompts). Zones that cannot keep it make the trim incompatible.
   */
  minResponseToPromptRatio?: number;
  /**
   * Page composition. lineSnap: every writing area holds whole writing lines
   * at the page's ruling (no part-line strip left under the last line); the
   * remainder is spread evenly between sections so the page reads top to
   * bottom with even rhythm.
   */
  composition?: { lineSnap?: boolean };
  /**
   * Size-aware structural variants, tried in order when the full structure
   * does not fit a trim (it fails the writing-space rules, or the trim is not
   * one of its own). A variant leaves out named sections; everything else
   * (surfaces, weights, composition, customization) is the recipe's own.
   */
  sizeVariants?: StationerySizeVariant[];
  /** What the creator may change (semantic controls only). */
  customization: { rename: boolean; reorder: boolean; adjustSpace: boolean; editPrompts: boolean };
};

export type StationerySizeVariant = {
  id: string;
  label: string;
  /** Section keys this variant leaves out. */
  omit: string[];
  /** Trims this variant is engineered for. */
  supportedTrims: string[];
};

/** Semantic space choice per section (translated to weights by the geometry layer). */
export type SectionSpace = "less" | "standard" | "more";

/**
 * Creator customization of ONE recipe. Stored per combo id on the project;
 * the recipe itself is never mutated.
 */
export type StationeryCustomization = {
  /** Section key → heading. */
  rename?: Record<string, string>;
  /** Section key → prompt text. */
  prompts?: Record<string, string>;
  /** Optional sections the creator removed. */
  hidden?: string[];
  /** Per page: section keys in the creator's order (unknown / missing keys fall back to recipe order). */
  order?: string[][];
  /** Section key → space. */
  space?: Record<string, SectionSpace>;
  /** "recipe" keeps the designed proportions; "equal" gives every writing section the same space. */
  balance?: "recipe" | "equal";
  /**
   * Prompt + response blocks per page (types/prompts.ts). When set for a page,
   * its writing sections are exactly these blocks (fixed rows such as the date
   * line stay); rename / hidden / order / space above then no longer apply to it.
   */
  promptPages?: (import("./prompts").PromptSet | undefined)[];
  /** Page title override (the recipe's title otherwise). */
  title?: string;
};
