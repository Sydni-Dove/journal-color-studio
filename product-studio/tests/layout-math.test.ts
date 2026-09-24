import { describe, expect, it } from "vitest";
import { distributeEqual, fitCount, gridPositions, solveStack, writingLinePositions } from "../src/engines/layout/math";
import { PRACTICAL_LINE_COUNTS, RULINGS, GRIDS } from "../src/data/research/rulings";
import { measurementIn, mmToIn } from "../src/engines/units/units";

describe("equal distribution (columns / rows)", () => {
  it("B1 variant A: colW = (5.75 − 6 × 0.06) / 7 = 0.77", () => {
    const d = distributeEqual(0, 5.75, 7, 0.06);
    expect(d.size).toBeCloseTo(0.77, 2);
    expect(d.size).toBeCloseTo((5.75 - 0.36) / 7, 12);
  });
  it("B1 variant B (1.4 sidebar + 0.2 gap): colW = 0.54", () => {
    expect(distributeEqual(0, 5.75 - 1.6, 7, 0.06).size).toBeCloseTo(0.54, 2);
  });
  it("B1 rows: rowH = 6.85 / 6 = 1.14 (no row gap)", () => {
    expect(distributeEqual(0, 6.85, 6, 0).size).toBeCloseTo(1.14, 2);
  });
  it("B6: 7 columns on 16.0\" with 0.08 gaps = 2.22; with priorities strip = 1.82", () => {
    expect(distributeEqual(0, 16, 7, 0.08).size).toBeCloseTo(2.22, 2);
    expect(distributeEqual(0, 16 - 2.75, 7, 0.08).size).toBeCloseTo(1.82, 2);
  });
  it("columns are exactly equal and fill the width exactly", () => {
    const d = distributeEqual(1.25, 5.75, 7, 0.06);
    const widths = d.starts.map((s, i) => d.edges[i * 2 + 1] - s);
    widths.forEach((w) => expect(w).toBeCloseTo(d.size, 12));
    expect(d.edges[d.edges.length - 1]).toBeCloseTo(1.25 + 5.75, 12);
  });
  it("rejects invalid counts", () => {
    expect(() => distributeEqual(0, 5, 0, 0)).toThrow();
    expect(() => distributeEqual(0, 5, 2.5, 0)).toThrow();
  });
});

describe("writing lines", () => {
  it("reproduces the research practical line-count table (3.2.2) for every size and ruling", () => {
    const { topStartIn, bottomEndIn, rows } = PRACTICAL_LINE_COUNTS;
    const spacing = {
      wide: measurementIn(RULINGS.wide.spacing),
      college: measurementIn(RULINGS.college.spacing),
      narrow: measurementIn(RULINGS.narrow.spacing),
    };
    for (const row of rows) {
      for (const k of ["wide", "college", "narrow"] as const) {
        const ys = writingLinePositions(topStartIn, row.heightIn - bottomEndIn, spacing[k]);
        expect({ size: row.size, k, n: ys.length }).toEqual({ size: row.size, k, n: row[k] });
      }
    }
  });
  it("J-B1: 6 × 9 college, first line zone 1.0, last line ≤ 8.25 → 25 lines", () => {
    const ys = writingLinePositions(1.0, 8.25, 9 / 32);
    expect(ys).toHaveLength(25);
    expect(ys[ys.length - 1]).toBeLessThanOrEqual(8.25);
  });
  it("J-B3: Cornell notes area 7.25\" ruled at 0.32 → 22 lines", () => {
    expect(fitCount(7.25, 0.32)).toBe(22);
  });
  it("J-B4: guided response 5.5\" wide-ruled → 16 lines", () => {
    expect(fitCount(5.5, 11 / 32)).toBe(16);
  });
  it("final line always stays inside the region", () => {
    for (let h = 0.1; h < 10; h += 0.37) {
      const ys = writingLinePositions(2, 2 + h, 0.3);
      if (ys.length) expect(ys[ys.length - 1]).toBeLessThanOrEqual(2 + h + 1e-9);
    }
  });
  it("recalculates when the region changes", () => {
    expect(writingLinePositions(0, 5, 0.3).length).toBe(16);
    expect(writingLinePositions(0, 4, 0.3).length).toBe(13);
  });
});

describe("dot / graph grids", () => {
  it("J-B2: A5 grid area 4.83 × 7.27 at 5 mm → 24 × 36 cells", () => {
    const pitch = measurementIn(GRIDS.dotGrid5mm);
    expect(gridPositions(0, 4.83, pitch).cells).toBe(24);
    expect(gridPositions(0, 7.27, pitch).cells).toBe(36);
  });
  it("centres the grid within its area", () => {
    const g = gridPositions(1, 4.83, mmToIn(5));
    const left = g.positions[0] - 1;
    const right = 1 + 4.83 - g.positions[g.positions.length - 1];
    expect(left).toBeCloseTo(right, 12);
    expect(left).toBeGreaterThanOrEqual(0);
  });
});

describe("notepad checklist rows (N-B1)", () => {
  it("bodyH 5.2 at 0.36 rows → 14 rows", () => {
    expect(fitCount(7.0 - (0.375 + 0.125 + 0.9) - 0.4, 0.36)).toBe(14);
  });
});

describe("stack solver (fixed anchors vs elastic modules)", () => {
  it("fixed modules keep size, elastic takes the remainder", () => {
    const st = solveStack(0.5, 8, [
      { id: "title", kind: "fixed", size: 0.8 },
      { id: "weekday", kind: "fixed", size: 0.35 },
      { id: "grid", kind: "elastic" },
    ], 0);
    expect(st.byId.grid.size).toBeCloseTo(6.85, 12); // B1 grid height
    expect(st.byId.grid.start).toBeCloseTo(0.5 + 1.15, 12);
    expect(st.overflow).toBe(0);
  });
  it("distributes by weight and honours min/max", () => {
    const st = solveStack(0, 10, [
      { id: "a", kind: "elastic", weight: 1 },
      { id: "b", kind: "elastic", weight: 3 },
      { id: "c", kind: "elastic", max: 1 },
    ], 0);
    expect(st.byId.c.size).toBe(1);
    expect(st.byId.a.size).toBeCloseTo(2.25, 12);
    expect(st.byId.b.size).toBeCloseTo(6.75, 12);
  });
  it("reports overflow instead of borrowing space", () => {
    const st = solveStack(0, 2, [
      { id: "a", kind: "fixed", size: 1.5 },
      { id: "b", kind: "elastic", min: 1 },
    ], 0);
    expect(st.overflow).toBeCloseTo(0.5, 12);
  });
});
