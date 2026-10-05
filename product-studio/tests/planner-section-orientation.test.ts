/**
 * PLANNER SECTION ORIENTATION — per-section page orientation:
 *
 *   each planner section (monthly / weekly / daily) can carry its own page
 *   orientation, so one planner can hold landscape monthlies with portrait
 *   daily/weekly pages; a filler page takes the orientation of the spread it
 *   faces; export offers per-orientation scopes so each print job holds a
 *   single media size.
 */
import { describe, expect, it } from "vitest";
import { resolveDocument, trimForPage } from "../src/engines/document/resolve";
import { planPrint } from "../src/engines/print/printPlan";
import { computeUsage } from "../src/engines/document/usage";
import { plannerSectionOf, plannerSectionsIn, sectionPageOrientationOf } from "../src/layouts/planner/plannerOptions";
import { addDaily, addMonthly, addWeekly } from "../src/engines/recipe/pageBuilder";
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
const settings = (scope: "full" | "landscape-pages" | "portrait-pages") => ({ scope, repeatSheets: false, target: "print-pdf" }) as never;

describe("planner section mapping", () => {
  it("maps planner layouts to their section; other layouts to null", () => {
    expect(plannerSectionOf("planner-monthly")).toBe("monthly");
    expect(plannerSectionOf("planner-weekly-spread")).toBe("weekly");
    expect(plannerSectionOf("weekly-plan-spread")).toBe("weekly");
    expect(plannerSectionOf("weekly-plan-mwg-spread")).toBe("weekly");
    expect(plannerSectionOf("planner-daily")).toBe("daily");
    expect(plannerSectionOf("daily-luxury-execution")).toBe("daily");
    expect(plannerSectionOf("notepad-daily")).toBe("daily");
    expect(plannerSectionOf("notes-page")).toBeNull();
    expect(plannerSectionOf("blank-page")).toBeNull();
  });

  it("plannerSectionsIn lists the present sections in monthly/weekly/daily order", () => {
    expect(plannerSectionsIn(["planner-daily", "planner-monthly"])).toEqual(["monthly", "daily"]);
    expect(plannerSectionsIn(["notes-page"])).toEqual([]);
  });

  it("sectionPageOrientationOf prefers the section override, else the project orientation", () => {
    expect(sectionPageOrientationOf({ plannerPageOrientation: { monthly: "landscape" } }, "portrait", "planner-monthly")).toBe("landscape");
    expect(sectionPageOrientationOf({ plannerPageOrientation: { monthly: "landscape" } }, "portrait", "planner-daily")).toBe("portrait");
    expect(sectionPageOrientationOf({}, "portrait", "planner-monthly")).toBe("portrait");
    expect(sectionPageOrientationOf({ plannerPageOrientation: { monthly: "landscape" } }, "portrait", "notes-page")).toBe("portrait");
  });
});

describe("per-page trim", () => {
  const structure = addDaily(addWeekly(addMonthly([])));

  it("turns the trim for sections with an orientation override", () => {
    const d = doc(structure, { plannerPageOrientation: { monthly: "landscape" } });
    const monthly = d.recipe.pages.find((p) => p.layoutId === "planner-monthly")!;
    const daily = d.recipe.pages.find((p) => p.layoutId === "planner-daily")!;
    const mt = trimForPage(d, monthly, d.recipe.pages.indexOf(monthly));
    const dt = trimForPage(d, daily, d.recipe.pages.indexOf(daily));
    expect(mt.orientation).toBe("landscape");
    expect(mt.widthIn).toBeCloseTo(9, 4);
    expect(mt.heightIn).toBeCloseTo(7, 4);
    expect(dt.orientation).toBe("portrait");
    expect(dt.widthIn).toBeCloseTo(7, 4);
  });

  it("without overrides every page keeps the project trim", () => {
    const d = doc(structure);
    for (const [i, p] of d.recipe.pages.entries()) {
      expect(trimForPage(d, p, i)).toBe(d.trim);
    }
  });

  it("a filler page takes the orientation of the spread it faces", () => {
    const d = doc(structure, { plannerPageOrientation: { weekly: "landscape" } });
    const filler = d.recipe.pages.find((p) => p.filler);
    expect(filler).toBeDefined();
    const i = d.recipe.pages.indexOf(filler!);
    const next = d.recipe.pages.slice(i + 1).find((p) => !p.filler)!;
    expect(plannerSectionOf(next.layoutId)).toBe("weekly");
    expect(trimForPage(d, filler!, i).orientation).toBe("landscape");
  });
});

describe("export with mixed orientations", () => {
  const structure = addDaily(addWeekly(addMonthly([])));
  const mixed = () => doc(structure, { plannerPageOrientation: { monthly: "landscape" } });

  it("landscape-pages scope exports only the landscape pages, with no size error", () => {
    const d = mixed();
    const plan = planPrint(d, settings("landscape-pages"));
    expect(plan.errors).toHaveLength(0);
    expect(plan.sequence.length).toBeGreaterThan(0);
    expect(plan.sequence.every((i) => d.recipe.pages[i].layoutId === "planner-monthly")).toBe(true);
    expect(plan.mediaWidthIn).toBeGreaterThan(plan.mediaHeightIn);
  });

  it("portrait-pages scope exports everything else, with no size error", () => {
    const d = mixed();
    const plan = planPrint(d, settings("portrait-pages"));
    expect(plan.errors).toHaveLength(0);
    expect(plan.sequence.every((i) => d.recipe.pages[i].layoutId !== "planner-monthly")).toBe(true);
    expect(plan.mediaWidthIn).toBeLessThan(plan.mediaHeightIn);
  });

  it("the two orientation scopes partition the whole product", () => {
    const d = mixed();
    const land = new Set(planPrint(d, settings("landscape-pages")).sequence);
    const port = new Set(planPrint(d, settings("portrait-pages")).sequence);
    expect(land.size + port.size).toBe(d.recipe.pageCount);
    expect([...land].some((i) => port.has(i))).toBe(false);
  });

  it("whole-product export of a mixed product reports the size error", () => {
    const d = mixed();
    const plan = planPrint(d, settings("full"));
    expect(plan.errors.some((e) => e.includes("Landscape pages"))).toBe(true);
  });
});

describe("usage", () => {
  const structure = addDaily(addWeekly(addMonthly([])));

  it("reports the present planner sections and whether orientations mix", () => {
    const plain = computeUsage(doc(structure));
    expect(plain.plannerSections).toEqual(["monthly", "weekly", "daily"]);
    expect(plain.mixedPageOrientation).toBe(false);
    const mixedDoc = computeUsage(doc(structure, { plannerPageOrientation: { monthly: "landscape" } }));
    expect(mixedDoc.mixedPageOrientation).toBe(true);
  });
});
