/**
 * Facing pages share one header zone: the left and right headers of an open
 * book end at the same height, whatever the two pages are (Daily + Monthly,
 * Monthly + Notes, Journal + Daily, …). Preview and print use the same solve.
 */
import { describe, expect, it } from "vitest";
import { resolveDocument, solvePage } from "../src/engines/document/resolve";
import { addDaily, addMonthly, addWeekly } from "../src/engines/recipe/pageBuilder";
import { spreadHeaderMisalignments } from "../src/engines/validation/spread";
import { BOOK_TEMPLATES } from "../src/presets/layouts/recipePresets";
import { step } from "../src/presets/bookRecipes";
import { createProject } from "../src/presets/products/projectFactory";
import type { BookNode } from "../src/types/recipe";

const book = (structure: BookNode[], size = "7x9", end = "2027-02-28") =>
  createProject("planner", {
    dimensions: { sizePresetId: size, orientation: "portrait" },
    production: { bindingType: "coil", printProfileId: "coil-generic", duplex: true } as never,
    calendar: { startDate: "2027-01-01", endDate: end, weekStart: 0, sixRowMonths: true },
    recipe: { items: [], ordering: "chronological", structure },
  });
const rule = (doc: ReturnType<typeof resolveDocument>, i: number) => solvePage(doc, i).nodes.find((n) => /-header-rule$/.test(n.id))!;
const title = (doc: ReturnType<typeof resolveDocument>, i: number) => solvePage(doc, i).nodes.find((n) => /-header-title$/.test(n.id))!;

describe("facing headers line up", () => {
  it("Daily (Sunday, January 31) facing Monthly (February 2027): one header rule height, title bottoms together", () => {
    const doc = resolveDocument(book(addDaily(addMonthly([]))));
    const feb = doc.recipe.pages.findIndex((p) => p.layoutId === "planner-monthly" && p.period.kind === "month" && p.period.key === "2027-02");
    expect(doc.recipe.pages[feb].side).toBe("recto");
    const left = feb - 1;
    expect(doc.recipe.pages[left].layoutId).toBe("planner-daily");
    expect(rule(doc, left).rect.y).toBeCloseTo(rule(doc, feb).rect.y, 3);
    const tl = title(doc, left).rect, tr = title(doc, feb).rect;
    expect(tl.y + tl.h).toBeCloseTo(tr.y + tr.h, 2);
    expect(spreadHeaderMisalignments(doc)).toEqual([]);
  });

  it("a notes page beside a monthly calendar lines up with it; pages without a facing page keep their own header", () => {
    const doc = resolveDocument(book([step("notes", { type: "copies", count: 1 }), ...addMonthly([])]));
    expect(spreadHeaderMisalignments(doc)).toEqual([]);
    const solo = resolveDocument({ ...book(addDaily([])), production: { bindingType: "coil", printProfileId: "coil-generic", duplex: false } as never });
    const i = solo.recipe.pages.findIndex((p) => p.layoutId === "planner-daily");
    expect(solvePage(solo, i).nodes.find((n) => n.id === "p0-header")!.rect.h).toBeCloseTo(0.6, 6);
  });

  for (const size of ["8.5x11", "7x9", "5.5x8.5"]) {
    it(`${size}: every template book, every opening`, () => {
      for (const t of BOOK_TEMPLATES) {
        const p = book(t.build({ count: 1, sheets: 1 }).structure!, size, "2027-02-28");
        expect(spreadHeaderMisalignments(resolveDocument({ ...p, layoutOptions: { ...p.layoutOptions, ...(t.layoutOptions ?? {}) } })), `${t.id} ${size}`).toEqual([]);
      }
      expect(spreadHeaderMisalignments(resolveDocument(book(addDaily(addWeekly(addMonthly([])))))), "monthly + weekly + daily").toEqual([]);
    });
  }
});
