/**
 * OBJECT FITTER — pure. Places one decorative object (a floral cluster, a
 * line-art motif) in its composition region.
 *
 * The object is aligned inside (or beside) its anchor region, then scaled
 * about its alignment point to the LARGEST size ≤ its preferred size at which
 * its actual artwork footprint (alpha-occupancy cells, not its bounding box):
 *   - stays inside its containment bounds unless clipping is allowed:
 *       contained  an explicit region (e.g. a corner region inset from the trim)
 *       bleed      the trim pushed out by the deliberate bleed amount
 *       default    the trim (+ the bleed margin when allowBleed), and
 *   - touches no protected content (already inflated by the clearance)
 *     unless overlap is allowed.
 * Below MIN_LONG_SIDE_IN an object is dropped with a reason
 * instead of being drawn as a speck.
 */
import { OCCUPANCY, OCCUPANCY_GRID } from "../../design-library/occupancy";
import type { Composition, DecorationPlacement, ProtectedRect } from "../../types/composition";
import type { Rect } from "../../types/geometry";
import { overlaps } from "./composition";

/**
 * Objects shrink as far as needed to stay clear of content, but not below this
 * long side (inches): smaller art reads as a speck, so it is dropped instead.
 */
export const MIN_LONG_SIDE_IN = 0.6;
const SEARCH_STEPS = 14;

export type ArtTransform = { flipX?: boolean; flipY?: boolean };

export type ObjectSpec = DecorationPlacement & {
  assetId: string;
  /** Artwork width / height. */
  aspect: number;
  /** Width before region / conflict limits (inches). */
  preferredW: number;
  transform: ArtTransform;
  /** Region to align in, instead of the anchor's own region (e.g. a contained corner region). */
  region?: Rect;
  /** Containment bounds for a CONTAINED object: every ink cell must stay inside (never cropped). */
  bounds?: Rect;
  /** BLEED: inches the art is pushed past the trim edges it is aligned to (intentional crop). */
  bleedOut?: number;
  /** Per-axis attach (default: `attach`), e.g. above a title (outside in Y) but aligned to its start (inside in X). */
  attachX?: "inside" | "outside";
  attachY?: "inside" | "outside";
  /** Gap to the region when attached outside (default: the content clearance). */
  gapIn?: number;
  /** Vertical centre (or resting line, with alignY "end") that overrides the region's own, e.g. a header rule. */
  restOnY?: number;
  /** Protected content this object is designed to sit on (e.g. the header rule under a flank). */
  ignore?: (p: ProtectedRect) => boolean;
  /** "knockout" = never shrink; content is masked away instead (line-art textures). */
  avoid?: "shrink" | "knockout";
};

export type FitResult = {
  rect: Rect | null;
  scale: number;
  reason?: string;
  /** Share of artwork cells outside the trim (visible page). */
  clippedShare: number;
  /** Share of artwork cells over protected content. */
  overlapShare: number;
  /** True when clipping is part of the design (bleed mode / bleed allowed / clipping allowed). */
  intentionalClip: boolean;
  /** Artwork footprint (union of ink cells), trim coordinates. */
  inkBox: Rect | null;
  /** Ink cells, trim coordinates (validation measures real clearances against these). */
  cells: Rect[];
  /** The bounds the object was contained in (null = bleed / clipping allowed). */
  bounds: Rect | null;
};

type Cell = { u0: number; v0: number; u1: number; v1: number };
const cellCache = new Map<string, Cell[]>();

/** Ink cells of an artwork in unit space (a full-cell grid when no occupancy data exists). */
export function inkCells(assetId: string): Cell[] {
  let c = cellCache.get(assetId);
  if (!c) {
    const rows = OCCUPANCY[assetId];
    const n = OCCUPANCY_GRID;
    c = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!rows || rows[y][x] === "1") c.push({ u0: x / n, v0: y / n, u1: (x + 1) / n, v1: (y + 1) / n });
    cellCache.set(assetId, c);
  }
  return c;
}

export function cellRects(assetId: string, r: Rect, t: ArtTransform): Rect[] {
  return inkCells(assetId).map(({ u0, v0, u1, v1 }) => {
    const [a0, a1] = t.flipX ? [1 - u1, 1 - u0] : [u0, u1];
    const [b0, b1] = t.flipY ? [1 - v1, 1 - v0] : [v0, v1];
    return { x: r.x + a0 * r.w, y: r.y + b0 * r.h, w: (a1 - a0) * r.w, h: (b1 - b0) * r.h };
  });
}

const within = (c: Rect, b: Rect) => c.x >= b.x - 1e-6 && c.y >= b.y - 1e-6 && c.x + c.w <= b.x + b.w + 1e-6 && c.y + c.h <= b.y + b.h + 1e-6;

function inkUnion(cells: Rect[]): Rect | null {
  if (!cells.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cells) {
    x0 = Math.min(x0, c.x);
    y0 = Math.min(y0, c.y);
    x1 = Math.max(x1, c.x + c.w);
    y1 = Math.max(y1, c.y + c.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function fitObject(spec: ObjectSpec, comp: Composition): FitResult {
  const R = spec.region ?? comp.regions[spec.anchor];
  const none = (reason: string): FitResult => ({ rect: null, scale: 0, reason, clippedShare: 0, overlapShare: 0, intentionalClip: false, inkBox: null, cells: [], bounds: null });
  if (!R) return none(`this page has no "${spec.anchor}" region`);
  const { w: W, h: H } = comp.trim;
  const bx = spec.allowBleed ? comp.bleedIn.x : 0, by = spec.allowBleed ? comp.bleedIn.y : 0;
  const trim: Rect = { x: 0, y: 0, w: W, h: H };
  const ar = spec.aspect;

  // Preferred size, limited by max width / height and (inside + contain) the region itself.
  let w0 = spec.fit === "natural" ? spec.preferredW : spec.preferredW;
  if (spec.maxWidthIn) w0 = Math.min(w0, spec.maxWidthIn);
  if (spec.maxHeightIn) w0 = Math.min(w0, spec.maxHeightIn * ar);
  if (spec.attach === "inside" && spec.fit === "contain") w0 = Math.min(w0, R.w, R.h * ar);
  if (spec.attach === "inside" && spec.fit === "cover") w0 = Math.max(R.w, R.h * ar);
  if (!(w0 > 0)) return none("no size available");
  const out = spec.bleedOut ?? 0;
  const ink = inkCells(spec.assetId);
  const inkBottom = ink.length ? Math.max(...ink.map((c) => (spec.transform.flipY ? 1 - c.v0 : c.v1))) : 1;
  const ax = spec.attachX ?? spec.attach, ay = spec.attachY ?? spec.attach;
  const gap = spec.gapIn ?? comp.clearanceIn;

  const place = (w: number): Rect => {
    const h = w / ar;
    let x: number, y: number;
    if (ax === "outside") x = spec.alignX === "start" ? R.x - gap - w : spec.alignX === "end" ? R.x + R.w + gap : R.x + (R.w - w) / 2;
    else x = spec.alignX === "start" ? R.x : spec.alignX === "end" ? R.x + R.w - w : R.x + (R.w - w) / 2;
    if (ay === "outside") y = spec.alignY === "start" ? R.y - gap - h : spec.alignY === "end" ? R.y + R.h + gap : R.y + (R.h - h) / 2;
    else y = spec.alignY === "start" ? R.y : spec.alignY === "end" ? R.y + R.h - h : R.y + (R.h - h) / 2;
    // Resting on a line: the artwork's LOWEST INK (not its image box) touches the line.
    if (spec.restOnY !== undefined) y = spec.alignY === "end" ? spec.restOnY - h * inkBottom : spec.restOnY - h / 2;
    // Pieces aligned to a page edge run to the bleed edge — or, in bleed mode, deliberately past it.
    if (ax === "inside" && !spec.bounds) {
      // Never push more than 45% of the art off the page: the rest must still read.
      const px = out ? Math.min(out, 0.45 * w) : bx, py = out ? Math.min(out, 0.45 * h) : by;
      if (spec.alignX === "start" && Math.abs(R.x) < 1e-6) x -= px;
      if (spec.alignX === "end" && Math.abs(R.x + R.w - W) < 1e-6) x += px;
      if (ay === "inside" && spec.alignY === "start" && Math.abs(R.y) < 1e-6) y -= py;
      if (ay === "inside" && spec.alignY === "end" && Math.abs(R.y + R.h - H) < 1e-6) y += py;
    }
    return { x: x + spec.offsetXIn, y: y + spec.offsetYIn, w, h };
  };
  const bounds = (w: number): Rect => {
    if (spec.bounds) return spec.bounds;
    const ox = Math.max(bx, out ? Math.min(out, 0.45 * w) : 0), oy = Math.max(by, out ? Math.min(out, (0.45 * w) / ar) : 0);
    return { x: -ox, y: -oy, w: W + 2 * ox, h: H + 2 * oy };
  };
  const protectedSet = comp.protected.filter((p) => !spec.ignore?.(p));
  const conflicts = (cells: Rect[]) => {
    let n = 0;
    for (const c of cells) if (protectedSet.some((p) => overlaps(c, p.rect))) n++;
    return n;
  };
  const shrink = spec.avoid !== "knockout";
  const valid = (w: number) => {
    const cells = cellRects(spec.assetId, place(w), spec.transform);
    if (!spec.allowClipping) {
      const b = bounds(w);
      if (cells.some((c) => !within(c, b))) return false;
    }
    if (shrink && !spec.allowContentOverlap && conflicts(cells) > 0) return false;
    return true;
  };

  let k = 1;
  if (!valid(w0)) {
    const minW = ar >= 1 ? MIN_LONG_SIDE_IN : MIN_LONG_SIDE_IN * ar;
    const kMin = Math.min(1, minW / w0);
    if (!valid(w0 * kMin)) {
      return none(`no room for this artwork (≥ ${(w0 * kMin).toFixed(2)}" wide) without ${spec.allowClipping ? "covering content" : spec.bounds ? "leaving its region or covering content" : "being cropped or covering content"}`);
    }
    let lo = kMin, hi = 1;
    for (let i = 0; i < SEARCH_STEPS; i++) {
      const mid = (lo + hi) / 2;
      if (valid(w0 * mid)) lo = mid;
      else hi = mid;
    }
    k = lo;
  }
  const rect = place(w0 * k);
  const cells = cellRects(spec.assetId, rect, spec.transform);
  const outside = cells.filter((c) => !within(c, trim)).length;
  return {
    rect,
    scale: k,
    clippedShare: cells.length ? outside / cells.length : 0,
    overlapShare: cells.length ? conflicts(cells) / cells.length : 0,
    intentionalClip: spec.allowClipping || out > 0 || (spec.allowBleed && !spec.bounds),
    inkBox: inkUnion(cells),
    cells,
    bounds: spec.allowClipping ? null : bounds(w0 * k),
  };
}
