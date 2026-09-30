/**
 * Product builder (information architecture):
 *   pages      a kind of page is added in the right place; the cover belongs to the whole product
 *   weekly     Classic Weekly days as columns or rows, by choice, both two facing pages
 *   undated    a planner can be undated: no real dates printed, counted months / weeks / days
 */
import { describe, expect, it } from "vitest";
import { getCalendar, undatedRange } from "../src/engines/calendar/calendar";
import { allPageInfo } from "../src/engines/document/pageInfo";
import { resolveDocument, solvePage } from "../src/engines/document/resolve";
import { computeUsage } from "../src/engines/document/usage";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { validateProject } from "../src/engines/validation/validate";
import {
  addDaily, addEndCover, addFrontCover, addMonthly, addToEachMonth, addToEachWeek, addWeekly, builderRows, categoryOf, primaryCategories,
} from "../src/engines/recipe/pageBuilder";
import { bookSteps } from "../src/engines/recipe/bookRecipe";
import { dailyPlannerBook, meetingsWithGodBook } from "../src/presets/bookRecipes";
import { createProject } from "../src/presets/products/projectFactory";
import type { BookNode } from "../src/types/recipe";
import type { LayoutNode } from "../src/types/layout";

type Text = Extract<LayoutNode, { type: "text" }>;
const planner = (structure: BookNode[], extra: Record<string, unknown> = {}) =>
  createProject("planner", {
    name: "Builder",
    dimensions: { sizePresetId: "7x9", orientation: "portrait" },
    production: { bindingType: "coil", printProfileId: "coil-generic", duplex: true } as never,
    calendar: { startDate: "2027-01-01", endDate: "2027-02-28", weekStart: 1, sixRowMonths: true },
    recipe: { items: [], ordering: "chronological", structure },
    ...extra,
  });
const texts = (doc: ReturnType<typeof resolveDocument>, i: number) => solvePage(doc, i).nodes.filter((n): n is Text => n.type === "text").map((n) => n.text);

describe("Pages builder: each kind of page goes in the right place", () => {
  it("starting from Monthly, the cover and end cover can be added at once, first and last", () => {
    const monthly = addMonthly([]);
    const withCovers = addEndCover(addFrontCover(monthly));
    const doc = resolveDocument(planner(withCovers));
    const pages = doc.recipe.pages.filter((p) => !p.filler);
    expect(pages[0].layoutId).toBe("cover-page");
    expect(pages.at(-1)!.layoutId).toBe("back-cover-page");
    expect(pages.filter((p) => p.layoutId === "planner-monthly")).toHaveLength(2);
  });

  it("Monthly → Weekly → Daily nest: each month's calendar, then its weeks, each with its days", () => {
    const s = addDaily(addWeekly(addMonthly([])));
    const doc = resolveDocument(planner(s));
    const seq = doc.recipe.pages.filter((p) => !p.filler && p.spreadPart !== 1).map((p) => (p.layoutId === "planner-monthly" ? "M" : p.module?.type === "weekly-planner" ? "W" : p.layoutId === "planner-daily" ? "D" : "?"));
    expect(seq.join("")).toMatch(/^M(WD{1,7})+M(WD{1,7})+$/);
    expect(doc.recipe.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("the end cover stays last when more pages are added", () => {
    const s = addWeekly(addEndCover(addMonthly([])));
    expect(s.at(-1)).toMatchObject({ kind: "step", module: "back-cover" });
  });

  it("guided journal each week: after the weekly pages, or Meeting With God on the Weekly Plan's facing page", () => {
    const base = addWeekly(addMonthly([]));
    const after = addToEachWeek(base, "reflection");
    const doc = resolveDocument(planner(after));
    const idx = doc.recipe.pages.findIndex((p) => p.module?.type === "reflection");
    expect(doc.recipe.pages[idx - 1].module?.type).toBe("weekly-planner");
    expect(doc.recipe.pages.filter((p) => p.module?.type === "reflection").length).toBe(doc.recipe.pages.filter((p) => p.module?.type === "weekly-planner" && p.spreadPart === 0).length);
    // Meeting With God on the same spread: the Weekly Plan becomes the combined spread (no extra pages).
    const plan = bookSteps(base).find((x) => x.step.module === "weekly-planner")!.step;
    const asPlan = base.map(function swap(n): BookNode { return n.kind === "group" ? { ...n, children: n.children.map(swap) } : n.id === plan.id ? { ...n, layoutId: "weekly-plan-spread" } : n; });
    const same = addToEachWeek(asPlan, "meeting-with-god", "same-spread");
    expect(bookSteps(same).find((x) => x.step.id === plan.id)!.step.layoutId).toBe("weekly-plan-mwg-spread");
    expect(bookSteps(same)).toHaveLength(bookSteps(asPlan).length);
  });

  it("monthly goals and reviews join every month", () => {
    const s = addToEachMonth(addToEachMonth(addMonthly([]), "goals"), "review");
    const rows = builderRows(s);
    expect(rows.filter((r) => r.category === "monthly").map((r) => r.step.module)).toEqual(["monthly-calendar", "goals", "review"]);
    const doc = resolveDocument(planner(s));
    expect(doc.recipe.pages.filter((p) => p.module?.type === "review")).toHaveLength(2);
  });

  it("the template books list under the kinds of page a maker expects", () => {
    const rows = builderRows(meetingsWithGodBook());
    const by = (c: string) => rows.filter((r) => r.category === c).map((r) => r.step.module);
    expect(by("cover")).toEqual(["cover-page", "back-cover"]);
    expect(by("monthly")).toEqual(["monthly-calendar", "review"]);
    expect(by("weekly")).toEqual(["weekly-planner", "meeting-with-god", "lined-journal"]);
    expect(by("yearly")).toEqual(["review"]);
    expect(builderRows(dailyPlannerBook()).filter((r) => r.category === "daily").map((r) => r.step.module)).toEqual(["daily-planner"]);
    expect(primaryCategories("planner")).toEqual(expect.arrayContaining(["cover", "monthly", "weekly", "daily", "dividers"]));
    expect(primaryCategories("journal")).not.toContain("weekly");
    expect(categoryOf(rows[0].step, rows[0].parents)).toBe("cover");
  });
});

describe("Classic Weekly: days as columns or rows, both two facing pages", () => {
  const weekly = (weeklyOrientation?: "vertical" | "horizontal", size = "8.5x11") =>
    planner(addWeekly([]), { dimensions: { sizePresetId: size, orientation: "portrait" }, layoutOptions: { weeklyOrientation } });
  it("Vertical is columns, Horizontal is rows, on the same page size; both are two pages", () => {
    for (const [o, variant] of [["vertical", "vertical"], ["horizontal", "horizontal"]] as const) {
      const doc = resolveDocument(weekly(o));
      const u = computeUsage(doc);
      expect(u.weeklyOrientation).toMatchObject({ supported: true, vertical: true, horizontal: true, current: variant });
      const spread = doc.recipe.pages.filter((p) => p.layoutId === "planner-weekly-spread");
      expect(spread[0].spreadPart).toBe(0);
      expect(spread[1].spreadPart).toBe(1);
      expect(validateProject(doc.project, heuristicMeasurer, { pageIndices: [doc.recipe.pages.indexOf(spread[0]), doc.recipe.pages.indexOf(spread[1])] }).errorCount, o).toBe(0);
    }
    // Rows really are rows: the day tracks are stacked, not side by side.
    const rows = resolveDocument(weekly("horizontal"));
    const i = rows.recipe.pages.findIndex((p) => p.layoutId === "planner-weekly-spread");
    const days = solvePage(rows, i).nodes.filter((n) => /^wk0-d\d$/.test(n.id));
    expect(new Set(days.map((d) => Math.round(d.rect.x * 100))).size).toBe(1);
  });
  it("a narrow insert that cannot take columns uses rows whatever the choice", () => {
    const u = computeUsage(resolveDocument(weekly("vertical", "filofax-personal")));
    expect(u.weeklyOrientation.vertical).toBe(false);
    expect(u.weeklyOrientation.current).toBe("horizontal");
  });
});

describe("Undated planners", () => {
  const undated = (unit: "month" | "week" | "day", count: number, structure: BookNode[], weekStart: 0 | 1 = 1) =>
    planner(structure, { calendar: { startDate: "2027-01-01", endDate: "2027-12-31", weekStart, sixRowMonths: true, undated: { unit, count } } });

  it("the counted range starts on the week's first day of a month, whatever the week start", () => {
    for (const weekStart of [0, 1] as const) {
      const r = undatedRange({ startDate: "", endDate: "", weekStart, sixRowMonths: true, undated: { unit: "month", count: 3 } })!;
      const cal = getCalendar({ startDate: r.startDate, endDate: r.endDate, weekStart, sixRowMonths: true });
      expect(cal.months).toHaveLength(3);
      expect(cal.weeks[0].days.every((d) => d.inRange)).toBe(true);
    }
  });

  it("monthly: 'Month ____' and blank date boxes; the number of months is the quantity", () => {
    const doc = resolveDocument(undated("month", 4, addMonthly([])));
    const months = doc.recipe.pages.filter((p) => p.layoutId === "planner-monthly");
    expect(months).toHaveLength(4);
    const t = texts(doc, doc.recipe.pages.indexOf(months[0]));
    expect(t.some((x) => /^Month _+$/.test(x))).toBe(true);
    expect(t.some((x) => /^\d{1,2}$/.test(x))).toBe(false); // no printed day numbers
    expect(t.join(" ")).not.toMatch(/2001|2006|January|2027/);
  });

  it("weekly: 'Week of ____', weekday names kept, no dates; Sunday or Monday start", () => {
    for (const weekStart of [0, 1] as const) {
      const doc = resolveDocument(undated("week", 6, addWeekly([]), weekStart));
      const spreads = doc.recipe.pages.filter((p) => p.layoutId === "planner-weekly-spread" && p.spreadPart === 0);
      expect(spreads).toHaveLength(6);
      const t = texts(doc, doc.recipe.pages.indexOf(spreads[0]));
      expect(t.some((x) => /^Week of _+$/.test(x))).toBe(true);
      expect(t).toContain(weekStart === 0 ? "Sun" : "Mon");
      expect(t.some((x) => /^\d{1,2}$/.test(x))).toBe(false);
      expect(t.join(" ")).not.toMatch(/Jan|200[16]/);
    }
  });

  it("daily: 'Date ____' and 'Day ____', the rest of the daily page unchanged", () => {
    const dated = resolveDocument(planner(addDaily([])));
    const doc = resolveDocument(undated("day", 10, addDaily([])));
    const days = doc.recipe.pages.filter((p) => p.layoutId === "planner-daily");
    expect(days).toHaveLength(10);
    const i = doc.recipe.pages.indexOf(days[0]);
    const t = texts(doc, i);
    expect(t.some((x) => /^Date _+$/.test(x))).toBe(true);
    expect(t.some((x) => /^Day _+$/.test(x))).toBe(true);
    const body = (d: typeof doc, k: number) => solvePage(d, k).nodes.filter((n) => !/^dy-(header|year|day)/.test(n.id)).map((n) => `${n.id}:${n.rect.x.toFixed(3)},${n.rect.y.toFixed(3)}`);
    expect(body(doc, i)).toEqual(body(dated, dated.recipe.pages.findIndex((p) => p.layoutId === "planner-daily")));
  });

  it("navigation counts the pages instead of dating them", () => {
    const doc = resolveDocument(undated("month", 2, addWeekly(addMonthly([]))));
    const labels = allPageInfo(doc).map((i) => i.dateLabel).filter(Boolean);
    expect(labels).toContain("Month 1");
    expect(labels).toContain("Month 2");
    expect(labels.some((l) => /^Week \d+$/.test(l!))).toBe(true);
    expect(labels.join(" ")).not.toMatch(/200[16]|January/);
  });

  it("a dated planner is unchanged (no undated setting, same pages)", () => {
    const s = addWeekly(addMonthly([]));
    const doc = resolveDocument(planner(s));
    const t = texts(doc, doc.recipe.pages.findIndex((p) => p.layoutId === "planner-monthly"));
    expect(t).toContain("January 2027");
  });
});
