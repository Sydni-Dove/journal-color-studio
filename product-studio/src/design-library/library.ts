/**
 * DESIGN LIBRARY — one-way snapshot of approved Journal Color Studio visual
 * assets, adapted to Product Studio's own theme interface.
 *
 * Snapshot rules:
 *  - Asset FILES were copied (not linked) from Journal Color Studio at the
 *    commit below. Product Studio never imports Journal Color Studio code and
 *    keeps working if that app changes.
 *  - Only the asset formats are shared (what each channel/color means). The
 *    rendering in themes/recolor.ts is Product Studio's own implementation.
 *  - To refresh a snapshot: copy the new file, bump `version`, update `sha1`.
 */
import marbleVeined from "./assets/marble-layers.png?url";
import marbleBoldGold from "./assets/marble-layers-canva.png?url";
import marbleGoldLeaf from "./assets/marble-layers-goldleaf.png?url";
import marbleWhite from "./assets/marble-layers-white.png?url";
import floralBouquet from "./assets/floral-bouquet.png?url";
import marbleCanvaVeins from "./assets/marble-canva-source.png?url";
import marbleGoldLeafVeins from "./assets/marble-goldleaf-gold.png?url";
import floralCorner from "./assets/floral-corner.png?url";
import floralSprig from "./assets/floral-header.png?url";
import accentTopo from "./assets/accent-topo.png?url";
import accentWaves from "./assets/accent-waves.png?url";
import accentArcs from "./assets/accent-arcs.png?url";
import accentRibbon from "./assets/accent-ribbon.png?url";
import accentDots from "./assets/accent-dots.png?url";
import accentStripes from "./assets/accent-stripes.png?url";
import type { DecorationCapability, DecorativePlacement } from "../types/theme";
import { DECORATION_CAPABILITIES, placementsForCapabilities } from "./placement";

export const JCS_SNAPSHOT = {
  source: "journal-color-studio snapshot",
  repository: "Sydni-Dove/journal-color-studio",
  /** Branch that carries the current Journal Color Studio designs (patterns merged onto the four-journal baseline). */
  branch: "integration/multi-journal-plus-patterns",
  commit: "14e4e75",
  /** Every asset below was verified byte-identical to this commit (or copied from it). */
  verified: "2026-09-25",
  previousCommit: "8282a74",
} as const;

type Base = {
  id: string;
  label: string;
  source: typeof JCS_SNAPSHOT.source;
  sourceFile: string;
  sha1: string;
  version: number;
  url: string;
  /** Pixel size of the source file (used to preserve aspect ratio). */
  size: { w: number; h: number };
  /** Journal Color Studio commit the file was copied from. */
  sourceCommit: string;
  /** What the artwork is designed to do (design-library/placement.ts). */
  capabilities: DecorationCapability[];
  /** Placements realising those capabilities. */
  placements: DecorativePlacement[];
};

/**
 * Real vein artwork drawn over the recolored stone (JCS TEXTURES `veins`).
 * alpha = the file carries its own crisp coverage (gold leaf); otherwise the
 * layer map's vein/highlight channels limit it (photo source).
 * originalPalette = the palette whose vein/highlight colours ARE the artwork's
 * own colours: that colourway draws the overlay untouched.
 */
export type VeinOverlay = { url: string; sourceFile: string; sha1: string; sourceCommit: string; size: { w: number; h: number }; alpha: boolean; originalPalette: string };

/**
 * Marble layer map. Channels: R = stone detail, G = vein coverage,
 * B = highlight coverage. Recolored onto three roles.
 */
export type MarbleAsset = Base & { type: "marble"; shadeBase: number; shadeAmt: number; veins?: VeinOverlay };
/** Full-color floral artwork, recolored by hue family onto five roles. */
export type FloralAsset = Base & { type: "floral"; usage: "bouquet" | "corner" | "sprig" };
/** Single-color line art (white alpha mask), tinted with one role. */
export type AccentAsset = Base & { type: "accent" };

export type DesignAsset = MarbleAsset | FloralAsset | AccentAsset;

const snap = { source: JCS_SNAPSHOT.source, version: 1, sourceCommit: "8282a74" } as const;
/** Assets first copied at 14e4e75 (or replaced by a newer approved file there). */
const snap2 = { source: JCS_SNAPSHOT.source, version: 2, sourceCommit: "14e4e75" } as const;

type Raw<T> = T extends unknown ? Omit<T, "capabilities" | "placements"> : never;

const RAW_ASSETS: Raw<DesignAsset>[] = [
  // Marble layer maps + their shading constants (JCS TEXTURES table).
  { ...snap, type: "marble", id: "jcs-marble-veined", label: "Veined marble", sourceFile: "marble-layers.png", sha1: "00c64f3d5b184494bf20d97b242670ac94fa65eb", url: marbleVeined, size: { w: 1777, h: 2277 }, shadeBase: 0.82, shadeAmt: 0.3 },
  { ...snap, type: "marble", id: "jcs-marble-boldgold", label: "Bold gold marble", sourceFile: "marble-layers-canva.png", sha1: "3a927ad8c4c8beae5e5310c9d5b9e517677b2228", url: marbleBoldGold, size: { w: 1800, h: 2316 }, shadeBase: 0.5, shadeAmt: 0.75,
    veins: { url: marbleCanvaVeins, sourceFile: "marble-canva-source.png", sha1: "6d1340bf5fe4f9d2da4624612346128354dbbff5", sourceCommit: "14e4e75", size: { w: 1109, h: 1427 }, alpha: false, originalPalette: "Your Canva Cover" } },
  { ...snap, type: "marble", id: "jcs-marble-goldleaf", label: "Gold leaf marble", sourceFile: "marble-layers-goldleaf.png", sha1: "497da5d008f29be0e0e6095c6f947a27df5b2cd5", url: marbleGoldLeaf, size: { w: 1500, h: 1922 }, shadeBase: 0.62, shadeAmt: 0.5,
    veins: { url: marbleGoldLeafVeins, sourceFile: "marble-goldleaf-gold.png", sha1: "768a91750cfe97935ce9b381543f2cd4434432d5", sourceCommit: "14e4e75", size: { w: 1594, h: 2042 }, alpha: true, originalPalette: "Gold Leaf" } },
  { ...snap, type: "marble", id: "jcs-marble-white", label: "White marble", sourceFile: "marble-layers-white.png", sha1: "bd7ce03f23dbc3af604fdc1e9e82e003093a6b92", url: marbleWhite, size: { w: 1800, h: 2306 }, shadeBase: 0.7, shadeAmt: 0.4 },
  // Floral artwork.
  // floral-cover.jpg (lettering baked in) was retired upstream; the bouquet is now its own transparent layer.
  { ...snap2, type: "floral", usage: "bouquet", id: "jcs-floral-bouquet", label: "Floral bouquet", sourceFile: "floral-bouquet.png", sha1: "57b03db65e1c35cd0687beb308995cc10211e9ba", url: floralBouquet, size: { w: 2479, h: 1593 } },
  { ...snap, type: "floral", usage: "corner", id: "jcs-floral-corner", label: "Floral corners", sourceFile: "floral-corner.png", sha1: "26c5d487e764d0a7b68166e2942eb6490f8c7395", url: floralCorner, size: { w: 1321, h: 1480 } },
  { ...snap, type: "floral", usage: "sprig", id: "jcs-floral-sprig", label: "Floral header sprigs", sourceFile: "floral-header.png", sha1: "368b2f4921410c7bcecd7d313d5450e406c9a095", url: floralSprig, size: { w: 653, h: 419 } },
  // Line-art accents (single-color masks).
  { ...snap, type: "accent", id: "jcs-accent-topo", label: "Topographic lines", sourceFile: "accent-topo.png", sha1: "3d615764f1a005f719f0fd4edffc05edcaa1db9b", url: accentTopo, size: { w: 1237, h: 1237 } },
  { ...snap, type: "accent", id: "jcs-accent-waves", label: "Flowing lines", sourceFile: "accent-waves.png", sha1: "5d368bc089bbc8bdd696eafa4586099edf53cdb8", url: accentWaves, size: { w: 1237, h: 1262 } },
  { ...snap, type: "accent", id: "jcs-accent-arcs", label: "Nested arcs", sourceFile: "accent-arcs.png", sha1: "5ec31ff823f5ceb11350ceb4903f3aa00d2f9145", url: accentArcs, size: { w: 399, h: 799 } },
  { ...snap, type: "accent", id: "jcs-accent-ribbon", label: "Line ribbon", sourceFile: "accent-ribbon.png", sha1: "fd31dee797dd7da16bc6ad13158255a0db259457", url: accentRibbon, size: { w: 617, h: 616 } },
  { ...snap, type: "accent", id: "jcs-accent-dots", label: "Halftone dots", sourceFile: "accent-dots.png", sha1: "d11bd55dbb84963ebfc95e0505fa7681a05c9247", url: accentDots, size: { w: 617, h: 617 } },
  { ...snap, type: "accent", id: "jcs-accent-stripes", label: "Bold stripes", sourceFile: "accent-stripes.png", sha1: "bed6f555cdeb7b89a8b87abbe656d5649ccf2c8c", url: accentStripes, size: { w: 1238, h: 700 } },
];

export const DESIGN_ASSETS: DesignAsset[] = RAW_ASSETS.map((a) => {
  const capabilities = DECORATION_CAPABILITIES[a.id] ?? [];
  return { ...a, capabilities, placements: placementsForCapabilities(capabilities) } as DesignAsset;
});

/**
 * Watercolor wash — JCS's deterministic bloom layout (page-fraction centre,
 * radius as a fraction of the long side, role, alpha). Pure design data.
 */
export const WATERCOLOR_BLOOMS: { cx: number; cy: number; r: number; role: "base" | "highlight" | "vein"; alpha: number }[] = [
  { cx: 0.28, cy: 0.22, r: 0.62, role: "base", alpha: 0.3 },
  { cx: 0.78, cy: 0.68, r: 0.58, role: "base", alpha: 0.26 },
  { cx: 0.15, cy: 0.78, r: 0.4, role: "highlight", alpha: 0.4 },
  { cx: 0.85, cy: 0.18, r: 0.36, role: "highlight", alpha: 0.38 },
  { cx: 0.55, cy: 0.48, r: 0.3, role: "highlight", alpha: 0.3 },
  { cx: 0.4, cy: 0.1, r: 0.16, role: "vein", alpha: 0.5 },
  { cx: 0.9, cy: 0.5, r: 0.14, role: "vein", alpha: 0.45 },
  { cx: 0.2, cy: 0.95, r: 0.15, role: "vein", alpha: 0.4 },
];
export const WATERCOLOR_PLACEMENTS: DecorativePlacement[] = ["header-band", "border-frame", "footer-band", "edge-strip", "full-page"];
export const SOLID_PLACEMENTS: DecorativePlacement[] = ["header-band", "footer-band", "edge-strip", "border-frame", "full-page"];

export function findAsset(id: string | undefined): DesignAsset | undefined {
  return DESIGN_ASSETS.find((a) => a.id === id);
}
