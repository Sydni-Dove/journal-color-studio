import type { CalendarData } from "../../types/calendar";
import type { PageGeometry } from "../../types/geometry";
import type { SolvedPage } from "../../types/layout";
import type { LayoutOptions } from "../../types/project";
import type { PeriodRef } from "../../types/recipe";
import type { FunctionalPattern } from "../../types/theme";
import type { SpacingTokens, TypographySettings, Wording } from "../../types/tokens";
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
  solve: (ctx: LayoutContext) => SolvedPage[];
};
