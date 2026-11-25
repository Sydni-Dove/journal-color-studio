/**
 * BUBBLE LETTERING LINE ART — words drawn as coloring-page lettering: a black outline only, white inside, print-ready.
 *
 *   draw      the words, set in a rounded display font (Fredoka Bold, bundled), swelled ("puffed") by the style's
 *             roundness, outlined at its outline thickness. Letters that overlap share one outline: the black layer is
 *             every letter stroked wide, the white layer every letter stroked narrower on top, so only the outer edge of
 *             the whole word stays black (the classic hand-drawn bubble look). Vector paths only: no font is needed to
 *             open the SVG, and the PNG is drawn from the same paths at 300 DPI.
 *   measure   reads an existing bubble-lettering image (an upload, or a picture already in Product Studio): its size,
 *             the letters' height and width, the outline thickness, the spacing (or overlap) between letters, the line
 *             spacing and how round (puffed) the letters are. `styleFrom` turns those measurements into a style that
 *             draws new words the same way, at the same dimensions.
 *
 * Everything here is plain math on paths and pixels (no DOM), so it is tested in Node; the screen loads the font and
 * draws the PNG (components/lettering).
 */
import type { Font, PathCommand } from "opentype.js";

export const LETTERING_FONT = "Fredoka";
/** Print resolution for the PNG and the default for reading a sample's physical size. */
export const PRINT_DPI = 300;

/** A lettering style: everything that decides how words are drawn. Lengths in inches, the outline in points. */
export type LetteringStyle = {
  id: string;
  name: string;
  /** Height of a capital letter's body before puffing (inches). */
  capHeightIn: number;
  /** Black outline thickness (points). */
  outlinePt: number;
  /** Roundness: how far each letter swells past the font's own shape, rounding every corner (inches). */
  puffIn: number;
  /** Extra space between letters (inches). Negative: the letters overlap by that much and share one outline. */
  spacingIn: number;
  /** Letter width: 1 = the font's own proportions; 0.8 narrower, 1.2 wider. */
  widthScale: number;
  /** Gap between one line's outline and the next line's (inches). */
  lineGapIn: number;
  align: "left" | "center" | "right";
  /** The artwork's overall size (from a sample): new words are centred on a canvas this size. Absent: fit the words. */
  canvas?: { widthIn: number; heightIn: number };
  /** Where the style was read from, and the raw measurements (shown, never needed to draw). */
  source?: { name: string; widthPx: number; heightPx: number; dpi: number; text?: string };
  measured?: Measurement;
  createdAt?: string;
};

export const DEFAULT_STYLE: LetteringStyle = {
  id: "classic-bubble", name: "Classic bubble", capHeightIn: 1, outlinePt: 3, puffIn: 0.06, spacingIn: -0.02, widthScale: 1, lineGapIn: 0.12, align: "center",
};

const PT = 72;

// ---- Drawing -------------------------------------------------------------------------------------

/** One letter's path data and its outer box (inches, before the outline and puff). */
type Placed = { d: string; x1: number; x2: number };

export type LetteringLayout = {
  /** All the letters' outlines as one path (points, origin top-left of the artwork). */
  d: string;
  /** Artwork size in inches (outline and puff included, plus the canvas when the style has one). */
  widthIn: number;
  heightIn: number;
  /** The black layer's and the white layer's stroke widths (points). */
  blackStrokePt: number;
  whiteStrokePt: number;
  lines: { text: string; widthIn: number; letters: number }[];
};

/** The font's capital height in font units (OS/2, else the "H"). */
export function capHeightUnits(font: Font): number {
  const os2 = (font.tables as { os2?: { sCapHeight?: number } }).os2;
  return os2?.sCapHeight || font.charToGlyph("H").getBoundingBox().y2 || font.unitsPerEm * 0.7;
}

/** The font's typical stem width as a share of its capital height (for reading a sample's roundness). */
export function stemRatio(font: Font): number {
  const b = font.charToGlyph("l").getBoundingBox();
  return Math.max(0.05, (b.x2 - b.x1) / capHeightUnits(font));
}

const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

/** Path commands → SVG path data, every x stretched by `sx` around `ox` and moved by (dx, dy). */
function pathData(cmds: PathCommand[], sx: number, ox: number, dx: number, dy: number): string {
  const X = (x: number) => fmt(ox + (x - ox) * sx + dx), Y = (y: number) => fmt(y + dy);
  return cmds
    .map((c) => {
      switch (c.type) {
        case "M":
        case "L":
          return `${c.type}${X(c.x)} ${Y(c.y)}`;
        case "Q":
          return `Q${X(c.x1)} ${Y(c.y1)} ${X(c.x)} ${Y(c.y)}`;
        case "C":
          return `C${X(c.x1)} ${Y(c.y1)} ${X(c.x2)} ${Y(c.y2)} ${X(c.x)} ${Y(c.y)}`;
        default:
          return "Z";
      }
    })
    .join("");
}

/** Lay out the words (one line per line of text) in the style: their paths and the artwork's size. */
export function layoutLettering(font: Font, text: string, s: LetteringStyle): LetteringLayout {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const capPt = s.capHeightIn * PT;
  const size = (capPt * font.unitsPerEm) / capHeightUnits(font);
  const per = size / font.unitsPerEm;
  const edge = (s.puffIn * PT) + s.outlinePt; // how far the outline reaches past the letter shape (points)
  const placedLines = lines.map((line) => {
    const out: Placed[] = [];
    let x = 0;
    for (const g of font.stringToGlyphs(line)) {
      const adv = (g.advanceWidth ?? 0) * per * s.widthScale;
      if (g.unicode !== 32 && g.path.commands.length) {
        const cmds = openCounters(g.getPath(x, 0, size).commands, edge);
        const b = g.getBoundingBox();
        out.push({ d: pathData(cmds, s.widthScale, x, 0, 0), x1: x + b.x1 * per * s.widthScale, x2: x + b.x2 * per * s.widthScale });
      }
      x += adv + s.spacingIn * PT;
    }
    const x1 = out.length ? Math.min(...out.map((p) => p.x1)) : 0, x2 = out.length ? Math.max(...out.map((p) => p.x2)) : 0;
    // The line's own height: its tallest letter's top to its lowest letter's bottom (points, from the baseline).
    const ext = lineExtent(font, line);
    return { line, out, x1, x2, w: x2 - x1, up: ext.up * per, down: ext.down * per };
  });
  // Lines stack outline to outline, `lineGapIn` apart.
  const heights = placedLines.map((l) => l.up + l.down + 2 * edge);
  const textW = Math.max(0, ...placedLines.map((l) => l.w)) + 2 * edge;
  const textH = heights.reduce((a, b) => a + b, 0) + Math.max(0, placedLines.length - 1) * s.lineGapIn * PT;
  const W = Math.max(textW, (s.canvas?.widthIn ?? 0) * PT), H = Math.max(textH, (s.canvas?.heightIn ?? 0) * PT);
  let y = (H - textH) / 2;
  const d = placedLines
    .map((l, k) => {
      const baseline = y + edge + l.up;
      y += heights[k] + s.lineGapIn * PT;
      const left = s.align === "left" ? edge : s.align === "right" ? W - edge - l.w : (W - l.w) / 2;
      const dx = left - l.x1;
      return l.out.map((p) => translate(p.d, dx, baseline)).join("");
    })
    .join("");
  return {
    d, widthIn: W / PT, heightIn: H / PT, blackStrokePt: 2 * edge, whiteStrokePt: 2 * s.puffIn * PT,
    lines: placedLines.map((l) => ({ text: l.line, widthIn: (l.w + 2 * edge) / PT, letters: l.line.replace(/\s/g, "").length })),
  };
}

/**
 * A letter's openings (the holes in o, a, e…) that the puff and outline would close up are filled in: otherwise
 * they'd print as small solid black dots. Openings with room for a white centre stay open, outlined. `edge` is how
 * far the outline reaches past the letter (points).
 */
export function openCounters(cmds: PathCommand[], edge: number): PathCommand[] {
  const contours: PathCommand[][] = [];
  for (const c of cmds) {
    if (c.type === "M" || !contours.length) contours.push([]);
    contours[contours.length - 1].push(c);
  }
  const info = contours.map((cs) => {
    const pts = polygons(cs)[0] ?? [];
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      area += x1 * y2 - x2 * y1;
    }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { area: area / 2, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  });
  const outer = info.reduce((best, x) => (Math.abs(x.area) > Math.abs(best.area) ? x : best), info[0]);
  if (!outer) return cmds;
  // A hole winds the other way. Keep it only when its white centre survives: half its narrow side past the reach,
  // with some room to spare.
  return contours.filter((_, i) => {
    const x = info[i];
    if (Math.sign(x.area) === Math.sign(outer.area)) return true;
    return Math.min(x.w, x.h) / 2 > edge * 1.35;
  }).flat();
}

/** How far a line's letters reach above and below the baseline (font units). */
export function lineExtent(font: Font, line: string): { up: number; down: number } {
  let up = 0, down = 0;
  for (const g of font.stringToGlyphs(line)) {
    if (!g.path.commands.length) continue;
    const b = g.getBoundingBox();
    up = Math.max(up, b.y2);
    down = Math.max(down, -b.y1);
  }
  return { up, down };
}

/** Flatten a glyph's outline into closed polygons (font units, y up). */
function polygons(cmds: PathCommand[]): [number, number][][] {
  const out: [number, number][][] = [];
  let cur: [number, number][] = [];
  let px = 0, py = 0;
  for (const c of cmds) {
    if (c.type === "M") { if (cur.length) out.push(cur); cur = [[c.x, c.y]]; px = c.x; py = c.y; }
    else if (c.type === "L") { cur.push([c.x, c.y]); px = c.x; py = c.y; }
    else if (c.type === "Q") { for (let t = 0.125; t <= 1.0001; t += 0.125) { const u = 1 - t; cur.push([u * u * px + 2 * u * t * c.x1 + t * t * c.x, u * u * py + 2 * u * t * c.y1 + t * t * c.y]); } px = c.x; py = c.y; }
    else if (c.type === "C") { for (let t = 0.125; t <= 1.0001; t += 0.125) { const u = 1 - t; cur.push([u * u * u * px + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x, u * u * u * py + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y]); } px = c.x; py = c.y; }
    else if (c.type === "Z") { if (cur.length) out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Filled runs across the glyphs of `text`, scanned across and down (font units): how thick its strokes are. */
export function glyphRuns(font: Font, text: string): number[] {
  const runs: number[] = [];
  for (const g of font.stringToGlyphs(text)) {
    if (!g.path.commands.length) continue;
    const polys = polygons(g.path.commands);
    const b = g.getBoundingBox();
    for (const axis of [0, 1] as const) {
      const lo = axis ? b.x1 : b.y1, hi = axis ? b.x2 : b.y2;
      for (let k = 1; k < 40; k++) {
        const at = lo + ((hi - lo) * k) / 40;
        const xs: number[] = [];
        for (const poly of polys)
          for (let i = 0; i < poly.length; i++) {
            const p = poly[i], q = poly[(i + 1) % poly.length];
            const [a0, a1] = axis ? [p[0], q[0]] : [p[1], q[1]];
            const [c0, c1] = axis ? [p[1], q[1]] : [p[0], q[0]];
            if ((a0 <= at && a1 > at) || (a1 <= at && a0 > at)) xs.push(c0 + ((at - a0) / (a1 - a0)) * (c1 - c0));
          }
        xs.sort((u, v) => u - v);
        for (let i = 0; i + 1 < xs.length; i += 2) runs.push(xs[i + 1] - xs[i]);
      }
    }
  }
  return runs;
}

/** The typical stroke thickness of `text`'s letters (font units): the most common filled run. */
export function typicalStroke(font: Font, text: string): number {
  const runs = glyphRuns(font, text || "ABCDEGHKMNOPRSabcdeghmnoprs");
  const bin = font.unitsPerEm / 100;
  return modeBinned(runs, bin);
}

/** The most common value, in bins of `bin`, refined to the median of that bin and its neighbours. */
function modeBinned(xs: number[], bin: number): number {
  if (!xs.length) return 0;
  const c = new Map<number, number>();
  for (const x of xs) { const k = Math.round(x / bin); c.set(k, (c.get(k) ?? 0) + 1); }
  let best = 0, n = -1;
  for (const [k, v] of c) {
    const score = v + (c.get(k - 1) ?? 0) * 0.5 + (c.get(k + 1) ?? 0) * 0.5;
    if (score > n) [best, n] = [k, score];
  }
  return median(xs.filter((x) => Math.abs(x / bin - best) <= 1.5));
}

/** Move every coordinate pair of path data by (dx, dy). */
function translate(d: string, dx: number, dy: number): string {
  return d.replace(/([MLQCZ])([^MLQCZ]*)/g, (_m, cmd: string, args: string) => {
    if (cmd === "Z") return "Z";
    const n = args.trim().split(/[\s,]+/).map(Number);
    return cmd + n.map((v, i) => fmt(i % 2 === 0 ? v + dx : v + dy)).join(" ");
  });
}

/** The artwork as a standalone SVG: black outline, white inside, transparent elsewhere (or on white). */
export function letteringSvg(layout: LetteringLayout, opts: { background?: "white" | "none" } = {}): string {
  const w = layout.widthIn * PT, h = layout.heightIn * PT;
  const common = `stroke-linejoin="round" stroke-linecap="round" fill-rule="nonzero"`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(layout.widthIn)}in" height="${fmt(layout.heightIn)}in" viewBox="0 0 ${fmt(w)} ${fmt(h)}">`,
    opts.background === "white" ? `<rect width="100%" height="100%" fill="#ffffff"/>` : "",
    `<path d="${layout.d}" fill="#000000" stroke="#000000" stroke-width="${fmt(layout.blackStrokePt)}" ${common}/>`,
    `<path d="${layout.d}" fill="#ffffff" stroke="${layout.whiteStrokePt > 0 ? "#ffffff" : "none"}" stroke-width="${fmt(layout.whiteStrokePt)}" ${common}/>`,
    `</svg>`,
  ].join("");
}

/** The PNG's pixel size at print resolution. */
export const pngSize = (l: LetteringLayout, dpi = PRINT_DPI) => ({ w: Math.round(l.widthIn * dpi), h: Math.round(l.heightIn * dpi) });

// ---- Reading a sample ------------------------------------------------------------------------------

/** Raw pixels (RGBA, as from a canvas). */
export type Pixels = { width: number; height: number; data: Uint8ClampedArray | Uint8Array };

export type Measurement = {
  widthPx: number;
  heightPx: number;
  /** The lettering's own box inside the image (pixels). */
  ink: { x: number; y: number; w: number; h: number };
  /** Lines of lettering found, top to bottom. */
  lines: { y: number; h: number; x: number; w: number; pieces: number; pieceWidths: number[]; gaps: number[] }[];
  /** Outline thickness (pixels): the most common black run across an outline. */
  strokePx: number;
  /** Letter height: the median line height (outer edge to outer edge, pixels). */
  letterHeightPx: number;
  /** Letter width: the median separate letter's width (pixels; absent when every letter overlaps its neighbour). */
  letterWidthPx?: number;
  /** The white inside a letter's stroke, outline to outline (pixels): how fat the letters are. */
  bodyPx: number;
  /** Space between separate letters (pixels, median; absent when they all overlap). */
  gapPx?: number;
  /** Gap between lines (pixels). */
  lineGapPx?: number;
};

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
/** The most common value (to the nearest whole pixel), ignoring the longest tail. */
const mode = (xs: number[]) => {
  const c = new Map<number, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  let best = 0, n = -1;
  for (const [k, v] of c) if (v > n || (v === n && k < best)) [best, n] = [k, v];
  return best;
};

/** Read a bubble-lettering image: black outlines on white (or transparent). */
/**
 * The image's black ink, and everything outside the lettering (non-black pixels reachable from the image's edge).
 * What isn't outside is a letter: its outline and the white inside it.
 */
export function letterMasks(px: Pixels): { ink: Uint8Array; outside: Uint8Array; box: { minX: number; minY: number; maxX: number; maxY: number } } {
  const { width: W, height: H, data } = px;
  const ink = new Uint8Array(W * H);
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let i = 0; i < W * H; i++) {
    const a = data[i * 4 + 3], lum = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    if (a > 128 && lum < 128) {
      ink[i] = 1;
      const x = i % W, y = (i / W) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error("No black lettering found in this image. Use black outlines on a white or transparent background.");
  const outside = new Uint8Array(W * H);
  const stack: number[] = [];
  const seed = (i: number) => { if (!ink[i] && !outside[i]) { outside[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
  while (stack.length) {
    const i = stack.pop()!, x = i % W;
    if (x > 0) seed(i - 1);
    if (x < W - 1) seed(i + 1);
    if (i >= W) seed(i - W);
    if (i < W * (H - 1)) seed(i + W);
  }
  return { ink, outside, box: { minX, minY, maxX, maxY } };
}

/** Bands of rows holding lettering (small gaps inside a line bridged): the lines, top to bottom. */
export function lineBands(W: number, outside: Uint8Array, box: { minX: number; minY: number; maxX: number; maxY: number }): { y0: number; y1: number }[] {
  const rows: boolean[] = [];
  for (let y = 0; y <= box.maxY; y++) {
    let any = false;
    for (let x = box.minX; x <= box.maxX && !any; x++) any = !outside[y * W + x];
    rows.push(any);
  }
  const bridge = Math.max(2, Math.round((box.maxY - box.minY) * 0.015));
  const bands: { y0: number; y1: number }[] = [];
  for (let y = box.minY; y <= box.maxY; y++) {
    if (!rows[y]) continue;
    const last = bands[bands.length - 1];
    if (last && y - last.y1 <= bridge) last.y1 = y;
    else bands.push({ y0: y, y1: y });
  }
  return bands.filter((b) => b.y1 - b.y0 >= 4);
}

export function measureLettering(px: Pixels): Measurement {
  const { width: W, height: H } = px;
  const { ink, outside, box } = letterMasks(px);
  const { minX, minY, maxX, maxY } = box;
  const shape = (i: number) => !outside[i];

  const bands = lineBands(W, outside, box);
  const lines = bands.map((b) => {
    // Pieces: runs of columns holding lettering in this band (overlapping letters are one piece).
    const cols: boolean[] = [];
    for (let x = 0; x < W; x++) {
      let any = false;
      for (let y = b.y0; y <= b.y1 && !any; y++) any = shape(y * W + x);
      cols.push(any);
    }
    const pieces: { x0: number; x1: number }[] = [];
    for (let x = 0; x < W; x++) {
      if (!cols[x]) continue;
      const last = pieces[pieces.length - 1];
      if (last && x - last.x1 <= 1) last.x1 = x;
      else pieces.push({ x0: x, x1: x });
    }
    const real = pieces.filter((p) => p.x1 - p.x0 >= 3);
    return {
      y: b.y0, h: b.y1 - b.y0 + 1,
      x: real[0]?.x0 ?? 0, w: real.length ? real[real.length - 1].x1 - real[0].x0 + 1 : 0,
      pieces: real.length, pieceWidths: real.map((p) => p.x1 - p.x0 + 1),
      gaps: real.slice(1).map((p, k) => p.x0 - real[k].x1 - 1),
    };
  });

  // Outline thickness: black runs across the lettering, both ways. Letter body: white runs inside the letters.
  const blackRuns: number[] = [], whiteRuns: number[] = [];
  const scan = (len: number, at: (k: number) => number) => {
    let run = 0, kind = -1;
    for (let k = 0; k <= len; k++) {
      const i = k < len ? at(k) : -1;
      const v = i < 0 ? -1 : ink[i] ? 1 : shape(i) ? 0 : -1;
      if (v === kind) { run++; continue; }
      if (kind === 1 && run > 0) blackRuns.push(run);
      if (kind === 0 && run > 0) whiteRuns.push(run);
      kind = v;
      run = 1;
    }
  };
  const stepY = Math.max(1, Math.floor((maxY - minY) / 120)), stepX = Math.max(1, Math.floor((maxX - minX) / 240));
  for (let y = minY; y <= maxY; y += stepY) scan(W, (x) => y * W + x);
  for (let x = minX; x <= maxX; x += stepX) scan(H, (y) => y * W + x);
  const strokePx = Math.max(1, mode(blackRuns.filter((r) => r <= median(blackRuns) * 3)));
  // White inside a letter between two outlines: ignore slivers and the big open counters.
  const bodyPx = modeBinned(whiteRuns.filter((r) => r > strokePx), Math.max(1, Math.round((maxY - minY) / 200)));

  const singles = lines.flatMap((l) => l.pieceWidths);
  const gaps = lines.flatMap((l) => l.gaps);
  const heights = lines.map((l) => l.h);
  return {
    widthPx: W, heightPx: H, ink: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, lines,
    strokePx, letterHeightPx: median(heights), bodyPx,
    ...(singles.length ? { letterWidthPx: median(singles) } : {}),
    ...(gaps.length ? { gapPx: median(gaps) } : {}),
    ...(lines.length > 1 ? { lineGapPx: median(lines.slice(1).map((l, k) => l.y - (lines[k].y + lines[k].h))) } : {}),
  };
}

/**
 * A style that draws new words like the sample: the same letter height, outline, roundness, spacing (or overlap),
 * line spacing and overall size. `text` is what the sample says (one line per line): with it, spacing and letter width
 * are matched line by line; without it, each separate shape is taken as one letter.
 */
export function styleFrom(font: Font, m: Measurement, opts: { name: string; dpi?: number; text?: string; sourceName?: string; id: string }): LetteringStyle {
  const dpi = opts.dpi ?? PRINT_DPI;
  const inch = (p: number) => p / dpi;
  const outlinePt = +((m.strokePx / dpi) * PT).toFixed(2);
  const outlineIn = inch(m.strokePx);
  // Per line: its outer height = its letters' own height + 2 × (puff + outline); the white inside a stroke = the font's
  // typical stroke + 2 × puff. Solve the two together for the capital height and the roundness.
  const words = (opts.text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const paired = words.length === m.lines.length;
  const capU = capHeightUnits(font);
  const strokeU = typicalStroke(font, words.join(""));
  const extU = m.lines.map((_, i) => { const e = paired ? lineExtent(font, words[i]) : { up: capU, down: 0 }; return e.up + e.down; });
  const solve = (outerIn: number, ext: number) => {
    let puff = 0, cap = 0;
    for (let it = 0; it < 40; it++) {
      cap = ((outerIn - 2 * (puff + outlineIn)) * capU) / ext;
      puff = Math.max(0, (inch(m.bodyPx) - (strokeU / capU) * cap) / 2);
    }
    return { cap, puff };
  };
  const fitsH = m.lines.map((l, i) => solve(inch(l.h), extU[i]));
  const cap = Math.max(0.1, median(fitsH.map((f) => f.cap)));
  const puff = Math.min(median(fitsH.map((f) => f.puff)), cap * 0.3);
  const base: LetteringStyle = { ...DEFAULT_STYLE, id: opts.id, name: opts.name, capHeightIn: +cap.toFixed(3), outlinePt, puffIn: +puff.toFixed(3), spacingIn: 0, widthScale: 1, lineGapIn: +inch(m.lineGapPx ?? m.letterHeightPx * 0.12).toFixed(3) };
  // Spacing (and letter width): fit each line's measured width.
  const pairs = paired ? m.lines.map((l, i) => ({ l, text: words[i] })) : [];
  if (pairs.length) {
    // Letter width first, from lines whose every letter stands apart.
    const apart = pairs.filter((p) => p.l.pieces === p.text.replace(/\s/g, "").length);
    if (apart.length && m.letterWidthPx) {
      const natural = layoutLettering(font, apart.map((p) => p.text).join("\n"), { ...base, spacingIn: 0.5 });
      const ours = natural.lines.flatMap((ln) => [...ln.text.replace(/\s/g, "")].map((ch) => {
        const g = font.charToGlyph(ch).getBoundingBox();
        return ((g.x2 - g.x1) / font.unitsPerEm) * ((cap * PT * font.unitsPerEm) / capHeightUnits(font)) / PT + 2 * (puff + outlineIn);
      }));
      const ws = inch(m.letterWidthPx) - 2 * (puff + outlineIn);
      const wo = median(ours) - 2 * (puff + outlineIn);
      if (wo > 0) base.widthScale = +Math.max(0.6, Math.min(1.6, ws / wo)).toFixed(3);
    }
    const fits = pairs.map((p) => {
      const n = p.text.length - 1;
      const at0 = layoutLettering(font, p.text, { ...base, spacingIn: 0 }).lines[0].widthIn;
      return n > 0 ? (inch(p.l.w) - at0) / n : 0;
    });
    base.spacingIn = +median(fits).toFixed(3);
  } else if (m.gapPx !== undefined) {
    // No words given: separate shapes are letters; match the gap between them with the font's own.
    base.spacingIn = +(inch(m.gapPx) - avgNaturalGap(font, base)).toFixed(3);
  }
  return {
    ...base,
    canvas: { widthIn: +inch(m.widthPx).toFixed(3), heightIn: +inch(m.heightPx).toFixed(3) },
    source: { name: opts.sourceName ?? opts.name, widthPx: m.widthPx, heightPx: m.heightPx, dpi, ...(opts.text ? { text: opts.text } : {}) },
    measured: m,
    createdAt: new Date().toISOString(),
  };
}

/** The font's own gap between two letters' outer outlines at this style (inches), averaged over common pairs. */
function avgNaturalGap(font: Font, s: LetteringStyle): number {
  const per = ((s.capHeightIn * PT) / capHeightUnits(font)) * s.widthScale / PT;
  const edge = s.puffIn + s.outlinePt / PT;
  const gs = font.stringToGlyphs("ABCDEFGHKLMNOPRSTUabcdefghkmnoprstu");
  const gaps = gs.slice(1).map((g, i) => {
    const a = gs[i], ba = a.getBoundingBox(), bb = g.getBoundingBox();
    return ((a.advanceWidth ?? 0) - ba.x2 + bb.x1) * per - 2 * edge;
  });
  return median(gaps);
}

/** The measurements in plain inches and points, for the screen. */
export function describe(m: Measurement, dpi = PRINT_DPI) {
  const inch = (p: number) => +(p / dpi).toFixed(2);
  return {
    sizeIn: { w: inch(m.widthPx), h: inch(m.heightPx) },
    letterHeightIn: inch(m.letterHeightPx),
    letterWidthIn: m.letterWidthPx !== undefined ? inch(m.letterWidthPx) : null,
    outlinePt: +((m.strokePx / dpi) * PT).toFixed(1),
    gapIn: m.gapPx !== undefined ? inch(m.gapPx) : null,
    lineGapIn: m.lineGapPx !== undefined ? inch(m.lineGapPx) : null,
    lines: m.lines.length,
    pieces: m.lines.map((l) => l.pieces),
  };
}
