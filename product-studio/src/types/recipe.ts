import type { PageSide } from "./geometry";

export type RepeatRule =
  | { kind: "once" }
  | { kind: "count"; count: number }
  | { kind: "every-year" }
  | { kind: "every-quarter" }
  | { kind: "every-month" }
  | { kind: "every-week" }
  | { kind: "every-day" }
  /**
   * One master sheet repeated N times physically (pads). The sheet count is
   * manufacturing metadata: the editor shows ONE page.
   */
  | { kind: "repeated-sheet"; sheets: number };

export type RecipeItem = {
  id: string;
  layoutId: string;
  repeat: RepeatRule;
  /** Optional title override for this recipe step (wording key or literal). */
  label?: string;
};

export type RecipeOrdering =
  /** Each item fully expanded before the next. */
  | "sequential"
  /** Periodic items interleaved chronologically (month → its weeks → next month). */
  | "chronological";

export type ProductRecipe = {
  items: RecipeItem[];
  ordering: RecipeOrdering;
};

export type PeriodRef =
  | { kind: "none" }
  | { kind: "copy"; index: number }
  | { kind: "year"; year: number }
  | { kind: "quarter"; key: string }
  | { kind: "month"; key: string }
  | { kind: "week"; key: string }
  | { kind: "day"; iso: string };

export type PageInstance = {
  /** Stable key used for caching solved layouts. */
  key: string;
  recipeItemId: string;
  layoutId: string;
  period: PeriodRef;
  /** 0 or 1 for two-page spread layouts; undefined for single pages. */
  spreadPart?: 0 | 1;
  /** 1-based physical page number in the product. */
  pageNumber: number;
  side: PageSide;
  /** Inserted by the engine to keep a spread starting on a verso. */
  filler?: boolean;
  /** Repeated-sheet metadata (pads). */
  physicalSheets?: number;
};
