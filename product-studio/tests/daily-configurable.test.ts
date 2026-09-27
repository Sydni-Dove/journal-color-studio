/**
 * Daily planner (original brief: configurable daily sections from semantic wording):
 *   sections   any of the nine, in the chosen order, headings from wording; default schedule · priorities · to-do
 *   sizes      Letter → Franklin compact; wide pages put the schedule beside the lists; nothing squashed
 *   book       Daily Planner product: front matter → month → week plan + Meeting With God → daily pages → review
 *   pads       undated daily planner sheet (larger pads) and the small-pad Daily To-Do
 */
import { describe, expect, it } from "vitest";
import { resolveDocument, solvePage } from "../src/engines/document/resolve";
import { computeUsage } from "../src/engines/document/usage";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { validateProject } from "../src/engines/validation/validate";
import { DAILY_SECTIONS, DEFAULT_DAILY_SECTIONS, dailySectionsOf } from "../src/layouts/planner/dailyConfigurable";
import { dailyPlannerBook, step } from "../src/presets/bookRecipes";
import { getModule } from "../src/presets/modules";
import { RECIPE_PRESETS } from "../src/presets/layouts/recipePresets";
import { PRODUCT_FAMILIES } from "../src/presets/products/productFamilies";
import { createProject } from "../src/presets/products/projectFactory";
import type { LayoutNode } from "../src/types/layout";
import type { LayoutOptions } from "../src/types/project";

type Text = Extract<LayoutNode, { type: "text" }>;
type Size = [string, string, string];
const LETTER: Size = ["8.5x11", "coil", "coil-generic"];

function daily(size: Size, sections?: string[], end = "2027-01-02", extra: Partial<LayoutOptions> = {}) {
  return createProject("planner", {
    name: "Daily",
    dimensions: { sizePresetId: size[0], orientation: "portrait" },
    production: { bindingType: size[1], printProfileId: size[2], duplex: true } as never,
    calendar: { startDate: "2027-01-01", endDate: end, weekStart: 0, sixRowMonths: true },
    recipe: { items: [], ordering: "chronological", structure: [step("daily-planner")] },
    layoutOptions: { ...(sections ? { dailySections: sections as LayoutOptions["dailySections"] } : {}), ...extra },
  });
}
const firstDaily = (p: ReturnType<typeof daily>) => {
  const doc = resolveDocument(p);
  const i = doc.recipe.pages.findIndex((x) => x.layoutId === "planner-daily" || x.layoutId === "notepad-daily");
  return solvePage(doc, i);
};
const headings = (nodes: LayoutNode[]) => nodes.filter((n): n is Text => n.type === "text" && /^dy-[a-zA-Z]+-title$/.test(n.id) && n.id !== "dy-header-title").map((n) => n.text);
const problems = (p: ReturnType<typeof daily>) => validateProject(p, heuristicMeasurer).issues.filter((x) => x.severity !== "info" && x.rule !== "page-count");

describe("configurable daily page", () => {
  it("the Daily planner purpose defaults to the configurable page (Luxury is the second design)", () => {
    expect(getModule("daily-planner").layouts).toEqual(["planner-daily", "daily-luxury-execution"]);
    expect(DEFAULT_DAILY_SECTIONS).toEqual(["schedule", "topPriorities", "toDo"]);
    expect(dailySectionsOf(createProject("planner").layoutOptions)).toEqual(DEFAULT_DAILY_SECTIONS);
  });

  it("the nine sections of the original brief, headings from wording keys, in the chosen order", () => {
    expect([...DAILY_SECTIONS]).toEqual(["schedule", "topPriorities", "toDo", "notes", "gratitude", "prayer", "scripture", "reflection", "kingdomAssignments"]);
    const p = daily(LETTER, ["scripture", "prayer", "toDo", "gratitude"]);
    p.wording = { ...p.wording, scripture: "Word for Today" };
    expect(headings(firstDaily(p).nodes)).toEqual(["Word for Today", "Prayer", "To Do", "Gratitude"]);
  });

  it("dated header: weekday, month and day, with the year", () => {
    const s = firstDaily(daily(LETTER));
    expect((s.nodes.find((n) => n.id === "dy-header-title") as Text).text).toBe("Friday, January 1");
    expect((s.nodes.find((n) => n.id === "dy-year") as Text).text).toBe("2027");
  });

  it("schedule hours follow the options (6 AM – 9 PM by default; half hours double the rows)", () => {
    const hours = (p: ReturnType<typeof daily>) => firstDaily(p).nodes.filter((n): n is Text => /^dy-hour-\d+$/.test(n.id)).map((n) => n.text);
    expect(hours(daily(LETTER))).toEqual(["6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM", "9 PM"]);
    const custom = hours(daily(LETTER, undefined, "2027-01-02", { hourStart: 8, hourEnd: 12, halfHours: true }));
    expect(custom).toEqual(["8 AM", "8:30 AM", "9 AM", "9:30 AM", "10 AM", "10:30 AM", "11 AM", "11:30 AM", "12 PM", "12:30 PM"]);
  });

  it("Half Letter / A5: a stacked schedule splits into two hour columns rather than dropping hours", () => {
    for (const size of [["5.5x8.5", "discbound", "disc-generic"], ["a5", "ring-6", "ring-insert"]] as Size[]) {
      const s = firstDaily(daily(size));
      expect(s.nodes.filter((n) => /^dy-hour-\d+$/.test(n.id)), size[0]).toHaveLength(16);
      // Half Letter stacks (too narrow for schedule | lists) and splits the hours; A5 fits schedule | lists.
      expect(s.nodes.some((n) => n.id === "dy-hours2"), size[0]).toBe(size[0] === "5.5x8.5");
    }
  });

  const sizes: Size[] = [LETTER, ["7x9", "coil", "coil-generic"], ["6x9", "perfect-bound", "kdp"], ["5.5x8.5", "discbound", "disc-generic"], ["a5", "ring-6", "ring-insert"]];
  for (const size of sizes) {
    it(`${size[0]}: the default sections and five spiritual sections fit with no errors or warnings`, () => {
      expect(problems(daily(size))).toEqual([]);
      expect(problems(daily(size, ["scripture", "prayer", "gratitude", "reflection", "kingdomAssignments"]))).toEqual([]);
    });
  }
  it("Letter, 7×9, 6×9, A5: all nine sections fit (extra lists move below the schedule)", () => {
    for (const size of [sizes[0], sizes[1], sizes[2], sizes[4]]) expect(problems(daily(size, [...DAILY_SECTIONS])), size[0]).toEqual([]);
  });
  it("too many sections for the page is reported, never squeezed", () => {
    const p = daily(["5.5x8.5", "discbound", "disc-generic"], [...DAILY_SECTIONS]);
    expect(problems(p).some((x) => /Too many daily sections/.test(x.message))).toBe(true);
    expect(firstDaily(p).nodes.some((n) => n.id.startsWith("dy-schedule"))).toBe(false);
  });
  it("the editor's Layout panel offers the daily section controls, and the chosen headings become editable wording", () => {
    const u = computeUsage(resolveDocument(daily(LETTER, ["schedule", "prayer"])));
    expect(u.dailySections).toBe(true);
    expect(u.wordingKeys).toEqual(expect.arrayContaining(["schedule", "prayer"]));
  });
});

describe("Daily Planner product", () => {
  it("a Daily Planner family on the studio home starts the wizard on the daily planner book", () => {
    const f = PRODUCT_FAMILIES.find((x) => x.id === "daily-planner")!;
    expect(f.status).toBe("ready");
    expect(f.start).toMatchObject({ type: "planner", recipeId: "book-daily-planner" });
    expect(RECIPE_PRESETS.find((r) => r.id === "book-daily-planner")!.layoutOptions?.dailySections).toEqual(["schedule", "topPriorities", "toDo"]);
  });
  it("book: front matter → each month: calendar → each week: plan + Meeting With God, then that week's days → monthly review", () => {
    const preset = RECIPE_PRESETS.find((r) => r.id === "book-daily-planner")!;
    const p = createProject("planner", {
      dimensions: { sizePresetId: "7x9", orientation: "portrait" },
      production: { bindingType: "coil", printProfileId: "coil-generic", duplex: true },
      calendar: { startDate: "2027-01-01", endDate: "2027-02-28", weekStart: 0, sixRowMonths: true },
      recipe: preset.build({ count: 1, sheets: 1 }),
      layoutOptions: preset.layoutOptions,
    });
    const doc = resolveDocument(p);
    const seq = doc.recipe.pages
      .filter((x) => !x.filler && x.spreadPart !== 1)
      .map((x) => (x.layoutId === "planner-daily" ? "D" : x.layoutId === "planner-monthly" ? "M" : x.layoutId === "weekly-plan-mwg-spread" ? "W" : x.module?.type === "review" ? "R" : "F"));
    expect(seq.join("")).toMatch(/^FFFM(WD{1,7})+RM(WD{1,7})+R$/);
    expect(doc.recipe.pages.filter((x) => x.layoutId === "planner-daily")).toHaveLength(59);
    expect(dailyPlannerBook()).toHaveLength(2);
    const errors = validateProject(p, heuristicMeasurer).issues.filter((x) => x.severity === "error");
    expect(errors, JSON.stringify(errors.slice(0, 2))).toEqual([]);
  });
});

describe("daily notepads", () => {
  const pad = (size: string, presetId: string) => {
    const r = RECIPE_PRESETS.find((x) => x.id === presetId)!;
    return createProject("notepad", {
      dimensions: { sizePresetId: size, orientation: "portrait" },
      production: { bindingType: "glued-pad", boundEdge: "top", printProfileId: "notepad-top-glued", sheetsPerPad: 50 },
      recipe: r.build({ count: 1, sheets: 50 }),
      layoutOptions: r.layoutOptions,
    });
  };
  for (const size of ["3x5", "4x6", "5x7", "5.5x8.5", "8.5x11"]) {
    it(`${size}: Daily To-Do — a date line and the day's to-do list`, () => {
      const p = pad(size, "notepad-daily-todo");
      expect(problems(p)).toEqual([]);
      const s = firstDaily(p);
      expect(headings(s.nodes)).toEqual(["To Do"]);
      expect(s.nodes.some((n) => n.type === "text" && /^Date _+$/.test((n as Text).text)) || s.nodes.some((n) => n.id === "dy-date")).toBe(true);
    });
  }
  for (const size of ["5x7", "5.5x8.5", "8.5x11"]) {
    it(`${size}: undated daily planner sheet — schedule, top priorities, to-do`, () => {
      const p = pad(size, "notepad-daily");
      expect(problems(p)).toEqual([]);
      expect(headings(firstDaily(p).nodes)).toEqual(["Schedule", "Top Priorities", "To Do"]);
    });
  }
  it("small pads: the full daily sheet is reported as not fitting (the Daily To-Do is the small-pad design)", () => {
    expect(problems(pad("3x5", "notepad-daily")).some((x) => /Too many daily sections/.test(x.message))).toBe(true);
  });
});
