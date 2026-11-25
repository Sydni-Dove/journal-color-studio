/**
 * FIX THE SPACING of uploaded lettering (art brought back from ChatGPT): each letter is lifted out exactly as drawn —
 * its outline and white inside, pixel for pixel, with the soft edge pixels just outside it so the outline stays
 * clean — and the letters are set again with even gaps (the spacing slider), each line centred where it was.
 *
 * A letter's dot (i, j) or accent goes with the letter under it. Letters that touch or overlap can't be lifted apart
 * without redrawing part of the outline, so they move together as one piece; the report says where that happened,
 * and the screen offers to redraw the words in the measured style instead.
 */
import { letterMasks, lineBands, type Pixels } from "./bubble";

export type RespaceReport = {
  /** Pieces found on each line (a piece is one letter, or letters that touch). */
  pieces: number[];
  /** Lines where fewer pieces were found than letters typed: some letters touch and move together. */
  joined: { line: number; letters: number; pieces: number }[];
  /** The original gap between pieces (pixels, median), for the slider's starting value. */
  originalGapPx: number;
};

/** The letters' pieces: each its pixels (indices into the image) and its box, grouped by line, left to right. */
export function letterPieces(px: Pixels) {
  const { width: W, height: H } = px;
  const { outside, box } = letterMasks(px);
  const bands = lineBands(W, outside, box);
  const label = new Int32Array(W * H).fill(-1);
  const comps: { px: number[]; x0: number; x1: number; y0: number; y1: number }[] = [];
  for (let start = 0; start < W * H; start++) {
    if (outside[start] || label[start] >= 0) continue;
    const id = comps.length;
    const c = { px: [] as number[], x0: W, x1: -1, y0: H, y1: -1 };
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const i = stack.pop()!, x = i % W, y = (i / W) | 0;
      c.px.push(i);
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i >= W ? i - W : -1, i < W * (H - 1) ? i + W : -1]) {
        if (j >= 0 && !outside[j] && label[j] < 0) {
          label[j] = id;
          stack.push(j);
        }
      }
    }
    comps.push(c);
  }
  // Specks (stray pixels) are dropped; everything else belongs to the line its middle is in.
  const minArea = Math.max(4, ((box.maxY - box.minY + 1) * 0.004) ** 2);
  const lines = bands.map(() => [] as typeof comps);
  for (const c of comps) {
    if (c.px.length < minArea) continue;
    const cy = (c.y0 + c.y1) / 2;
    let best = 0, dist = Infinity;
    bands.forEach((b, k) => {
      const d = cy < b.y0 ? b.y0 - cy : cy > b.y1 ? cy - b.y1 : 0;
      if (d < dist) [best, dist] = [k, d];
    });
    lines[best]?.push(c);
  }
  // A dot or accent over a letter (mostly within its width) goes with that letter.
  return lines.map((cs) => {
    const sorted = [...cs].sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0));
    const groups: (typeof comps[number])[] = [];
    for (const c of sorted) {
      const host = groups.find((g) => {
        const overlap = Math.min(g.x1, c.x1) - Math.max(g.x0, c.x0);
        return overlap > 0.5 * (c.x1 - c.x0 + 1);
      });
      if (host) {
        host.px.push(...c.px);
        host.x0 = Math.min(host.x0, c.x0);
        host.x1 = Math.max(host.x1, c.x1);
        host.y0 = Math.min(host.y0, c.y0);
        host.y1 = Math.max(host.y1, c.y1);
      } else groups.push({ ...c, px: [...c.px] });
    }
    return groups.sort((a, b) => a.x0 - b.x0);
  });
}

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

/**
 * The lettering with its letters set `gapPx` apart (outline to outline), each line centred where it was.
 * The image grows wider only if a line no longer fits. `text`: what it says, one line per line (for the report).
 */
export function respaceLettering(px: Pixels, gapPx: number, opts: { text?: string; background?: "white" | "none" } = {}): { pixels: Pixels; report: RespaceReport } {
  const { width: W, height: H, data } = px;
  const lines = letterPieces(px);
  const gaps = lines.flatMap((g) => g.slice(1).map((p, k) => p.x0 - g[k].x1 - 1));
  const widths = lines.map((g) => g.reduce((n, p) => n + (p.x1 - p.x0 + 1), 0) + Math.max(0, g.length - 1) * gapPx);
  const pad = Math.round(H * 0.02);
  const outW = Math.max(W, ...widths.map((w) => w + 2 * pad));
  const out = new Uint8ClampedArray(outW * H * 4);
  if (opts.background !== "none") out.fill(255);
  // A piece's pixels, plus the soft edge pixels just outside its outline (so the outline keeps its smooth edge).
  const { outside } = letterMasks(px);
  for (const [k, g] of lines.entries()) {
    if (!g.length) continue;
    const mid = (g[0].x0 + g[g.length - 1].x1) / 2;
    let x = Math.round(Math.min(Math.max(pad, mid - widths[k] / 2), outW - pad - widths[k]));
    for (const p of g) {
      const dx = x - p.x0;
      const done = new Set<number>();
      const copy = (i: number) => {
        if (done.has(i)) return;
        done.add(i);
        const sx = i % W, sy = (i / W) | 0, tx = sx + dx;
        if (tx < 0 || tx >= outW) return;
        const o = (sy * outW + tx) * 4, s = i * 4;
        out[o] = data[s];
        out[o + 1] = data[s + 1];
        out[o + 2] = data[s + 2];
        out[o + 3] = opts.background === "none" ? data[s + 3] : 255;
      };
      for (const i of p.px) {
        copy(i);
        const sx = i % W;
        for (const j of [sx > 0 ? i - 1 : -1, sx < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < W * H && outside[j]) copy(j);
      }
      x += p.x1 - p.x0 + 1 + gapPx;
    }
  }
  const typed = (opts.text ?? "").split(/\r?\n/).map((l) => l.replace(/\s/g, "")).filter(Boolean);
  const joined = typed.length === lines.length ? lines.flatMap((g, k) => (g.length < typed[k].length ? [{ line: k + 1, letters: typed[k].length, pieces: g.length }] : [])) : [];
  return { pixels: { width: outW, height: H, data: out }, report: { pieces: lines.map((g) => g.length), joined, originalGapPx: median(gaps) } };
}
