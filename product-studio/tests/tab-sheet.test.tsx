import { describe, it, expect } from "vitest";
import { createProject } from "../src/presets/products/projectFactory";
import { step, neutralLuxeDividers } from "../src/presets/bookRecipes";
import { resolveDocument, solvePage, geometryFor } from "../src/engines/document/resolve";
import { validateProject } from "../src/engines/validation/validate";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { rectContains } from "../src/engines/layout/math";
import { DEFAULT_TAB_PIECES } from "../src/layouts/book/tabSheet";
import { DEFAULT_DECORATIVE } from "../src/presets/products/projectFactory";
import { PrintablePage } from "../src/primitives/PrintablePage";
import { renderToStaticMarkup } from "react-dom/server";
export function tabProject(size = "8.5x11") {
  return createProject("worksheet", { dimensions: { sizePresetId: size }, colors: { paletteId: "neutral-cheetah-luxe" }, recipe: { items: [], ordering: "sequential", structure: [step("tab-sheet", { type: "once" }, { tabSheet: { fromDividers: false, dividerHeightIn: 9 } })] } });
}
describe("Separate physical cut-and-fold tab pieces", () => {
  for (const size of ["8.5x11", "7x9", "6x9", "5.5x8.5", "a5"]) it(`${size}: two faces, cut outline, fold and adhesive geometry`, () => {
    const doc = resolveDocument(tabProject(size)), solved = solvePage(doc, 0), g = geometryFor(doc, doc.recipe.pages[0]);
    expect(solved.diagnostics).toEqual([]);
    expect(solved.manufacturingSheet).toBe(true);
    expect(solved.nodes.filter((n) => n.id.startsWith("tab-face-"))).toHaveLength(18);
    expect(solved.nodes.filter((n) => n.id.startsWith("fold-"))).toHaveLength(9);
    for (const n of solved.nodes) expect(rectContains(g.safeRect, n.rect)).toBe(true);
    expect(validateProject(doc.project, heuristicMeasurer).issues.filter((i) => i.severity === "error")).toEqual([]);
    const piece = solved.nodes.find((n) => n.id === "piece-0")!;
    expect(piece.rect.w).toBeCloseTo(2.1); expect(piece.rect.h).toBe(0.6);
    const props = { geometry: g, solved, colors: doc.colors, typography: doc.typography, decorative: DEFAULT_DECORATIVE };
    const editor = renderToStaticMarkup(<PrintablePage {...props} mode="editor"/>);
    const print = renderToStaticMarkup(<PrintablePage {...props} mode="print"/>);
    expect(editor.split("ps-page--editor").join("ps-page--print")).toBe(print);
    expect(print).toContain('background:white');
  });
  it("matches divider names even with printed labels switched off", () => {
    const p = tabProject(); p.recipe.structure = [...neutralLuxeDividers(), step("tab-sheet")];
    for (const n of p.recipe.structure) if (n.kind === "step" && n.cover?.tab) n.cover.tab.show = false;
    const doc = resolveDocument(p);
    expect(doc.recipe.pages.at(-1)!.module!.tabSheet!.entries!.map((e) => e.label)).toEqual(DEFAULT_TAB_PIECES.map((e) => e.label));
  });
  it("blocks undersized paper, attachment allowances and crowded divider placement", () => {
    const small = resolveDocument(tabProject("filofax-pocket"));
    expect(solvePage(small, 0).diagnostics.some((d) => d.severity === "error")).toBe(true);
    const p = tabProject(); (p.recipe.structure![0] as ReturnType<typeof step>).tabSheet = { attachIn: 1.05 };
    expect(solvePage(resolveDocument(p), 0).diagnostics.some((d) => d.severity === "error")).toBe(true);
    (p.recipe.structure![0] as ReturnType<typeof step>).tabSheet = { dividerHeightIn: 4 };
    expect(solvePage(resolveDocument(p), 0).diagnostics.some((d) => d.severity === "error")).toBe(true);
  });
});
