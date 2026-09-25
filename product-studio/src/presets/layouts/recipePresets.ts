import type { ProductType } from "../../types/product";
import type { ProductRecipe } from "../../types/recipe";
import type { LayoutOptions } from "../../types/project";

/** Layout / page-recipe choices offered by the New Product flow per product type. */
export type RecipePreset = {
  id: string;
  label: string;
  productTypes: ProductType[];
  needsCalendar: boolean;
  /** Build the recipe; `count` is pages/copies where relevant, `sheets` for pads. */
  build: (opts: { count: number; sheets: number }) => ProductRecipe;
  layoutOptions?: Partial<LayoutOptions>;
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
    id: "deskpad-weekly",
    label: "Weekly Desk Pad",
    productTypes: ["deskpad"],
    needsCalendar: false,
    build: ({ sheets }) => ({ items: [{ id: "sheet", layoutId: "deskpad-weekly", repeat: { kind: "repeated-sheet", sheets } }], ordering: "sequential" }),
    layoutOptions: { showSidebar: true, sidebarContent: "priorities", sidebarWidthIn: 2.5 },
  },
];

export function recipePresetsFor(t: ProductType): RecipePreset[] {
  const own = RECIPE_PRESETS.filter((r) => r.productTypes.includes(t));
  return own.length ? own : RECIPE_PRESETS;
}
