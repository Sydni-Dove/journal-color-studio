import { describe, it, expect } from "vitest";
import { createProject } from "../src/presets/products/projectFactory";
import { neutralLuxeDividers } from "../src/presets/bookRecipes";
import { resolveDocument, solvePage, geometryFor } from "../src/engines/document/resolve";
import { SIZE_PRESETS } from "../src/presets/sizes/sizePresets";
import { rectContains } from "../src/engines/layout/math";
import { tabGeometry } from "../src/layouts/book/coverDivider";
import { validateProject } from "../src/engines/validation/validate";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
export function luxeProject(size = "8.5x11") {
  return createProject("planner", { name: "Neutral Luxe QA", dimensions: { sizePresetId: size }, colors: { paletteId: "neutral-cheetah-luxe" }, typography: { fonts: { cover: "Great Vibes", headings: "Playfair Display", subheadings: "Lato", body: "Lato", accent: "Great Vibes" }, roleOverrides: { coverTitle: { sizePt: 88, transform: "none", weight: 400, trackingEm: 0 }, coverSubtitle: { sizePt: 10, trackingEm: 0.22 } } }, recipe: { items: [], ordering: "sequential", structure: neutralLuxeDividers() } });
}
describe("Reusable covers and printed tabs", () => {
  for (const size of SIZE_PRESETS) it(`${size.id}: audit composition and safe physical tab geometry`, () => {
    const p = luxeProject(size.id), doc = resolveDocument(p);
    expect(doc.recipe.pageCount).toBe(10);
    for (let i = 0; i < 10; i++) {
      const solved = solvePage(doc, i), g = geometryFor(doc, doc.recipe.pages[i]);
      for (const node of solved.nodes.filter((n) => n.functional)) expect(rectContains(g.safeRect, node.rect)).toBe(true);
      if (i) {
        const t = doc.recipe.pages[i].module!.cover!.tab!;
        expect(t.order).toBe(i); expect(t.count).toBe(9);
        const rect = tabGeometry(g, t);
        if (rect) expect(rectContains(g.safeRect, rect)).toBe(true);
        else expect(solved.diagnostics.some((d) => d.rule === "tab-fit")).toBe(true);
      }
    }
  });
  for (const size of ["8.5x11", "7x9", "6x9", "5.5x8.5", "a5"]) it(`${size}: passes full printable validation`, () => {
    expect(validateProject(luxeProject(size), heuristicMeasurer).issues.filter((x) => x.severity === "error")).toEqual([]);
  });
  it("rejects impossible counts rather than squeezing tabs", () => {
    const doc = resolveDocument(luxeProject("filofax-pocket")), g = geometryFor(doc, { side: "recto" });
    expect(tabGeometry(g, { show: true, count: 24, order: 1 })).toBeNull();
    expect(tabGeometry(g, { show: true, count: 4, order: 5 })).toBeNull();
  });
});
