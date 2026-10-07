/**
 * Gold on paper. Reported: gold step numbers and lines print orange / peach on a home inkjet (Epson EcoTank).
 * A printed gold-match sheet picked C3 (#AB9230) as true gold on paper for the Dove gold #E6A742; the print gold
 * is derived from the palette's line art the same way, and is used only when printing (styles/page.css).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { paperGold, printGold, resolveColors } from "../src/presets/themes/palettes";

describe("paper gold", () => {
  it("the Dove gold prints as the gold picked on the printed sheet (C3)", () => {
    expect(paperGold("#E6A742").toLowerCase()).toBe("#ab9230");
  });
  it("other golds move the same way: yellower and deeper, never lighter", () => {
    for (const g of ["#c8974d", "#DBB044", "#D4A73A"]) {
      const out = paperGold(g);
      expect(out).not.toBe(g);
      const lum = (h: string) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
      expect(lum(out)).toBeLessThan(lum(g));
    }
  });
  it("a line color that isn't gold is left alone", () => {
    for (const c of ["#1B1717", "#630000", "#718496", "#56644F", "#808080"]) expect(paperGold(c)).toBe(c);
  });
  it("every palette carries a paper gold next to its screen gold", () => {
    const c = resolveColors("dove-charcoal");
    expect(c.goldInk).toBe(printGold(c.lineArt));
    expect(c.goldPaper).toBe(paperGold(c.lineArt));
  });
  it("only printing switches the gold", () => {
    const css = readFileSync("src/styles/page.css", "utf8");
    const print = css.slice(css.indexOf("@media print"));
    expect(print).toMatch(/\.ps-page\s*\{\s*--c-goldInk:\s*var\(--c-goldPaper\)\s*!important;/);
  });
});
