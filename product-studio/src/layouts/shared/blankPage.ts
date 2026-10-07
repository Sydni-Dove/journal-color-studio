/**
 * BLANK PAGE — a truly empty page: no header, no footer, no content.
 *
 * Used as the spread filler when the planner's filler kind is "blank":
 * the page holds a spread open without adding writing surface. It never
 * grows a header to face another page (there is nothing to line up), and it
 * is never offered as a choosable layout in the editor — the recipe engine
 * is its only caller.
 */
import type { LayoutDefinition } from "./types";
import { minimumAreaFit } from "./types";

export const blankPage: LayoutDefinition = {
  id: "blank-page",
  label: "Blank Page",
  family: "shared",
  description: "Empty page used as a spread filler when the filler kind is Blank.",
  pages: 1,
  period: "none",
  capability: {
    supportedProductTypes: ["planner", "journal", "notebook", "notepad", "deskpad", "insert", "worksheet", "devotional", "tracker", "custom"],
    supportsPatterns: [],
    supportsLineStyle: false,
    supportsSidebar: false,
    supportsDatePlacement: false,
    supportsSectionsPerDay: false,
    supportsWritingRows: false,
    supportsPageNumbers: false,
    supportsFooter: false,
    requiresCalendar: false,
    usesWeekStart: false,
    wordingKeys: [],
    repeats: ["once"],
    defaultRepeat: "once",
  },
  fit: minimumAreaFit(0.5, 0.5, "Blank page"),
  solve: () => [{ nodes: [], diagnostics: [], metrics: [] }],
};
