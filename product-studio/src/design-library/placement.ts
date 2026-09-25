/**
 * DECORATIVE PLACEMENT METADATA — one-way snapshot of Journal Color Studio's
 * approved composition data (branch integration/multi-journal-plus-patterns,
 * commit 14e4e75: ACCENT_LAYOUTS / ACCENT_CAPS / ACCENT_SUPPORT / drawAccent
 * constants, floralFlank, "soft" interior backgrounds). Pure design data;
 * Product Studio's composition engine applies it to physical page regions.
 */
import type { DecorativePlacement } from "../types/theme";

/** Size / opacity caps per accent layout (JCS ACCENT_CAPS). maxScale = art width as a fraction of page width. */
export const ACCENT_CAPS = {
  corners: { maxOpacity: 0.85, maxScale: 0.5 },
  singleCorner: { maxOpacity: 0.85, maxScale: 0.55 },
  topBottom: { maxOpacity: 0.6, maxScale: 1 },
  behindTitle: { maxOpacity: 0.16, maxScale: 1 },
} as const;

/** Default accent size slider (JCS accentScale default 80%). */
export const ACCENT_DEFAULT_SCALE = 0.8;
/** Corner accents hang this fraction of their size past the page edge (intentional bleed crop, JCS corners). */
export const ACCENT_CORNER_OVERHANG = 0.2;
/** "Top + bottom edges": band depth as a fraction of page height (JCS borderEdge). */
export const ACCENT_EDGE_BAND = 0.12;
/** Band art is mirror-tiled with tiles this many times the band height (JCS band tiling). */
export const ACCENT_BAND_TILE_FACTOR = 1.4;
/** Line art tinted on a writing page sits faintly under the lines (JCS "lined" accents: 35% of the chosen opacity). */
export const ACCENT_UNDER_LINES_OPACITY = 0.35;

/** Pattern-like art fills a band; single motifs (dots, arcs, ribbon) do not (JCS SIDE_BAND). */
export const ACCENT_BAND_ART = new Set(["jcs-accent-stripes", "jcs-accent-topo", "jcs-accent-waves"]);

/**
 * Product Studio placements each line-art element supports, derived from JCS
 * ACCENT_SUPPORT (only the layouts Product Studio implements):
 *   corners / single corners → "corners" (+ anchor)   borderEdge → "top-bottom"
 *   behindTitleSubtle → "behind-title"   top band → "header-band"   repeat → "border-frame"
 */
export const ACCENT_PLACEMENTS: Record<string, DecorativePlacement[]> = {
  "jcs-accent-stripes": ["corners", "top-bottom", "behind-title", "header-band", "border-frame"],
  "jcs-accent-dots": ["corners", "top-bottom", "behind-title", "header-band", "border-frame"],
  "jcs-accent-arcs": ["corners", "top-bottom", "behind-title", "border-frame"],
  "jcs-accent-topo": ["corners", "top-bottom", "behind-title", "header-band", "border-frame"],
  "jcs-accent-waves": ["corners", "top-bottom", "behind-title", "header-band", "border-frame"],
  "jcs-accent-ribbon": ["corners", "top-bottom", "behind-title"],
};

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
