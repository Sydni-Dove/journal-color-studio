/**
 * Hardcover assembly: every measurement from the trim, orientation, binding and the maker's materials.
 * Expected values are worked by hand (see each comment).
 */
import { describe, expect, it } from "vitest";
import { fraction, HARDCOVER_DEFAULTS, hardcoverPlan, inches, wirePitchIn, type HardcoverSettings } from "../src/engines/assembly/hardcover";

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);
const s = (x: Partial<HardcoverSettings> = {}): HardcoverSettings => ({ ...HARDCOVER_DEFAULTS, ...x });

describe("hardcover plan — 8.5 × 11 portrait, 3/4\" Wire-O on the left, 2 mm board", () => {
  const p = hardcoverPlan({ w: 8.5, h: 11 }, "wire-o", "left", s());
  it("board: pages + 1/8\" squares on head, tail and fore-edge, flush on the binding edge", () => {
    expect(p.squares).toEqual({ top: 0.125, bottom: 0.125, left: 0, right: 0.125 });
    close(p.board.w, 8.625); // 8.5 + 0.125
    close(p.board.h, 11.25); // 11 + 2 × 0.125
  });
  it("printed cover sheet: board + (board thickness + 3/4\" turn-in) on every side", () => {
    close(p.wrapIn, 0.83); // 0.08 + 0.75
    close(p.sheet.w, 10.285); // 8.625 + 2 × 0.83
    close(p.sheet.h, 12.91); // 11.25 + 2 × 0.83
  });
  it("chipboard placement: 0.83\" in from each sheet edge; the design sits flush with the board's binding edge", () => {
    expect(p.front.board).toMatchObject({ x: 0.83, y: 0.83 });
    close(p.front.trim.x, 0.83);
    close(p.front.trim.y, 0.955); // 0.83 + 0.125
  });
  it("laminate (default): board face + edges + 1/4\" onto the turn-in, 1/2\" from every sheet edge", () => {
    close(p.laminate.w, 9.285); // 8.625 + 2 × (0.08 + 0.25)
    close(p.laminate.h, 11.91);
    for (const e of ["top", "bottom", "left", "right"] as const) close(p.laminate.offsets[e], 0.5); // 0.83 − 0.33
  });
  it("corner cuts: 45°, 1.5 × board thickness from each board corner, sheet edge to sheet edge", () => {
    close(p.cornerGapIn, 0.12);
    const [tl] = p.front.cornerCuts;
    // c = 0.12·√2 = 0.16971; the cut meets the sheet edges 2·0.83 − c = 1.49029 from the sheet corner.
    close(tl.x1, 0); close(tl.y1, 1.66 - 0.12 * Math.SQRT2);
    close(tl.x2, 1.66 - 0.12 * Math.SQRT2); close(tl.y2, 0);
    // Distance from the board corner (0.83, 0.83) to the cut line x + y = 1.49029 is exactly the gap.
    close(Math.abs(0.83 + 0.83 - (1.66 - 0.12 * Math.SQRT2)) / Math.SQRT2, 0.12);
  });
  it("binding edge: 2:1 pitch holes 1/4\" in from the board edge; a keep-clear band of 0.525\"", () => {
    close(p.pitchIn, 0.5);
    close(p.holeCenterIn, 0.25);
    close(p.clearanceIn, 0.525);
    expect(p.front.clearance).toMatchObject({ x: 0.83, y: 0.83, w: 0.525, h: 11.25 });
    expect(p.front.holes.every((h) => Math.abs(h.cx - 1.08) < 1e-9)).toBe(true);
    // 22 holes at 0.5" over 11.25", centred.
    expect(p.front.holes).toHaveLength(22);
    close(p.front.holes[0].cy - 0.83, (11.25 - 21 * 0.5) / 2);
  });
  it("back cover: mirrored — binding on the right, squares on the left, laminate mirrored", () => {
    expect(p.back.boundEdge).toBe("right");
    close(p.back.trim.x, 0.955);
    expect(p.back.clearance.x + p.back.clearance.w).toBeCloseTo(0.83 + 8.625, 6);
    close(p.back.laminate.x, p.sheet.w - p.front.laminate.x - p.front.laminate.w);
  });
  it("no problems with the defaults", () => expect(p.problems).toEqual([]));
});

describe("everything follows the product and the materials", () => {
  it("landscape 11 × 8.5 (the notary journal), left-bound", () => {
    const p = hardcoverPlan({ w: 11, h: 8.5 }, "wire-o", "left", s());
    close(p.board.w, 11.125); close(p.board.h, 8.75);
    close(p.sheet.w, 12.785); close(p.sheet.h, 10.41);
  });
  it("top-bound: squares move to the left and right; the back keeps the binding at the top", () => {
    const p = hardcoverPlan({ w: 11, h: 8.5 }, "wire-o", "top", s());
    expect(p.squares).toEqual({ top: 0, bottom: 0.125, left: 0.125, right: 0.125 });
    close(p.board.w, 11.25); close(p.board.h, 8.625);
    expect(p.back.boundEdge).toBe("top");
    expect(p.front.holes.every((h) => Math.abs(h.cy - (0.83 + 0.25)) < 1e-9)).toBe(true);
  });
  it("a thicker board widens the wrap and the corner gap", () => {
    const p = hardcoverPlan({ w: 8.5, h: 11 }, "wire-o", "left", s({ boardThicknessIn: 0.12 }));
    close(p.wrapIn, 0.87);
    close(p.sheet.w, 8.625 + 1.74);
    close(p.cornerGapIn, 0.18);
  });
  it("disc-bound: 0.98\" pitch, 0.3\" slots, 1/2\" keep-clear", () => {
    const p = hardcoverPlan({ w: 8.5, h: 11 }, "discbound", "left", s());
    expect(p.binding).toBe("discbound");
    close(p.pitchIn, 0.98);
    close(p.holeCenterIn, 0.3);
    close(p.clearanceIn, 0.5);
    expect(p.front.holes[0].shape).toBe("mushroom");
  });
  it("smaller Wire-O uses 3:1 pitch and a 5 mm margin; your own punch setting wins", () => {
    expect(wirePitchIn(0.5)).toBeCloseTo(1 / 3);
    expect(wirePitchIn(0.5625)).toBe(0.5);
    const p = hardcoverPlan({ w: 5.5, h: 8.5 }, "wire-o", "left", s({ wireSizeIn: 0.375 }));
    close(p.holeCenterIn, 5 / 25.4);
    close(hardcoverPlan({ w: 5.5, h: 8.5 }, "wire-o", "left", s({ holeCenterIn: 0.3 })).holeCenterIn, 0.3);
  });
  it("laminate modes: full sheet, inset, custom piece (too small is said)", () => {
    const base = { w: 8.5, h: 11 };
    const full = hardcoverPlan(base, "wire-o", "left", s({ laminate: { mode: "full" } }));
    expect(full.laminate).toMatchObject({ w: full.sheet.w, h: full.sheet.h });
    const inset = hardcoverPlan(base, "wire-o", "left", s({ laminate: { mode: "inset", insetIn: 0.25 } }));
    close(inset.laminate.offsets.left, 0.25);
    const small = hardcoverPlan(base, "wire-o", "left", s({ laminate: { mode: "custom", widthIn: 8.5, heightIn: 11 } }));
    expect(small.problems.join(" ")).toMatch(/doesn't cover the board and its edges/);
    const custom = hardcoverPlan(base, "wire-o", "left", s({ laminate: { mode: "custom", widthIn: 9, heightIn: 12 } }));
    close(custom.front.laminate.x, 0.83 + (8.625 - 9) / 2);
  });
  it("a binding the guide doesn't cover, and a turn-in too narrow, are said", () => {
    expect(hardcoverPlan({ w: 8.5, h: 11 }, "perfect-bound", "left", s()).problems.join(" ")).toMatch(/Wire-O and disc-bound/);
    expect(hardcoverPlan({ w: 8.5, h: 11 }, "wire-o", "left", s({ turnInIn: 0.25 })).problems.join(" ")).toMatch(/narrow/);
  });
});

describe("measurements read the way a maker measures", () => {
  it("nearest sixteenth, with decimal and millimetres", () => {
    expect(fraction(0.75)).toBe("3/4");
    expect(fraction(12.785)).toBe("12 13/16");
    expect(fraction(8.625)).toBe("8 5/8");
    expect(inches(0.75)).toBe('3/4"');
    expect(inches(8.625, true)).toBe('8 5/8" · 219.1 mm');
    expect(inches(0.83)).toBe('0.83" (≈ 13/16")');
    expect(inches(0.08)).toBe('0.08" (≈ 1/16")');
    expect(inches(10.285, true)).toBe('10.285" (≈ 10 5/16") · 261.2 mm');
  });
});
