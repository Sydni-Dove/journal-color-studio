import type { ProductType } from "../../types/product";
import type { ProductRecipe } from "../../types/recipe";
import type { LayoutOptions } from "../../types/project";
import { BOOK_PRESETS, dailyPlannerBook, meetingsWithGodBook } from "../bookRecipes";
import { STATIONERY_RECIPES, stationeryLayoutId } from "../stationery/catalog";
import type { StationeryRecipe } from "../../types/stationery";

/** Product types each stationery family is offered in by the New Product flow. */
const STATIONERY_PRODUCT_TYPES: Record<StationeryRecipe["family"], ProductType[]> = {
  devotional: ["devotional"],
  worksheet: ["worksheet"],
  journal: ["journal"],
  planner: ["planner"],
};

/** Every catalog recipe is a New Product choice: pick it, pick a trim, and the page is solved. */
const STATIONERY_PRESETS: RecipePreset[] = STATIONERY_RECIPES.map((r) => ({
  id: stationeryLayoutId(r.comboId),
  label: r.label,
  productTypes: STATIONERY_PRODUCT_TYPES[r.family],
  needsCalendar: false,
  build: ({ count }) => ({
    items: [{ id: "page", layoutId: stationeryLayoutId(r.comboId), repeat: { kind: "count", count: Math.max(1, Math.round(count / r.pages.length)) } }],
    ordering: "sequential",
  }),
}));

/** Layout / page-recipe choices offered by the New Product flow per product type. */
export type RecipePreset = {
  id: string;
  label: string;
  productTypes: ProductType[];
  needsCalendar: boolean;
  /** Build the recipe; `count` is pages/copies where relevant, `sheets` for pads. */
  build: (opts: { count: number; sheets: number }) => ProductRecipe;
  layoutOptions?: Partial<LayoutOptions>;
  /**
   * Set on a complete book (a multi-section recipe that makes the whole
   * product). Those are offered as full product templates — not as a page
   * type — with a plain name, a one-line summary and the page layouts to
   * show as a preview (in order; `#1` names the right-hand page of a spread)
   * — the card shows `card`, or the first two.
   */
  template?: { summary: string; preview: string[]; card?: string[] };
};

export const RECIPE_PRESETS: RecipePreset[] = [
  {
    id: "notepad-todo",
    label: "To-Do List",
    productTypes: ["notepad"],
    needsCalendar: false,
    build: ({ sheets }) => ({ items: [{ id: "sheet", layoutId: "notepad-todo", repeat: { kind: "repeated-sheet", sheets } }], ordering: "sequential" }),
    layoutOptions: { showFooter: true },
  },
  {
    id: "notepad-grocery",
    label: "Grocery List",
    productTypes: ["notepad"],
    needsCalendar: false,
    build: ({ sheets }) => ({ items: [{ id: "sheet", layoutId: "notepad-grocery", repeat: { kind: "repeated-sheet", sheets } }], ordering: "sequential" }),
  },
  {
    id: "notepad-lined",
    label: "Lined Notes",
    productTypes: ["notepad"],
    needsCalendar: false,
    build: ({ sheets }) => ({ items: [{ id: "sheet", layoutId: "notes-page", repeat: { kind: "repeated-sheet", sheets } }], ordering: "sequential" }),
  },
  {
    // Small pads (3×5, 4×6, 5×7 …): just the day's to-do list under a date line.
    id: "notepad-daily-todo",
    label: "Daily To-Do (small pads)",
    productTypes: ["notepad"],
    needsCalendar: false,
    build: ({ sheets }) => ({ items: [{ id: "sheet", layoutId: "notepad-daily", repeat: { kind: "repeated-sheet", sheets } }], ordering: "sequential" }),
    layoutOptions: { dailySections: ["toDo"] },
  },
  {
    id: "notepad-daily",
    label: "Daily Planner (undated)",
    productTypes: ["notepad"],
    needsCalendar: false,
    build: ({ sheets }) => ({ items: [{ id: "sheet", layoutId: "notepad-daily", repeat: { kind: "repeated-sheet", sheets } }], ordering: "sequential" }),
    layoutOptions: { dailySections: ["schedule", "topPriorities", "toDo"] },
  },
  {
    id: "journal-lined",
    label: "Lined / Dot / Graph Pages",
    productTypes: ["journal", "notebook"],
    needsCalendar: false,
    build: ({ count }) => ({ items: [{ id: "pages", layoutId: "journal-lined", repeat: { kind: "count", count } }], ordering: "sequential" }),
    layoutOptions: { showPageNumbers: true },
  },
  {
    id: "planner-monthly",
    label: "Monthly Calendar",
    productTypes: ["planner", "insert"],
    needsCalendar: true,
    build: () => ({ items: [{ id: "month", layoutId: "planner-monthly", repeat: { kind: "every-month" } }], ordering: "chronological" }),
    layoutOptions: { showSidebar: true },
  },
  {
    id: "planner-weekly",
    label: "Weekly Vertical Spread",
    productTypes: ["planner", "insert"],
    needsCalendar: true,
    build: () => ({ items: [{ id: "week", layoutId: "planner-weekly-spread", repeat: { kind: "every-week" } }], ordering: "chronological" }),
    layoutOptions: { showSidebar: true, sidebarContent: "weeklyFocus" },
  },
  {
    id: "planner-daily-page",
    label: "Daily Planner Page",
    productTypes: ["planner", "insert"],
    needsCalendar: true,
    build: () => ({ items: [{ id: "day", layoutId: "planner-daily", repeat: { kind: "every-day" } }], ordering: "chronological" }),
    layoutOptions: { showPageNumbers: true, dailySections: ["schedule", "topPriorities", "toDo"] },
  },
  {
    id: "planner-weekly-plan-spread",
    label: "Weekly Plan Spread",
    productTypes: ["planner", "insert"],
    needsCalendar: true,
    build: () => ({ items: [{ id: "week", layoutId: "weekly-plan-spread", repeat: { kind: "every-week" } }], ordering: "chronological" }),
    layoutOptions: { showPageNumbers: true },
  },
  {
    id: "planner-weekly-mwg",
    label: "Weekly Plan + Meeting With God",
    productTypes: ["planner", "insert"],
    needsCalendar: true,
    build: () => ({ items: [{ id: "week", layoutId: "weekly-plan-mwg-spread", repeat: { kind: "every-week" } }], ordering: "chronological" }),
    layoutOptions: { showPageNumbers: true },
  },
  {
    id: "planner-monthly-weekly",
    label: "Monthly + Weekly + Notes",
    productTypes: ["planner"],
    needsCalendar: true,
    build: ({ count }) => ({
      items: [
        { id: "month", layoutId: "planner-monthly", repeat: { kind: "every-month" } },
        { id: "week", layoutId: "planner-weekly-spread", repeat: { kind: "every-week" } },
        { id: "notes", layoutId: "notes-page", repeat: { kind: "count", count: Math.max(1, count) } },
      ],
      ordering: "chronological",
    }),
    layoutOptions: { showSidebar: true, sidebarContent: "weeklyFocus" },
  },
  {
    id: "book-daily-planner",
    label: "Daily Planner + Meetings With God",
    productTypes: ["planner", "insert"],
    needsCalendar: true,
    build: () => ({ items: [], ordering: "chronological", structure: dailyPlannerBook() }),
    layoutOptions: { showPageNumbers: true, dailySections: ["schedule", "topPriorities", "toDo"] },
    template: { summary: "Includes monthly, weekly, daily and Meetings With God pages.", preview: ["weekly-plan-spread", "weekly-plan-spread#1", "meeting-with-god-spread", "meeting-with-god-spread#1", "planner-daily", "planner-monthly"], card: ["weekly-plan-spread", "planner-daily"] },
  },
  {
    id: "book-meetings-with-god",
    label: "Meetings With God Planner",
    productTypes: ["planner", "journal"],
    needsCalendar: true,
    build: () => ({ items: [], ordering: "chronological", structure: meetingsWithGodBook() }),
    layoutOptions: { showPageNumbers: true },
    template: { summary: "Monthly and weekly planning with Meetings With God journal pages.", preview: ["weekly-plan-spread", "weekly-plan-spread#1", "meeting-with-god-spread", "meeting-with-god-spread#1", "planner-monthly", "journal-lined"] },
  },
  {
    id: "book-meetings-with-god-daily",
    label: "Meetings With God Planner + Daily Pages",
    productTypes: ["planner", "journal"],
    needsCalendar: true,
    build: () => ({ items: [], ordering: "chronological", structure: BOOK_PRESETS.find((b) => b.id === "meetings-with-god-daily")!.build() }),
    layoutOptions: { showPageNumbers: true, dailySections: ["schedule", "topPriorities", "toDo"] },
    template: { summary: "Monthly, weekly, Meetings With God and journal pages, plus a page for every day.", preview: ["weekly-plan-spread", "weekly-plan-spread#1", "meeting-with-god-spread", "meeting-with-god-spread#1", "planner-daily", "journal-lined"], card: ["meeting-with-god-spread", "planner-daily"] },
  },
  {
    id: "book-planner-journal",
    label: "Monthly + Weekly Journal Planner",
    productTypes: ["planner", "journal"],
    needsCalendar: true,
    build: () => ({ items: [], ordering: "chronological", structure: BOOK_PRESETS.find((b) => b.id === "planner-journal")!.build() }),
    layoutOptions: { showPageNumbers: true },
    template: { summary: "Monthly planning, weekly planning and a journal page every week.", preview: ["planner-weekly-spread", "planner-weekly-spread#1", "planner-monthly", "journal-lined"] },
  },
  {
    id: "deskpad-weekly",
    label: "Weekly Desk Pad",
    productTypes: ["deskpad"],
    needsCalendar: false,
    build: ({ sheets }) => ({ items: [{ id: "sheet", layoutId: "deskpad-weekly", repeat: { kind: "repeated-sheet", sheets } }], ordering: "sequential" }),
    layoutOptions: { showSidebar: true, sidebarContent: "priorities", sidebarWidthIn: 2.5 },
  },
];

RECIPE_PRESETS.push(...STATIONERY_PRESETS);

/** Page types for a product: single page layouts only — complete books are templates (below). */
export function recipePresetsFor(t: ProductType): RecipePreset[] {
  const pages = RECIPE_PRESETS.filter((r) => !r.template);
  const own = pages.filter((r) => r.productTypes.includes(t));
  return own.length ? own : pages;
}

/** Full planners & books: complete products to start from (same recipes, same expansion — just offered whole). */
export const BOOK_TEMPLATES: RecipePreset[] = RECIPE_PRESETS.filter((r) => r.template);
