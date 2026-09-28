/**
 * Page navigation metadata: every generated page gets a plain-language type
 * and, where it has them, a title and a date — from the page's own metadata,
 * never from its page number. Navigation never changes the book.
 */
import { describe, expect, it } from "vitest";
import { resolveDocument } from "../src/engines/document/resolve";
import { allPageInfo, jumpTargets, pageSummary, PAGE_CATEGORIES } from "../src/engines/document/pageInfo";
import { dailyPlannerBook, meetingsWithGodBook, neutralLuxeDividers, step } from "../src/presets/bookRecipes";
import { RECIPE_PRESETS } from "../src/presets/layouts/recipePresets";
import { createProject } from "../src/presets/products/projectFactory";
import { LAYOUTS } from "../src/layouts/registry";

const bigBook = () =>
  createProject("planner", {
    name: "Big book", dimensions: { sizePresetId: "7x9", orientation: "portrait" },
    production: { bindingType: "coil", printProfileId: "coil-generic", duplex: true },
    calendar: { startDate: "2027-01-01", endDate: "2027-12-31", weekStart: 0, sixRowMonths: true },
    recipe: { items: [], ordering: "chronological", structure: [...neutralLuxeDividers(), ...dailyPlannerBook()] },
  });

describe("page info", () => {
  const doc = resolveDocument(bigBook());
  const info = allPageInfo(doc);
  const internal = new RegExp(`\\b(${LAYOUTS.map((l) => l.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b|stationery:|book-|module`);

  it("a large book: every page has a plain-language type label; no internal ids anywhere", () => {
    expect(doc.recipe.pageCount).toBeGreaterThan(500);
    expect(info).toHaveLength(doc.recipe.pageCount);
    for (const i of info) {
      expect(i.typeLabel, `page ${i.pageNumber}`).toBeTruthy();
      expect(pageSummary(i), `page ${i.pageNumber}`).not.toMatch(internal);
      expect(i.pageNumber).toBe(i.index + 1);
    }
    const cats = new Set(info.map((i) => i.category));
    for (const c of ["cover", "divider", "monthly", "weekly", "meeting", "daily", "reflection", "notes"]) expect(cats.has(c as never), c).toBe(true);
  });

  it("labels read like the book: cover, divider names, months, week ranges, days, Meeting With God", () => {
    const first = (c: string) => info.find((i) => i.category === c)!;
    expect(pageSummary(first("cover"))).toBe("Cover — Plan");
    expect(info.filter((i) => i.category === "divider").map((i) => i.title)).toEqual(["Prayer", "Vision", "Plan", "Schedule", "Work", "Home", "Wellness", "Finances", "Notes"]);
    expect(pageSummary(first("monthly"))).toBe("Monthly Planner — January 2027");
    expect(first("weekly").dateLabel).toBe("Dec 27, 2026 – Jan 2, 2027");
    expect(first("weekly").spread).toBe("left");
    expect(first("meeting").typeLabel).toBe("Meeting With God");
    expect(pageSummary(first("daily"))).toBe("Daily Planner — Friday, January 1");
    expect(info.find((i) => i.category === "reflection")!.title).toMatch(/Review/);
    // Weekly and Meeting With God spreads alternate, each followed by that week's days.
    const w = first("weekly").index;
    expect(info.slice(w, w + 5).map((i) => i.category)).toEqual(["weekly", "weekly", "meeting", "meeting", "daily"]);
  });

  it("types come from metadata, not page position: the one-page hybrid's right page is Meeting With God; stationery is named", () => {
    const hybrid = resolveDocument(createProject("planner", { calendar: { startDate: "2027-01-01", endDate: "2027-01-31", weekStart: 1, sixRowMonths: true }, recipe: { items: [{ id: "w", layoutId: "weekly-plan-mwg-spread", repeat: { kind: "every-week" } }], ordering: "chronological" } }));
    const hi = allPageInfo(hybrid).filter((i) => !i.filler);
    expect(hi.slice(0, 2).map((i) => i.category)).toEqual(["weekly", "meeting"]);
    const soap = RECIPE_PRESETS.find((r) => r.id.includes("devotional-soap"))!;
    const sdoc = resolveDocument(createProject("devotional", { recipe: soap.build({ count: 2, sheets: 1 }) }));
    expect(pageSummary(allPageInfo(sdoc)[0])).toMatch(/^Devotional — SOAP/);
  });

  it("jump targets: every month, every divider section, the first page of each type", () => {
    const t = jumpTargets(doc);
    expect(t.filter((x) => x.group === "Months").map((x) => x.label)).toHaveLength(12);
    expect(t.filter((x) => x.group === "Months")[2].label).toBe("March 2027");
    const march = t.find((x) => x.label === "March 2027")!;
    expect(info[march.index].monthKey).toBe("2027-03");
    // A month opens at its own section (its calendar), even when earlier pages are dated in it (June 1–5 sit in May's last week).
    for (const m of t.filter((x) => x.group === "Months")) expect(info[m.index].category, m.label).toBe("monthly");
    expect(t.filter((x) => x.group === "Sections").map((x) => x.label)).toContain("Prayer");
    const daily = t.find((x) => x.group === "Page types" && /daily/i.test(x.label))!;
    expect(info[daily.index].category).toBe("daily");
  });

  it("reading page info never changes the book (order, count, keys)", () => {
    const before = resolveDocument(bigBook()).recipe.pages.map((p) => `${p.layoutId}|${p.pageNumber}|${p.side}`);
    allPageInfo(doc);
    jumpTargets(doc);
    expect(doc.recipe.pages.map((p) => `${p.layoutId}|${p.pageNumber}|${p.side}`)).toEqual(before);
    expect(PAGE_CATEGORIES.map((c) => c.label)).toContain("Meeting With God");
  });
});

it("Meetings With God planner labels its journal pages", () => {
  const d = resolveDocument(createProject("planner", { calendar: { startDate: "2027-01-01", endDate: "2027-01-31", weekStart: 1, sixRowMonths: true }, recipe: { items: [], ordering: "chronological", structure: [...meetingsWithGodBook(), step("notes", { type: "once" })] } }));
  const cats = new Set(allPageInfo(d).map((i) => i.category));
  expect([...cats]).toEqual(expect.arrayContaining(["weekly", "meeting", "journal", "monthly", "notes"]));
});
