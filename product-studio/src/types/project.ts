import type { ElementPosition, SemanticTextKey } from "./layout";
import type { BindingType } from "./binding";
import type { CalendarSettings } from "./calendar";
import type { Edge, LogicalEdge, Orientation } from "./geometry";
import type { ProductType } from "./product";
import type { ProductRecipe } from "./recipe";
import type { DecorativeTheme, FunctionalPattern } from "./theme";
import type {
  ColorTokens,
  FontSelection,
  SpacingDensity,
  SpacingTokens,
  TypographyRole,
  TypographyRoleStyle,
  Wording,
  WordingKey,
} from "./tokens";

export const PROJECT_SCHEMA_VERSION = 1;

export type DimensionSettings = {
  /** Size preset id, or "custom". */
  sizePresetId: string;
  custom?: { width: number; height: number; unit: "in" | "mm" };
  orientation: Orientation;
};

export type ProductionSettings = {
  bindingType: BindingType;
  /** Physical bound/glued edge for punched or glued products (front side). */
  boundEdge?: Edge;
  printProfileId: string;
  includeBleed: boolean;
  /** Print both sides of each leaf (inserts). Books are always duplex. */
  duplex: boolean;
  /** Pads / desk pads: sheets per pad (manufacturing metadata). */
  sheetsPerPad?: number;
  /** USER-DESIGN margins (inches) — never allowed below required geometry. */
  userMargins?: Partial<Record<LogicalEdge, number>>;
  paperColor?: "white" | "cream";
};

export type LayoutPlacement = "top-left" | "top-right" | "top-center";

/** Per-layout user options, keyed by layout id. */
export type LayoutOptions = {
  datePlacement: LayoutPlacement;
  showSidebar: boolean;
  /**
   * Monthly calendar's notes sidebar, independent of the weekly sidebar.
   * Absent = showSidebar (the legacy master switch).
   */
  monthlySidebar?: boolean;
  /**
   * Weekly spread's sidebar, independent of the monthly sidebar.
   * Absent = showSidebar (the legacy master switch).
   */
  weeklySidebar?: boolean;
  /**
   * Weekly spread's extra Notes slot (shown when its sidebar is off).
   * Absent = true. When false the seven days reclaim the slot's space.
   */
  weeklyNotes?: boolean;
  /**
   * Weekly plan spread's foot sections. Absent = true. When false the day
   * rows reclaim the foot's space.
   */
  weeklyPlanNotes?: boolean;
  weeklyPlanPriorities?: boolean;
  /**
   * Facing-page behavior for paged (book-like) products. "preserve" inserts
   * a filler page so every two-page spread opens on a left-hand page;
   * "continuous" flows pages with no fillers. Absent = "preserve".
   */
  spreadMode?: "preserve" | "continuous";
  /**
   * What a required filler page carries in preserve mode. Absent = "notes".
   */
  fillerKind?: "notes" | "blank";
  /**
   * Monthly calendar arrangement. "classic" = 7 day-columns × week rows, read
   * upright; "rotated" = the whole monthly design (title, weekday labels,
   * grid, notes) is laid out in landscape and rotated 90° onto the portrait
   * sheet, so the reader turns the planner to read it. Absent = "classic".
   */
  monthlyArrangement?: "classic" | "rotated";
  /**
   * Page orientation per planner section. Each section absent here follows the
   * project's orientation. Lets one planner carry e.g. landscape monthly pages
   * with portrait daily/weekly pages.
   */
  plannerPageOrientation?: { monthly?: Orientation; weekly?: Orientation; daily?: Orientation };
  sidebarContent: WordingKey;
  sidebarWidthIn: number;
  sectionsPerDay: number;
  /**
   * Classic Weekly: days as columns ("vertical") or rows ("horizontal"). Both
   * are two-page spreads. Absent / "auto" = columns when they fit, else rows.
   * A choice that cannot fit at this size falls back to the one that does.
   */
  weeklyOrientation?: "auto" | "vertical" | "horizontal";
  hourStart: number;
  hourEnd: number;
  halfHours: boolean;
  writingRowsPerDay: number;
  showPageNumbers: boolean;
  showFooter: boolean;
  /** Daily layout: ordered section keys. */
  dailySections: WordingKey[];
  /**
   * Daily schedules: print the hours (6 AM, 7 AM …) or leave the time column
   * blank for the writer to fill in. Absent = printed.
   */
  scheduleTimes?: "printed" | "blank";
  /**
   * Stationery recipes: the creator's semantic customization per combo id
   * (rename, hide optional sections, order, space). The recipe itself is never changed.
   */
  stationery?: Record<string, import("./stationery").StationeryCustomization>;
  /** Journal prompt text (guided pages). */
  promptText: string;
  /** User placement of semantic text (Week of, month title, Notes…). Absent = layout default. */
  textPositions?: Partial<Record<SemanticTextKey, ElementPosition>>;
  /**
   * The title of plain writing pages (journal pages, notes pages — "NOTES"):
   * where it sits, a line under it, its text style and its own font. Absent =
   * a small label at the left, no line (as before).
   */
  writingTitle?: { align?: "left" | "center" | "right"; rule?: boolean; style?: "label" | "sectionHeading" | "pageTitle"; font?: string; /** Points; absent = the style's size. */ sizePt?: number };
};

export type ExportSettings = {
  scope: "full" | "current-page" | "page-range" | "landscape-pages" | "portrait-pages";
  pageRange?: { from: number; to: number };
  /** Pads: emit the master sheet once (false) or once per physical sheet (true). */
  repeatSheets: boolean;
  /** Future: separate cover/interior, printer-specific output. */
  target: "print-pdf";
  /**
   * The sheet the job prints on: the page's own size (Save as PDF, print
   * shops) or a home printer's paper (Letter, A4) with the page centred on it.
   * A home printer has no 7 × 9 paper; asked for one, the browser falls back
   * to Letter with its own margins, header and footer around the page.
   */
  paper?: "page" | "letter" | "a4";
  /** Home printing only: show corner trim/cut marks around the finished page. Default false. */
  showTrimMarks?: boolean;
};

export type ProductVariant = {
  id: string;
  name: string;
  /** Overrides only — geometry, layout and recipe are always shared. */
  overrides: {
    colors?: Partial<ColorTokens>;
    decorativeTheme?: Partial<DecorativeTheme>;
    /** Background / surface layer override (see themes/layers.ts). */
    backgroundTheme?: Partial<DecorativeTheme>;
    title?: string;
    subtitle?: string;
  };
};

export type ProjectOrigin =
  | { kind: "product-studio" }
  /** Prepared for a future Dove Command Center → Product Studio flow. */
  | { kind: "dove-command-center"; requestId: string; returnUrl?: string };

export type ProductProject = {
  schemaVersion: number;
  id: string;
  name: string;
  productType: ProductType;

  dimensions: DimensionSettings;
  production: ProductionSettings;
  recipe: ProductRecipe;

  calendar?: CalendarSettings;
  wording: Partial<Wording>;
  typography: {
    fonts: FontSelection;
    roleOverrides: Partial<Record<TypographyRole, Partial<TypographyRoleStyle>>>;
  };
  colors: {
    paletteId: string;
    overrides: Partial<ColorTokens>;
    /** Which of the palette's colors does which job (0 = as designed); tapping the palette again steps through them. */
    arrangement?: number;
    /** The page's paper: the palette's own paper color (default) or plain white. */
    paper?: "palette" | "white";
  };
  spacing: { density: SpacingDensity; overrides: Partial<SpacingTokens> };
  functionalPattern: FunctionalPattern;
  /** Decorative ELEMENTS: florals and line art placed against page structure. */
  decorativeTheme: DecorativeTheme;
  /**
   * BACKGROUND / SURFACE layer: solid, marble, pattern, watercolor. Absent on
   * projects saved before the split; a surface stored in decorativeTheme is
   * then the background (themes/layers.ts).
   */
  backgroundTheme?: DecorativeTheme;
  layoutOptions: LayoutOptions;
  exportSettings: ExportSettings;

  variants: ProductVariant[];
  /**
   * Saved page designs: Custom Pages the maker built once and reuses in Pages
   * (e.g. "Project Snapshot" × 8). A page added from a design gets its own copy
   * of the sections, so editing that page never changes the design.
   */
  pageDesigns?: PageDesign[];
  /** The product's own data: collections of typed entries (engines/data/data.ts). Absent until the first collection. */
  data?: import("./document").ProjectData;
  activeVariantId: string | null;
  origin: ProjectOrigin;

  createdAt: string;
  updatedAt: string;
};

/** A reusable page definition: a Custom Page's title and structured sections. */
export type PageDesign = {
  id: string;
  name: string;
  /** The page title printed on pages made from it. */
  title?: string;
  promptSet: import("./prompts").PromptSet;
  savedAt: string;
};
