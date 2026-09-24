/**
 * Milestone-1 test products. These prove the geometry system end to end;
 * the full template library is built only after they validate.
 */
import type { ProductProject } from "../../types/project";
import { STUDIO_PAD } from "../studioDefaults";
import { createProject } from "./projectFactory";

export type ProductTemplate = {
  id: string;
  label: string;
  summary: string;
  build: () => ProductProject;
};

export const TEST_PRODUCTS: ProductTemplate[] = [
  {
    id: "tp1-notepad-5x7-todo",
    label: "5 × 7 Top-Glued To-Do Notepad",
    summary: "Glue keep-out · header · checklist rows · dynamic row count",
    build: () =>
      createProject("notepad", {
        name: "5×7 To-Do Notepad",
        dimensions: { sizePresetId: "5x7", orientation: "portrait" },
        production: { bindingType: "glued-pad", boundEdge: "top", printProfileId: "notepad-top-glued", includeBleed: false, duplex: false, sheetsPerPad: STUDIO_PAD.defaultSheets },
        recipe: { items: [{ id: "sheet", layoutId: "notepad-todo", repeat: { kind: "repeated-sheet", sheets: STUDIO_PAD.defaultSheets } }], ordering: "sequential" },
        functionalPattern: { kind: "checklist" },
        layoutOptions: { showFooter: true },
      }),
  },
  {
    id: "tp2-journal-6x9-lined",
    label: "6 × 9 Lined Journal (KDP)",
    summary: "Perfect-bound gutter · mirrored pages · calculated line count",
    build: () =>
      createProject("journal", {
        name: "6×9 Lined Journal",
        dimensions: { sizePresetId: "6x9", orientation: "portrait" },
        production: { bindingType: "perfect-bound", printProfileId: "kdp", includeBleed: false, duplex: true },
        recipe: { items: [{ id: "lined", layoutId: "journal-lined", repeat: { kind: "count", count: 120 } }], ordering: "sequential" },
        functionalPattern: { kind: "ruled", rulingPreset: "college" },
        layoutOptions: { showPageNumbers: true },
      }),
  },
  {
    id: "tp3-planner-7x9-monthly",
    label: "7 × 9 Monthly Coil Planner",
    summary: "Coil keep-out · title · weekday row · 7 × 6 grid · month generation",
    build: () =>
      createProject("planner", {
        name: "7×9 Monthly Planner 2027",
        dimensions: { sizePresetId: "7x9", orientation: "portrait" },
        production: { bindingType: "coil", boundEdge: "left", printProfileId: "coil-generic", includeBleed: false, duplex: true },
        calendar: { startDate: "2027-01-01", endDate: "2027-12-31", weekStart: 0, sixRowMonths: true },
        recipe: { items: [{ id: "month", layoutId: "planner-monthly", repeat: { kind: "every-month" } }], ordering: "chronological" },
        layoutOptions: { showSidebar: true, sidebarContent: "notes", datePlacement: "top-left", showPageNumbers: false },
      }),
  },
  {
    id: "tp4-planner-7x9-weekly",
    label: "7 × 9 Weekly Planner Spread",
    summary: "Two-page spread · equal day columns · weekly generation · sidebar",
    build: () =>
      createProject("planner", {
        name: "7×9 Weekly Planner 2027",
        dimensions: { sizePresetId: "7x9", orientation: "portrait" },
        production: { bindingType: "coil", boundEdge: "left", printProfileId: "coil-generic", includeBleed: false, duplex: true },
        calendar: { startDate: "2027-01-04", endDate: "2027-12-26", weekStart: 1, sixRowMonths: true },
        recipe: { items: [{ id: "week", layoutId: "planner-weekly-spread", repeat: { kind: "every-week" } }], ordering: "chronological" },
        functionalPattern: { kind: "ruled", rulingPreset: "custom", customLineSpacingIn: 0.28 },
        layoutOptions: { showSidebar: true, sidebarContent: "weeklyFocus", sectionsPerDay: 3 },
      }),
  },
  {
    id: "tp5-deskpad-11x17-weekly",
    label: "11 × 17 Weekly Desk Pad",
    summary: "Landscape · glue zone · 7 columns · writing rows · large format",
    build: () =>
      createProject("deskpad", {
        name: "11×17 Weekly Desk Pad",
        dimensions: { sizePresetId: "11x17", orientation: "landscape" },
        production: { bindingType: "glued-pad", boundEdge: "top", printProfileId: "notepad-top-glued", includeBleed: false, duplex: false, sheetsPerPad: STUDIO_PAD.deskPadSheets },
        recipe: { items: [{ id: "sheet", layoutId: "deskpad-weekly", repeat: { kind: "repeated-sheet", sheets: STUDIO_PAD.deskPadSheets } }], ordering: "sequential" },
        functionalPattern: { kind: "ruled" },
        layoutOptions: { showSidebar: true, sidebarContent: "priorities", sidebarWidthIn: 2.5, writingRowsPerDay: 4 },
      }),
  },
];
