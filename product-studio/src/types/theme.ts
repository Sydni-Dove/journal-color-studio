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

export type DecorativePlacement = "full-page" | "header-band" | "border-frame" | "corners";

export type DecorativeTheme = {
  style: DecorativeStyle;
  /** design-library asset id (marble / floral / accent styles). */
  assetId?: string;
  placement: DecorativePlacement;
  /** Size of accent / floral corner art relative to the default, or marble zoom. */
  scale: number;
  opacity: number;
  /** Role colors: base (stone / leaves / accent ink), veins, highlights. */
  colorA: ColorToken;
  colorB: ColorToken;
  colorC: ColorToken;
  /** Full-page decoration may extend under writing areas (off keeps them clean). */
  applyToInterior: boolean;
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
