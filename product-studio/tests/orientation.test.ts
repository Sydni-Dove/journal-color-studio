/**
 * Orientation: every page type — cover, divider, tab, monthly, weekly, daily,
 * journal, worksheet, notes — gets the project's own trim (width × height), in
 * the orientation the project chose. Landscape only when chosen; never by
 * sorting dimensions. Choosing a size never carries the previous size's
 * orientation over (the 7 × 9 → "9 × 7 page" bug).
 */
import { describe, expect, it } from "vitest";
import { geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { resolveTrim, withSizePreset } from "../src/engines/geometry/dimensions";
import { planPrint } from "../src/engines/print/printPlan";
import { dailyPlannerBook, neutralLuxeDividers, step } from "../src/presets/bookRecipes";
import { createProject } from "../src/presets/products/projectFactory";
import { CUSTOM_SIZE_ID } from "../src/presets/sizes/sizePresets";
import type { BookNode } from "../src/types/recipe";
import type { DimensionSettings, ProductProject } from "../src/types/project";

const CAL = { startDate: "2027-01-01", endDate: "2027-01-12", weekStart: 0 as const, sixRowMonths: true };
/** A book holding every page type. */
const everyPageType = (): BookNode[] => [
  ...neutralLuxeDividers().slice(0, 2), // cover + divider with a tab
  step("lined-journal", { type: "once" }),
  step("notes", { type: "once" }),
  step("worksheet", { type: "once" }, { layoutId: "stationery:worksheet-prompt.prompt-response" }),
  ...dailyPlannerBook(), // monthly, weekly spread, daily, guided pages
];
const LAYOUTS = ["cover-page", "divider-page", "journal-lined", "notes-page", "stationery:worksheet-prompt.prompt-response", "planner-monthly", "weekly-plan-mwg-spread", "planner-daily", "guided-page"];

function project(dimensions: DimensionSettings): ProductProject {
  return createProject("planner", { name: "Orientation", dimensions, calendar: CAL, recipe: { items: [], ordering: "chronological", structure: everyPageType() } });
}

const SIZES = ["3x5", "4x6", "5x7", "5.5x8.5", "6x9", "7x9", "7x9.25", "8x10", "8.5x11", "a5", "a6", "11x17", "18x11", "18x12", "22x17"];

describe("every page type gets the project's trim, in the chosen orientation", () => {
  it("7 × 9 portrait: cover, divider and tab pages are 7 wide × 9 high (and the tab sits on the page)", () => {
    const doc = resolveDocument(project({ sizePresetId: "7x9", orientation: "portrait" }));
    expect([doc.trim.widthIn, doc.trim.heightIn]).toEqual([7, 9]);
    for (const layout of ["cover-page", "divider-page"]) {
      const i = doc.recipe.pages.findIndex((p) => p.layoutId === layout);
      const g = geometryFor(doc, doc.recipe.pages[i]);
      expect([g.trimWidthIn, g.trimHeightIn, g.orientation], layout).toEqual([7, 9, "portrait"]);
    }
    const i = doc.recipe.pages.findIndex((p) => p.layoutId === "divider-page");
    const tab = solvePage(doc, i).nodes.find((n) => n.id === "tab")!;
    expect(tab.rect.x + tab.rect.w).toBeLessThanOrEqual(7);
    expect(tab.rect.y + tab.rect.h).toBeLessThanOrEqual(9);
  });

  for (const size of [...SIZES, CUSTOM_SIZE_ID]) {
    for (const orientation of ["portrait", "landscape"] as const) {
      it(`${size} ${orientation}: all page types, the caption's trim and the print media agree`, () => {
        const dims: DimensionSettings = size === CUSTOM_SIZE_ID ? { sizePresetId: size, custom: { width: 5.25, height: 8.25, unit: "in" }, orientation } : { sizePresetId: size, orientation };
        const doc = resolveDocument(project(dims));
        const t = doc.trim; // the preview caption prints this
        expect(orientation === "portrait" ? t.widthIn < t.heightIn : t.widthIn > t.heightIn).toBe(true);
        for (const layout of LAYOUTS) {
          const page = doc.recipe.pages.find((p) => p.layoutId === layout);
          expect(page, layout).toBeDefined();
          const g = geometryFor(doc, page!);
          expect([g.trimWidthIn, g.trimHeightIn, g.orientation], `${size} ${layout}`).toEqual([t.widthIn, t.heightIn, orientation]);
        }
        // Print / export: the @page box is the page's own media, same orientation.
        const plan = planPrint(doc, { scope: "full", repeatSheets: false, target: "print-pdf" });
        const g0 = geometryFor(doc, doc.recipe.pages[0]);
        expect([plan.mediaWidthIn, plan.mediaHeightIn]).toEqual([g0.mediaWidthIn, g0.mediaHeightIn]);
        expect(plan.pageCss).toContain(`size: ${g0.mediaWidthIn}in ${g0.mediaHeightIn}in`);
        expect(orientation === "portrait" ? plan.mediaWidthIn < plan.mediaHeightIn : plan.mediaWidthIn > plan.mediaHeightIn).toBe(true);
      });
    }
  }
});

describe("landscape only when chosen", () => {
  it("resolving a size applies the chosen orientation, never a sorted guess", () => {
    expect(resolveTrim({ sizePresetId: "7x9", orientation: "portrait" })).toMatchObject({ widthIn: 7, heightIn: 9 });
    expect(resolveTrim({ sizePresetId: "7x9", orientation: "landscape" })).toMatchObject({ widthIn: 9, heightIn: 7 });
    expect(resolveTrim({ sizePresetId: "11x17", orientation: "portrait" })).toMatchObject({ widthIn: 11, heightIn: 17 });
  });
  it("choosing a size brings that size's own orientation — an 11 × 17 landscape project switched to 7 × 9 is 7 × 9, not 9 × 7", () => {
    const deskpad: DimensionSettings = { sizePresetId: "11x17", orientation: "landscape" };
    const next = withSizePreset(deskpad, "7x9");
    expect(next.orientation).toBe("portrait");
    expect(resolveTrim(next)).toMatchObject({ widthIn: 7, heightIn: 9 });
    // A landscape-by-nature size stays landscape; a custom size keeps the current orientation.
    expect(withSizePreset({ sizePresetId: "7x9", orientation: "portrait" }, "18x11").orientation).toBe("landscape");
    expect(withSizePreset(deskpad, CUSTOM_SIZE_ID)).toMatchObject({ sizePresetId: CUSTOM_SIZE_ID, orientation: "landscape", custom: { width: 6, height: 9, unit: "in" } });
  });
  it("saved projects keep their chosen orientation", () => {
    for (const orientation of ["portrait", "landscape"] as const) {
      const saved = JSON.parse(JSON.stringify(project({ sizePresetId: "7x9", orientation }))) as ProductProject;
      const doc = resolveDocument(saved);
      expect(doc.trim.orientation).toBe(orientation);
      expect(geometryFor(doc, doc.recipe.pages[0]).orientation).toBe(orientation);
    }
  });
});
