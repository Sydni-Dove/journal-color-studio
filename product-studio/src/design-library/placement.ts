/**
 * DECORATIVE PLACEMENT METADATA — one-way snapshot of Journal Color Studio's
 * approved composition data (branch integration/multi-journal-plus-patterns,
 * commit 14e4e75: ACCENT_LAYOUTS / ACCENT_CAPS / ACCENT_SUPPORT / drawAccent
 * constants, floralFlank, "soft" interior backgrounds). Pure design data;
 * Product Studio's composition engine applies it to physical page regions.
 */
import type { DecorationCapability, DecorativePlacement } from "../types/theme";

/** Size / opacity caps per accent layout (JCS ACCENT_CAPS). maxScale = art width as a fraction of page width. */
export const ACCENT_CAPS = {
  corners: { maxOpacity: 0.85, maxScale: 0.5 },
  singleCorner: { maxOpacity: 0.85, maxScale: 0.55 },
  topBottom: { maxOpacity: 0.6, maxScale: 1 },
  behindTitle: { maxOpacity: 0.16, maxScale: 1 },
} as const;

/** Default accent size slider (JCS accentScale default 80%). */
export const ACCENT_DEFAULT_SCALE = 0.8;
/*
 * JCS corners hang 20% of the art past the page edge (ACCENT_CORNER_OVERHANG). Product Studio does NOT
 * crop by default: corners are CONTAINED unless the user chooses "Bleed off the edge", which runs the art
 * past the trim by the physical edgeBleedAmount spacing token.
 */
/** "Top + bottom edges": band depth as a fraction of page height (JCS borderEdge). */
export const ACCENT_EDGE_BAND = 0.12;
/** Band art is mirror-tiled with tiles this many times the band height (JCS band tiling). */
export const ACCENT_BAND_TILE_FACTOR = 1.4;
/** Line art tinted on a writing page sits faintly under the lines (JCS "lined" accents: 35% of the chosen opacity). */
export const ACCENT_UNDER_LINES_OPACITY = 0.35;

/** Pattern-like art fills a band; single motifs (dots, arcs, ribbon) do not (JCS SIDE_BAND). */
export const ACCENT_BAND_ART = new Set(["jcs-accent-stripes", "jcs-accent-topo", "jcs-accent-waves"]);

const LINE_ART_OBJECT: DecorationCapability[] = ["corner-contained", "corner-bleed", "top-bottom", "behind-title"];
const FLOWING: DecorationCapability[] = ["edge-accent", "header-flourish", "footer-flourish"];

/**
 * What each artwork is designed to do. Line-art support follows JCS
 * ACCENT_SUPPORT (corners / single corners, borderEdge → top-bottom,
 * behindTitleSubtle, top band → header-band, repeat → margin-frame); flowing
 * and abstract line art (waves, topo, ribbon, arcs) also work as edge accents
 * and header / footer flourishes. Florals: the sprig is a title accent, the
 * corner piece frames page corners, the bouquet sits on the top / bottom edges.
 */
export const DECORATION_CAPABILITIES: Record<string, DecorationCapability[]> = {
  "jcs-marble-veined": ["background", "header-band", "margin-frame"],
  "jcs-marble-boldgold": ["background", "header-band", "margin-frame"],
  "jcs-marble-goldleaf": ["background", "header-band", "margin-frame"],
  "jcs-marble-white": ["background", "header-band", "margin-frame"],
  "jcs-floral-bouquet": ["top-bottom"],
  "jcs-floral-corner": ["corner-contained", "corner-bleed"],
  "jcs-floral-sprig": ["title-left", "title-right", "title-above", "title-below", "title-rule-left", "title-rule-center", "title-rule-right"],
  "jcs-accent-stripes": [...LINE_ART_OBJECT, "header-band", "margin-frame"],
  "jcs-accent-dots": [...LINE_ART_OBJECT, "header-band", "margin-frame"],
  "jcs-accent-arcs": [...LINE_ART_OBJECT, ...FLOWING, "margin-frame"],
  "jcs-accent-topo": [...LINE_ART_OBJECT, ...FLOWING, "header-band", "margin-frame"],
  "jcs-accent-waves": [...LINE_ART_OBJECT, ...FLOWING, "header-band", "margin-frame"],
  "jcs-accent-ribbon": [...LINE_ART_OBJECT, ...FLOWING],
};

/** Capability → the placement that realises it (placement order = menu order). */
const PLACEMENT_ORDER: [DecorativePlacement, DecorationCapability[]][] = [
  ["corners", ["corner-contained", "corner-bleed"]],
  ["title-accent", ["title-left", "title-right", "title-above", "title-below", "title-rule-left", "title-rule-center", "title-rule-right"]],
  ["header-flourish", ["header-flourish"]],
  ["footer-flourish", ["footer-flourish"]],
  ["edge-accent", ["edge-accent"]],
  ["top-bottom", ["top-bottom"]],
  ["behind-title", ["behind-title"]],
  ["full-page", ["background"]],
  ["header-band", ["header-band"]],
  ["border-frame", ["margin-frame"]],
];

export function placementsForCapabilities(caps: DecorationCapability[]): DecorativePlacement[] {
  return PLACEMENT_ORDER.filter(([, need]) => need.some((c) => caps.includes(c))).map(([p]) => p);
}

/**
 * Floral header clusters flank a header rule, mirrored about the title's
 * centre and vertically centred ON the rule (JCS floralFlank: cluster 9% of
 * page height with a 6%-of-height title → 1.5 title em; half gap 14% of page width).
 */
export const FLORAL_FLANK = { heightPerTitleEm: 1.5, halfGapOfPageWidth: 0.14 } as const;

/** Interior backgrounds behind writing content are "soft": 16% strength over paper (JCS soft marble/watercolor). */
export const SOFT_BACKGROUND_STRENGTH = 0.16;
/** Floral bouquet width at most this fraction of page width (JCS cover bouquet, scaled to interior pages). */
export const BOUQUET_WIDTH_OF_PAGE = 0.6;
/** Floral corner width at most this fraction of the short trim side. */
export const FLORAL_CORNER_OF_SHORT_SIDE = 0.42;
/** Line-art flourishes (header / footer / edge accents): preferred width as a fraction of page width. */
export const LINE_FLOURISH_OF_PAGE = 0.3;
