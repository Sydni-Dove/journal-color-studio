import { describe, expect, it } from "vitest";
import { resolveDocument, solvePage } from "../src/engines/document/resolve";
import { planPrint } from "../src/engines/print/printPlan";
import { step } from "../src/presets/bookRecipes";
import { createProject } from "../src/presets/products/projectFactory";

const calendar = { startDate: "2027-01-04", endDate: "2027-01-05", weekStart: 1 as const, sixRowMonths: true };
const project = (recipe: object = {}, layoutOptions: object = {}) => createProject("planner", {
  dimensions: { sizePresetId: "8.5x11", orientation: "portrait" },
  production: { bindingType: "coil", printProfileId: "coil-generic", duplex: true },
  calendar,
  recipe: { items: [], ordering: "sequential", structure: [step("weekly-planner", { type: "weekly" })], ...recipe },
  layoutOptions,
});

describe("planner customization", () => {
  it("uses one final page model for alignment pages and print", () => {
    const notes = resolveDocument(project());
    const blank = resolveDocument(project({ fillerPage: "blank" }));
    const continuous = resolveDocument(project({ facingPages: "continuous" }));
    expect(notes.recipe.pages[0].layoutId).toBe("notes-page");
    expect(blank.recipe.pages[0].layoutId).toBe("blank-filler-page");
    expect(solvePage(blank, 0).blankPage).toBe(true);
    expect(continuous.recipe.pages.some((p) => p.filler)).toBe(false);
    expect(continuous.recipe.pageCount).toBe(notes.recipe.pageCount - 1);
    for (const doc of [notes, blank, continuous]) {
      const plan = planPrint(doc, { scope: "full", repeatSheets: false, target: "print-pdf" });
      expect(plan.sequence).toHaveLength(doc.recipe.pageCount);
    }
  });

  it("removes monthly notes and lets the calendar use the width", () => {
    const recipe = { structure: [step("monthly-calendar", { type: "monthly" })] };
    const withNotes = resolveDocument(project(recipe, { monthlyNotes: true }));
    const without = resolveDocument(project(recipe, { monthlyNotes: false }));
    const a = solvePage(withNotes, 0);
    const b = solvePage(without, 0);
    expect(a.regions?.notes).toBeDefined();
    expect(b.regions?.notes).toBeUndefined();
    expect(b.regions?.calendar?.w).toBeGreaterThan(a.regions?.calendar?.w ?? 0);
  });

  it("removes weekly notes and daily sections while reclaiming their space", () => {
    const notes = resolveDocument(project(undefined, { weeklyNotes: true }));
    const noNotes = resolveDocument(project(undefined, { weeklyNotes: false }));
    const n = notes.recipe.pages.findIndex((p) => p.spreadPart === 1);
    const m = noNotes.recipe.pages.findIndex((p) => p.spreadPart === 1);
    expect(solvePage(notes, n).nodes.some((x) => x.id === "wk1-notes-name")).toBe(true);
    expect(solvePage(noNotes, m).nodes.some((x) => x.id === "wk1-notes-name")).toBe(false);
    const daily = { structure: [step("daily-planner", { type: "daily" })] };
    const full = solvePage(resolveDocument(project(daily)), 0);
    const lean = solvePage(resolveDocument(project(daily, { dailySections: [] })), 0);
    expect(full.nodes.some((x) => x.id.startsWith("daily-notes"))).toBe(true);
    expect(lean.nodes.some((x) => x.id.startsWith("daily-notes"))).toBe(false);
    expect(lean.nodes.find((x) => x.id === "daily-schedule")?.rect.w).toBeGreaterThan(full.nodes.find((x) => x.id === "daily-schedule")?.rect.w ?? 0);
  });

  for (const size of ["8x10", "7x9", "8.5x11"]) for (const orientation of ["portrait", "landscape"] as const) {
    it(`${size} ${orientation}: facing Monthly and Notes share the header and content boundaries`, () => {
      const p = project({ structure: [step("cover-page"), step("monthly-calendar", { type: "monthly" }), step("weekly-planner", { type: "weekly" })] });
      p.dimensions = { sizePresetId: size, orientation };
      const doc = resolveDocument(p);
      const month = doc.recipe.pages.findIndex((page) => page.layoutId === "planner-monthly");
      const notes = month + 1;
      expect(doc.recipe.pages[notes].filler).toBe(true);
      expect(doc.recipe.pages[notes].layoutId).toBe("notes-page");
      const a = solvePage(doc, month);
      const b = solvePage(doc, notes);
      const rule = (nodes: typeof a.nodes) => nodes.find((node) => node.id === "month-header-rule" || node.id === "notes-facing-month-header-rule")!;
      expect(rule(a.nodes).rect.y).toBeCloseTo(rule(b.nodes).rect.y, 6);
      expect(rule(a.nodes).rect.w).toBeCloseTo(rule(b.nodes).rect.w, 6);
      expect(a.regions?.mainContent?.y).toBeCloseTo(b.regions?.mainContent?.y ?? -1, 6);
      expect(a.regions?.mainContent?.h).toBeCloseTo(b.regions?.mainContent?.h ?? -1, 6);
      expect(planPrint(doc, { scope: "full", repeatSheets: false, target: "print-pdf" }).sequence).toContain(notes);
    });
  }
});
