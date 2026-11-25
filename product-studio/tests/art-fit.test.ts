/**
 * Uploaded art, made to fit: lettering respaced letter by letter (engines/lettering/respace.ts), and any art scaled and
 * centred inside the page margins with cut-off warnings and plain-line borders redrawn inside them
 * (engines/artfit/fit.ts).
 */
import { describe, expect, it } from "vitest";
import { letterPieces, respaceLettering } from "../src/engines/lettering/respace";
import { borderPrompt, contentBox, cutEdges, detectFrame, fitArt, frameSvg, pageBoxes, redrawFrame } from "../src/engines/artfit/fit";
import type { Pixels } from "../src/engines/lettering/bubble";

/** White image with black-outlined boxes (letters) and filled black rectangles (lines). */
function img(w: number, h: number, draw: { outlined?: { x: number; y: number; w: number; h: number }[]; solid?: { x: number; y: number; w: number; h: number }[]; stroke?: number }): Pixels {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const set = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < w && y < h) { const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; } };
  const s = draw.stroke ?? 6;
  for (const b of draw.outlined ?? []) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (x < b.x + s || x >= b.x + b.w - s || y < b.y + s || y >= b.y + b.h - s) set(x, y);
  for (const b of draw.solid ?? []) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) set(x, y);
  return { width: w, height: h, data };
}
const dark = (p: Pixels, x: number, y: number) => p.data[(y * p.width + x) * 4] < 128;

describe("Fix the spacing of uploaded lettering", () => {
  // "Hi!": H, i (with its dot above), and a letter far off to the right: uneven gaps of 10 and 80 px.
  const sample = () => img(500, 200, { outlined: [{ x: 20, y: 60, w: 80, h: 120 }, { x: 110, y: 90, w: 30, h: 90 }, { x: 112, y: 55, w: 26, h: 26 }, { x: 220, y: 60, w: 80, h: 120 }] });

  it("finds each letter, with an i's dot kept on its letter", () => {
    const lines = letterPieces(sample());
    expect(lines).toHaveLength(1);
    expect(lines[0].map((p) => [p.x0, p.x1])).toEqual([[20, 99], [110, 139], [220, 299]]);
  });

  it("evens out the gaps, keeps each letter's pixels exactly, and centres the line where it was", () => {
    const r = respaceLettering(sample(), 30);
    expect(r.report.pieces).toEqual([3]);
    expect(r.report.originalGapPx).toBe(80);
    const after = letterPieces(r.pixels)[0];
    const gaps = after.slice(1).map((p, k) => p.x0 - after[k].x1 - 1);
    expect(gaps).toEqual([30, 30]);
    expect(after.map((p) => p.x1 - p.x0)).toEqual([79, 29, 79]);
    // The middle letter's outline and white inside, moved as drawn.
    const dx = after[1].x0 - 110;
    for (const [x, y] of [[110, 120], [139, 150], [115, 120], [120, 60]]) expect(dark(r.pixels, x + dx, y)).toBe(dark(sample(), x, y));
    // Centred on the original line's centre (20…299).
    expect(Math.abs((after[0].x0 + after[2].x1) / 2 - (20 + 299) / 2)).toBeLessThanOrEqual(1);
  });

  it("says which lines have touching letters (they move together), so the words can be redrawn instead", () => {
    const touching = img(400, 200, { outlined: [{ x: 20, y: 40, w: 100, h: 120 }, { x: 110, y: 40, w: 100, h: 120 }, { x: 260, y: 40, w: 100, h: 120 }] });
    const r = respaceLettering(touching, 20, { text: "ABC" });
    expect(r.report.pieces).toEqual([2]);
    expect(r.report.joined).toEqual([{ line: 1, letters: 3, pieces: 2 }]);
  });
});

describe("Fit art to the margins", () => {
  const page = { trimW: 8.5, trimH: 11, bleed: 0.125 };
  const m = { top: 0.5, bottom: 0.5, left: 0.75, right: 0.5 };

  it("scales the art to fit inside the margins and centres it, never stretched", () => {
    const f = fitArt({ w: 3000, h: 1500 }, page, m);
    const { safe } = pageBoxes(page, m);
    expect(safe).toEqual({ x: 0.875, y: 0.625, w: 7.25, h: 10 });
    expect(f.draw.w).toBeCloseTo(7.25, 5);
    expect(f.draw.h).toBeCloseTo(3.625, 5);
    expect(f.draw.w / f.draw.h).toBeCloseTo(2, 6);
    expect(f.draw.x).toBeCloseTo(0.875, 5);
    expect(f.draw.y + f.draw.h / 2).toBeCloseTo(safe.y + safe.h / 2, 5);
    expect(f.ppi).toBe(Math.round(3000 / 7.25));
    // A tall piece fits the height instead.
    expect(fitArt({ w: 1000, h: 4000 }, page, m).draw.h).toBeCloseTo(10, 5);
  });

  it("measures the art's own box, without the empty space around it", () => {
    expect(contentBox(img(300, 200, { solid: [{ x: 50, y: 40, w: 100, h: 20 }] }))).toEqual({ x: 50, y: 40, w: 100, h: 20 });
    expect(contentBox(img(10, 10, {}))).toBeNull();
  });

  it("warns which edges the art was cut off at", () => {
    expect(cutEdges(img(300, 200, { solid: [{ x: 50, y: 40, w: 100, h: 20 }] }))).toEqual([]);
    expect(cutEdges(img(300, 200, { solid: [{ x: 0, y: 0, w: 250, h: 8 }, { x: 0, y: 0, w: 8, h: 170 }] }))).toEqual(["top", "left"]);
  });

  it("measures a border of plain lines (count, thickness, spacing) and redraws it whole inside the margins", () => {
    // Two frames: a thick outer one cut by the page edge (it starts at the edge), a thin inner one 30 px further in.
    const frame = img(600, 800, { outlined: [{ x: 0, y: 0, w: 600, h: 800 }, { x: 30, y: 30, w: 540, h: 740 }], stroke: 6 });
    const f = detectFrame(frame)!;
    expect(f.cut).toBe(true);
    expect(f.lines).toEqual([{ offset: 0, thickness: 6 }, { offset: 30, thickness: 6 }]);
    const rects = redrawFrame(f, page, m, 300);
    const { safe } = pageBoxes(page, m);
    expect(rects).toHaveLength(2);
    expect(rects[0].x - rects[0].stroke / 2).toBeCloseTo(safe.x, 5);
    expect(rects[0].stroke).toBeCloseTo(6 / 300, 6);
    expect(rects[1].x - rects[0].x).toBeCloseTo(30 / 300, 6);
    const svg = frameSvg(rects, page);
    expect(svg.match(/<rect /g)).toHaveLength(2);
    expect(svg).toContain('width="8.75in" height="11.25in"');
  });

  it("an ornamental border or a picture isn't mistaken for a frame; an Art Prompt redraws it inside the margins", () => {
    expect(detectFrame(img(400, 400, { outlined: [{ x: 100, y: 100, w: 200, h: 200 }] }))).toBeNull();
    const p = borderPrompt(page, { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 });
    expect(p).toContain("inside a 0.5 inch margin on every side of a portrait 8.5 x 11 inch page");
    expect(p).toContain("No gray, no shading");
  });
});
