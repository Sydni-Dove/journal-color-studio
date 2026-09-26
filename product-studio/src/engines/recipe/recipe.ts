/**
 * RECIPE ENGINE — expands a product recipe into ordered physical pages.
 *
 * - Periodic rules (year/quarter/month/week/day) read the calendar engine.
 * - "repeated-sheet" yields ONE editor page carrying the physical sheet count
 *   as metadata (a 50-sheet notepad is one master sheet, not 50 pages).
 * - Two-page spread layouts are kept on a verso/recto pair; in paged
 *   products a filler page is inserted when a spread would start on a recto.
 */
import type { CalendarData } from "../../types/calendar";
import type { PageSide } from "../../types/geometry";
import type { PageInstance, PeriodRef, ProductRecipe, RecipeItem } from "../../types/recipe";
import { bookSteps, expandBook } from "./bookRecipe";

export type RecipeContext = {
  calendar: CalendarData | null;
  /** Number of physical pages one instance of a layout occupies (1 or 2). */
  pagesPerInstance: (layoutId: string) => 1 | 2;
  /** True for book-like products where pages alternate recto/verso. */
  paged: boolean;
  /** Layout used for inserted filler pages. */
  fillerLayoutId: string;
  /** Composite books: the period a layout needs, and its label (for diagnostics). */
  layoutPeriod?: (layoutId: string) => "none" | "month" | "week" | "day";
  layoutLabel?: (layoutId: string) => string;
};

export type RecipeDiagnostic = { severity: "error" | "warning" | "info"; itemId: string; message: string };

export type ExpandedRecipe = {
  pages: PageInstance[];
  diagnostics: RecipeDiagnostic[];
  /** Total physical pages (after fillers). */
  pageCount: number;
};

type Unit = {
  item: RecipeItem;
  itemIndex: number;
  period: PeriodRef;
  pages: 1 | 2;
  physicalSheets?: number;
  sort?: { month: string; level: number; date: string };
};

const PERIODIC = new Set(["every-year", "every-quarter", "every-month", "every-week", "every-day"]);

function periodKey(p: PeriodRef): string {
  switch (p.kind) {
    case "none":
      return "once";
    case "copy":
      return `copy${p.index}`;
    case "year":
      return `y${p.year}`;
    case "quarter":
    case "month":
    case "week":
      return p.key;
    case "day":
      return p.iso;
  }
}

function unitsFor(item: RecipeItem, itemIndex: number, ctx: RecipeContext, diags: RecipeDiagnostic[]): Unit[] {
  const pages = ctx.pagesPerInstance(item.layoutId);
  const base = { item, itemIndex, pages };
  const r = item.repeat;
  if (PERIODIC.has(r.kind) && !ctx.calendar) {
    diags.push({ severity: "error", itemId: item.id, message: `"${r.kind}" needs a date range, but the project has no calendar.` });
    return [];
  }
  const cal = ctx.calendar!;
  switch (r.kind) {
    case "once":
      return [{ ...base, period: { kind: "none" } }];
    case "count": {
      if (!Number.isInteger(r.count) || r.count < 1) {
        diags.push({ severity: "error", itemId: item.id, message: `Copy count must be a positive whole number (got ${r.count}).` });
        return [];
      }
      return Array.from({ length: r.count }, (_, i) => ({ ...base, period: { kind: "copy", index: i } as PeriodRef }));
    }
    case "repeated-sheet":
      return [{ ...base, period: { kind: "none" }, physicalSheets: r.sheets }];
    case "every-year":
      return cal.years.map((y) => ({
        ...base,
        period: { kind: "year", year: y.year } as PeriodRef,
        sort: { month: y.monthKeys[0], level: 0, date: `${y.monthKeys[0]}-01` },
      }));
    case "every-quarter":
      return cal.quarters.map((q) => ({
        ...base,
        period: { kind: "quarter", key: q.key } as PeriodRef,
        sort: { month: q.monthKeys[0], level: 1, date: `${q.monthKeys[0]}-01` },
      }));
    case "every-month":
      return cal.months.map((m) => ({
        ...base,
        period: { kind: "month", key: m.key } as PeriodRef,
        sort: { month: m.key, level: 2, date: `${m.key}-01` },
      }));
    case "every-week":
      return cal.weeks.map((w) => ({
        ...base,
        period: { kind: "week", key: w.key } as PeriodRef,
        sort: { month: w.ownerMonthKey, level: 3, date: w.startIso },
      }));
    case "every-day":
      return cal.days
        .filter((d) => d.inRange)
        .map((d) => ({
          ...base,
          period: { kind: "day", iso: d.iso } as PeriodRef,
          sort: { month: d.iso.slice(0, 7), level: 4, date: d.iso },
        }));
  }
}

function compareUnits(a: Unit, b: Unit): number {
  const sa = a.sort!, sb = b.sort!;
  if (sa.month !== sb.month) return sa.month < sb.month ? -1 : 1;
  // Year/quarter/month-level pages lead their month.
  const la = Math.min(sa.level, 3), lb = Math.min(sb.level, 3);
  if (la !== lb) return la - lb;
  if (sa.date !== sb.date) return sa.date < sb.date ? -1 : 1;
  // Same date: week before day, then recipe order.
  if (sa.level !== sb.level) return sa.level - sb.level;
  return a.itemIndex - b.itemIndex;
}

export function orderUnits(recipe: ProductRecipe, ctx: RecipeContext, diags: RecipeDiagnostic[]): Unit[] {
  const perItem = recipe.items.map((item, i) => unitsFor(item, i, ctx, diags));
  if (recipe.ordering === "sequential") return perItem.flat();

  // Chronological: non-periodic items before the first periodic item are
  // front matter; all remaining non-periodic items are back matter; periodic
  // items interleave by month → level → date.
  const firstPeriodic = recipe.items.findIndex((it) => PERIODIC.has(it.repeat.kind));
  if (firstPeriodic < 0) return perItem.flat();
  const front: Unit[] = [], middle: Unit[] = [], back: Unit[] = [];
  recipe.items.forEach((it, i) => {
    if (PERIODIC.has(it.repeat.kind)) middle.push(...perItem[i]);
    else if (i < firstPeriodic) front.push(...perItem[i]);
    else back.push(...perItem[i]);
  });
  middle.sort(compareUnits);
  return [...front, ...middle, ...back];
}

/** The steps a recipe is made of (flat items, or every step of a book structure), for usage / availability. */
export function recipeSteps(recipe: ProductRecipe): { id: string; layoutId: string }[] {
  return recipe.structure ? bookSteps(recipe.structure).map(({ step }) => ({ id: step.id, layoutId: step.layoutId })) : recipe.items;
}

export function expandRecipe(recipe: ProductRecipe, ctx: RecipeContext): ExpandedRecipe {
  // Composite book structure: nested sections + cadence (engines/recipe/bookRecipe).
  if (recipe.structure) return expandBook(recipe.structure, { ...ctx, layoutPeriod: ctx.layoutPeriod ?? (() => "none"), layoutLabel: ctx.layoutLabel ?? ((id) => id) });
  const diagnostics: RecipeDiagnostic[] = [];
  const units = orderUnits(recipe, ctx, diagnostics);
  const pages: PageInstance[] = [];
  let pageNumber = 1;
  let fillerCount = 0;
  const sideOf = (n: number): PageSide => (ctx.paged ? (n % 2 === 1 ? "recto" : "verso") : "single");

  for (const u of units) {
    const pk = periodKey(u.period);
    if (u.pages === 2 && ctx.paged && pageNumber % 2 === 1) {
      // A spread must open on a verso (left page).
      pages.push({
        key: `filler:${fillerCount++}`,
        recipeItemId: u.item.id,
        layoutId: ctx.fillerLayoutId,
        period: { kind: "none" },
        pageNumber,
        side: sideOf(pageNumber),
        filler: true,
      });
      pageNumber++;
    }
    for (let part = 0; part < u.pages; part++) {
      pages.push({
        key: `${u.item.id}:${pk}${u.pages === 2 ? `:${part}` : ""}`,
        recipeItemId: u.item.id,
        layoutId: u.item.layoutId,
        period: u.period,
        spreadPart: u.pages === 2 ? (part as 0 | 1) : undefined,
        pageNumber,
        side: sideOf(pageNumber),
        physicalSheets: u.physicalSheets,
      });
      pageNumber++;
    }
  }
  if (fillerCount) {
    diagnostics.push({
      severity: "info",
      itemId: "recipe",
      message: `${fillerCount} filler page(s) inserted so every two-page spread opens on a left-hand page.`,
    });
  }
  return { pages, diagnostics, pageCount: pages.length };
}
