import type { ProductType } from "../../types/product";
import type { ProductRecipe } from "../../types/recipe";
import type { LayoutOptions } from "../../types/project";
import { BOOK_PRESETS, meetingsWithGodBook } from "../bookRecipes";

/** Starting page or book recipes. These are not themselves layout choices. */
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
    label: "Writing pages",
    productTypes: ["journal", "notebook"],
    needsCalendar: false,
    build: ({ count }) => ({ items: [{ id: "pages", layoutId: "journal-lined", repeat: { kind: "count", count } }], ordering: "sequential" }),
    layoutOptions: { showPageNumbers: true },
  },
  {
    id: "journal-guided",
    label: "Guided journal pages",
    productTypes: ["journal"],
    needsCalendar: false,
    build: ({ count }) => ({ items: [], ordering: "sequential", structure: [{ kind: "step", id: "guided-entry", module: "reflection", layoutId: "guided-page", cadence: { type: "copies", count: Math.max(1, count) } }] }),
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
    label: "Weekly planning",
    productTypes: ["planner", "insert"],
    needsCalendar: true,
    build: () => ({ items: [{ id: "week", layoutId: "planner-weekly-spread", repeat: { kind: "every-week" } }], ordering: "chronological" }),
    layoutOptions: { showSidebar: true, sidebarContent: "weeklyFocus" },
  },
  {
    id: "planner-daily",
    label: "Daily planning",
    productTypes: ["planner", "insert"],
    needsCalendar: true,
    build: () => ({ items: [{ id: "day", layoutId: "planner-daily", repeat: { kind: "every-day" } }], ordering: "chronological" }),
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
    id: "book-meetings-with-god",
    label: "Meetings With God planner + journal",
    productTypes: ["planner", "journal"],
    needsCalendar: true,
    build: () => ({ items: [], ordering: "chronological", structure: meetingsWithGodBook() }),
    layoutOptions: { showPageNumbers: true },
  },
  {
    id: "book-planner-journal",
    label: "Monthly + weekly planner with journal pages",
    productTypes: ["planner", "journal"],
    needsCalendar: true,
    build: () => ({ items: [], ordering: "chronological", structure: BOOK_PRESETS.find((b) => b.id === "planner-journal")!.build() }),
    layoutOptions: { showPageNumbers: true },
  },
  {
    id: "deskpad-weekly",
    label: "Weekly Desk Pad",
    productTypes: ["deskpad"],
    needsCalendar: false,
    build: ({ sheets }) => ({ items: [{ id: "sheet", layoutId: "deskpad-weekly", repeat: { kind: "repeated-sheet", sheets } }], ordering: "sequential" }),
    layoutOptions: { showSidebar: true, sidebarContent: "priorities", sidebarWidthIn: 2.5 },
  },
  {
    id: "worksheet-guided",
    label: "Guided worksheet",
    productTypes: ["worksheet"],
    needsCalendar: false,
    build: () => ({ items: [], ordering: "sequential", structure: [{ kind: "step", id: "worksheet-page", module: "custom", layoutId: "guided-page", cadence: { type: "once" }, title: "Worksheet", prompts: ["Focus", "Work through it", "Next step"] }] }),
  },
  {
    id: "tracker-weekly",
    label: "Weekly tracker",
    productTypes: ["tracker"],
    needsCalendar: false,
    build: () => ({ items: [], ordering: "sequential", structure: [{ kind: "step", id: "tracker-page", module: "tracker", layoutId: "tracker-weekly", cadence: { type: "once" } }] }),
  },
  {
    id: "custom-guided",
    label: "Custom guided page",
    productTypes: ["custom"],
    needsCalendar: false,
    build: () => ({ items: [], ordering: "sequential", structure: [{ kind: "step", id: "custom-page", module: "custom", layoutId: "guided-page", cadence: { type: "once" } }] }),
  },
];

export function recipePresetsFor(t: ProductType): RecipePreset[] {
  const own = RECIPE_PRESETS.filter((r) => r.productTypes.includes(t));
  return own;
}
