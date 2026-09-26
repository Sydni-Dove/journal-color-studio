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
  /**
   * Composite book structure (optional). When present it defines the book —
   * nested period groups, module steps and cadence — and `items` is ignored
   * for expansion. Projects without it keep the flat step list unchanged.
   */
  structure?: BookNode[];
};

// ─── Composite book recipe ─────────────────────────────────────────────────
/** A page's PURPOSE. Its design is the step's layout (one purpose, many possible layouts). */
export type PageModuleType =
  | "monthly-calendar"
  | "weekly-planner"
  | "daily-planner"
  | "lined-journal"
  | "dot-journal"
  | "blank-journal"
  | "notes"
  | "meeting-with-god"
  | "prayer"
  | "vision"
  | "mission"
  | "goals"
  | "project-planning"
  | "review"
  | "reflection"
  | "tracker"
  | "worksheet"
  | "custom";

/** Where a module's first page may fall in a bound book. */
export type PageStartRule = "any" | "recto" | "verso" | "spread";

export type RecipePeriod = "year" | "quarter" | "month" | "week" | "day";

/**
 * How often a step occurs, relative to the section it sits in (inside
 * "Every Month", "once" means once per month; "weekly" means each week of
 * that month). New cadence types extend this union and one switch in the
 * expansion engine.
 */
export type RecipeCadence =
  | { type: "once" }
  | { type: "copies"; count: number }
  | { type: "yearly" }
  | { type: "quarterly" }
  | { type: "monthly" }
  | { type: "weekly" }
  | { type: "daily" }
  /** Immediately after every occurrence of another step in the same section. */
  | { type: "after-module"; moduleId: string }
  | { type: "end-of-period"; period: "week" | "month" | "quarter" | "year" };

export type BookStep = {
  kind: "step";
  id: string;
  module: PageModuleType;
  layoutId: string;
  cadence: RecipeCadence;
  /** Instances per occurrence (e.g. 2 journal pages after each Meeting With God). Default 1. */
  copies?: number;
  /** Default: "spread" for two-page layouts, otherwise "any". */
  start?: PageStartRule;
  /** Title override (otherwise the module's title for the period). */
  title?: string;
  /** Prompt overrides for guided pages. */
  prompts?: string[];
};

/** A section of the book. With a period it repeats for each period inside its parent. */
export type BookGroup = {
  kind: "group";
  id: string;
  label?: string;
  period?: "year" | "quarter" | "month" | "week";
  children: BookNode[];
};

export type BookNode = BookStep | BookGroup;

/** Module content handed to the layout (title for the period + prompts). */
export type PageModuleContent = { type: PageModuleType; title: string; subtitle?: string; prompts: string[] };

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
  /** Why an intentional filler page exists. */
  fillerReason?: string;
  /** Composite books: the module this page belongs to (purpose, title, prompts). */
  module?: PageModuleContent;
  /** Repeated-sheet metadata (pads). */
  physicalSheets?: number;
};
