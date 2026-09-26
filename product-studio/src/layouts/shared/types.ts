import type { CalendarData } from "../../types/calendar";
import type { PageGeometry } from "../../types/geometry";
import type { SolvedPage } from "../../types/layout";
import type { ProductType } from "../../types/product";
import type { LayoutOptions } from "../../types/project";
import type { PageModuleContent, PeriodRef, RepeatRule } from "../../types/recipe";
import type { FunctionalPattern, FunctionalPatternKind } from "../../types/theme";
import type { SpacingTokens, TypographySettings, Wording, WordingKey } from "../../types/tokens";
import type { WeekStart } from "../../types/calendar";

export type LayoutFamily = "planner" | "journal" | "notepad" | "deskpad" | "worksheet" | "tracker" | "shared";

/**
 * Everything a layout solver may read. Solvers are pure functions of this
 * context: no DOM, no dates computed locally, no colors, no font families.
 */
export type LayoutContext = {
  /** One geometry per physical page. Spreads receive [verso, recto]. */
  pages: PageGeometry[];
  pageNumbers: number[];
  spacing: SpacingTokens;
  typography: TypographySettings;
  wording: Wording;
  pattern: FunctionalPattern;
  options: LayoutOptions;
  calendar: CalendarData | null;
  weekStart: WeekStart;
  period: PeriodRef;
  /** Composite books: the page's module (purpose title + prompts). Layouts may use it or ignore it. */
  module?: PageModuleContent;
};

/** Inputs a layout needs to decide whether (and how) it fits a page. */
export type FitContext = Pick<LayoutContext, "spacing" | "typography" | "options"> & { page: PageGeometry };

export type FitResult =
  | {
      ok: true;
      /** Size-aware structural variant the solver will use (e.g. "full", "compact"). */
      variant: string;
      /** Human label for the variant, shown in the editor. */
      variantLabel: string;
      /** Whether the optional sidebar can be shown at this size. */
      sidebarAvailable: boolean;
      sidebarReason?: string;
    }
  | { ok: false; reason: string };

/**
 * What a layout supports. The editor only shows controls a layout actually
 * consumes, and only offers layouts that fit the current product and size.
 */
export type LayoutCapability = {
  supportedProductTypes: ProductType[];
  /** Writing-surface patterns the layout's writing areas consume ([] = none). */
  supportsPatterns: FunctionalPatternKind[];
  /** Line weight / opacity apply (all layouts that draw lines). */
  supportsLineStyle: boolean;
  supportsSidebar: boolean;
  supportsDatePlacement: boolean;
  supportsSectionsPerDay: boolean;
  supportsWritingRows: boolean;
  supportsPageNumbers: boolean;
  supportsFooter: boolean;
  requiresCalendar: boolean;
  /** Uses the week-start setting even without a calendar (undated weekdays). */
  usesWeekStart: boolean;
  /** Semantic wording keys this layout renders (sidebar heading added dynamically). */
  wordingKeys: WordingKey[];
  /** Repeat rules that make sense for this layout. */
  repeats: RepeatRule["kind"][];
  defaultRepeat: RepeatRule["kind"];
};

export type LayoutDefinition = {
  id: string;
  label: string;
  family: LayoutFamily;
  description: string;
  /** 2 = two-page spread. */
  pages: 1 | 2;
  /** Period the layout expects from the recipe. */
  period: "none" | "month" | "week" | "day";
  capability: LayoutCapability;
  /** Decide whether this layout fits a page and which variant to use. */
  fit: (ctx: FitContext) => FitResult;
  solve: (ctx: LayoutContext) => SolvedPage[];
};

/** Fit helper for layouts with a single structure and a minimum usable area. */
export function minimumAreaFit(minW: number, minH: number, label = "Standard") {
  return ({ page }: FitContext): FitResult =>
    page.usableWidthIn + 1e-6 >= minW && page.usableHeightIn + 1e-6 >= minH
      ? { ok: true, variant: "standard", variantLabel: label, sidebarAvailable: false }
      : {
          ok: false,
          reason: `Needs a usable area of at least ${minW}" × ${minH}"; this page has ${page.usableWidthIn.toFixed(2)}" × ${page.usableHeightIn.toFixed(2)}".`,
        };
}
