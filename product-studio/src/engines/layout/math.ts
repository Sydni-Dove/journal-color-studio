/**
 * Layout math shared by every template. Pure, unit-tested, inch-based.
 *
 *   Equal distribution:  size = (available − (n − 1) × gap) / n
 *   Pitch fitting:       count = floor(available / pitch)
 *   Stack solving:       fixed mechanical/text modules keep their size;
 *                        elastic modules share what remains.
 */
import type { Rect } from "../../types/geometry";
import { GEOMETRY_EPSILON_IN } from "../units/units";

export type Distribution = {
  count: number;
  size: number;
  gap: number;
  /** Start coordinate of each track. */
  starts: number[];
  /** Track boundaries [start0, end0, start1, end1 …] flattened for overlays. */
  edges: number[];
};

/** n equal tracks with n − 1 gaps across [start, start + length]. */
export function distributeEqual(start: number, length: number, count: number, gap: number): Distribution {
  if (!Number.isInteger(count) || count < 1) throw new Error(`distributeEqual: count must be a positive integer (got ${count})`);
  const size = (length - (count - 1) * gap) / count;
  const starts = Array.from({ length: count }, (_, i) => start + i * (size + gap));
  const edges = starts.flatMap((s) => [s, s + size]);
  return { count, size, gap, starts, edges };
}

/** Number of whole pitches that fit (floor), tolerant of float noise. */
export function fitCount(length: number, pitch: number): number {
  if (!(pitch > 0)) throw new Error(`fitCount: pitch must be > 0 (got ${pitch})`);
  if (length <= 0) return 0;
  return Math.floor(length / pitch + GEOMETRY_EPSILON_IN);
}

/**
 * Writing-line positions. The region [top, bottom] is divided into rows of
 * `spacing`; each row's rule sits at the row's bottom. The final rule is
 * always ≤ bottom, so no line escapes the usable writing region.
 */
export function writingLinePositions(top: number, bottom: number, spacing: number): number[] {
  const n = fitCount(bottom - top, spacing);
  return Array.from({ length: n }, (_, i) => top + (i + 1) * spacing);
}

/**
 * Grid points (dots / graph lines) fitted to a length, centred so the
 * leftover is split evenly on both sides. Returns cells + 1 positions.
 */
export function gridPositions(start: number, length: number, pitch: number): { cells: number; positions: number[] } {
  const cells = fitCount(length, pitch);
  const used = cells * pitch;
  const offset = start + (length - used) / 2;
  return { cells, positions: Array.from({ length: cells + 1 }, (_, i) => offset + i * pitch) };
}

// ─── Stack solver ──────────────────────────────────────────────────────────
export type StackModule =
  | { id: string; kind: "fixed"; size: number }
  | { id: string; kind: "elastic"; weight?: number; min?: number; max?: number };

export type StackSegment = { id: string; start: number; size: number };

export type StackResult = {
  segments: StackSegment[];
  /** > 0 when fixed sizes + gaps + elastic minimums exceed the available length. */
  overflow: number;
  byId: Record<string, StackSegment>;
};

/**
 * Solve a 1-D stack of modules along [start, start + length].
 * Fixed modules keep their size. Elastic modules share the remainder by
 * weight, honoring min/max. Nothing is ever pushed outside the range: when
 * the stack does not fit, `overflow` reports the deficit so validation can
 * flag it — mechanical safety zones are never borrowed.
 */
export function solveStack(start: number, length: number, modules: StackModule[], gap: number): StackResult {
  const gaps = Math.max(0, modules.length - 1) * gap;
  const fixedTotal = modules.reduce((s, m) => s + (m.kind === "fixed" ? m.size : 0), 0);
  const elastic = modules.filter((m): m is Extract<StackModule, { kind: "elastic" }> => m.kind === "elastic");
  const remaining = length - gaps - fixedTotal;
  const minTotal = elastic.reduce((s, m) => s + (m.min ?? 0), 0);
  const overflow = Math.max(0, minTotal - remaining);

  // Weighted share with min/max clamping: clamp violators, redistribute the rest.
  const sizes = new Map<string, number>();
  let free = elastic.slice();
  let avail = Math.max(0, remaining);
  while (free.length) {
    const totalW = free.reduce((s, m) => s + (m.weight ?? 1), 0);
    const share = (m: (typeof free)[number]) => (avail * (m.weight ?? 1)) / totalW;
    const violators = free.filter((m) => (m.min !== undefined && share(m) < m.min) || (m.max !== undefined && share(m) > m.max));
    if (!violators.length) {
      for (const m of free) sizes.set(m.id, share(m));
      break;
    }
    for (const m of violators) {
      const size = m.min !== undefined && share(m) < m.min ? m.min : m.max!;
      sizes.set(m.id, size);
      avail = Math.max(0, avail - size);
    }
    free = free.filter((m) => !sizes.has(m.id));
  }

  let cursor = start;
  const segments: StackSegment[] = modules.map((m) => {
    const size = m.kind === "fixed" ? m.size : sizes.get(m.id) ?? 0;
    const seg = { id: m.id, start: cursor, size };
    cursor += size + gap;
    return seg;
  });
  return { segments, overflow, byId: Object.fromEntries(segments.map((s) => [s.id, s])) };
}

// ─── Rect helpers ──────────────────────────────────────────────────────────
export const inset = (r: Rect, d: number): Rect => ({ x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - 2 * d });
export const rectRight = (r: Rect) => r.x + r.w;
export const rectBottom = (r: Rect) => r.y + r.h;

export function rectContains(outer: Rect, inner: Rect, eps = GEOMETRY_EPSILON_IN): boolean {
  return (
    inner.x >= outer.x - eps &&
    inner.y >= outer.y - eps &&
    rectRight(inner) <= rectRight(outer) + eps &&
    rectBottom(inner) <= rectBottom(outer) + eps
  );
}

export function rectsIntersect(a: Rect, b: Rect, eps = GEOMETRY_EPSILON_IN): boolean {
  return a.x < rectRight(b) - eps && rectRight(a) > b.x + eps && a.y < rectBottom(b) - eps && rectBottom(a) > b.y + eps;
}

/** Split a rect vertically (rows) by a solved stack. */
export function rowRect(r: Rect, seg: StackSegment): Rect {
  return { x: r.x, y: seg.start, w: r.w, h: seg.size };
}

/** Split a rect horizontally (columns) by a solved stack. */
export function colRect(r: Rect, seg: StackSegment): Rect {
  return { x: seg.start, y: r.y, w: seg.size, h: r.h };
}
