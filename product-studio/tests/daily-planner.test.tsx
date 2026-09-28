import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getCalendar } from "../src/engines/calendar/calendar";
import { geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { structureFromItems } from "../src/engines/recipe/bookEdit";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { validateProject } from "../src/engines/validation/validate";
import { rectContains } from "../src/engines/layout/math";
import { meetingsWithGodBook, step } from "../src/presets/bookRecipes";
import { createProject, type ProjectPatch } from "../src/presets/products/projectFactory";
import { PrintablePage } from "../src/primitives/PrintablePage";
import type { BookNode } from "../src/types/recipe";

const CAL = { startDate: "2027-01-29", endDate: "2027-02-03", weekStart: 1 as const, sixRowMonths: true };
function book(size = "8.5x11", structure: BookNode[] = meetingsWithGodBook(true), patch: ProjectPatch = {}) {
  return resolveDocument(createProject("planner", {
    dimensions: { sizePresetId: size, orientation: "portrait" },
    production: { bindingType: "coil", printProfileId: "coil-generic", duplex: true },
    calendar: CAL, recipe: { items: [], ordering: "chronological", structure },
    layoutOptions: { showPageNumbers: true }, ...patch,
  }));
}

/*
 * From the codex/meetings-with-god-daily-capacity draft (4aa5ff1), merged with
 * codex/reusable-covers-dividers. Kept: the recipe-level daily checks, which
 * hold for the current daily planner and exercise the "Meetings With God
 * planner + daily pages" preset. Not kept: the draft's page-design checks
 * (seven stacked weekly day rows, its hourly-grid daily page), whose layouts
 * were superseded before the merge — the current weekly 2 × 4 grid and daily
 * page are covered by daily-planner.test.ts and daily-configurable.test.ts
 * (capacity at every size, leap day, safe area, hour ranges, half hours).
 */
describe("Daily planner and composite recipes", () => {
  it("generates exactly the selected days across partial weeks/months, alongside every existing module", () => {
    const doc = book();
    const daily = doc.recipe.pages.filter((p) => p.layoutId === "planner-daily");
    expect(daily.map((p) => p.period.kind === "day" && p.period.iso)).toEqual(getCalendar(CAL).days.filter((d) => d.inRange).map((d) => d.iso));
    expect(new Set(doc.recipe.pages.map((p) => p.key)).size).toBe(doc.recipe.pageCount);
    for (const id of ["planner-monthly", "weekly-plan-mwg-spread", "journal-lined", "guided-page"]) expect(doc.recipe.pages.some((p) => p.layoutId === id)).toBe(true);
    for (const [i, p] of doc.recipe.pages.entries()) {
      expect(p.pageNumber).toBe(i + 1);
      if (p.spreadPart === 0) {
        expect(p.side).toBe("verso");
        expect(doc.recipe.pages[i + 1].spreadPart).toBe(1);
      }
    }
  });
  it("daily pages remain optional for saved/default Meetings With God recipes", () => {
    const doc = book("8.5x11", meetingsWithGodBook());
    expect(doc.recipe.pages.some((p) => p.layoutId === "planner-daily")).toBe(false);
  });
  it("a week crossing the month boundary owns its daily pages exactly once", () => {
    const doc = book("7x9", meetingsWithGodBook(true), { calendar: { ...CAL, weekStart: 0 } });
    const pages = doc.recipe.pages.filter((p) => p.layoutId === "planner-daily");
    expect(pages.map((p) => p.period.kind === "day" && p.period.iso)).toEqual(["2027-01-29", "2027-01-30", "2027-01-31", "2027-02-01", "2027-02-02", "2027-02-03"]);
    expect(doc.calendar!.weeks.some((w) => w.startIso === "2027-01-31" && w.ownerMonthKey === "2027-01")).toBe(true);
    expect(doc.recipe.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
  it("supports a separate Meeting With God module and journal after each daily page", () => {
    const daily = step("daily-planner");
    const meeting = step("meeting-with-god", { type: "after-module", moduleId: daily.id });
    const doc = book("8.5x11", [daily, meeting, step("lined-journal", { type: "after-module", moduleId: meeting.id })]);
    expect(doc.recipe.pages).toHaveLength(18);
    expect(doc.recipe.pages.slice(0, 3).map((p) => p.module?.type)).toEqual(["daily-planner", "meeting-with-god", "lined-journal"]);
  });
  it("leap day is generated once, with the correct weekday", () => {
    const doc = book("8.5x11", [step("daily-planner")], { calendar: { ...CAL, startDate: "2028-02-28", endDate: "2028-03-01" } });
    expect(doc.recipe.pageCount).toBe(3);
    expect(doc.recipe.pages[1].period).toEqual({ kind: "day", iso: "2028-02-29" });
    expect(solvePage(doc, 1).nodes.some((n) => n.type === "text" && /Tuesday/.test(n.text) && /February/.test(n.text) && /\b29\b/.test(n.text))).toBe(true);
  });
  for (const size of ["8.5x11", "7x9", "6x9", "a5"]) {
    it(`${size}: all daily pages validate, keep functional nodes inside the safe area, and print like preview`, () => {
      const doc = book(size, [step("daily-planner")]);
      expect(validateProject(doc.project, heuristicMeasurer).issues.filter((x) => x.severity === "error")).toEqual([]);
      doc.recipe.pages.forEach((p, i) => {
        const solved = solvePage(doc, i), g = geometryFor(doc, p);
        for (const n of solved.nodes.filter((n) => n.functional)) expect(rectContains(g.safeRect, n.rect), n.id).toBe(true);
        const props = { geometry: g, solved, colors: doc.colors, typography: doc.typography, decorative: doc.decorative, spacing: doc.spacing };
        const strip = (s: string) => s.replace("ps-page--editor", "").replace("ps-page--print", "");
        expect(strip(renderToStaticMarkup(<PrintablePage {...props} mode="editor" />))).toBe(strip(renderToStaticMarkup(<PrintablePage {...props} mode="print" />)));
      });
    });
  }
  it("flat daily recipes convert to the daily module without changing dates", () => {
    const recipe = { items: [{ id: "d", layoutId: "planner-daily", repeat: { kind: "every-day" as const } }], ordering: "chronological" as const };
    const p = createProject("planner", { calendar: CAL, recipe });
    const flat = resolveDocument(p);
    const structure = structureFromItems(recipe);
    expect(structure[0]).toMatchObject({ module: "daily-planner", cadence: { type: "daily" } });
    expect(resolveDocument({ ...p, recipe: { ...recipe, structure } }).recipe.pages.map((p) => p.period)).toEqual(flat.recipe.pages.map((p) => p.period));
  });
});
