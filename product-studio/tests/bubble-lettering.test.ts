/**
 * Bubble Lettering (engines/lettering): words drawn as outline-only coloring lettering, measured samples turned into
 * styles, saved styles, and placing lettering on a COPY of a project (the original never changes).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import { DEFAULT_STYLE, capHeightUnits, describe as describeM, glyphRuns, layoutLettering, letteringSvg, lineExtent, measureLettering, pngSize, styleFrom, typicalStroke, type Pixels } from "../src/engines/lettering/bubble";
import { deleteStyle, listStyles, normalizeStyle, saveStyle } from "../src/engines/lettering/styles";
import { pagesOf, placeOnCopy } from "../src/engines/lettering/place";
import { assembleInterior } from "../src/engines/coloringBook/assembleBook";
import { mommyAndMe } from "./fixtures/mommyAndMe";
import type { ProductProject } from "../src/types/project";

const buf = readFileSync("node_modules/@fontsource/fredoka/files/fredoka-latin-700-normal.woff");
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
});

describe("Drawing", () => {
  it("draws outline-only lettering: a wide black stroke under a narrower white one, as vector paths", () => {
    const l = layoutLettering(font, "Jesus Loves Me", DEFAULT_STYLE);
    const svg = letteringSvg(l);
    const paths = [...svg.matchAll(/<path [^>]+>/g)].map((m) => m[0]);
    expect(paths).toHaveLength(2);
    expect(paths[0]).toContain('fill="#000000" stroke="#000000"');
    expect(paths[1]).toContain('fill="#ffffff" stroke="#ffffff"');
    expect(svg).toContain('stroke-linejoin="round"');
    // No font needed to open it: no <text>, no font names.
    expect(svg).not.toMatch(/<text|font-family/);
    expect(l.blackStrokePt - l.whiteStrokePt).toBeCloseTo(2 * DEFAULT_STYLE.outlinePt, 5);
    expect(svg).not.toContain("<rect");
    expect(letteringSvg(l, { background: "white" })).toContain('<rect width="100%" height="100%" fill="#ffffff"/>');
  });

  it("the capital letters are the style's height; the artwork's size follows the words", () => {
    const s = { ...DEFAULT_STYLE, capHeightIn: 1, puffIn: 0, outlinePt: 0.0001 };
    const one = layoutLettering(font, "HI", s);
    expect(one.heightIn).toBeCloseTo(1 * (lineExtent(font, "HI").up + lineExtent(font, "HI").down) / capHeightUnits(font), 2);
    const two = layoutLettering(font, "HI\nHI", { ...s, lineGapIn: 0.5 });
    expect(two.heightIn).toBeCloseTo(2 * one.heightIn + 0.5, 2);
    expect(two.lines.map((x) => x.text)).toEqual(["HI", "HI"]);
    // 300 DPI PNG.
    expect(pngSize(one)).toEqual({ w: Math.round(one.widthIn * 300), h: Math.round(one.heightIn * 300) });
  });

  it("spacing below zero overlaps the letters (narrower artwork); a wider letter width widens it", () => {
    const w = (o: Partial<typeof DEFAULT_STYLE>) => layoutLettering(font, "BRAVE", { ...DEFAULT_STYLE, ...o }).widthIn;
    expect(w({ spacingIn: -0.1 })).toBeCloseTo(w({ spacingIn: 0 }) - 0.4, 2);
    expect(w({ widthScale: 1.2 })).toBeGreaterThan(w({ widthScale: 1 }));
  });

  it("roundness swells every letter: the outline reaches further out", () => {
    const a = layoutLettering(font, "Joy", { ...DEFAULT_STYLE, puffIn: 0 });
    const b = layoutLettering(font, "Joy", { ...DEFAULT_STYLE, puffIn: 0.1 });
    expect(b.heightIn - a.heightIn).toBeCloseTo(0.2, 3);
    expect(b.whiteStrokePt).toBeCloseTo(0.1 * 72 * 2, 3);
  });

  it("never leaves a solid black dot: an opening too small to stay open is filled in; a roomy one stays outlined", () => {
    const contours = (o: Partial<typeof DEFAULT_STYLE>) => (layoutLettering(font, "o", { ...DEFAULT_STYLE, ...o }).d.match(/M/g) ?? []).length;
    expect(contours({ capHeightIn: 2, puffIn: 0, outlinePt: 1 })).toBe(2); // the o keeps its hole
    expect(contours({ capHeightIn: 0.6, puffIn: 0.08, outlinePt: 4 })).toBe(1); // closed up cleanly
  });

  it("the same overall size as a sample: the words are centred on that canvas", () => {
    const l = layoutLettering(font, "Hi", { ...DEFAULT_STYLE, canvas: { widthIn: 8, heightIn: 3 } });
    expect([l.widthIn, l.heightIn]).toEqual([8, 3]);
  });

  it("knows the font's typical stroke from its glyph outlines", () => {
    const k = typicalStroke(font, "BRAVE") / capHeightUnits(font);
    expect(k).toBeGreaterThan(0.1);
    expect(k).toBeLessThan(0.3);
    expect(glyphRuns(font, "O").length).toBeGreaterThan(40);
  });
});

/** A simple drawn sample: two black-outlined white rounded boxes ("letters") with a gap, on white. */
function sample(w: number, h: number, boxes: { x: number; y: number; w: number; h: number }[], stroke: number): Pixels {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const set = (x: number, y: number) => { const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; };
  for (const b of boxes)
    for (let y = b.y; y < b.y + b.h; y++)
      for (let x = b.x; x < b.x + b.w; x++) if (x < b.x + stroke || x >= b.x + b.w - stroke || y < b.y + stroke || y >= b.y + b.h - stroke) set(x, y);
  return { width: w, height: h, data };
}

describe("Reading a sample", () => {
  it("measures the size, lines, letter height and width, outline, gap and line gap", () => {
    const m = measureLettering(sample(600, 400, [
      { x: 20, y: 20, w: 100, h: 150 }, { x: 150, y: 20, w: 100, h: 150 },
      { x: 20, y: 220, w: 100, h: 150 },
    ], 9));
    expect([m.widthPx, m.heightPx]).toEqual([600, 400]);
    expect(m.lines).toHaveLength(2);
    expect(m.lines[0].pieces).toBe(2);
    expect(m.letterHeightPx).toBe(150);
    expect(m.letterWidthPx).toBe(100);
    expect(m.strokePx).toBe(9);
    expect(m.gapPx).toBe(30);
    expect(m.lineGapPx).toBe(50);
    const d = describeM(m, 300);
    expect(d.sizeIn).toEqual({ w: 2, h: 1.33 });
    expect(d.outlinePt).toBeCloseTo(2.2, 1);
  });

  it("says so when there's no black lettering", () => {
    expect(() => measureLettering({ width: 10, height: 10, data: new Uint8ClampedArray(400).fill(255) })).toThrow(/No black lettering/);
  });

  it("turns measurements into a style with the sample's size and outline", () => {
    const m = measureLettering(sample(600, 300, [{ x: 20, y: 20, w: 100, h: 150 }, { x: 150, y: 20, w: 100, h: 150 }], 9));
    const s = styleFrom(font, m, { id: "s1", name: "Copied", dpi: 300 });
    expect(s.canvas).toEqual({ widthIn: 2, heightIn: 1 });
    expect(s.outlinePt).toBeCloseTo(2.16, 2);
    expect(s.capHeightIn).toBeGreaterThan(0.1);
    expect(s.source?.widthPx).toBe(600);
  });
});

describe("Saved lettering styles", () => {
  it("save, list, replace and delete; damaged values are kept in range", () => {
    saveStyle({ ...DEFAULT_STYLE, id: "a", name: "Mine" });
    saveStyle({ ...DEFAULT_STYLE, id: "a", name: "Mine 2", outlinePt: 4 });
    expect(listStyles().map((s) => [s.id, s.name, s.outlinePt])).toEqual([["a", "Mine 2", 4]]);
    expect(deleteStyle("a")).toEqual([]);
    expect(normalizeStyle({ id: "x", name: "x", outlinePt: 999, capHeightIn: "big" })).toMatchObject({ outlinePt: 24, capHeightIn: DEFAULT_STYLE.capHeightIn });
    expect(normalizeStyle({ name: "no id" })).toBeNull();
  });
});

describe("Putting lettering on a page", () => {
  const project = (): ProductProject => ({ ...assembleInterior(mommyAndMe()), name: "Finished journal" });
  const asset = { id: "png1", name: "jesus.png", mime: "image/png" as const, widthPx: 1800, heightPx: 600, hasAlpha: true, bytes: 1, addedAt: "" };

  it("always makes a copy; the finished project is unchanged", () => {
    const p = project();
    const before = JSON.stringify(p);
    const pg = pagesOf(p)[0];
    const copy = placeOnCopy(p, asset, pg, "top", { widthIn: 6, heightIn: 2 }, { w: pg.safeWidthIn, h: pg.safeHeightIn }, "l1");
    expect(JSON.stringify(p)).toBe(before);
    expect(copy.id).not.toBe(p.id);
    expect(copy.name).toBe("Finished journal (with lettering)");
    expect(copy.artwork?.assets.map((a) => a.id)).toEqual(["png1"]);
    expect(copy.artwork?.placements[0]).toMatchObject({ use: "illustration", placement: "area", anchor: "top", targets: [{ item: pg.item, nth: pg.nth }] });
  });

  it("a band is the lettering's height at the page's width (at most half the page); “page” centres it in the safe area", () => {
    const p = project();
    const pg = pagesOf(p)[0];
    const band = placeOnCopy(p, asset, pg, "bottom", { widthIn: 20, heightIn: 4 }, { w: 6, h: 9 }, "l1").artwork!.placements[0] as { sizeIn: number; anchor: string };
    expect(band.anchor).toBe("bottom");
    expect(band.sizeIn).toBeCloseTo(1.2, 3);
    const page = placeOnCopy(p, asset, pg, "page", { widthIn: 6, heightIn: 2 }, { w: 6, h: 9 }, "l1").artwork!.placements[0];
    expect(page).toMatchObject({ use: "background", extent: "safe", fit: "fit" });
  });
});
