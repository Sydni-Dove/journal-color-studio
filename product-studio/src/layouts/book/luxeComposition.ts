/**
 * NEUTRAL CHEETAH LUXE — the responsive composition (layouts/book/composition.ts).
 *
 * The shapes keep the reference cover's positions (measured from the Letter
 * "Plan / WITH PURPOSE" cover, as fractions of the trim) and gain a role and a
 * priority. On a Letter page nothing moves; on smaller pages the text zones are
 * fitted first and the shapes step around them.
 *
 *   primary     burgundy (upper-left anchor), slate (lower-left anchor),
 *               top cheetah (upper-right accent), top ring (edge framing)
 *   supporting  blush (title frame), terracotta (right-edge accent),
 *               bottom cheetah (lower-right accent), left ring
 *   optional    tan circle, right and low rings
 */
import type { CompositionPreset, CompositionVariant, DecorItem, SizeClass } from "./composition";

export const LUXE_DECORATION: DecorItem[] = [
  { id: "luxe-burgundy", kind: "circle", style: "fill", fill: "primary", x: 0.269, y: 0.108, r: 0.248, priority: "primary", anchor: "upper-left anchor", push: [-0.6, -1], toggle: "circles" },
  { id: "luxe-blush", kind: "circle", style: "fill", fill: "decorHighlight", x: 0.655, y: 0.37, r: 0.184, priority: "supporting", anchor: "title frame", push: [0.5, -1], mayUnderlayTitle: true, toggle: "circles" },
  { id: "luxe-terracotta", kind: "circle", style: "fill", fill: "accent", x: 1.013, y: 0.536, r: 0.17, priority: "supporting", anchor: "right-edge accent", push: [1, 0], toggle: "circles" },
  { id: "luxe-tan", kind: "circle", style: "fill", fill: "secondary", x: 0.109, y: 0.722, r: 0.132, priority: "optional", anchor: "lower-left support", push: [-1, 0.3], toggle: "circles" },
  { id: "luxe-slate", kind: "circle", style: "fill", fill: "decorativeAccent", x: 0.24, y: 0.989, r: 0.222, priority: "primary", anchor: "lower-left anchor", push: [-0.3, 1], toggle: "circles" },
  { id: "luxe-cheetah-top", kind: "circle", style: "leopard", x: 0.88, y: 0.232, r: 0.132, priority: "primary", anchor: "upper-right accent", push: [1, -0.6], toggle: "leopard" },
  { id: "luxe-cheetah-bottom", kind: "circle", style: "leopard", x: 0.858, y: 0.895, r: 0.116, priority: "supporting", anchor: "lower-right accent", push: [1, 0.6], toggle: "leopard" },
  { id: "luxe-ring-top", kind: "circle", style: "outline", x: 0.384, y: 0.046, r: 0.349, priority: "primary", anchor: "edge framing (top)", push: [-0.4, -1], toggle: "outlines" },
  { id: "luxe-ring-left", kind: "circle", style: "outline", x: 0.188, y: 0.942, r: 0.308, priority: "supporting", anchor: "edge framing (lower left)", push: [-0.6, 1], toggle: "outlines" },
  { id: "luxe-ring-right", kind: "circle", style: "outline", x: 1.13, y: 0.942, r: 0.35, priority: "optional", anchor: "edge framing (right)", push: [1, 0.4], toggle: "outlines" },
  { id: "luxe-ring-low", kind: "circle", style: "outline", x: 0.779, y: 1.057, r: 0.236, priority: "optional", anchor: "edge framing (bottom)", push: [0.3, 1], toggle: "outlines" },
];

/** What changes between classes; everything else is the class's base (see below). */
type Tune = { title: Partial<CompositionVariant["title"]>; subtitle: Partial<CompositionVariant["subtitle"]>; decorScale: number; hide: CompositionVariant["hide"]; adjust?: CompositionVariant["adjust"]; clearanceIn: number };

const COVER_BASE: CompositionVariant = {
  // Title: the page's focal point, centred a little below the middle, between the burgundy anchor and the lower shapes.
  title: { preferredPt: 250, minPt: 40, centerX: 0.5, centerY: 0.53, maxW: 0.95, maxH: 0.38 },
  // Subtitle: stacked, widely spaced capitals, centred under the title.
  subtitle: { preferredPt: 13, minPt: 7.5, minTrackingEm: 0.2, width: 0.3, maxWidth: 0.9, stack: true, lineHeight: 1.55 },
  rule: { width: 0.2, gapEm: 0.9 },
  decorScale: 1,
  hide: [],
  maxShiftR: 0.22,
  clearanceIn: 0.1,
};
const DIVIDER_BASE: CompositionVariant = {
  // A section label: smaller than the cover's, centred, on a calmer page.
  title: { preferredPt: 170, minPt: 34, centerX: 0.5, centerY: 0.5, maxW: 0.74, maxH: 0.26 },
  subtitle: { preferredPt: 12, minPt: 7.5, minTrackingEm: 0.16, width: 0.6, maxWidth: 0.92, stack: false, lineHeight: 1.4 },
  rule: { width: 0.14, gapEm: 0.9 },
  decorScale: 1,
  hide: [],
  // Calmer than the cover: its lowest ring is always left out.
  adjust: { "luxe-ring-low": { hide: true } },
  maxShiftR: 0.22,
  clearanceIn: 0.1,
};

const COVER_TUNE: Record<SizeClass, Tune> = {
  large: { title: {}, subtitle: {}, decorScale: 1, hide: [], clearanceIn: 0.1 },
  medium: { title: { preferredPt: 190, maxW: 0.9, maxH: 0.34 }, subtitle: { preferredPt: 12, width: 0.36 }, decorScale: 1, hide: [], clearanceIn: 0.09 },
  // Same recognisable design; the shapes a little smaller and the busiest ring left out around the title.
  small: { title: { preferredPt: 120, maxW: 0.8, maxH: 0.3, centerY: 0.52 }, subtitle: { preferredPt: 10.5, width: 0.44 }, decorScale: 0.94, hide: [], adjust: { "luxe-ring-low": { hide: true } }, clearanceIn: 0.08 },
  // Simplified: the signature pieces and colors, the title protected.
  compact: { title: { preferredPt: 92, minPt: 30, maxW: 0.86, maxH: 0.28, centerY: 0.5 }, subtitle: { preferredPt: 9, width: 0.56 }, decorScale: 0.9, hide: ["optional"], clearanceIn: 0.06 },
};
const DIVIDER_TUNE: Record<SizeClass, Tune> = {
  large: { title: {}, subtitle: {}, decorScale: 1, hide: [], clearanceIn: 0.1 },
  medium: { title: { preferredPt: 140, maxW: 0.78, maxH: 0.24 }, subtitle: { preferredPt: 11, width: 0.66 }, decorScale: 1, hide: [], clearanceIn: 0.09 },
  small: { title: { preferredPt: 104, minPt: 30, maxW: 0.8, maxH: 0.22 }, subtitle: { preferredPt: 10, width: 0.72 }, decorScale: 0.94, hide: ["optional"], clearanceIn: 0.08 },
  compact: { title: { preferredPt: 76, minPt: 24, maxW: 0.86, maxH: 0.2 }, subtitle: { preferredPt: 9, width: 0.8 }, decorScale: 0.88, hide: ["optional"], clearanceIn: 0.06 },
};

const build = (base: CompositionVariant, tune: Record<SizeClass, Tune>) =>
  Object.fromEntries(
    (Object.keys(tune) as SizeClass[]).map((c) => {
      const t = tune[c];
      return [c, { ...base, title: { ...base.title, ...t.title }, subtitle: { ...base.subtitle, ...t.subtitle }, decorScale: t.decorScale, hide: t.hide, adjust: { ...base.adjust, ...t.adjust }, clearanceIn: t.clearanceIn }];
    }),
  ) as Record<SizeClass, CompositionVariant>;

export const NEUTRAL_CHEETAH_LUXE: CompositionPreset = {
  id: "neutral-cheetah-luxe",
  label: "Neutral Cheetah Luxe",
  decoration: LUXE_DECORATION,
  cover: build(COVER_BASE, COVER_TUNE),
  divider: build(DIVIDER_BASE, DIVIDER_TUNE),
};

/** A design with no decoration (the "Plain" preset) still gets the responsive title and subtitle. */
export const PLAIN_COMPOSITION: CompositionPreset = { ...NEUTRAL_CHEETAH_LUXE, id: "plain", label: "Plain", decoration: [] };

export const COMPOSITION_PRESETS: Record<string, CompositionPreset> = { [NEUTRAL_CHEETAH_LUXE.id]: NEUTRAL_CHEETAH_LUXE, [PLAIN_COMPOSITION.id]: PLAIN_COMPOSITION };
