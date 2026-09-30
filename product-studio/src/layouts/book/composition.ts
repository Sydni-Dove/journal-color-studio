/**
 * RESPONSIVE COVER / DIVIDER COMPOSITION — size-aware designs.
 *
 * A cover or divider design is not a Letter canvas scaled down. It is resolved
 * for the page it lands on:
 *
 *   page geometry → usable area → size class → protected text zones →
 *   fitted typography → decoration placed around the text → nodes
 *
 * A design (CompositionPreset) supplies, per size class and per page kind
 * (cover / divider): the title and subtitle zones, preferred and minimum type
 * sizes, and how its decoration is sized and which pieces it keeps. Decoration
 * is described by semantic anchors (an upper-left anchor, a right-edge accent…)
 * with a priority, and always yields to the text: print-safe geometry first,
 * readable title and subtitle second, negative space third, decoration last.
 *
 * Pure functions only (no DOM): the measurer is passed in, so the editor's
 * canvas metrics and the tests' heuristic metrics run the same code.
 */
import type { Rect } from "../../types/geometry";
import type { ColorToken } from "../../types/tokens";

// ─── Size classes ─────────────────────────────────────────────────────────────

export type SizeClass = "large" | "medium" | "small" | "compact";
export const SIZE_CLASSES: SizeClass[] = ["large", "medium", "small", "compact"];

/**
 * Smallest usable area (inches: short side × long side of the live area, after
 * binding keepout, margins and any tab) for each class; a page takes the
 * largest class whose minimums it meets, the rest are compact. Measured from
 * the presets' live areas: Letter 7.25 × 10, 8 × 10 6.75 × 9, A4 7.02 × 10.69
 * (large); 7 × 9 5.75 × 8, 6 × 9 4.75 × 8 (medium); 5.5 × 8.5 4.25 × 7.5, A5
 * 4.58 × 7.27 (small); 5 × 7 3.75 × 6, A6 2.88 × 4.83 and inserts (compact).
 */
export const SIZE_CLASS_MIN: Record<Exclude<SizeClass, "compact">, { short: number; long: number }> = {
  large: { short: 6.4, long: 8.6 },
  medium: { short: 4.7, long: 7.6 },
  small: { short: 4.0, long: 6.6 },
};

export type CompositionClass = {
  sizeClass: SizeClass;
  /** Live area the text may use (inches). */
  usable: Rect;
  aspect: number;
  /** Portrait pages much taller than wide (4 × 9, Filofax): narrower zones, smaller script. */
  narrow: boolean;
  landscape: boolean;
};

export function classifyComposition(usable: Rect): CompositionClass {
  const landscape = usable.w > usable.h;
  const short = Math.min(usable.w, usable.h), long = Math.max(usable.w, usable.h);
  const sizeClass = (["large", "medium", "small"] as const).find((c) => short >= SIZE_CLASS_MIN[c].short - 1e-9 && long >= SIZE_CLASS_MIN[c].long - 1e-9) ?? "compact";
  const aspect = usable.w / usable.h;
  return { sizeClass, usable, aspect, narrow: !landscape && aspect < 0.5, landscape };
}

// ─── Design description ──────────────────────────────────────────────────────

export type TitleSpec = {
  /** The size the fitting starts from (pt); it only shrinks as far as the words need. */
  preferredPt: number;
  /** Readable floor (pt): below this the title is reported, never squeezed. */
  minPt: number;
  /** Centre of the title's lettering (fractions of the trim). */
  centerX: number;
  centerY: number;
  /** Widest / tallest the lettering may be (fractions of the usable area). */
  maxW: number;
  maxH: number;
};
export type SubtitleSpec = {
  preferredPt: number;
  minPt: number;
  /** Letter spacing floor (em); spacing is tightened before the type gets smaller. */
  minTrackingEm: number;
  /** Preferred and widest subtitle zone (fractions of the usable width). */
  width: number;
  maxWidth: number;
  /** Two short lines ("WITH / PURPOSE") rather than one. */
  stack: boolean;
  /** Line pitch of a stacked subtitle (in subtitle ems). */
  lineHeight: number;
};
export type RuleSpec = { width: number; gapEm: number };
export type DecorPriority = "primary" | "supporting" | "optional";
/** A decorative shape at a semantic anchor. x, y: fractions of the trim; r: of the page's design scale R. */
export type DecorItem = {
  id: string;
  kind: "circle";
  style: "fill" | "outline" | "leopard";
  fill?: ColorToken;
  x: number;
  y: number;
  r: number;
  priority: DecorPriority;
  /** What the piece does in the design ("upper-left anchor", "title frame"…). */
  anchor: string;
  /** Where it escapes to when it would touch the text (towards its own corner / edge). */
  push: [number, number];
  /** A soft, low-contrast shape allowed behind the title (never behind the subtitle). */
  mayUnderlayTitle?: boolean;
  /** Which of the page's decoration toggles controls it. */
  toggle: "circles" | "outlines" | "leopard";
};
export type DecorAdjust = { dx?: number; dy?: number; scale?: number; hide?: boolean };
export type CompositionVariant = {
  title: TitleSpec;
  subtitle: SubtitleSpec;
  rule: RuleSpec;
  /** Size of every shape relative to the design (1 = the reference's proportions). */
  decorScale: number;
  /** Priorities this variant leaves out (density: a compact page keeps the signature pieces). */
  hide: DecorPriority[];
  /** Per-piece repositioning for this class (fractions of the trim / relative scale). */
  adjust?: Record<string, DecorAdjust>;
  /** Furthest a shape may move away from the text (fraction of R) before it shrinks or steps aside. */
  maxShiftR: number;
  /** Clear space kept between text and decoration (inches). */
  clearanceIn: number;
};
export type CompositionPreset = {
  id: string;
  label: string;
  /** Draw order, bottom to top. */
  decoration: DecorItem[];
  cover: Record<SizeClass, CompositionVariant>;
  divider: Record<SizeClass, CompositionVariant>;
};

// ─── Text fitting ────────────────────────────────────────────────────────────

/** Width in inches of `text` at `sizePt` with `trackingEm` letter spacing. */
export type MeasureText = (text: string, sizePt: number, trackingEm: number) => number;
/** Glyph widths scale almost, not exactly, linearly with size: fit to 98.5 % of the width. */
const FIT_SLACK = 0.985;
/** Height of script lettering (ascenders to descenders) in ems, for the height cap and the protected zone. */
export const SCRIPT_ASCENT_EM = 0.85, SCRIPT_DESCENT_EM = 0.36, SCRIPT_DESCENT_SHORT_EM = 0.22;

export type TitleFit = { sizePt: number; widthIn: number; ok: boolean; limitedBy: "preferred" | "width" | "height" | "minimum" };

/**
 * The title: start at the preferred size, measure the real lettering, shrink
 * only as far as the width and height of the zone require, stop at the floor.
 */
export function fitTitle(value: string, measure: MeasureText, spec: Pick<TitleSpec, "preferredPt" | "minPt">, zone: { w: number; h: number }, trackingEm = 0): TitleFit {
  const perPt = measure(value, 100, trackingEm) / 100;
  const byW = perPt > 0 ? (zone.w * FIT_SLACK) / perPt : Infinity;
  const byH = (zone.h * 72) / (SCRIPT_ASCENT_EM + SCRIPT_DESCENT_EM);
  const size = Math.min(spec.preferredPt, byW, byH);
  const limitedBy = size === spec.preferredPt ? "preferred" : size === byW ? "width" : "height";
  if (size >= spec.minPt) return { sizePt: round(size), widthIn: perPt * round(size), ok: true, limitedBy };
  // Below the floor: keep the floor; it is an error only if the words still don't fit across.
  return { sizePt: spec.minPt, widthIn: perPt * spec.minPt, ok: perPt * spec.minPt <= zone.w + 1e-6, limitedBy: "minimum" };
}

export type SubtitleFit = { lines: string[]; sizePt: number; trackingEm: number; widthIn: number; ok: boolean; steps: string[] };

/** Two lines with the narrower widest line ("WITH / PURPOSE"); one line for a single word. */
export function splitTwoLines(value: string, widthOf: (t: string) => number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [value.trim()];
  let best: string[] = [value.trim()], bestW = Infinity;
  for (let k = 1; k < words.length; k++) {
    const pair = [words.slice(0, k).join(" "), words.slice(k).join(" ")];
    const w = Math.max(...pair.map(widthOf));
    if (w < bestW) (bestW = w), (best = pair);
  }
  return best;
}

/**
 * The subtitle, in this order: preferred spacing → tighter spacing (to the
 * floor) → slightly smaller type (to 82 %) → a wider zone (to the widest safe
 * width) → smaller type to the readable floor → (divider only) two lines. Only
 * if all of that fails is it reported.
 */
export function fitSubtitle(value: string, measure: MeasureText, spec: SubtitleSpec, prefTrackingEm: number, zoneW: number, maxW: number): SubtitleFit {
  const text = value.trim();
  const steps: string[] = [];
  const attempt = (lines: string[]): SubtitleFit | null => {
    const widest = (pt: number, tr: number) => Math.max(...lines.map((l) => measure(l, pt, tr)));
    const pref = spec.preferredPt, trMin = Math.min(spec.minTrackingEm, prefTrackingEm);
    const done = (sizePt: number, trackingEm: number, w: number): SubtitleFit => ({ lines, sizePt: round(sizePt), trackingEm: round(trackingEm, 3), widthIn: w, ok: true, steps: [...steps] });
    // 1 · preferred spacing, then 2 · tighter spacing, at the preferred size.
    for (let tr = prefTrackingEm; tr >= trMin - 1e-9; tr = round(tr - 0.02, 3)) {
      if (widest(pref, tr) <= zoneW * FIT_SLACK) return done(pref, tr, zoneW);
      if (tr === prefTrackingEm) steps.push("tracking");
    }
    // 3 · slightly smaller type (linear in size: spacing is in ems).
    const slight = Math.max(spec.minPt, pref * 0.82), perPt = widest(1, trMin);
    steps.push("size");
    const need = (zoneW * FIT_SLACK) / perPt;
    if (need >= slight) return done(Math.min(pref, need), trMin, zoneW);
    // 4 · a wider zone, where the live area allows it.
    steps.push("width");
    const wide = (perPt * slight) / FIT_SLACK;
    if (wide <= maxW) return done(slight, trMin, Math.max(zoneW, wide));
    // 5 · smaller type at the widest zone, to the readable floor.
    const atMax = (maxW * FIT_SLACK) / perPt;
    if (atMax >= spec.minPt) return done(Math.min(slight, atMax), trMin, maxW);
    return null;
  };
  const base = spec.stack ? splitTwoLines(text, (t) => measure(t, 10, prefTrackingEm)) : [text];
  const fit = attempt(base);
  if (fit) return fit;
  if (!spec.stack && base.length === 1 && text.includes(" ")) {
    steps.push("two lines");
    const two = attempt(splitTwoLines(text, (t) => measure(t, 10, prefTrackingEm)));
    if (two) return two;
  }
  const trMin = Math.min(spec.minTrackingEm, prefTrackingEm);
  return { lines: base, sizePt: spec.minPt, trackingEm: trMin, widthIn: maxW, ok: false, steps };
}

// ─── Decoration around the text ──────────────────────────────────────────────

export type ProtectedZone = { rect: Rect; /** Title lettering: soft shapes may sit behind it. */ soft: boolean };
export type PlacedDecor = {
  item: DecorItem;
  cx: number;
  cy: number;
  r: number;
  /** Why it looks different from the reference: moved / smaller / left out / left touching (primary). */
  moved: number;
  scaled: number;
  hidden: boolean;
  overlapsText: boolean;
};

const clampTo = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function circleTouchesRect(cx: number, cy: number, r: number, rect: Rect, outline: boolean, strokeIn: number, clearance: number): boolean {
  const nx = clampTo(cx, rect.x, rect.x + rect.w), ny = clampTo(cy, rect.y, rect.y + rect.h);
  const near = Math.hypot(cx - nx, cy - ny);
  if (!outline) return near < r + clearance;
  // A thin ring touches the rectangle only if its line passes through (or near) it.
  const far = Math.max(...[rect.x, rect.x + rect.w].flatMap((x) => [rect.y, rect.y + rect.h].map((y) => Math.hypot(cx - x, cy - y))));
  return near < r + strokeIn + clearance && far > r - strokeIn - clearance;
}

/**
 * Places the design's shapes for this page, then moves each one clear of the
 * protected text zones: along its own escape direction (towards its corner or
 * edge — it may bleed further off the page), then smaller, and finally a
 * supporting or optional piece steps aside. A primary piece is never removed.
 */
export function placeDecoration(
  items: DecorItem[],
  variant: CompositionVariant,
  page: { W: number; H: number; R: number },
  zones: ProtectedZone[],
  opts: { enabled: (toggle: DecorItem["toggle"]) => boolean; shift?: { x: number; y: number }; strokeIn: number },
): PlacedDecor[] {
  const out: PlacedDecor[] = [];
  const shift = opts.shift ?? { x: 0, y: 0 };
  for (const item of items) {
    if (!opts.enabled(item.toggle)) continue;
    const adj = variant.adjust?.[item.id] ?? {};
    let cx = (item.x + (adj.dx ?? 0) + shift.x) * page.W, cy = (item.y + (adj.dy ?? 0) + shift.y) * page.H;
    let r = item.r * page.R * variant.decorScale * (adj.scale ?? 1);
    const hiddenByDensity = !!adj.hide || variant.hide.includes(item.priority);
    const outline = item.style === "outline";
    const blocking = zones.filter((z) => !(z.soft && item.mayUnderlayTitle));
    const touches = () => blocking.some((z) => circleTouchesRect(cx, cy, r, z.rect, outline, opts.strokeIn, variant.clearanceIn));
    let moved = 0, scaled = 1, hidden = hiddenByDensity;
    if (!hidden && touches()) {
      const len = Math.hypot(item.push[0], item.push[1]) || 1, dx = item.push[0] / len, dy = item.push[1] / len;
      const step = 0.01 * page.R, limit = variant.maxShiftR * page.R;
      while (touches() && moved < limit - 1e-9) { cx += dx * step; cy += dy * step; moved += step; }
      while (touches() && scaled > 0.72) { r *= 0.96; scaled *= 0.96; }
      if (touches() && item.priority !== "primary") hidden = true;
    }
    out.push({ item, cx, cy, r, moved, scaled, hidden, overlapsText: !hidden && touches() });
  }
  return out;
}

const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits;
