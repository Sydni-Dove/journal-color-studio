/**
 * Two designs per sheet, at actual size: a 5 × 7 notepad prints two to a Letter sheet (50 pad sheets = 25 printed
 * sheets), the sheet turns to whichever orientation fits, trim marks cover both designs, and pages too large for two
 * say so instead of shrinking.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveDocument } from "../src/engines/document/resolve";
import { PAPER, planPrint, twoPerSheetSizes, twoUpLayout } from "../src/engines/print/printPlan";
import { PrintSheets } from "../src/components/export/PrintDocument";
import { TEST_PRODUCTS } from "../src/presets/products/testProducts";

const pad = () => resolveDocument(TEST_PRODUCTS[0].build()); // 5 × 7 to-do notepad, 50 sheets

describe("Two designs per sheet — actual size", () => {
  it("50 notepad sheets = 25 printed Letter sheets, two 5 × 7 designs side by side on landscape Letter", () => {
    const doc = pad();
    const plan = planPrint(doc, { ...doc.project.exportSettings, repeatSheets: true, perSheet: 2, paper: "letter" });
    expect(plan.errors).toEqual([]);
    expect([plan.mediaWidthIn, plan.mediaHeightIn]).toEqual([5, 7]);
    expect(plan.sequence).toHaveLength(50);
    expect(plan.sheets).toHaveLength(25);
    expect(plan.sheets.every((s) => s.length === 2)).toBe(true);
    expect(plan.orientation).toBe("landscape");
    expect([plan.sheetWidthIn, plan.sheetHeightIn]).toEqual([11, 8.5]);
    expect(plan.pageCss).toBe("@page { size: 11in 8.5in; margin: 0; }");
    // Actual size, centred, a quarter inch between them, nothing off the paper.
    const [a, b] = plan.slots;
    expect(b.x - a.x).toBeCloseTo(5.25, 10);
    expect(a.y).toBeCloseTo(0.75, 10);
    expect(a.x).toBeCloseTo(0.375, 10);
    expect(b.x + 5).toBeCloseTo(11 - 0.375, 10);
    expect(plan.notes).toEqual([]);
  });

  it("one design (a pad’s master sheet) fills both places on the sheet; a page too large for two says so", () => {
    const doc = pad();
    const one = planPrint(doc, { ...doc.project.exportSettings, repeatSheets: false, perSheet: 2, paper: "letter" });
    expect(one.sheets).toEqual([[0, 0]]);
    const tp = TEST_PRODUCTS[1].build(); // a 6 × 9 book: too big for two on Letter
    const big = planPrint(resolveDocument(tp), { ...tp.exportSettings, perSheet: 2, paper: "letter" });
    expect(big.errors.join(" ")).toMatch(/don't fit on one sheet of Letter paper at actual size \(each can be at most 5\.5" × 8\.5"\)/);
  });

  it("orientation is automatic: stacked on portrait paper when that's what fits", () => {
    // 8 × 5 landscape designs: two stack on portrait Letter (8.5 × 11), not side by side.
    const t = twoUpLayout(8, 5, PAPER.letter)!;
    expect(t.orientation).toBe("portrait");
    expect(t.slots[1].y - t.slots[0].y).toBeCloseTo(5.25, 10);
    // Half-letter (5.5 × 8.5) fills landscape Letter exactly: no gap, and a note about the printer's edge.
    const half = twoUpLayout(5.5, 8.5, PAPER.letter)!;
    expect(half.orientation).toBe("landscape");
    expect(half.gap).toBe(0);
    expect(half.margin).toBeCloseTo(0, 10);
    expect(twoUpLayout(6, 9, PAPER.letter)).toBeNull();
  });

  it("prints two pages on each sheet, at their own size, with trim marks for both", () => {
    const doc = pad();
    const plan = planPrint(doc, { ...doc.project.exportSettings, repeatSheets: true, perSheet: 2, paper: "letter", showTrimMarks: true });
    const html = renderToStaticMarkup(<PrintSheets doc={doc} plan={plan} />);
    expect(html.match(/data-per-sheet="2"/g)).toHaveLength(25);
    expect(html.match(/data-slot="/g)).toHaveLength(50);
    expect(html).toContain("width:11in;height:8.5in");
    // Trim lines: four up-and-down cuts (two per design) marked above and below, two across cuts marked left and right.
    const marks = html.split('data-testid="cut-marks"').length - 1;
    expect(marks).toBe(25);
    const first = html.slice(html.indexOf('data-testid="cut-marks"'), html.indexOf("</svg>"));
    expect(first.match(/<line /g)).toHaveLength(4 * 2 + 2 * 2);
  });

  it("single design per sheet is unchanged", () => {
    const doc = pad();
    const plan = planPrint(doc, { ...doc.project.exportSettings, repeatSheets: true, paper: "letter" });
    expect(plan.perSheet).toBe(1);
    expect(plan.sheets).toHaveLength(50);
    expect([plan.sheetWidthIn, plan.sheetHeightIn]).toEqual([8.5, 11]);
  });

  it("4 × 8 fills landscape Letter two up, a quarter inch clear of every paper edge", () => {
    const t = twoUpLayout(4, 8, PAPER.letter)!;
    expect(t.orientation).toBe("landscape");
    expect(t.across).toBe(true);
    expect(t.slots[0].y).toBeCloseTo(0.25, 10);
    expect(t.margin).toBeCloseTo(0.25, 10);
    // Tall pads go side by side on portrait paper.
    const tall = twoUpLayout(4.25, 11, PAPER.letter)!;
    expect([tall.orientation, tall.across, tall.margin]).toEqual(["portrait", true, 0]);
  });

  it("lists the notepad sizes that print two per Letter sheet, largest first, and which keep clear of the printer's edge", () => {
    const sizes = twoPerSheetSizes("notepad");
    expect(sizes.filter((s) => s.clear).map((s) => s.id)).toEqual(["5x8", "5x7", "4x8", "a6", "4x6", "3x5"]);
    expect(sizes.filter((s) => !s.clear).map((s) => s.id)).toEqual(["4.25x11", "5.5x8.5", "4x9"]);
    expect(sizes.map((s) => s.id)).not.toContain("6x9");
  });
});
