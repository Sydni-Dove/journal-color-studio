/**
 * FIT ART TO THE PAGE MARGINS — any uploaded art (lettering, page borders, frames, coloring art) scaled and centred
 * inside the page's margins, never stretched (both directions scale together), on the printed page with its bleed.
 *
 *   content     the art's own box: the empty white (or transparent) space around it is left out first, so the art,
 *               not the file, is what fits the margins
 *   cut off     art that runs off the edge of the file (a border cut by the page edge) is reported: shrinking it to fit
 *               can't bring back the part that was cut away
 *   redraw      a border made of plain lines (one or more frames, square or rounded corners) is measured and drawn
 *               again, whole, inside the margins, at its own line thicknesses and spacing. An ornamental border
 *               can't be rebuilt from part of it: the screen offers an Art Prompt to have it redrawn inside the margins.
 */
import type { Pixels } from "../lettering/bubble";

export type Margins = { top: number; bottom: number; left: number; right: number };
export type PageSpec = { trimW: number; trimH: number; bleed: number };
export type Edge = "top" | "bottom" | "left" | "right";
export type Box = { x: number; y: number; w: number; h: number };

const lum = (d: Pixels["data"], i: number) => 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
/** Any art at all: not white and not transparent. */
const isArt = (d: Pixels["data"], i: number) => d[i * 4 + 3] > 16 && lum(d, i) < 245;
/** Line work: dark and solid. */
const isInk = (d: Pixels["data"], i: number) => d[i * 4 + 3] > 128 && lum(d, i) < 128;

/** The art's own box in the file (pixels), without the empty space around it; null for an empty image. */
export function contentBox(px: Pixels): Box | null {
  const { width: W, height: H, data } = px;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (isArt(data, y * W + x)) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** The edges the art runs off: art touching the file's edge along more than a speck of it. */
export function cutEdges(px: Pixels): Edge[] {
  const { width: W, height: H, data } = px;
  const count = (n: number, at: (k: number, depth: number) => number) => {
    let c = 0;
    for (let k = 0; k < n; k++) if (isArt(data, at(k, 0)) || isArt(data, at(k, 1))) c++;
    return c;
  };
  const out: Edge[] = [];
  const min = (n: number) => Math.max(3, n * 0.01);
  if (count(W, (k, d) => d * W + k) > min(W)) out.push("top");
  if (count(W, (k, d) => (H - 1 - d) * W + k) > min(W)) out.push("bottom");
  if (count(H, (k, d) => k * W + d) > min(H)) out.push("left");
  if (count(H, (k, d) => k * W + (W - 1 - d)) > min(H)) out.push("right");
  return out;
}

/** The page, in inches from the corner of the printed sheet (the bleed included). */
export function pageBoxes(page: PageSpec, m: Margins) {
  const b = page.bleed;
  return {
    media: { x: 0, y: 0, w: page.trimW + 2 * b, h: page.trimH + 2 * b },
    trim: { x: b, y: b, w: page.trimW, h: page.trimH },
    /** Inside the margins: where the art goes. */
    safe: { x: b + m.left, y: b + m.top, w: Math.max(0.1, page.trimW - m.left - m.right), h: Math.max(0.1, page.trimH - m.top - m.bottom) },
  };
}

/**
 * Where the art is drawn (inches, on the printed sheet): as large as fits inside the margins, centred, never
 * stretched. `ppi` is how sharp it prints there (300 or more prints sharp).
 */
export function fitArt(art: { w: number; h: number }, page: PageSpec, m: Margins): { draw: Box; scale: number; ppi: number } {
  const { safe } = pageBoxes(page, m);
  const k = Math.min(safe.w / art.w, safe.h / art.h); // inches per pixel
  const w = art.w * k, h = art.h * k;
  return { draw: { x: safe.x + (safe.w - w) / 2, y: safe.y + (safe.h - h) / 2, w, h }, scale: k, ppi: Math.round(1 / k) };
}

// ---- A border of plain lines ------------------------------------------------------------------------

/** One line of a frame: how far its outer edge is from the file's edge, and its thickness (pixels). */
export type FrameLine = { offset: number; thickness: number };
export type Frame = { lines: FrameLine[]; radiusPx: number; cut: boolean };

/** The dark runs met going in from one edge, up to `depth` pixels in. */
function runsFrom(px: Pixels, edge: Edge, along: number, depth: number): FrameLine[] {
  const { width: W, height: H, data } = px;
  const at = (k: number) => (edge === "left" ? along * W + k : edge === "right" ? along * W + (W - 1 - k) : edge === "top" ? k * W + along : (H - 1 - k) * W + along);
  const out: FrameLine[] = [];
  let start = -1;
  for (let k = 0; k <= depth; k++) {
    const ink = k < depth && isInk(data, at(k));
    if (ink && start < 0) start = k;
    if (!ink && start >= 0) {
      out.push({ offset: start, thickness: k - start });
      start = -1;
    }
  }
  return out;
}

/**
 * A border of plain lines, if that's what the art is: the same lines (count, thickness and spacing, within a few
 * pixels) met going in from all four sides, at several places along each. Null for anything else (an ornamental
 * border, a picture).
 */
export function detectFrame(px: Pixels): Frame | null {
  const { width: W, height: H } = px;
  const tol = Math.max(3, Math.round(Math.min(W, H) * 0.006));
  const same = (a: FrameLine[], b: FrameLine[]) => a.length === b.length && a.every((l, i) => Math.abs(l.offset - b[i].offset) <= tol && Math.abs(l.thickness - b[i].thickness) <= tol);
  const sides: FrameLine[][] = [];
  for (const edge of ["left", "right", "top", "bottom"] as Edge[]) {
    const n = edge === "left" || edge === "right" ? H : W;
    const depth = Math.round((edge === "left" || edge === "right" ? W : H) * 0.25);
    const probes = [0.3, 0.5, 0.7].map((f) => runsFrom(px, edge, Math.round(n * f), depth));
    if (!probes[1].length || !same(probes[0], probes[1]) || !same(probes[1], probes[2])) return null;
    sides.push(probes[1]);
  }
  // Sides may be cut differently by the page edge: compare their lines' spacing and thickness, not their offsets.
  const shape = (s: FrameLine[]) => s.map((l) => ({ offset: l.offset - s[0].offset, thickness: l.thickness }));
  if (!sides.every((s) => same(shape(s), shape(sides[0])))) return null;
  const lines = shape(sides[0]).map((l, i) => ({ offset: l.offset, thickness: Math.round(sides.reduce((n, s) => n + s[i].thickness, 0) / sides.length) }));
  // Corner roundness: how far in along the diagonal the first line is met, against a square corner.
  const o = Math.round(sides.reduce((n, s) => n + s[0].offset, 0) / sides.length);
  let d = 0;
  const lim = Math.min(W, H) * 0.3;
  while (d < lim && !isInk(px.data, Math.round(d) * W + Math.round(d))) d += 1;
  const radiusPx = Math.max(0, Math.round(((d - o) * Math.SQRT2) / (Math.SQRT2 - 1)));
  const cut = sides.some((s) => s[0].offset === 0);
  return { lines, radiusPx: d >= lim ? 0 : radiusPx, cut };
}

/**
 * The border drawn again inside the margins: each line as a rounded rectangle (inches, centre of the stroke), the
 * outermost on the margin, at the lines' own thickness and spacing (`dpi`: the file's resolution).
 */
export function redrawFrame(f: Frame, page: PageSpec, m: Margins, dpi: number): { x: number; y: number; w: number; h: number; r: number; stroke: number }[] {
  const { safe } = pageBoxes(page, m);
  const inch = (p: number) => p / dpi;
  return f.lines.map((l) => {
    const inset = inch(l.offset) + inch(l.thickness) / 2;
    return {
      x: safe.x + inset, y: safe.y + inset, w: Math.max(0, safe.w - 2 * inset), h: Math.max(0, safe.h - 2 * inset),
      r: Math.max(0, inch(f.radiusPx) - inch(l.offset)), stroke: inch(l.thickness),
    };
  });
}

/** The redrawn border as SVG (inches), for the preview and the PNG. */
export function frameSvg(rects: ReturnType<typeof redrawFrame>, page: PageSpec): string {
  const W = page.trimW + 2 * page.bleed, H = page.trimH + 2 * page.bleed;
  const f = (v: number) => +v.toFixed(4);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}in" height="${f(H)}in" viewBox="0 0 ${f(W)} ${f(H)}">${rects.map((r) => `<rect x="${f(r.x)}" y="${f(r.y)}" width="${f(r.w)}" height="${f(r.h)}" rx="${f(r.r)}" fill="none" stroke="#000000" stroke-width="${f(r.stroke)}"/>`).join("")}</svg>`;
}

/** For a border that can't be rebuilt from lines: an Art Prompt to have it redrawn whole, inside the margins. */
export function borderPrompt(page: PageSpec, m: Margins): string {
  const all = m.top === m.bottom && m.top === m.left && m.top === m.right;
  const margins = all ? `a ${m.top} inch margin on every side` : `margins of ${m.top} in at the top, ${m.bottom} in at the bottom, ${m.left} in on the left and ${m.right} in on the right`;
  return [
    `Redraw this page border so the whole border, corners included, sits inside ${margins} of a portrait ${page.trimW} x ${page.trimH} inch page.`,
    "Nothing may touch or run off the edge of the page. Keep the same design, line weight and style, completed where it was cut off.",
    "Pure black line art on pure white. No gray, no shading, no gradients, no shadows and no solid black fills.",
    "Leave the middle of the page completely blank.",
  ].join("\n");
}
