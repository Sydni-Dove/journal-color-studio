import type { ProductType, ProductTypeDefinition } from "../../types/product";
import { STUDIO_MARGINS, type StudioValue } from "../studioDefaults";

/**
 * Centralized product capabilities. Product-specific behavior is looked up
 * here — not scattered through layouts as conditionals.
 */
export const PRODUCT_TYPES: Record<ProductType, ProductTypeDefinition> = {
  planner: {
    id: "planner",
    label: "Planner",
    description: "Dated monthly / weekly / daily planners.",
    capabilities: { supportsCalendar: true, supportsBinding: true, supportsPageRecipes: true, supportsRepeatedSheets: false, supportsMirroredPages: true, supportsPatterns: true, supportsSpreads: true },
    defaultBinding: "coil",
    allowedBindings: ["coil", "wire-o", "discbound", "ring-6", "ring-7", "perfect-bound", "case-bound", "saddle-stitch", "none"],
    defaultPrintProfile: "coil-generic",
    suggestedSizes: ["7x9", "8x10", "7x9.25", "8.5x11", "5.5x8.5", "a5"],
  },
  journal: {
    id: "journal",
    label: "Journal",
    description: "Lined, dotted, guided, prayer, scripture and dream journals.",
    capabilities: { supportsCalendar: false, supportsBinding: true, supportsPageRecipes: true, supportsRepeatedSheets: false, supportsMirroredPages: true, supportsPatterns: true, supportsSpreads: false },
    defaultBinding: "perfect-bound",
    allowedBindings: ["perfect-bound", "case-bound", "coil", "wire-o", "saddle-stitch", "discbound"],
    defaultPrintProfile: "kdp",
    suggestedSizes: ["6x9", "5.5x8.5", "5x8", "a5", "7x9"],
  },
  notebook: {
    id: "notebook",
    label: "Notebook",
    description: "Repeated writing pages (lined, dot, graph).",
    capabilities: { supportsCalendar: false, supportsBinding: true, supportsPageRecipes: true, supportsRepeatedSheets: false, supportsMirroredPages: true, supportsPatterns: true, supportsSpreads: false },
    defaultBinding: "coil",
    allowedBindings: ["coil", "wire-o", "perfect-bound", "case-bound", "saddle-stitch", "discbound"],
    defaultPrintProfile: "coil-generic",
    suggestedSizes: ["8.5x11", "6x9", "5.5x8.5", "a5"],
  },
  notepad: {
    id: "notepad",
    label: "Notepad",
    description: "Glued tear-off pads — memo pads, to-do pads, list pads.",
    capabilities: { supportsCalendar: false, supportsBinding: true, supportsPageRecipes: false, supportsRepeatedSheets: true, supportsMirroredPages: false, supportsPatterns: true, supportsSpreads: false },
    defaultBinding: "glued-pad",
    allowedBindings: ["glued-pad"],
    defaultPrintProfile: "notepad-top-glued",
    suggestedSizes: ["5x7", "4x6", "3x5", "4x9", "5.5x8.5", "6x9", "8.5x11"],
  },
  deskpad: {
    id: "deskpad",
    label: "Desk Pad",
    description: "Large-format glued weekly / monthly desk planners.",
    capabilities: { supportsCalendar: true, supportsBinding: true, supportsPageRecipes: false, supportsRepeatedSheets: true, supportsMirroredPages: false, supportsPatterns: true, supportsSpreads: false },
    defaultBinding: "glued-pad",
    allowedBindings: ["glued-pad"],
    defaultPrintProfile: "notepad-top-glued",
    suggestedSizes: ["11x17", "18x11", "22x17", "18x12"],
  },
  insert: {
    id: "insert",
    label: "Planner Insert",
    description: "Ring / disc planner inserts.",
    capabilities: { supportsCalendar: true, supportsBinding: true, supportsPageRecipes: true, supportsRepeatedSheets: false, supportsMirroredPages: true, supportsPatterns: true, supportsSpreads: true },
    defaultBinding: "ring-6",
    allowedBindings: ["ring-6", "ring-7", "discbound", "none"],
    defaultPrintProfile: "ring-insert",
    suggestedSizes: ["filofax-personal", "filofax-pocket", "franklin-compact", "franklin-classic", "a5", "7x9.25"],
  },
  worksheet: {
    id: "worksheet",
    label: "Worksheet",
    description: "Single-sheet printables — budgets, goal plans, Cornell notes.",
    capabilities: { supportsCalendar: false, supportsBinding: false, supportsPageRecipes: true, supportsRepeatedSheets: false, supportsMirroredPages: false, supportsPatterns: true, supportsSpreads: false },
    defaultBinding: "none",
    allowedBindings: ["none", "digital", "discbound", "ring-6"],
    defaultPrintProfile: "generic-commercial",
    suggestedSizes: ["8.5x11", "a4", "5.5x8.5"],
  },
  tracker: {
    id: "tracker",
    label: "Tracker",
    description: "Habit, prayer, reading and gratitude trackers.",
    capabilities: { supportsCalendar: true, supportsBinding: false, supportsPageRecipes: true, supportsRepeatedSheets: false, supportsMirroredPages: false, supportsPatterns: true, supportsSpreads: false },
    defaultBinding: "none",
    allowedBindings: ["none", "digital", "discbound", "ring-6", "glued-pad"],
    defaultPrintProfile: "generic-commercial",
    suggestedSizes: ["8.5x11", "a4", "5.5x8.5"],
  },
  custom: {
    id: "custom",
    label: "Custom",
    description: "Anything else — start from a blank recipe.",
    capabilities: { supportsCalendar: true, supportsBinding: true, supportsPageRecipes: true, supportsRepeatedSheets: true, supportsMirroredPages: true, supportsPatterns: true, supportsSpreads: true },
    defaultBinding: "none",
    allowedBindings: ["none", "digital", "perfect-bound", "case-bound", "coil", "wire-o", "discbound", "ring-6", "ring-7", "saddle-stitch", "glued-pad"],
    defaultPrintProfile: "generic-commercial",
    suggestedSizes: ["8.5x11"],
  },
};

/** Product-type studio margin overrides (recommended geometry only). */
export const PRODUCT_RECOMMENDED_MARGINS: Partial<Record<ProductType, { bound?: StudioValue; other?: StudioValue }>> = {
  deskpad: { bound: STUDIO_MARGINS.deskPadGlueZone, other: STUDIO_MARGINS.deskPadOtherEdges },
};
