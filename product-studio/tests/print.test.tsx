import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { pageRuleCss, planPrint } from "../src/engines/print/printPlan";
import { PrintablePage } from "../src/primitives/PrintablePage";
import { TEST_PRODUCTS } from "../src/presets/products/testProducts";

describe("print plan", () => {
  it("uses the exact media size with zero browser margins", () => {
    expect(pageRuleCss(5, 7)).toBe("@page { size: 5in 7in; margin: 0; }");
    const doc = resolveDocument(TEST_PRODUCTS[4].build());
    const plan = planPrint(doc, doc.project.exportSettings);
    expect([plan.mediaWidthIn, plan.mediaHeightIn]).toEqual([17, 11]);
  });

  it("emits one master sheet for a pad unless repeat is requested", () => {
    const doc = resolveDocument(TEST_PRODUCTS[0].build());
    expect(planPrint(doc, { ...doc.project.exportSettings, repeatSheets: false }).sequence).toHaveLength(1);
    expect(planPrint(doc, { ...doc.project.exportSettings, repeatSheets: true }).sequence).toHaveLength(50);
  });

  it("supports full / current page / page range without duplicates", () => {
    const doc = resolveDocument(TEST_PRODUCTS[1].build());
    expect(planPrint(doc, { ...doc.project.exportSettings, scope: "full" }).sequence).toHaveLength(120);
    expect(planPrint(doc, { ...doc.project.exportSettings, scope: "current-page" }, 7).sequence).toEqual([7]);
    const range = planPrint(doc, { ...doc.project.exportSettings, scope: "page-range", pageRange: { from: 3, to: 6 } }).sequence;
    expect(range).toEqual([2, 3, 4, 5]);
    expect(new Set(range).size).toBe(range.length);
  });

  it("includes bleed in the media box when bleed is on (KDP outer three edges)", () => {
    const p = TEST_PRODUCTS[1].build();
    p.production.includeBleed = true;
    const plan = planPrint(resolveDocument(p), p.exportSettings);
    expect(plan.mediaWidthIn).toBeCloseTo(6.125, 10);
    expect(plan.mediaHeightIn).toBeCloseTo(9.25, 10);
    expect(plan.errors).toHaveLength(0);
  });
});

describe("Preview = Print", () => {
  it("renders identical page markup in editor and print modes (overlay excluded)", () => {
    for (const t of TEST_PRODUCTS) {
      const doc = resolveDocument(t.build());
      const i = doc.recipe.pages.findIndex((p) => !p.filler);
      const props = {
        geometry: geometryFor(doc, doc.recipe.pages[i]),
        solved: solvePage(doc, i),
        colors: doc.colors,
        typography: doc.typography,
        decorative: doc.decorative,
      };
      const editor = renderToStaticMarkup(<PrintablePage {...props} mode="editor" overlay={<g className="ps-debug" />} />);
      const print = renderToStaticMarkup(<PrintablePage {...props} mode="print" />);
      const strip = (s: string) => s.replace("ps-page--editor", "").replace("ps-page--print", "").replace('<g class="ps-debug"></g>', "");
      expect(strip(editor)).toBe(strip(print));
      expect(print).not.toContain("ps-debug");
      expect(print).toContain(`width:${props.geometry.mediaWidthIn}in`);
    }
  });
});
