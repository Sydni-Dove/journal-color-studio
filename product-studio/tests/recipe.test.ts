import { describe, expect, it } from "vitest";
import { buildCalendar } from "../src/engines/calendar/calendar";
import { expandRecipe, type RecipeContext } from "../src/engines/recipe/recipe";
import type { ProductRecipe } from "../src/types/recipe";

const cal = buildCalendar({ startDate: "2027-01-01", endDate: "2027-12-31", weekStart: 1, sixRowMonths: true });
const ctx = (over: Partial<RecipeContext> = {}): RecipeContext => ({
  calendar: cal,
  paged: true,
  fillerLayoutId: "notes-page",
  pagesPerInstance: (id) => (id === "spread" ? 2 : 1),
  ...over,
});

describe("recipe expansion", () => {
  it("count, monthly, weekly, daily", () => {
    const r = (kind: ProductRecipe["items"][0]["repeat"]) => expandRecipe({ items: [{ id: "a", layoutId: "x", repeat: kind }], ordering: "sequential" }, ctx()).pages.length;
    expect(r({ kind: "count", count: 30 })).toBe(30);
    expect(r({ kind: "every-month" })).toBe(12);
    expect(r({ kind: "every-week" })).toBe(cal.weeks.length);
    expect(r({ kind: "every-day" })).toBe(365);
    expect(r({ kind: "every-quarter" })).toBe(4);
    expect(r({ kind: "every-year" })).toBe(1);
  });

  it("a 50-sheet pad is ONE editor page with sheet metadata", () => {
    const e = expandRecipe({ items: [{ id: "s", layoutId: "todo", repeat: { kind: "repeated-sheet", sheets: 50 } }], ordering: "sequential" }, ctx({ paged: false }));
    expect(e.pages).toHaveLength(1);
    expect(e.pages[0].physicalSheets).toBe(50);
    expect(e.pages[0].side).toBe("single");
  });

  it("chronological planner order: front matter → each month followed by its weeks → back matter", () => {
    const e = expandRecipe(
      {
        items: [
          { id: "cover", layoutId: "x", repeat: { kind: "once" } },
          { id: "month", layoutId: "x", repeat: { kind: "every-month" } },
          { id: "goals", layoutId: "x", repeat: { kind: "every-month" } },
          { id: "week", layoutId: "x", repeat: { kind: "every-week" } },
          { id: "notes", layoutId: "x", repeat: { kind: "count", count: 10 } },
        ],
        ordering: "chronological",
      },
      ctx(),
    );
    const ids = e.pages.map((p) => p.recipeItemId);
    expect(ids[0]).toBe("cover");
    expect(ids.slice(1, 3)).toEqual(["month", "goals"]); // January month-level pages first
    expect(ids[3]).toBe("week");
    expect(ids.slice(-10).every((i) => i === "notes")).toBe(true);
    // February month page comes after the last week owned by January.
    const febIndex = e.pages.findIndex((p) => p.period.kind === "month" && p.period.key === "2027-02");
    const before = e.pages[febIndex - 1];
    expect(before.recipeItemId).toBe("week");
    expect(cal.weeks.find((w) => before.period.kind === "week" && w.key === before.period.key)!.ownerMonthKey).toBe("2027-01");
  });

  it("sequential order expands each item fully", () => {
    const e = expandRecipe(
      { items: [{ id: "m", layoutId: "x", repeat: { kind: "every-month" } }, { id: "w", layoutId: "x", repeat: { kind: "every-week" } }], ordering: "sequential" },
      ctx(),
    );
    expect(e.pages.slice(0, 12).every((p) => p.recipeItemId === "m")).toBe(true);
  });

  it("spreads open on a verso; a filler page is inserted when needed", () => {
    const e = expandRecipe({ items: [{ id: "w", layoutId: "spread", repeat: { kind: "count", count: 3 } }], ordering: "sequential" }, ctx());
    expect(e.pages[0].filler).toBe(true);
    expect(e.pageCount).toBe(7);
    for (const p of e.pages.filter((x) => x.spreadPart === 0)) {
      expect(p.side).toBe("verso");
      expect(p.pageNumber % 2).toBe(0);
    }
    expect(e.diagnostics.some((d) => d.message.includes("filler"))).toBe(true);
  });

  it("assigns recto to odd and verso to even page numbers in paged products", () => {
    const e = expandRecipe({ items: [{ id: "a", layoutId: "x", repeat: { kind: "count", count: 4 } }], ordering: "sequential" }, ctx());
    expect(e.pages.map((p) => p.side)).toEqual(["recto", "verso", "recto", "verso"]);
  });

  it("reports periodic items with no calendar", () => {
    const e = expandRecipe({ items: [{ id: "m", layoutId: "x", repeat: { kind: "every-month" } }], ordering: "sequential" }, ctx({ calendar: null }));
    expect(e.pages).toHaveLength(0);
    expect(e.diagnostics[0].severity).toBe("error");
  });

  it("produces stable page keys", () => {
    const r: ProductRecipe = { items: [{ id: "m", layoutId: "x", repeat: { kind: "every-month" } }], ordering: "chronological" };
    expect(expandRecipe(r, ctx()).pages.map((p) => p.key)).toEqual(expandRecipe(r, ctx()).pages.map((p) => p.key));
  });
});
