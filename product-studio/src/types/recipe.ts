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
  /** Guided Lined Pages in the simple page list: the page title and its prompt sections (as a book step has). */
  title?: string;
  promptSet?: import("./prompts").PromptSet;
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
  | "cover-page"
  | "back-cover"
  | "divider-page"
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
  | "devotional"
  | "guided"
  | "tracker"
  | "worksheet"
  | "custom";

/** The cadence kinds (RecipeCadence["type"]); each module declares which of them make sense for it. */
export type CadenceKind = "once" | "copies" | "yearly" | "quarterly" | "monthly" | "weekly" | "daily" | "after-module" | "end-of-period";

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
  /**
   * Title override (otherwise the module's title for the period). Inside a section that repeats
   * per list entry, `{fieldKey}` is replaced by that entry's value (`{#}` = its place in the list;
   * `{day|#}` = the day field, else its place).
   */
  title?: string;
  /** Inside a per-entry section: the line beside the title ("Day {day|#}"), with the same `{…}` fields. */
  subtitle?: string;
  /** Cover / divider page settings (absent on other pages and legacy projects). */
  cover?: CoverDividerSettings;
  /** Prompt overrides for guided pages (saved before prompt blocks; still read). */
  prompts?: string[];
  /** Prompt + response blocks for guided pages (wins over `prompts`). */
  /** A page made from a saved page design (ProductProject.pageDesigns): which one. */
  designId?: string;
  promptSet?: import("./prompts").PromptSet;
};

/** A section of the book. With a period it repeats for each period inside its parent. */
export type BookGroup = {
  kind: "group";
  id: string;
  label?: string;
  period?: "year" | "quarter" | "month" | "week";
  /**
   * Repeat this section once per entry of a content list (ProductProject.data), in the list's
   * order. Its pages read that entry's values: sections whose `content.key` names one of the
   * list's fields print it (engines/data/bind.ts). Not combined with `period`.
   */
  entries?: { collectionId: string };
  children: BookNode[];
  /**
   * Pages added from a saved page design ("Project Snapshot × 8"): each child
   * is its own page with its own copy of the design's sections, so editing one
   * never changes the others or the saved design.
   */
  designId?: string;
};

export type BookNode = BookStep | BookGroup;

/** Module content handed to the layout (title for the period + prompts). */
export type PageModuleContent = {
  type: PageModuleType;
  title: string;
  subtitle?: string;
  /** Plain prompt list (pages saved before prompt blocks, and module defaults). */
  prompts: string[];
  /** Prompt + response blocks chosen by the creator (types/prompts.ts); wins over `prompts`. */
  promptSet?: import("./prompts").PromptSet;
  /** Cover / divider page settings (absent on other pages). */
  cover?: CoverDividerSettings;
  /**
   * Record sections: the number this instance's first record gets, by section id —
   * assigned in book order by the recipe, so numbering runs across the whole product.
   */
  sequenceStarts?: Record<string, number>;
};

export type PeriodRef =
  | { kind: "none" }
  | { kind: "copy"; index: number }
  | { kind: "year"; year: number }
  | { kind: "quarter"; key: string }
  | { kind: "month"; key: string }
  | { kind: "week"; key: string }
  | { kind: "day"; iso: string }
  /** One entry of a content list (ProductProject.data): its stable id and its place in the list (0-based). */
  | { kind: "entry"; collectionId: string; recordId: string; index: number };

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
  /** Content that continues on more pages (prompts that don't fit one page): this page's part and the total. */
  flowPart?: number;
  flowCount?: number;
};

export type CoverPanel = {
  shape?: "rectangle" | "rounded" | "oval" | "circle";
  /** Palette role; default the paper color. */
  fill?: import("./tokens").ColorToken;
  /** 0–1; default 0.86. */
  opacity?: number;
  /** Outline color (palette role), or none (default). */
  outline?: import("./tokens").ColorToken | "none";
  outlinePt?: number;
  /** A thin inner line just inside the edge (the palette's line-art color). */
  trim?: boolean;
  /**
   * Width: "fit" hugs the words; "band" runs off both sides of the page (through the bleed);
   * "auto" (default) fits, and becomes a band when it would nearly fill the width.
   */
  width?: "auto" | "fit" | "band";
};

/** Additive, per-step settings; absent on legacy projects. Tabs are interior printed markers. */
export type CoverDividerSettings = {
  /** "surface": a Journal Color Studio marble / watercolor from the design library (`surfaceId`), this page only. */
  preset?: "neutral-cheetah-luxe" | "solid" | "surface" | "plain";
  /** Solid-cover fill from the current palette. */
  solidColor?: import("./tokens").ColorToken;
  /** Wording color (solid and design-library covers) from the current palette. */
  solidTextColor?: import("./tokens").ColorToken;
  /** Design-library asset drawn edge to edge on this cover (design-library/coverSurfaces.ts). Never the interior's. */
  surfaceId?: string;
  /** The art in its own Journal Color Studio colors (default) or in this product's palette. */
  surfaceColors?: "own" | "palette";
  /** A panel behind the wording, so it reads on busy art (design-library covers). */
  textPanel?: boolean;
  /** The panel's look (Journal Color Studio's title plate): shape, fill, opacity, outline, inner trim line. */
  panel?: CoverPanel;
  /** False = artwork/color only; no title, subtitle, quote or rule is printed. */
  showText?: boolean;
  /** Title only: the subtitle is not printed (it is kept, for switching back). */
  titleOnly?: boolean;
  subtitle?: string;
  quote?: string;
  smallLine?: boolean;
  alignment?: "left" | "center";
  position?: "upper" | "middle" | "lower";
  circles?: boolean;
  outlines?: boolean;
  leopard?: boolean;
  /**
   * Fit the design to the page size (default on): the composition is resolved
   * for the page's size class (layouts/book/composition.ts). Off keeps the
   * reference layout at every size.
   */
  autoFit?: boolean;
  /** Fine-tuning on top of the fitted design. Title size in % of the fitted size (60–130). */
  titleScale?: number;
  /** Nudges as fractions of the trim (x of the width, y of the height), so they carry across page sizes. */
  titleOffset?: { x: number; y: number };
  subtitleOffset?: { x: number; y: number };
  decorOffset?: { x: number; y: number };
  tab?: { show: boolean; label?: string; style?: "staggered" | "rounded"; order?: number; count?: number; color?: import("./tokens").ColorToken; leopard?: boolean };
};
