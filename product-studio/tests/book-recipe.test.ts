/**
 * Composite book recipes: nested sections + cadence expand across the date
 * range into correctly ordered pages, spreads open on a left-hand page, no
 * period is generated twice, fillers are intentional, and existing flat
 * recipes are unchanged.
 */
import { describe, expect, it } from "vitest";
import { getCalendar } from "../src/engines/calendar/calendar";
import { resolveDocument, solvePage, type ResolvedDocument } from "../src/engines/document/resolve";
import { addNode, bookOutline, duplicateNode, moveNode, removeNode, structureFromItems } from "../src/engines/recipe/bookEdit";
import { expandRecipe } from "../src/engines/recipe/recipe";
import { heuristicMeasurer } from "../src/engines/typography/textMeasure";
import { validateProject } from "../src/engines/validation/validate";
import { getLayout, FILLER_LAYOUT_ID } from "../src/layouts/registry";
import { meetingsWithGodBook, section, step } from "../src/presets/bookRecipes";
import { createProject } from "../src/presets/products/projectFactory";
import { TEST_PRODUCTS } from "../src/presets/products/testProducts";
import type { CalendarSettings } from "../src/types/calendar";
import type { BookNode, PageInstance } from "../src/types/recipe";

const Q1: CalendarSettings = { startDate: "2027-01-01", endDate: "2027-03-31", weekStart: 1, sixRowMonths: true };
const YEAR: CalendarSettings = { ...Q1, endDate: "2027-12-31" };

function book(structure: BookNode[], cal: CalendarSettings = Q1, binding: "coil" | "perfect" = "coil") {
  const p = createProject("planner", {
    dimensions: { sizePresetId: "7x9", orientation: "portrait" },
    production: binding === "coil" ? { bindingType: "coil", printProfileId: "coil-generic", duplex: true } : { bindingType: "perfect-bound", printProfileId: "kdp", duplex: true },
    calendar: cal,
    recipe: { items: [], ordering: "chronological", structure },
  });
  return resolveDocument(p);
}
const real = (doc: ResolvedDocument) => doc.recipe.pages.filter((p) => !p.filler);
const errors = (doc: ResolvedDocument) => validateProject(doc.project, heuristicMeasurer, { pageIndices: [] }).issues.filter((i) => i.severity === "error");
const monthsOf = (cal: CalendarSettings) => getCalendar(cal).months.map((m) => m.key);
const weeksOf = (cal: CalendarSettings) => getCalendar(cal).weeks.map((w) => w.key);
const periodKey = (p: PageInstance) => (p.period.kind === "month" || p.period.kind === "week" || p.period.kind === "quarter" ? p.period.key : p.period.kind);

/** Structural invariants every generated book must satisfy. */
function expectSoundBook(doc: ResolvedDocument) {
  const pages = doc.recipe.pages;
  expect(doc.recipe.pageCount).toBe(pages.length);
  pages.forEach((p, i) => expect(p.pageNumber).toBe(i + 1));
  expect(new Set(pages.map((p) => p.key)).size).toBe(pages.length);
  pages.forEach((p, i) => {
    if (p.spreadPart === 0) {
      expect(p.side, `spread at ${p.pageNumber}`).toBe("verso");
      expect(pages[i + 1].spreadPart).toBe(1);
      expect(pages[i + 1].recipeItemId).toBe(p.recipeItemId);
    }
    if (p.filler) {
      expect(p.layoutId).toBe(FILLER_LAYOUT_ID);
      expect(p.fillerReason).toBeTruthy();
      expect(pages[i + 1]?.filler).not.toBe(true);
      // A filler exists only to put the next page on the side it needs.
      expect(pages[i + 1].spreadPart === 0 || pages[i + 1].side !== p.side).toBe(true);
    }
  });
  expect(errors(doc)).toEqual([]);
}

describe("Recipe A — monthly calendar + weekly planner + journal", () => {
  const cal = step("monthly-calendar", { type: "once" });
  const week = step("weekly-planner", { type: "once" });
  const journal = step("lined-journal", { type: "once" });
  const doc = book([section("Every Month", [cal, section("Every Week", [week, journal], "week")], "month")]);

  it("one calendar per month, one spread + one journal per week, each week exactly once", () => {
    const months = real(doc).filter((p) => p.recipeItemId === cal.id).map(periodKey);
    expect(months).toEqual(monthsOf(Q1));
    const weeks = real(doc).filter((p) => p.recipeItemId === week.id && p.spreadPart === 0).map(periodKey);
    expect(weeks).toEqual(weeksOf(Q1));
    expect(real(doc).filter((p) => p.recipeItemId === journal.id)).toHaveLength(weeks.length);
  });
  it("order: each month's calendar, then its weeks (spread → journal)", () => {
    const seq = real(doc).filter((p) => p.spreadPart !== 1).map((p) => (p.recipeItemId === cal.id ? "M" : p.recipeItemId === week.id ? "W" : "J"));
    const expected = monthsOf(Q1).flatMap((m) => ["M", ...getCalendar(Q1).weeks.filter((w) => w.ownerMonthKey === m).flatMap(() => ["W", "J"])]);
    expect(seq).toEqual(expected);
  });
  it("page count = months + 3 × weeks + fillers; the book is sound", () => {
    const fillers = doc.recipe.pages.filter((p) => p.filler).length;
    expect(doc.recipe.pageCount).toBe(monthsOf(Q1).length + 3 * weeksOf(Q1).length + fillers);
    expectSoundBook(doc);
  });
});

describe("Recipe B — monthly calendar + weekly hybrid spread + two journal pages", () => {
  const spread = step("weekly-planner", { type: "once" }, { layoutId: "weekly-plan-mwg-spread" });
  const journal = step("lined-journal", { type: "after-module", moduleId: spread.id }, { copies: 2 });
  const doc = book([section("Every Month", [step("monthly-calendar", { type: "once" }), section("Every Week", [spread, journal], "week")], "month")]);

  it("every hybrid spread is followed by exactly two journal pages of the same week", () => {
    const pages = doc.recipe.pages;
    const starts = pages.map((p, i) => [p, i] as const).filter(([p]) => p.recipeItemId === spread.id && p.spreadPart === 0);
    expect(starts.map(([p]) => periodKey(p))).toEqual(weeksOf(Q1));
    for (const [p, i] of starts) {
      expect(pages[i + 2].recipeItemId).toBe(journal.id);
      expect(pages[i + 3].recipeItemId).toBe(journal.id);
      expect(periodKey(pages[i + 2])).toBe(periodKey(p));
      expect(pages[i + 4]?.recipeItemId).not.toBe(journal.id);
    }
  });
  it("hybrid spread solves both pages (plan | Meeting With God) with no layout errors", () => {
    const i = doc.recipe.pages.findIndex((p) => p.recipeItemId === spread.id);
    const verso = solvePage(doc, i), recto = solvePage(doc, i + 1);
    const texts = (s: typeof verso) => s.nodes.flatMap((n) => (n.type === "text" ? [n.text] : []));
    expect(texts(verso).some((t) => t.startsWith("Week of"))).toBe(true);
    expect(texts(verso)).toContain("Priorities");
    expect(texts(recto)).toEqual(expect.arrayContaining(["Meeting With God", "What did God say?", "Response / action steps"]));
    expect([...verso.diagnostics, ...recto.diagnostics].filter((d) => d.severity === "error")).toEqual([]);
    const v = validateProject(doc.project, heuristicMeasurer, { pageIndices: [i, i + 1] }).issues.filter((x) => x.severity === "error");
    expect(v).toEqual([]);
  });
  it("is sound", () => expectSoundBook(doc));
});

describe("Recipe C — front matter + monthly + weekly + end-of-month review", () => {
  const mission = step("mission"), vision = step("vision"), goals = step("goals");
  const cal = step("monthly-calendar", { type: "once" });
  const week = step("weekly-planner", { type: "once" });
  const review = step("review", { type: "end-of-period", period: "month" });
  const doc = book([section("Front Matter", [mission, vision, goals]), section("Every Month", [cal, section("Every Week", [week], "week"), review], "month")]);

  it("front matter first, in order", () => {
    expect(doc.recipe.pages.slice(0, 3).map((p) => p.recipeItemId)).toEqual([mission.id, vision.id, goals.id]);
    expect(doc.recipe.pages[0].module).toMatchObject({ title: "Mission", prompts: ["My assignment", "Who I serve", "How I carry it out"] });
  });
  it("each month: calendar → its weeks → its review (titled for that month), before the next month", () => {
    const seq = real(doc).filter((p) => p.spreadPart !== 1 && ![mission.id, vision.id, goals.id].includes(p.recipeItemId));
    for (const m of monthsOf(Q1)) {
      const at = seq.findIndex((p) => p.recipeItemId === cal.id && periodKey(p) === m);
      const r = seq.findIndex((p) => p.recipeItemId === review.id && periodKey(p) === m);
      const nWeeks = getCalendar(Q1).weeks.filter((w) => w.ownerMonthKey === m).length;
      expect(r - at).toBe(nWeeks + 1);
      expect(seq[r].module).toMatchObject({ title: "Monthly Review", subtitle: `${["January", "February", "March"][Number(m.slice(5)) - 1]} 2027` });
    }
  });
  it("is sound", () => expectSoundBook(doc));
});

describe("Recipe D — quarterly planning / review structure", () => {
  const plan = step("goals", { type: "once" });
  const cal = step("monthly-calendar", { type: "monthly" });
  const review = step("review", { type: "end-of-period", period: "quarter" });
  const doc = book([section("Every Quarter", [plan, cal, review], "quarter")], YEAR);

  it("four quarters: quarterly goals → its three months → quarterly review", () => {
    const seq = real(doc).map((p) => `${p.recipeItemId === plan.id ? "G" : p.recipeItemId === cal.id ? "M" : "R"}:${periodKey(p)}`);
    expect(seq).toEqual(
      getCalendar(YEAR).quarters.flatMap((q) => [`G:${q.key}`, ...q.monthKeys.map((m) => `M:${m}`), `R:${q.key}`]),
    );
    const goalTitles = real(doc).filter((p) => p.recipeItemId === plan.id).map((p) => p.module!.title);
    expect(new Set(goalTitles)).toEqual(new Set(["Quarterly Goals"]));
    expect(real(doc).filter((p) => p.recipeItemId === review.id).map((p) => p.module!.subtitle)).toEqual(["Q1 2027", "Q2 2027", "Q3 2027", "Q4 2027"]);
  });
  it("12 months and 4 reviews, nothing duplicated, sound", () => {
    expect(real(doc).filter((p) => p.recipeItemId === cal.id)).toHaveLength(12);
    expect(real(doc).filter((p) => p.recipeItemId === review.id)).toHaveLength(4);
    expectSoundBook(doc);
  });
});

describe("Flat cadence list (no sections) interleaves by date", () => {
  // 1 Vision once · 2 Goals once · 3 Monthly calendar every month · 4 Weekly planner every week ·
  // 5 Meeting With God after every weekly planner · 6 Journal ×2 after Meeting With God ·
  // 7 Monthly Review end of month · 8 Quarterly Review every quarter end.
  const vision = step("vision"), goals = step("goals");
  const cal = step("monthly-calendar", { type: "monthly" });
  const week = step("weekly-planner", { type: "weekly" });
  const mwg = step("meeting-with-god", { type: "after-module", moduleId: week.id });
  const journal = step("lined-journal", { type: "after-module", moduleId: mwg.id }, { copies: 2 });
  const mReview = step("review", { type: "end-of-period", period: "month" });
  const qReview = step("review", { type: "end-of-period", period: "quarter" });
  const doc = book([vision, goals, cal, week, mwg, journal, mReview, qReview], YEAR, "perfect");

  it("expands for the whole year with the expected order and counts", () => {
    const tag = (p: PageInstance) => ({ [vision.id]: "V", [goals.id]: "G", [cal.id]: "M", [week.id]: "W", [mwg.id]: "X", [journal.id]: "J", [mReview.id]: "r", [qReview.id]: "Q" })[p.recipeItemId];
    const seq = real(doc).filter((p) => p.spreadPart !== 1).map(tag).join("");
    expect(seq.startsWith("VGM")).toBe(true);
    expect(seq.match(/M/g)).toHaveLength(12);
    expect(seq.match(/WXJJ/g)).toHaveLength(weeksOf(YEAR).length);
    expect(seq.match(/r/g)).toHaveLength(12);
    expect(seq.match(/Q/g)).toHaveLength(4);
    // March review then Q1 review, then April's calendar.
    expect(seq).toMatch(/rQM/);
    expect(seq.endsWith("rQ")).toBe(true);
    expectSoundBook(doc);
  });
});

describe("start rules, fillers and validation", () => {
  it("a module that must start on a right-hand page gets one intentional filler when needed", () => {
    const a = step("vision"), b = step("goals", { type: "once" }, { start: "recto" });
    const doc = book([a, b]);
    expect(doc.recipe.pages.map((p) => (p.filler ? "F" : p.recipeItemId === a.id ? "A" : "B"))).toEqual(["A", "F", "B"]);
    expect(doc.recipe.pages[2].side).toBe("recto");
    expectSoundBook(doc);
  });
  it("a weekly spread outside a week reports missing dates instead of generating broken pages", () => {
    const doc = book([step("weekly-planner", { type: "once" })]);
    expect(doc.recipe.pages).toHaveLength(0);
    expect(errors(doc).some((e) => e.rule === "book-structure" && /needs a week/.test(e.message))).toBe(true);
  });
  it("invalid cadence and a broken 'after' are reported", () => {
    const doc = book([step("notes", { type: "copies", count: 0 }), step("lined-journal", { type: "after-module", moduleId: "missing" })]);
    const msgs = errors(doc).map((e) => e.message).join("\n");
    expect(msgs).toMatch(/positive whole number/);
    expect(msgs).toMatch(/not in the same section/);
  });
  it("a cadence with no periods in its section is reported (monthly inside Every Week)", () => {
    const doc = book([section("Every Week", [step("monthly-calendar", { type: "monthly" })], "week")]);
    expect(errors(doc).some((e) => /no months inside this week section/.test(e.message))).toBe(true);
  });
  it("the Meetings With God book (full year) is sound, and every page solves without errors", () => {
    const doc = book(meetingsWithGodBook(), YEAR);
    expectSoundBook(doc);
    const kinds = new Map<string, number>();
    doc.recipe.pages.forEach((p, i) => kinds.has(p.layoutId + (p.spreadPart ?? "")) || kinds.set(p.layoutId + (p.spreadPart ?? ""), i));
    for (const i of kinds.values()) expect(solvePage(doc, i).diagnostics.filter((d) => d.severity === "error"), doc.recipe.pages[i].layoutId).toEqual([]);
  });
});

describe("backwards compatibility and editing", () => {
  it("existing flat recipes expand exactly as before, and convert to an identical book structure", () => {
    for (const t of TEST_PRODUCTS) {
      const p = t.build();
      const doc = resolveDocument(p);
      const conv = resolveDocument({ ...p, recipe: { ...p.recipe, structure: structureFromItems(p.recipe) } });
      const sig = (d: ResolvedDocument) => d.recipe.pages.map((x) => `${x.layoutId}|${x.filler ? "F" : periodKey(x)}|${x.side}|${x.spreadPart ?? ""}`);
      if (p.recipe.items.some((i) => i.repeat.kind === "repeated-sheet")) continue; // pads: one master sheet
      expect(sig(conv), t.label).toEqual(sig(doc));
    }
  });
  it("legacy expansion is untouched when no structure is present", () => {
    const p = TEST_PRODUCTS[3].build();
    const a = expandRecipe(p.recipe, { calendar: getCalendar(p.calendar!), paged: true, fillerLayoutId: FILLER_LAYOUT_ID, pagesPerInstance: (id) => getLayout(id).pages });
    expect(a.pages.every((x) => x.module === undefined)).toBe(true);
  });
  it("move / duplicate / remove / add; duplicating a section re-points its 'after' steps to the copies", () => {
    const w = step("weekly-planner", { type: "once" }), j = step("lined-journal", { type: "after-module", moduleId: w.id });
    const wk = section("Every Week", [w, j], "week");
    let s: BookNode[] = [section("Every Month", [step("monthly-calendar", { type: "once" }), wk], "month")];
    s = duplicateNode(s, wk.id);
    const month = s[0] as Extract<BookNode, { kind: "group" }>;
    const copy = month.children[2] as Extract<BookNode, { kind: "group" }>;
    expect(copy.id).not.toBe(wk.id);
    const [cw, cj] = copy.children as Extract<BookNode, { kind: "step" }>[];
    expect(cj.cadence).toEqual({ type: "after-module", moduleId: cw.id });
    s = moveNode(s, copy.id, -1);
    expect((s[0] as typeof month).children[1].id).toBe(copy.id);
    s = removeNode(s, copy.id);
    expect((s[0] as typeof month).children.map((c) => c.id)).toEqual([month.children[0].id, wk.id]);
    s = addNode(s, month.id, step("review", { type: "end-of-period", period: "month" }));
    expect((s[0] as typeof month).children).toHaveLength(3);
  });
  it("the outline lists module occurrences (not every page) with month headings", () => {
    const doc = book(meetingsWithGodBook());
    const owner = new Map(doc.calendar!.weeks.map((w) => [w.key, w.ownerMonthKey]));
    const rows = bookOutline(doc.recipe, (id) => getLayout(id).label, owner, (k) => k);
    expect(rows.filter((r) => r.kind === "heading").map((r) => r.label)).toEqual(monthsOf(Q1));
    const spreadRows = rows.filter((r) => r.kind === "pages" && r.label.startsWith("Week of"));
    expect(spreadRows).toHaveLength(weeksOf(Q1).length);
    for (const r of spreadRows) if (r.kind === "pages") expect(r.to - r.from).toBe(1);
    expect(rows.some((r) => r.kind === "pages" && r.label === "Journal × 2")).toBe(true);
  });
});
