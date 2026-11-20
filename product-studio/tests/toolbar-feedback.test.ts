/**
 * Toolbar feedback (Grocery List and planner builder previews): list-page sections, lines and checkboxes; the
 * checklist layout; yearly calendars; months at the front and throughout; time dividers. Existing products print
 * exactly as before (golden templates are checked separately).
 */
import { describe, expect, it } from "vitest";
import { createProject } from "../src/presets/products/projectFactory";
import { dailyPlannerBook } from "../src/presets/bookRecipes";
import { resolveDocument, solvePage } from "../src/engines/document/resolve";
import { validateProject } from "../src/engines/validation/validate";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { addMonthly, addMonthsAtFront, addTimeDividers, addWeekly, addYearlyCalendar, hasMonthsThroughout, monthsAtFront } from "../src/engines/recipe/pageBuilder";
import { miniMonthWeeks } from "../src/layouts/planner/yearlyCalendar";
import { moveNode } from "../src/engines/recipe/bookEdit";
import type { ProductProject } from "../src/types/project";
import type { BookNode } from "../src/types/recipe";

const texts = (p: ProductProject, i = 0) => solvePage(resolveDocument(p), i).nodes.filter((n) => n.type === "text").map((n) => (n as { text: string }).text);
const pad = (layoutId: string, listPage?: ProductProject["layoutOptions"]["listPage"]) => {
  const p = createProject("notepad", { name: "Pad", recipe: { items: [{ id: "sheet", layoutId, repeat: { kind: "repeated-sheet", sheets: 50 } }], ordering: "sequential" } } as never);
  return listPage ? { ...p, layoutOptions: { ...p.layoutOptions, listPage } } : p;
};
const planner = (structure: BookNode[], start = "2027-01-01", end = "2027-03-31") =>
  createProject("planner", { name: "P", calendar: { startDate: start, endDate: end, weekStart: 0, sixRowMonths: true }, recipe: { items: [], ordering: "chronological", structure } } as never);
const order = (p: ProductProject) => resolveDocument(p).recipe.pages.filter((x) => !x.filler).map((x) => `${x.module?.type}:${x.module?.title}`);

describe("Grocery List: sections, lines and checkboxes", () => {
  it("without options it is the original six categories with square checkboxes", () => {
    const t = texts(pad("notepad-grocery"));
    expect(t).toEqual(expect.arrayContaining(["Grocery List", "Produce", "Dairy", "Pantry", "Frozen", "Household"]));
    const boxes = solvePage(resolveDocument(pad("notepad-grocery")), 0).nodes.filter((n) => n.type === "checkbox") as { radiusIn?: number }[];
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.every((b) => !b.radiusIn)).toBe(true);
  });
  it("custom sections (any number), a set number of lines, circle checkboxes", () => {
    const p = pad("notepad-grocery", { sections: ["Fruit", "Veggies", "Snacks", "Drinks", "Bakery"], lines: 3, marker: "circle" });
    const s = solvePage(resolveDocument(p), 0);
    const t = texts(p);
    expect(t).toEqual(expect.arrayContaining(["Fruit", "Veggies", "Snacks", "Drinks", "Bakery"]));
    expect(t).not.toContain("Produce");
    const boxes = s.nodes.filter((n) => n.type === "checkbox") as { radiusIn?: number }[];
    expect(boxes).toHaveLength(15);
    expect(boxes.every((b) => (b.radiusIn ?? 0) > 0)).toBe(true);
  });
  it("no checkboxes", () => {
    expect(solvePage(resolveDocument(pad("notepad-grocery", { marker: "none" })), 0).nodes.some((n) => n.type === "checkbox")).toBe(false);
  });
  it("more lines than fit: shows what fits and says so", () => {
    const s = solvePage(resolveDocument(pad("notepad-grocery", { lines: 40 })), 0);
    expect(s.diagnostics.some((d) => /40 lines per section don't fit/.test(d.message))).toBe(true);
  });
});

describe("Checklist: the title, then only checkboxes", () => {
  it("draws checkboxes and no writing lines", () => {
    const s = solvePage(resolveDocument(pad("notepad-checklist")), 0);
    expect(texts(pad("notepad-checklist"))).toEqual(["Checklist"]);
    expect(s.nodes.filter((n) => n.type === "checkbox").length).toBeGreaterThan(10);
    expect(s.nodes.some((n) => n.type === "lines")).toBe(false);
  });
  it("set rows and shapes", () => {
    const s = solvePage(resolveDocument(pad("notepad-checklist", { lines: 10, marker: "circle" })), 0);
    const boxes = s.nodes.filter((n) => n.type === "checkbox") as { radiusIn?: number }[];
    expect(boxes).toHaveLength(10);
    expect(boxes.every((b) => (b.radiusIn ?? 0) > 0)).toBe(true);
  });
  it("prints cleanly (no validation issues) at every common pad size", () => {
    for (const size of ["4x6", "5x7", "5.5x8.5", "8.5x11"]) {
      const p = { ...pad("notepad-checklist"), dimensions: { sizePresetId: size, orientation: "portrait" as const } };
      expect(validateProject(p, heuristicMeasurer).issues.filter((i) => i.severity !== "info"), size).toEqual([]);
    }
  });
});

describe("Yearly calendars", () => {
  const year = (layoutId: string, start = "2027-01-01", end = "2027-12-31") => planner([{ kind: "step", id: "y", module: "yearly-calendar", layoutId, cadence: { type: "once" } }], start, end);
  it("mini months are correct calendars (January 2027 starts on a Friday)", () => {
    const w = miniMonthWeeks(2027, 1, 0);
    expect(w[0]).toEqual([null, null, null, null, null, 1, 2]);
    expect(w.flat().filter(Boolean)).toHaveLength(31);
    expect(miniMonthWeeks(2028, 2, 0).flat().filter(Boolean)).toHaveLength(29);
    expect(miniMonthWeeks(2027, 1, 1)[0]).toEqual([null, null, null, null, 1, 2, 3]);
  });
  it("year at a glance: twelve months on one page, titled with the year", () => {
    const t = texts(year("year-at-a-glance"));
    expect(t[0]).toBe("2027");
    for (const m of ["January", "June", "December"]) expect(t).toContain(m);
  });
  it("the spread puts six months on each page", () => {
    const doc = resolveDocument(year("year-at-a-glance-spread"));
    const pages = doc.recipe.pages.map((p, i) => ({ p, i })).filter(({ p }) => p.layoutId === "year-at-a-glance-spread");
    expect(pages).toHaveLength(2);
    const left = solvePage(doc, pages[0].i).nodes.map((n) => (n as { text?: string }).text);
    const right = solvePage(doc, pages[1].i).nodes.map((n) => (n as { text?: string }).text);
    expect(left).toContain("June");
    expect(left).not.toContain("July");
    expect(right).toContain("July");
  });
  it("a July start shows July to June", () => {
    expect(texts(year("year-at-a-glance", "2027-07-01", "2028-06-30"))[0]).toBe("July 2027 – June 2028");
  });
  it("every yearly format prints cleanly on a 7 × 9 planner", () => {
    for (const id of ["year-at-a-glance", "year-at-a-glance-spread", "year-linear", "year-in-pixels"]) {
      const p = { ...year(id), dimensions: { sizePresetId: "7x9", orientation: "portrait" as const } };
      expect(validateProject(p, heuristicMeasurer).issues.filter((i) => i.severity !== "info"), id).toEqual([]);
    }
  });
});

describe("Months at the front, and throughout", () => {
  it("all months print together after the cover; the book keeps its own months too", () => {
    let st = addMonthsAtFront(dailyPlannerBook());
    expect(monthsAtFront(st)).not.toBeNull();
    expect(hasMonthsThroughout(st)).toBe(true);
    const o = order(planner(st));
    expect(o.slice(0, 4)).toEqual(["cover-page:Plan", "monthly-calendar:Month", "monthly-calendar:Month", "monthly-calendar:Month"]);
    // Mission / vision / goals keep their place; the months in the book are still there.
    expect(o.indexOf("mission:Mission")).toBe(4);
    expect(o.filter((x) => x === "monthly-calendar:Month")).toHaveLength(6);
    // A weekly planner with no months: months at the front, and weekly pages added afterwards go in the book, not the front.
    st = addWeekly(addMonthsAtFront([]));
    expect(monthsAtFront(st)!.children).toHaveLength(1);
  });
  it("a yearly calendar goes before the months at the front", () => {
    const st = addYearlyCalendar(addMonthsAtFront(dailyPlannerBook()), "year-at-a-glance");
    expect(order(planner(st)).slice(0, 3)).toEqual(["cover-page:Plan", "yearly-calendar:Year at a Glance", "monthly-calendar:Month"]);
  });
  it("adding monthly to a book that only has months at the front adds them throughout", () => {
    const st = addMonthly(addMonthsAtFront([]));
    expect(hasMonthsThroughout(st)).toBe(true);
  });
});

describe("Dividers by time", () => {
  it("before every month, titled with the month, with a tab", () => {
    const st = addTimeDividers(dailyPlannerBook(), "month");
    const doc = resolveDocument(planner(st));
    const div = doc.recipe.pages.filter((p) => p.module?.type === "divider-page");
    expect(div.map((p) => p.module!.title)).toEqual(["January 2027", "February 2027", "March 2027"]);
  });
  it("before every day, titled with the day, interleaved with that day's page", () => {
    const st = addTimeDividers(dailyPlannerBook(), "day");
    const pages = resolveDocument(planner(st, "2027-01-01", "2027-01-07")).recipe.pages.filter((p) => !p.filler && (p.module?.type === "divider-page" || p.module?.type === "daily-planner"));
    expect(pages.slice(0, 4).map((p) => `${p.module!.type}:${p.module!.type === "divider-page" ? p.module!.title : p.period.kind === "day" ? p.period.iso : ""}`)).toEqual([
      "divider-page:Friday, January 1, 2027", "daily-planner:2027-01-01", "divider-page:Saturday, January 2, 2027", "daily-planner:2027-01-02",
    ]);
  });
  it("a divider with its own title keeps it", () => {
    const st = addTimeDividers(dailyPlannerBook(), "month");
    const named = JSON.parse(JSON.stringify(st).replace('"module":"divider-page"', '"module":"divider-page","title":"Month ahead"')) as BookNode[];
    expect(resolveDocument(planner(named)).recipe.pages.find((p) => p.module?.type === "divider-page")!.module!.title).toBe("Month ahead");
  });
});

describe("Reordering pages (Browse pages ↑ ↓)", () => {
  it("moves a page's step among its neighbours", () => {
    const st = dailyPlannerBook();
    const intro = st.find((n) => n.kind === "group" && !n.period)! as { children: BookNode[] };
    const vision = intro.children.find((n) => n.kind === "step" && n.module === "vision")!;
    const before = order(planner(st, "2027-01-01", "2027-01-31"));
    const moved = order(planner(moveNode(st, vision.id, -1), "2027-01-01", "2027-01-31"));
    expect(before.slice(1, 3)).toEqual(["mission:Mission", "vision:Vision"]);
    expect(moved.slice(1, 3)).toEqual(["vision:Vision", "mission:Mission"]);
    expect(moved.length).toBe(before.length);
  });
  it("a repeating page moves in every month", () => {
    const st = dailyPlannerBook();
    const week = JSON.stringify(st).includes('"meeting-with-god"');
    expect(week).toBe(true);
    const find = (nodes: BookNode[], m: string): BookNode | null => { for (const n of nodes) { if (n.kind === "step" && n.module === m) return n; if (n.kind === "group") { const f = find(n.children, m); if (f) return f; } } return null; };
    const daily = find(st, "daily-planner")!;
    const moved = resolveDocument(planner(moveNode(st, daily.id, -1), "2027-01-01", "2027-02-28")).recipe.pages.filter((p) => !p.filler).map((p) => p.module?.type);
    // In every week the daily pages now come before Meeting With God.
    const i = moved.indexOf("daily-planner"), j = moved.indexOf("meeting-with-god");
    expect(i).toBeLessThan(j);
    expect(moved.lastIndexOf("daily-planner")).toBeLessThan(moved.lastIndexOf("meeting-with-god"));
  });
});
