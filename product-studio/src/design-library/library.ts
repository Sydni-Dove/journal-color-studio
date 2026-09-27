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
import marbleRose from "./assets/marble-layers-rose.png?url";
import marbleRoseVeins from "./assets/marble-rose-gold.png?url";
import marbleBurgundy from "./assets/marble-layers-burgundy.png?url";
import marbleBurgundySource from "./assets/marble-burgundy-source.jpg?url";
import marbleEmber from "./assets/marble-layers-ember.png?url";
import marbleEmberVeins from "./assets/marble-ember-gold.png?url";
import marblePeach from "./assets/marble-layers-peach.png?url";
import marblePeachVeins from "./assets/marble-peach-gold.png?url";
import patternCabana from "./assets/pattern-cabana.png?url";
import patternPinstripe from "./assets/pattern-pinstripe.png?url";
import patternBias from "./assets/pattern-bias.png?url";
import type { DecorationCapability, DecorativePlacement } from "../types/theme";
import { DECORATION_CAPABILITIES, placementsForCapabilities } from "./placement";

export const JCS_SNAPSHOT = {
  source: "journal-color-studio snapshot",
  repository: "Sydni-Dove/journal-color-studio",
  /** The stable source: `main` (the pattern / multi-journal integration branch was merged into it). */
  branch: "main",
  commit: "ba916ad",
  /** Every asset below was verified byte-identical (SHA-1) to this commit. */
  verified: "2026-09-27",
  previousCommit: "14e4e75",
  previousBranch: "integration/multi-journal-plus-patterns",
} as const;

/** Picker thumbnails: derived by tools/build_thumbs.py (160 px), recolored live; pages and print use the full files. */
const THUMBS = import.meta.glob("./assets/thumbs/*", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const thumbOf = (sourceFile: string) => THUMBS[`./assets/thumbs/${sourceFile.replace(/\.(png|jpg)$/, "")}.${sourceFile.endsWith(".jpg") ? "jpg" : "png"}`];

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
  /** Date the file was snapshotted into Product Studio. */
  snapshotted: string;
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
export type VeinOverlay = { url: string; thumb?: string; sourceFile: string; sha1: string; sourceCommit: string; size: { w: number; h: number }; alpha: boolean; originalPalette: string };

/** What each marble layer IS in this artwork (JCS TEXTURES `roles`): label + hint, per recolor role. */
export type MarbleLayerNames = { stone: [string, string]; highlight: [string, string]; vein: [string, string] };

/**
 * Marble layer map. Channels: R = stone detail, G = vein coverage,
 * B = highlight coverage. Recolored onto three roles.
 */
export type MarbleAsset = Base & {
  type: "marble";
  shadeBase: number;
  shadeAmt: number;
  veins?: VeinOverlay;
  /** Stone texture range multiplier (JCS `texScale`; burgundy's wine stone spans a wider light/dark range). */
  texScale?: number;
  /** Layer names shown next to the color roles (kintsugi marbles). */
  layers?: MarbleLayerNames;
  /** The palette holding this marble's own colors ("As designed", JCS `rec`). */
  asDesigned?: string;
  thumb?: string;
  /** Whole-frame 240 px copy of the map: thumbnail tone statistics (derived, tools/build_thumbs.py). */
  statsSample?: string;
};
/**
 * Two-tone pattern ink map (JCS pattern-*.png, 8-bit grey: 0 = light ground,
 * 255 = full ink). Rebuilt between two palette roles: ground + ink.
 * `original` = the design's own Canva colors (JCS PATTERNS `original`).
 */
export type PatternAsset = Base & { type: "pattern"; original: { ground: string; ink: string }; thumb?: string };
/** Full-color floral artwork, recolored by hue family onto five roles. */
export type FloralAsset = Base & { type: "floral"; usage: "bouquet" | "corner" | "sprig"; thumb?: string };
/** Single-color line art (white alpha mask), tinted with one role. */
export type AccentAsset = Base & { type: "accent" };

export type DesignAsset = MarbleAsset | PatternAsset | FloralAsset | AccentAsset;

const snap = { source: JCS_SNAPSHOT.source, version: 1, sourceCommit: "8282a74", snapshotted: "2026-09-25" } as const;
/** Assets first copied at 14e4e75 (or replaced by a newer approved file there). */
const snap2 = { source: JCS_SNAPSHOT.source, version: 2, sourceCommit: "14e4e75", snapshotted: "2026-09-25" } as const;
/** Assets first copied from `main` (d7068ea kintsugi marbles, 8ed5ace stripe maps), verified at ba916ad. */
const snap3 = (sourceCommit: string) => ({ source: JCS_SNAPSHOT.source, version: 3, sourceCommit, snapshotted: "2026-09-27" }) as const;
/** Kintsugi marbles share one shading setup (JCS TEXTURES: shadeBase .6, shadeAmt .5). */
const KINTSUGI = { shadeBase: 0.6, shadeAmt: 0.5 } as const;
const KINTSUGI_VEINS = { sourceCommit: "d7068ea", alpha: true } as const;

type Raw<T> = T extends unknown ? Omit<T, "capabilities" | "placements"> : never;

const RAW_ASSETS: Raw<DesignAsset>[] = [
  // Marble layer maps + their shading constants (JCS TEXTURES table).
  { ...snap, type: "marble", id: "jcs-marble-veined", label: "Veined marble", sourceFile: "marble-layers.png", sha1: "00c64f3d5b184494bf20d97b242670ac94fa65eb", url: marbleVeined, size: { w: 1777, h: 2277 }, shadeBase: 0.82, shadeAmt: 0.3 },
  { ...snap, type: "marble", id: "jcs-marble-boldgold", label: "Bold gold marble", sourceFile: "marble-layers-canva.png", sha1: "3a927ad8c4c8beae5e5310c9d5b9e517677b2228", url: marbleBoldGold, size: { w: 1800, h: 2316 }, shadeBase: 0.5, shadeAmt: 0.75,
    veins: { url: marbleCanvaVeins, sourceFile: "marble-canva-source.png", sha1: "6d1340bf5fe4f9d2da4624612346128354dbbff5", sourceCommit: "14e4e75", size: { w: 1109, h: 1427 }, alpha: false, originalPalette: "Your Canva Cover" } },
  { ...snap, type: "marble", id: "jcs-marble-goldleaf", label: "Gold leaf marble", sourceFile: "marble-layers-goldleaf.png", sha1: "497da5d008f29be0e0e6095c6f947a27df5b2cd5", url: marbleGoldLeaf, size: { w: 1500, h: 1922 }, shadeBase: 0.62, shadeAmt: 0.5,
    veins: { url: marbleGoldLeafVeins, sourceFile: "marble-goldleaf-gold.png", sha1: "768a91750cfe97935ce9b381543f2cd4434432d5", sourceCommit: "14e4e75", size: { w: 1594, h: 2042 }, alpha: true, originalPalette: "Gold Leaf" } },
  { ...snap, type: "marble", id: "jcs-marble-white", label: "White marble", sourceFile: "marble-layers-white.png", sha1: "bd7ce03f23dbc3af604fdc1e9e82e003093a6b92", url: marbleWhite, size: { w: 1800, h: 2306 }, shadeBase: 0.7, shadeAmt: 0.4 },
  // Kintsugi marbles (JCS Design Elements p.68-71, maps built by JCS tools/build_marble_maps.py). The stone and the
  // SECOND stone are rebuilt from the map; the gold seams are the original pixels (exact in the marble's own colors,
  // tone-transferred for any other palette).
  { ...snap3("d7068ea"), ...KINTSUGI, type: "marble", id: "jcs-marble-rose", label: "Rose kintsugi marble", sourceFile: "marble-layers-rose.png", sha1: "6c06cd18ba689d1b7e21f94528eb7cf470a5b5fd", url: marbleRose, size: { w: 2666, h: 3466 },
    veins: { ...KINTSUGI_VEINS, url: marbleRoseVeins, sourceFile: "marble-rose-gold.png", sha1: "4f7e0a5f50f5b0fb987cb075f9f714f8491800a8", size: { w: 2666, h: 3466 }, originalPalette: "Rose Marble" },
    asDesigned: "Rose Marble", layers: { stone: ["Rose stone", "Deeper pink slabs"], highlight: ["Blush stone", "Pale pink + white slabs"], vein: ["Gold seams", "Kintsugi gold"] } },
  // Three stone tones (wine, rose, cream): keeps the WHOLE original as its source (an opaque overlay covering the map's
  // B = 1 area) — exact pixels in its own colors, per-pixel tone transfer for any other palette.
  { ...snap3("d7068ea"), ...KINTSUGI, type: "marble", id: "jcs-marble-burgundy", label: "Burgundy + blush kintsugi marble", sourceFile: "marble-layers-burgundy.png", sha1: "2596f5d648b1e702c5b6613ecd12d28e66f258ce", url: marbleBurgundy, size: { w: 2666, h: 3512 },
    veins: { url: marbleBurgundySource, sourceFile: "marble-burgundy-source.jpg", sha1: "9ca564d88e0d37360d8566d01b14e6742ec900b1", sourceCommit: "d7068ea", size: { w: 2666, h: 3512 }, alpha: false, originalPalette: "Burgundy Blush Marble" },
    texScale: 2, asDesigned: "Burgundy Blush Marble", layers: { stone: ["Wine + rose stone", "Burgundy and rose-pink slabs"], highlight: ["Cream stone", "Pale cream + blush slabs"], vein: ["Gold seams", "Kintsugi gold"] } },
  { ...snap3("d7068ea"), ...KINTSUGI, type: "marble", id: "jcs-marble-ember", label: "Black ember kintsugi marble", sourceFile: "marble-layers-ember.png", sha1: "f5535a0c1c696e71233ce11a5abe106d995a70a1", url: marbleEmber, size: { w: 2666, h: 3289 },
    veins: { ...KINTSUGI_VEINS, url: marbleEmberVeins, sourceFile: "marble-ember-gold.png", sha1: "73c3fcb672ba24f7256865de49655d97cd2447fd", size: { w: 2666, h: 3289 }, originalPalette: "Black Ember Marble" },
    asDesigned: "Black Ember Marble", layers: { stone: ["Black stone", "Deep charcoal"], highlight: ["Smoke", "Grey smoky wisps"], vein: ["Ember seams", "Glowing gold veins"] } },
  { ...snap3("d7068ea"), ...KINTSUGI, type: "marble", id: "jcs-marble-peach", label: "Peach kintsugi marble", sourceFile: "marble-layers-peach.png", sha1: "41b0a77820e9e4850cc58a4710aee1707e29003c", url: marblePeach, size: { w: 2432, h: 3559 },
    veins: { ...KINTSUGI_VEINS, url: marblePeachVeins, sourceFile: "marble-peach-gold.png", sha1: "4dc9eb3e07ed59aca49d8578df15fc1bb81865b5", size: { w: 2432, h: 3559 }, originalPalette: "Peach Marble" },
    asDesigned: "Peach Marble", layers: { stone: ["Coral stone", "Deeper peach slabs"], highlight: ["Champagne stone", "Pale cream slabs"], vein: ["Gold seams", "Kintsugi gold"] } },
  // Stripe patterns (JCS Design Elements p.30/33/34, sharper Canva exports in 8ed5ace). Ink maps: geometry, weave and
  // anti-aliasing live in the map; only the two colors change.
  { ...snap3("8ed5ace"), type: "pattern", id: "jcs-pattern-cabana", label: "Cabana stripe", sourceFile: "pattern-cabana.png", sha1: "02c8f892db89c6af4c86b6e856c8546a8cf909d8", url: patternCabana, size: { w: 1700, h: 1688 }, original: { ground: "#FCF7F1", ink: "#8D9DB6" } },
  { ...snap3("8ed5ace"), type: "pattern", id: "jcs-pattern-pinstripe", label: "Pinstripe", sourceFile: "pattern-pinstripe.png", sha1: "37574a25225c4ff89e8036449194ac21ac268c66", url: patternPinstripe, size: { w: 1656, h: 1120 }, original: { ground: "#EDF1FA", ink: "#07080D" } },
  { ...snap3("8ed5ace"), type: "pattern", id: "jcs-pattern-bias", label: "Bias stripe", sourceFile: "pattern-bias.png", sha1: "52df1d2e476c0e6e9d0ffbfe8cab25fc469375ba", url: patternBias, size: { w: 1692, h: 1120 }, original: { ground: "#F1F2F6", ink: "#040306" } },
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
  const withThumb =
    a.type === "accent"
      ? a
      : {
          ...a,
          thumb: thumbOf(a.sourceFile),
          ...(a.type === "marble" ? { statsSample: THUMBS[`./assets/thumbs/${a.sourceFile.replace(/\.png$/, "")}-stats.png`] } : {}),
          ...(a.type === "marble" && a.veins ? { veins: { ...a.veins, thumb: thumbOf(a.veins.sourceFile) } } : {}),
        };
  return { ...withThumb, capabilities, placements: placementsForCapabilities(capabilities) } as DesignAsset;
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
