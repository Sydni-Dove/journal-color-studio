/**
 * DECORATIVE PLACEMENT METADATA — one-way snapshot of Journal Color Studio's
 * approved composition data (branch integration/multi-journal-plus-patterns,
 * commit 14e4e75: ACCENT_LAYOUTS / ACCENT_CAPS / ACCENT_SUPPORT / drawAccent
 * constants, floralFlank, "soft" interior backgrounds). Pure design data;
 * Product Studio's composition engine applies it to physical page regions.
 */
import type { DecorationCapability, DecorationRole, DecorativePlacement } from "../types/theme";

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

/*
 * Visual roles decide the placements (Studio UX pass):
 *   marble / watercolor / solid  surfaces: background, margin frame, header / footer band, edge strip
 *   floral bouquet                rule-end / divider ornament, bottom-edge and top + bottom edge flourishes
 *   floral sprig                  heading accent (beside the title) and title-rule accents — never floating above / below
 *   floral corner                 corner flourish (contained or bled)
 *   flowing line art              header / footer / edge / corner flourishes, border accent
 *   pattern line art (dots, stripes) bands, border, corners, top + bottom edges
 * Removed because they did not make design sense: "behind the title" for line art, sprigs floating above / below the
 * title, and the bouquet's top piece floating in the header margin (it now enters from the page edge).
 */
const SURFACE: DecorationCapability[] = ["header-band", "margin-frame", "footer-band", "edge-strip", "background"];
const LINE_PATTERN: DecorationCapability[] = ["header-band", "margin-frame", "corner-contained", "corner-bleed", "top-bottom"];
const FLOWING: DecorationCapability[] = ["header-flourish", "corner-contained", "corner-bleed", "footer-flourish", "edge-accent", "top-bottom", "margin-frame"];

/**
 * What each artwork is designed to do. Line-art support follows JCS
 * ACCENT_SUPPORT (corners / single corners, borderEdge → top-bottom, top band →
 * header-band, repeat → margin-frame); flowing art adds header / footer / edge
 * flourishes. Florals: the sprig accents the title and its rule, the bouquet
 * ends or divides the rule and enters from page edges, the corner piece frames corners.
 */
export const DECORATION_CAPABILITIES: Record<string, DecorationCapability[]> = {
  "jcs-marble-veined": SURFACE,
  "jcs-marble-boldgold": SURFACE,
  "jcs-marble-goldleaf": SURFACE,
  "jcs-marble-white": SURFACE,
  "jcs-floral-bouquet": ["title-rule-right", "title-rule-left", "title-rule-center", "table-corner", "footer-flourish", "top-bottom"],
  "jcs-floral-corner": ["corner-contained", "corner-bleed", "table-corner"],
  "jcs-floral-sprig": ["title-rule-right", "title-rule-left", "title-rule-center", "title-left", "title-right", "table-corner"],
  "jcs-accent-stripes": LINE_PATTERN,
  "jcs-accent-dots": LINE_PATTERN,
  "jcs-accent-arcs": FLOWING,
  "jcs-accent-topo": [...FLOWING, "header-band"],
  "jcs-accent-waves": [...FLOWING, "header-band"],
  "jcs-accent-ribbon": FLOWING.filter((c) => c !== "margin-frame"),
};

/** The role each capability serves. */
export const CAPABILITY_ROLE: Record<DecorationCapability, DecorationRole> = {
  background: "background",
  "margin-frame": "frame",
  "header-band": "band",
  "footer-band": "band",
  "edge-strip": "edge",
  "edge-accent": "edge",
  "top-bottom": "edge",
  "corner-contained": "corner",
  "corner-bleed": "corner",
  "table-corner": "table-corner",
  "title-rule-left": "rule-accent",
  "title-rule-right": "rule-accent",
  "title-rule-center": "divider",
  "title-left": "heading-accent",
  "title-right": "heading-accent",
  "title-above": "heading-accent",
  "title-below": "heading-accent",
  "header-flourish": "header-flourish",
  "footer-flourish": "footer-flourish",
  "behind-title": "background",
};

export const ROLE_LABEL: Record<DecorationRole, string> = {
  background: "background",
  frame: "margin frame",
  band: "header / footer band",
  edge: "edge flourish",
  corner: "corner flourish",
  "table-corner": "table-corner accent",
  divider: "divider ornament",
  "rule-accent": "rule-end ornament",
  "heading-accent": "heading accent",
  "header-flourish": "header flourish",
  "footer-flourish": "footer flourish",
};

export function rolesFor(caps: DecorationCapability[]): DecorationRole[] {
  return [...new Set(caps.map((c) => CAPABILITY_ROLE[c]))];
}

/** Capability → the placement that realises it (placement order = menu order). */
const PLACEMENT_ORDER: [DecorativePlacement, DecorationCapability[]][] = [
  ["title-accent", ["title-left", "title-right", "title-above", "title-below", "title-rule-left", "title-rule-center", "title-rule-right"]],
  ["header-flourish", ["header-flourish"]],
  ["header-band", ["header-band"]],
  ["corners", ["corner-contained", "corner-bleed"]],
  ["table-corner", ["table-corner"]],
  ["footer-flourish", ["footer-flourish"]],
  ["footer-band", ["footer-band"]],
  ["edge-accent", ["edge-accent"]],
  ["edge-strip", ["edge-strip"]],
  ["top-bottom", ["top-bottom"]],
  ["border-frame", ["margin-frame"]],
  ["behind-title", ["behind-title"]],
  ["full-page", ["background"]],
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

/** Title / rule ornament height in title em, per artwork (default: FLORAL_FLANK.heightPerTitleEm). */
export const TITLE_ACCENT_EM: Record<string, number> = { "jcs-floral-bouquet": 2.2 };

/**
 * The side of an artwork whose ink hangs lowest — its grounded end. A spray
 * that lifts up on one side must land on a line with the OTHER side: the
 * layout orients it so this end rests on the rule. Read from the artwork's
 * real alpha footprint (bottom rows of the occupancy grid).
 */
export function groundedSide(rows: string[] | undefined): "left" | "right" {
  if (!rows?.length) return "left";
  const n = rows.length;
  let sum = 0, count = 0;
  for (const row of rows.slice(Math.floor(n * 0.8))) {
    for (let x = 0; x < row.length; x++) if (row[x] === "1") (sum += x / (row.length - 1)), count++;
  }
  return count && sum / count > 0.5 ? "right" : "left";
}
