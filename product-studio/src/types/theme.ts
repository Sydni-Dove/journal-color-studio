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
 * cover an area; objects (florals, line art) are placed relative to semantic
 * targets (title, title rule, page corner, page edge, header, footer).
 *   full-page        field behind everything, soft strength (overlap by definition)
 *   header-band      field / band from the top edge down to just above the content
 *   border-frame     field / tiled texture around the content with a clearance
 *   corners          objects at page corners (see `corners` + `edge`)
 *   title-accent     an accent attached to the title or its rule (see `titlePosition`)
 *   top-bottom       objects centred on the top and bottom edges
 *   behind-title     object behind the title at subtle strength (intentional overlap)
 *   edge-accent      art along the outer side edge, running off it (intentional crop)
 *   header-flourish  art in the header, resting on the title rule, opposite the title
 *   footer-flourish  art centred in the footer space below the content (florals: entering from the bottom edge)
 *   footer-band      field from just below the content to the bottom edge
 *   edge-strip       field along the outer side edge, up to the content
 */
export type DecorativePlacement =
  | "full-page"
  | "header-band"
  | "border-frame"
  | "corners"
  | "title-accent"
  | "top-bottom"
  | "behind-title"
  | "edge-accent"
  | "header-flourish"
  | "footer-flourish"
  | "footer-band"
  | "edge-strip";

/** Which corners a "corners" placement uses. */
export type CornerSet = "opposite-tl-br" | "opposite-tr-bl" | "all" | "top" | "bottom" | "tl" | "tr" | "bl" | "br";

/**
 * How an object meets the page edge.
 *   contained  the whole artwork stays visible inside its region (inset from the trim, clear of content);
 *              it shrinks — or reports a conflict — rather than being cropped (the default)
 *   bleed      the artwork deliberately runs `edgeBleedAmount` past the trim edge and is cropped there
 */
export type EdgeTreatment = "contained" | "bleed";

/** Where a title accent attaches (semantic target: the title ink or the title rule). */
export type TitleAccentPosition =
  | "title-left"
  | "title-right"
  | "title-above"
  | "title-above-center"
  | "title-below"
  | "title-below-center"
  | "rule-left"
  | "rule-center"
  | "rule-right"
  | "rule-both";

/**
 * What an artwork is designed to do (declared per asset in the design
 * library). Only placements an asset declares are offered for it.
 */
export type DecorationCapability =
  | "title-left"
  | "title-right"
  | "title-above"
  | "title-below"
  | "title-rule-left"
  | "title-rule-center"
  | "title-rule-right"
  | "corner-contained"
  | "corner-bleed"
  | "edge-accent"
  | "margin-frame"
  | "header-band"
  | "header-flourish"
  | "footer-flourish"
  | "footer-band"
  | "edge-strip"
  | "top-bottom"
  | "behind-title"
  | "background";

/**
 * An artwork's visual JOB — what it is designed to decorate. Roles decide
 * which placements an asset offers; placements attach the art to a target
 * (page edge, title rule, header, footer, content boundary), never to
 * leftover empty space.
 */
export type DecorationRole =
  | "background"
  | "frame"
  | "band"
  | "edge"
  | "corner"
  | "divider"
  | "rule-accent"
  | "heading-accent"
  | "header-flourish"
  | "footer-flourish";

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
  /** Contained (default) or bleed, for corner objects. */
  edge?: EdgeTreatment;
  /** Title-accent attachment (default depends on the title's alignment). */
  titlePosition?: TitleAccentPosition;
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
