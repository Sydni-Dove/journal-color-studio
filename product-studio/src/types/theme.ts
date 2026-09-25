import type { DecorationPlacementOverrides } from "./composition";
import type { ColorToken, ColorTokens, FontSelection, TypographyRole, TypographyRoleStyle } from "./tokens";

// ─── Functional patterns (writing surfaces) ────────────────────────────────
export type FunctionalPatternKind =
  | "blank"
  | "ruled"
  | "dot-grid"
  | "graph-grid"
  | "checklist"
  | "cornell"
  | "split-column"
  | "margin-ruled";

export type RulingPresetId = "wide" | "college" | "narrow" | "a5-refill" | "custom";
export type GridPresetId = "dot-5mm" | "graph-5mm" | "hobonichi-daily" | "hobonichi-monthly" | "custom";

export type FunctionalPattern = {
  kind: FunctionalPatternKind;
  rulingPreset: RulingPresetId;
  /** Used when rulingPreset = custom (inches). */
  customLineSpacingIn: number;
  gridPreset: GridPresetId;
  /** Used when gridPreset = custom (inches). */
  customPitchIn: number;
  dotSizePt: number;
  lineWeightPt: number;
  /** Graph grid: draw a heavier line every N cells (0 = off). */
  majorEvery: number;
  majorWeightPt: number;
  /** Margin-ruled paper: vertical line distance from the left trim edge (inches). */
  marginLineIn: number;
  color: ColorToken;
  opacity: number;
};

// ─── Decorative theme (never affects functional geometry) ──────────────────
/**
 * Every style maps to real artwork: solid fill, the Journal Color Studio
 * marble / floral / line-art snapshots (design-library), or the JCS
 * watercolor bloom layout.
 */
export type DecorativeStyle = "none" | "solid" | "marble" | "watercolor" | "floral" | "accent";

/**
 * Placement = WHAT kind of composition. Fields (solid / marble / watercolor)
 * cover an area; objects (florals, line art) are anchored to page regions.
 *   full-page     field behind everything, soft strength (overlap by definition)
 *   header-band   field / band from the top edge down to just above the content
 *   border-frame  field / tiled texture around the content with a clearance
 *   corners       objects at page corners (pair or single, see `corners`)
 *   title-flank   objects flanking the title, sitting on its header rule
 *   top-bottom    objects centred on the top and bottom edges
 *   behind-title  object behind the title at subtle strength (intentional overlap)
 */
export type DecorativePlacement = "full-page" | "header-band" | "border-frame" | "corners" | "title-flank" | "top-bottom" | "behind-title";

/** Which corners a "corners" placement uses. */
export type CornerSet = "opposite-tl-br" | "opposite-tr-bl" | "tl" | "tr" | "bl" | "br";

export type DecorativeTheme = {
  style: DecorativeStyle;
  /** design-library asset id (marble / floral / accent styles). */
  assetId?: string;
  placement: DecorativePlacement;
  /** Size of accent / floral art relative to the default, or marble zoom. */
  scale: number;
  opacity: number;
  /** Role colors: base (stone / leaves / accent ink), veins, highlights. */
  colorA: ColorToken;
  colorB: ColorToken;
  colorC: ColorToken;
  /** @deprecated Superseded by placement "full-page" (behind content) vs "border-frame"; migrated on load. */
  applyToInterior?: boolean;
  /** Corners used by the "corners" placement (default depends on the artwork). */
  corners?: CornerSet;
  /** Advanced placement overrides for object decorations (anchor, alignment, size limits, offsets, rules). */
  layout?: DecorationPlacementOverrides;
};

// ─── Generic theme interface (future Journal Color Studio integration) ─────
/**
 * A self-contained theme Product Studio can apply. Journal Color Studio (or
 * any other source) may produce one of these LATER via an adapter; no
 * connection is implemented now.
 */
export type ProductTheme = {
  id: string;
  label: string;
  colors: ColorTokens;
  typography?: {
    fonts?: Partial<FontSelection>;
    roles?: Partial<Record<TypographyRole, Partial<TypographyRoleStyle>>>;
  };
  decorativeBackground?: DecorativeTheme;
  functionalLineStyle?: Partial<Pick<FunctionalPattern, "lineWeightPt" | "color" | "opacity" | "dotSizePt">>;
  assets?: ThemeAsset[];
};

export type ThemeAsset = { id: string; kind: "image" | "svg"; url: string; label?: string };

/** Untyped payload shape an external app may hand over in the future. */
export type ExternalThemePackage = {
  colors?: Record<string, string>;
  typography?: unknown;
  decorativeBackground?: unknown;
  lineStyle?: unknown;
  assets?: unknown[];
};
