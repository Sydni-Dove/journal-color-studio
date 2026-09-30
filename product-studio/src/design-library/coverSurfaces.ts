/**
 * COVER-ONLY SURFACES — Journal Color Studio artwork offered as a front / end
 * cover (or divider) design. Each choice is a pointer into the approved
 * design-library snapshot (library.ts) plus the JCS palette the art was
 * designed in; nothing is copied and nothing is recolored here. The page's
 * surface is drawn by the same decoration renderer and recolor pipeline as a
 * product background (themes/decorationPlan.ts, themes/recolor.ts).
 *
 *   Journal Color Studio → approved snapshot (library.ts) → this list → the cover
 *
 * A cover surface lives on the cover step only (CoverDividerSettings); it is
 * never written to the product's background, so interior pages don't inherit it.
 */
import { findPalette, resolveColors } from "../presets/themes/palettes";
import type { DecorativeTheme } from "../types/theme";
import type { ColorToken, ColorTokens } from "../types/tokens";
import { findAsset } from "./library";
import { jcsPaletteId } from "./palettes";

export type CoverSurfaceChoice = {
  /** The design-library asset (marble layer map or layered watercolor). */
  assetId: string;
  label: string;
  hint: string;
  /** The JCS palette the art was designed in — its "own colors". */
  palette: string;
  /** Wording color that reads on the art by default (a product palette role). */
  wording: ColorToken;
};

export const COVER_SURFACES: CoverSurfaceChoice[] = [
  { assetId: "jcs-marble-burgundy", label: "Burgundy + blush kintsugi marble", hint: "Wine + cream stone, gold seams", palette: "Burgundy Blush Marble", wording: "primary" },
  { assetId: "jcs-marble-rose", label: "Rose kintsugi marble", hint: "Pink stone, gold seams", palette: "Rose Marble", wording: "text" },
  { assetId: "jcs-marble-ember", label: "Black ember marble", hint: "Black stone, glowing veins", palette: "Black Ember Marble", wording: "background" },
  { assetId: "jcs-marble-peach", label: "Peach marble", hint: "Coral + champagne, gold seams", palette: "Peach Marble", wording: "text" },
  { assetId: "jcs-marble-goldleaf", label: "Gold leaf marble", hint: "Sweeping gold-leaf veins", palette: "Gold Leaf", wording: "text" },
  { assetId: "jcs-marble-white", label: "White marble", hint: "Soft grey veining", palette: "White Marble", wording: "text" },
  { assetId: "jcs-watercolor-abstract", label: "Abstract watercolor", hint: "Burgundy, blush + gold washes", palette: "Abstract Watercolor", wording: "text" },
];

export const findCoverSurface = (assetId?: string) => COVER_SURFACES.find((c) => c.assetId === assetId);

/** The page's own surface, as a full-page field drawn edge to edge (through the bleed) at full strength. */
export function coverSurfaceTheme(assetId: string): DecorativeTheme {
  const a = findAsset(assetId);
  return { style: a?.type === "watercolor" ? "watercolor" : "marble", assetId, placement: "full-page", scale: 1, opacity: 1, colorA: "decorBase", colorB: "decorativeAccent", colorC: "decorHighlight" };
}

/** The JCS palette id of a surface's own colors, when that palette is in the snapshot. */
export function ownPaletteId(assetId?: string): string | null {
  const c = findCoverSurface(assetId);
  if (!c) return null;
  const id = jcsPaletteId(c.palette);
  return findPalette(id).id === id ? id : null;
}

/**
 * The colors the surface is drawn in: the art's own palette (default), or the
 * product's palette when the cover should follow it. Only the surface uses
 * these — the cover's wording and the rest of the book keep the product's.
 */
export function coverSurfaceColors(assetId: string | undefined, own: boolean, productColors: ColorTokens): ColorTokens {
  const id = own ? ownPaletteId(assetId) : null;
  return id ? resolveColors(id) : productColors;
}
