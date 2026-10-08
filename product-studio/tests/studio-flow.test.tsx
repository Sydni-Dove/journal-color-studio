import { describe, expect, it } from "vitest";
import { weeklyRecipeWithExtras } from "../src/components/wizard/NewProductWizard";
import { resolveDocument, solvePage } from "../src/engines/document/resolve";
import { recipePresetsFor } from "../src/presets/layouts/recipePresets";
import { createProject } from "../src/presets/products/projectFactory";

describe("product, page and layout choices", () => {
  it("keeps selected weekly extras as distinct pages in the requested order", () => {
    const recipe = weeklyRecipeWithExtras("planner-weekly-writing-spread", ["notes", "reflection", "meeting-with-god"]);
    const project = createProject("planner", { recipe, calendar: { startDate: "2027-01-04", endDate: "2027-01-10", weekStart: 1, sixRowMonths: true } });
    const pages = resolveDocument(project).recipe.pages.filter((p) => !p.filler);
    const categories = pages.map((p) => p.module?.type);
    expect(categories).toEqual(["weekly-planner", "weekly-planner", "notes", "reflection", "meeting-with-god"]);
    expect(pages.slice(0, 2).map((p) => p.layoutId)).toEqual(["planner-weekly-writing-spread", "planner-weekly-writing-spread"]);
  });

  it("offers only product-specific starting recipes", () => {
    expect(recipePresetsFor("worksheet").map((x) => x.id)).toEqual(["worksheet-guided"]);
    expect(recipePresetsFor("custom").map((x) => x.id)).toEqual(["custom-guided"]);
    expect(recipePresetsFor("tracker").some((x) => x.id.startsWith("planner-"))).toBe(false);
  });

  it("renders tracker items as a seven-day grid", () => {
    const recipe = recipePresetsFor("tracker")[0].build({ count: 1, sheets: 1 });
    const project = createProject("tracker", { recipe });
    const doc = resolveDocument(project);
    expect(doc.recipe.pageCount).toBe(1);
    expect(solvePage(doc, 0).nodes.filter((n) => n.type === "checkbox")).toHaveLength(28);
  });
});
