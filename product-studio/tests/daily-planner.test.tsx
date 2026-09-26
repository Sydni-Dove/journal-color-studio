import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getCalendar } from "../src/engines/calendar/calendar";
import { geometryFor, resolveDocument, solvePage } from "../src/engines/document/resolve";
import { structureFromItems } from "../src/engines/recipe/bookEdit";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { validateProject } from "../src/engines/validation/validate";
import { lineSpacingIn } from "../src/engines/patterns/patterns";
import { writingLinePositions, rectContains } from "../src/engines/layout/math";
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

describe("Hybrid weekly writing capacity", () => {
  for (const size of ["8.5x11", "7x9", "6x9"]) {
    it(`${size}: increases all seven day surfaces, retaining pitch, shared rules and the journal page`, () => {
      const doc = book(size, meetingsWithGodBook());
      const i = doc.recipe.pages.findIndex((p) => p.layoutId === "weekly-plan-mwg-spread");
      const page = solvePage(doc, i);
      const days = page.nodes.filter((n) => n.type === "lines" && /^mw0-days-d\d-surface$/.test(n.id));
      expect(days).toHaveLength(7);
      const body = page.regions!.mainContent!;
      const oldHeight = (body.h - doc.spacing.section) * 0.7 / 7 - 2 * doc.spacing.boxPadding;
      const pitch = lineSpacingIn(doc.project.functionalPattern);
      for (const n of days) {
        if (n.type !== "lines") continue;
        expect(n.rect.h).toBeGreaterThan(oldHeight);
        const before = writingLinePositions(0, oldHeight, pitch).length;
        expect(n.positions.length).toBeGreaterThan(before);
        if (size === "8.5x11") expect(n.positions).toHaveLength(3);
        for (let j = 1; j < n.positions.length; j++) expect(n.positions[j] - n.positions[j - 1]).toBeCloseTo(pitch, 8);
      }
      expect(page.nodes.filter((n) => n.type === "checkbox")).toHaveLength(2);
      const grid = page.nodes.find((n) => n.id === "mw0-days")!;
      expect(grid.type).toBe("group");
      expect(page.nodes.filter((n) => n.type === "rule" && n.id.startsWith("mw0-days"))).toHaveLength(7);
      expect(solvePage(doc, i + 1).nodes.filter((n) => n.type === "text").map((n) => n.text)).toEqual(expect.arrayContaining(["Meeting With God", "What did God say?", "Response / action steps"]));
      expect(validateProject(doc.project, heuristicMeasurer, { pageIndices: [i, i + 1] }).issues.filter((x) => x.severity === "error")).toEqual([]);
    });
  }
});

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
    expect(solvePage(doc, 1).nodes.some((n) => n.type === "text" && n.text === "Tuesday, February 29, 2028")).toBe(true);
  });
  for (const size of ["8.5x11", "7x9", "6x9", "a5"]) {
    it(`${size}: all daily pages validate, keep functional nodes inside the safe area, and print like preview`, () => {
      const doc = book(size, [step("daily-planner")]);
      expect(validateProject(doc.project, heuristicMeasurer).issues.filter((x) => x.severity === "error")).toEqual([]);
      doc.recipe.pages.forEach((p, i) => {
        const solved = solvePage(doc, i), g = geometryFor(doc, p);
        for (const n of solved.nodes.filter((n) => n.functional)) expect(rectContains(g.safeRect, n.rect), n.id).toBe(true);
        expect(solved.nodes.filter((n) => n.component === "TimeLabel")).toHaveLength(16);
        const labels = solved.nodes.flatMap((n) => n.type === "text" ? [n.text] : []);
        expect(labels).toEqual(expect.arrayContaining(["Daily Plan", "Schedule", "Priorities", "To Do", "Notes", "6:00 AM", "9:00 PM"]));
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
  it("rejects a small page or invalid hours rather than shrinking schedule rows", () => {
    const doc = book("5x7", [step("daily-planner")]);
    expect(solvePage(doc, 0).diagnostics[0].rule).toBe("layout-incompatible");
    const bad = book("8.5x11", [step("daily-planner")], { layoutOptions: { hourStart: 22, hourEnd: 6 } });
    expect(solvePage(bad, 0).diagnostics[0].message).toMatch(/hours/);
  });
  it("half-hour schedule uses the selected range, at usable row heights", () => {
    const doc = book("8.5x11", [step("daily-planner")], { layoutOptions: { hourStart: 8, hourEnd: 18, halfHours: true } });
    const solved = solvePage(doc, 0);
    expect(solved.nodes.filter((n) => n.component === "TimeLabel")).toHaveLength(21);
    expect(solved.metrics[0].value).toBeGreaterThanOrEqual(0.15);
    expect(validateProject(doc.project, heuristicMeasurer).issues.filter((x) => x.severity === "error")).toEqual([]);
  });
});
