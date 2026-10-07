/**
 * PLANNER CUSTOMIZATION — the per-planner switches and facing-page behavior:
 *
 *   monthly / weekly sidebars toggle independently (legacy showSidebar still
 *   drives both when the new switches are absent);
 *   the weekly spread's extra Notes slot can be turned off (days reclaim it);
 *   the weekly plan spread's Notes / Priorities feet can be turned off;
 *   spreadMode "preserve" inserts fillers, "continuous" does not;
 *   fillerKind chooses Notes or Blank fillers;
 *   toggling any of these re-expands / re-solves (no stale cache).
 */
import { describe, expect, it } from "vitest";
import { resolveDocument, solvePage } from "../src/engines/document/resolve";
import { validateBook } from "../src/engines/validation/book";
import { planPrint } from "../src/engines/print/printPlan";
import { addDaily, addMonthly, addWeekly } from "../src/engines/recipe/pageBuilder";
import { step } from "../src/presets/bookRecipes";
import { createProject } from "../src/presets/products/projectFactory";
import type { BookNode } from "../src/types/recipe";
import type { LayoutOptions } from "../src/types/project";

const paged = { bindingType: "coil", printProfileId: "coil-generic", duplex: true } as never;

const planner = (structure: BookNode[], layoutOptions: Partial<LayoutOptions> = {}, size = "7x9") =>
  createProject("planner", {
    dimensions: { sizePresetId: size, orientation: "portrait" },
    production: paged,
    calendar: { startDate: "2027-01-01", endDate: "2027-02-28", weekStart: 0, sixRowMonths: true },
    recipe: { items: [], ordering: "chronological", structure },
    layoutOptions,
  });

const doc = (structure: BookNode[], layoutOptions: Partial<LayoutOptions> = {}) => resolveDocument(planner(structure, layoutOptions));
const fillers = (d: ReturnType<typeof resolveDocument>) => d.recipe.pages.filter((p) => p.filler);

describe("facing-page behavior", () => {
  const structure = addWeekly(addMonthly([]));

  it("preserve (default) inserts filler pages; continuous inserts none", () => {
    const keep = doc(structure);
    const flow = doc(structure, { spreadMode: "continuous" });
    expect(fillers(keep).length).toBeGreaterThan(0);
    expect(fillers(flow)).toHaveLength(0);
    expect(flow.recipe.pageCount).toBe(keep.recipe.pageCount - fillers(keep).length);
  });

  it("toggling spreadMode re-expands (the recipe cache key covers it)", () => {
    const a = doc(structure, { spreadMode: "preserve" });
    const b = doc(structure, { spreadMode: "continuous" });
    const c = doc(structure, { spreadMode: "preserve" });
    expect(b.recipe.pageCount).toBeLessThan(a.recipe.pageCount);
    expect(c.recipe.pageCount).toBe(a.recipe.pageCount);
  });

  it("fillerKind chooses Notes or Blank fillers", () => {
    const notes = doc(structure, { fillerKind: "notes" });
    const blank = doc(structure, { fillerKind: "blank" });
    expect(fillers(notes).length).toBeGreaterThan(0);
    expect(new Set(fillers(notes).map((p) => p.layoutId))).toEqual(new Set(["notes-page"]));
    expect(new Set(fillers(blank).map((p) => p.layoutId))).toEqual(new Set(["blank-page"]));
    // A blank filler renders nothing at all.
    const bi = blank.recipe.pages.findIndex((p) => p.filler);
    expect(solvePage(blank, bi).nodes).toEqual([]);
  });

  it("continuous mode: no spread-side errors from validation", () => {
    const flow = doc(structure, { spreadMode: "continuous" });
    const errors = validateBook(flow).filter((i) => i.severity === "error");
    expect(errors.filter((i) => /right-hand page|left-hand page/.test(i.message))).toEqual([]);
  });

  it("print follows the same page model (sequence length = page count)", () => {
    for (const mode of ["preserve", "continuous"] as const) {
      const d = doc(structure, { spreadMode: mode });
      const plan = planPrint(d, { scope: "all" } as never);
      expect(plan.sequence).toHaveLength(d.recipe.pageCount);
    }
  });
});

describe("independent sidebar switches", () => {
  const structure = addWeekly(addMonthly([]));
  const regions = (d: ReturnType<typeof resolveDocument>, layoutId: string) => {
    const i = d.recipe.pages.findIndex((p) => p.layoutId === layoutId && !p.filler);
    return solvePage(d, i).regions ?? {};
  };

  it("legacy showSidebar still drives both when the new switches are absent", () => {
    const d = doc(structure, { showSidebar: true });
    expect(regions(d, "planner-monthly").sidebar).toBeDefined();
    expect(regions(d, "planner-weekly-spread").sidebar).toBeDefined();
  });

  it("monthly on + weekly off: only the monthly page gets a sidebar", () => {
    const d = doc(structure, { showSidebar: false, monthlySidebar: true, weeklySidebar: false });
    expect(regions(d, "planner-monthly").sidebar).toBeDefined();
    expect(regions(d, "planner-weekly-spread").sidebar).toBeUndefined();
  });

  it("monthly off + weekly on: only the weekly spread gets a sidebar", () => {
    const d = doc(structure, { showSidebar: false, monthlySidebar: false, weeklySidebar: true });
    expect(regions(d, "planner-monthly").sidebar).toBeUndefined();
    expect(regions(d, "planner-weekly-spread").sidebar).toBeDefined();
  });
});

describe("weekly spread notes slot", () => {
  const structure = addWeekly([]);
  // The first weekly spread's two pages (one spread = two page indices).
  const firstSpread = (d: ReturnType<typeof resolveDocument>) => {
    const i = d.recipe.pages.findIndex((p) => p.layoutId === "planner-weekly-spread" && p.spreadPart === 0);
    return [i, i + 1];
  };
  const daySlots = (d: ReturnType<typeof resolveDocument>) =>
    firstSpread(d).flatMap((i) => solvePage(d, i).nodes.filter((n) => /^wk[01]-d\d+$/.test(n.id)));

  it("on (default): the recto page carries the notes slot", () => {
    const d = doc(structure);
    const [, recto] = firstSpread(d);
    const solved = solvePage(d, recto);
    expect(solved.nodes.some((n) => n.id === "wk1-notes")).toBe(true);
    expect(daySlots(d)).toHaveLength(7);
  });

  it("off: no notes slot and the seven days reclaim its space", () => {
    const d = doc(structure, { weeklyNotes: false });
    for (const i of firstSpread(d)) {
      const solved = solvePage(d, i);
      expect(solved.nodes.some((n) => /notes/.test(n.id))).toBe(false);
      expect(solved.regions?.notes).toBeUndefined();
    }
    // Still all seven days, now on wider tracks (recto uses 3, not 4).
    expect(daySlots(d)).toHaveLength(7);
    const [, recto] = firstSpread(d);
    const metric = solvePage(d, recto).metrics.find((m) => m.label.startsWith("Slot width"));
    expect(metric?.label).toContain("/ 3");
  });
});

describe("weekly plan spread foot sections", () => {
  const structure = [step("weekly-planner", { type: "weekly" }, { layoutId: "weekly-plan-spread", id: "wps" })];

  it("on (default): notes and priorities feet render", () => {
    const d = doc(structure);
    const i = d.recipe.pages.findIndex((p) => p.layoutId === "weekly-plan-spread" && p.spreadPart === 0);
    const ids = solvePage(d, i).nodes.map((n) => n.id);
    expect(ids.some((id) => id.includes("-notes"))).toBe(true);
    const j = d.recipe.pages.findIndex((p) => p.layoutId === "weekly-plan-spread" && p.spreadPart === 1);
    expect(solvePage(d, j).nodes.map((n) => n.id).some((id) => id.includes("-priorities"))).toBe(true);
  });

  it("off: feet disappear and day rows keep the page", () => {
    const d = doc(structure, { weeklyPlanNotes: false, weeklyPlanPriorities: false });
    for (const part of [0, 1] as const) {
      const i = d.recipe.pages.findIndex((p) => p.layoutId === "weekly-plan-spread" && p.spreadPart === part);
      const solved = solvePage(d, i);
      const ids = solved.nodes.map((n) => n.id);
      expect(ids.some((id) => id.includes("-notes") || id.includes("-priorities"))).toBe(false);
      expect(solved.regions?.notes).toBeUndefined();
      expect(solved.diagnostics.filter((x) => x.severity === "error")).toEqual([]);
    }
  });
});

describe("spread alignment with fillers", () => {
  it("a filler facing a monthly calendar shares its header zone", async () => {
    const { spreadHeaderMisalignments } = await import("../src/engines/validation/spread");
    // Monthly followed by a two-page weekly spread: the recipe inserts a
    // filler between them, facing the monthly page.
    const d = doc(addWeekly(addMonthly([])));
    const monthlyIdx = d.recipe.pages.findIndex((p) => p.layoutId === "planner-monthly" && !p.filler);
    const fillerIdx = d.recipe.pages.findIndex((p) => p.filler);
    expect(fillerIdx).toBeGreaterThan(-1);
    // The filler sits on the facing page of a monthly (verso monthly → recto filler).
    const facingMonthly = d.recipe.pages.findIndex(
      (p, i) => p.layoutId === "planner-monthly" && d.recipe.pages[i + 1]?.filler === true,
    );
    expect(facingMonthly).toBeGreaterThan(-1);
    expect(d.recipe.pages[facingMonthly].side).toBe("verso");
    expect(d.recipe.pages[facingMonthly + 1].side).toBe("recto");
    expect(spreadHeaderMisalignments(d)).toEqual([]);
    void monthlyIdx;
  });
});

describe("daily sections still configurable", () => {
  it("dailySections: false-ish choices reflow (regression guard)", () => {
    const d = doc(addDaily([]), { dailySections: ["schedule", "notes"] });
    const i = d.recipe.pages.findIndex((p) => p.layoutId === "planner-daily");
    const solved = solvePage(d, i);
    expect(solved.diagnostics.filter((x) => x.severity === "error")).toEqual([]);
    expect(solved.nodes.some((n) => n.id === "dy-notes")).toBe(true);
    expect(solved.nodes.some((n) => n.id === "dy-toDo")).toBe(false);
  });
});
