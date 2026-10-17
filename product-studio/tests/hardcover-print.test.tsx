/**
 * Hardcover outputs on paper: cover sheets fit (or say they don't), the template tiles, each kind of mark
 * appears only when chosen, the cover art keeps the design's trim, and products without hardcover are untouched.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HARDCOVER_DEFAULTS, hardcoverPlan } from "../src/engines/assembly/hardcover";
import { coverSheetLayout, templateLayout, MARK_MARGIN_IN, TILE_OVERLAP_IN } from "../src/engines/assembly/assemblyPrint";
import { hardcoverPlanFor } from "../src/engines/assembly/forDocument";
import { ART_PAST_EDGE_IN, assemblyJob, SheetMarks, sheetGeometry } from "../src/components/assembly/AssemblyPrint";
import { geometryFor, resolveDocument } from "../src/engines/document/resolve";
import { planPrint } from "../src/engines/print/printPlan";
import { createProject } from "../src/presets/products/projectFactory";
import { addEndCover, addFrontCover } from "../src/engines/recipe/pageBuilder";
import { TEST_PRODUCTS } from "../src/presets/products/testProducts";

const plan = hardcoverPlan({ w: 11, h: 8.5 }, "wire-o", "left", HARDCOVER_DEFAULTS); // sheet 12.785 × 10.41
const small = hardcoverPlan({ w: 5.5, h: 8.5 }, "wire-o", "left", HARDCOVER_DEFAULTS); // sheet 7.285 × 10.41

function notary(hardcover = true) {
  const base = createProject("notebook", { name: "Notary", dimensions: { sizePresetId: "8.5x11", orientation: "landscape" }, production: { bindingType: "wire-o", printProfileId: "coil-generic", duplex: true, includeBleed: false } });
  return { ...base, recipe: { ...base.recipe, structure: addEndCover(addFrontCover(base.recipe.structure ?? [])) }, production: { ...base.production, ...(hardcover ? { hardcover: { ...HARDCOVER_DEFAULTS } } : {}) } };
}

describe("cover sheets on paper", () => {
  it("exact size: the sheet, plus a 1/2\" margin all round only when marks are chosen", () => {
    expect(coverSheetLayout(plan, false)).toMatchObject({ pageW: plan.sheet.w, pageH: plan.sheet.h, x: 0, y: 0 });
    const m = coverSheetLayout(plan, true);
    expect(m.pageW).toBeCloseTo(plan.sheet.w + 2 * MARK_MARGIN_IN);
    expect(m.x).toBe(MARK_MARGIN_IN);
  });
  it("home paper: a 5.5 × 8.5 journal's sheet fits Letter even with marks (cut marks move inside the cut-away corners); an 11 × 8.5 one doesn't (said), but fits Tabloid", () => {
    const l = coverSheetLayout(small, true, "letter");
    expect(l.error).toBeUndefined();
    expect(l.outsideMarks).toBe(false);
    expect(coverSheetLayout(plan, false, "letter").error).toMatch(/doesn't fit on Letter/);
    const t = coverSheetLayout(plan, true, "tabloid");
    expect(t.error).toBeUndefined();
    expect([t.pageW, t.pageH]).toEqual([17, 11]);
    expect(t.outsideMarks).toBe(false); // 0.3" round the sheet: inside the printer's margin
    expect(coverSheetLayout(plan, true, "super-b")).toMatchObject({ pageW: 19, pageH: 13, outsideMarks: true });
  });
});

describe("alignment template", () => {
  it("fits on one Super B sheet, two Tabloid; tiles across Letter with 1/2\" overlaps covering the whole drawing", () => {
    expect(templateLayout(plan, "super-b").tiles).toHaveLength(1);
    expect(templateLayout(plan, "tabloid").tiles).toHaveLength(2);
    const l = templateLayout(plan, "letter");
    expect(l.tiles.length).toBe(4);
    const last = l.tiles[l.tiles.length - 1];
    expect(last.x0 + last.w).toBeGreaterThanOrEqual(l.bounds.x + l.bounds.w - 1e-9);
    expect(last.y0 + last.h).toBeGreaterThanOrEqual(l.bounds.y + l.bounds.h - 1e-9);
    expect(l.tiles[1].x0 - l.tiles[0].x0).toBeCloseTo(l.tiles[0].w - TILE_OVERLAP_IN);
  });
  it("legal paper turns sideways: 2 sheets", () => expect(templateLayout(plan, "legal").tiles).toHaveLength(2));
});

describe("marks are separate choices", () => {
  const layout = coverSheetLayout(plan, true);
  const kinds = (marks: { cut?: boolean; laminate?: boolean; board?: boolean }) => {
    const html = renderToStaticMarkup(<SheetMarks face={plan.front} layout={layout} marks={marks} />);
    return [...new Set([...html.matchAll(/data-mark="([a-z]+)"/g)].map((m) => m[1]))].sort();
  };
  it("cut marks without room outside: L's inside the sheet's corners, within the triangles the corner cuts remove", () => {
    const l = coverSheetLayout(small, true, "letter");
    const html = renderToStaticMarkup(<SheetMarks face={small.front} layout={l} marks={{ cut: true }} />);
    const pts = [...html.matchAll(/data-mark="cut" x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)].map((m) => m.slice(1).map(Number));
    expect(pts.length).toBe(8);
    const legs = 2 * small.wrapIn - small.cornerGapIn * Math.SQRT2;
    for (const [x1, y1, x2, y2] of pts) for (const [px, py] of [[x1, y1], [x2, y2]]) {
      const u = Math.min(px - l.x, l.x + small.sheet.w - px), v = Math.min(py - l.y, l.y + small.sheet.h - py);
      expect(u + v).toBeLessThanOrEqual(legs + 1e-6); // inside the cut-away corner triangle
    }
  });
  it("none chosen: nothing drawn", () => expect(renderToStaticMarkup(<SheetMarks face={plan.front} layout={layout} marks={{}} />)).toBe(""));
  it("each alone, and all together", () => {
    expect(kinds({ cut: true })).toEqual(["corner", "cut"]);
    expect(kinds({ laminate: true })).toEqual(["laminate"]);
    expect(kinds({ board: true })).toEqual(["board"]);
    expect(kinds({ cut: true, laminate: true, board: true })).toEqual(["board", "corner", "cut", "laminate"]);
  });
});

describe("the cover art keeps the design", () => {
  it("the cover page's trim sits on the board where the plan says, at its own size; the art runs 1/8\" past the board's edge", () => {
    const doc = resolveDocument(notary());
    const p = hardcoverPlanFor(doc)!;
    const i = doc.recipe.pages.findIndex((x) => x.layoutId === "cover-page");
    const { geometry: g, at } = sheetGeometry(geometryFor(doc, doc.recipe.pages[i], i), p.front, p);
    expect([g.trimWidthIn, g.trimHeightIn]).toEqual([11, 8.5]);
    expect(at.x + g.trimOffset.x).toBeCloseTo(p.front.trim.x);
    expect(at.y + g.trimOffset.y).toBeCloseTo(p.front.trim.y);
    expect(g.mediaWidthIn).toBeCloseTo(p.board.w + 2 * (p.boardThicknessIn + ART_PAST_EDGE_IN));
  });
  it("cover sheets need a front cover page (said plainly)", () => {
    const base = createProject("notebook", { name: "No cover", production: { bindingType: "wire-o", printProfileId: "coil-generic", duplex: true, includeBleed: false } });
    const doc = resolveDocument({ ...base, production: { ...base.production, hardcover: { ...HARDCOVER_DEFAULTS } } });
    expect(assemblyJob(doc, hardcoverPlanFor(doc)!, { output: "cover-sheets" }).errors.join(" ")).toMatch(/no front cover page/);
  });
});

describe("optional: nothing changes unless chosen", () => {
  it("without hardcover there is no plan; the ordinary print plan is identical with or without the hardcover settings", () => {
    const off = resolveDocument(notary(false));
    expect(hardcoverPlanFor(off)).toBeNull();
    const on = resolveDocument(notary(true));
    const a = planPrint(off, off.project.exportSettings), b = planPrint(on, on.project.exportSettings);
    expect(b).toEqual(a);
  });
  it("hardcover settings don't change any page of the test products", () => {
    for (const t of TEST_PRODUCTS.slice(0, 6)) {
      const p = t.build();
      const a = resolveDocument(p), b = resolveDocument({ ...p, production: { ...p.production, hardcover: { ...HARDCOVER_DEFAULTS } } });
      expect(b.recipe.pageCount).toBe(a.recipe.pageCount);
      expect(geometryFor(b, b.recipe.pages[0])).toEqual(geometryFor(a, a.recipe.pages[0]));
    }
  });
});
