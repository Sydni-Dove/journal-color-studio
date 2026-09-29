/**
 * PRODUCT FAMILIES — how the studio names what you are making. A family is
 * a user-facing starting point (Planner, Planner + Journal, Devotional, …); it
 * maps onto the engine's product type + a page structure, or is marked
 * "next" when its foundation (e.g. the Content Template Engine for
 * devotionals and workbooks) does not exist yet. "Next" families are shown
 * but never clickable — no workflow that leads nowhere.
 */
import type { ProductType } from "../../types/product";

export type ProductFamilyId = "planner" | "daily-planner" | "journal" | "planner-journal" | "devotional" | "workbook" | "worksheet" | "notepad" | "deskpad" | "tracker" | "custom";

/** `template` opens that full planner / book template (Full planners & books) instead of a page type. */
export type WizardStart = { type?: ProductType; recipeId?: string; template?: string; section?: "templates" | "books" | "build" };

export type ProductFamily = {
  id: ProductFamilyId;
  label: string;
  blurb: string;
  status: "ready" | "next";
  /** What the New Product flow starts with for this family. */
  start?: WizardStart;
  /** Why a "next" family is not available yet. */
  nextNote?: string;
};

export const PRODUCT_FAMILIES: ProductFamily[] = [
  { id: "planner", label: "Planner", blurb: "Monthly, weekly, daily and yearly planning pages — mix the layouts you want.", status: "ready", start: { type: "planner", section: "build" } },
  { id: "journal", label: "Journal", blurb: "Guided writing, reflection, lined, dot-grid and free-writing pages.", status: "ready", start: { type: "journal", section: "build" } },
  { id: "devotional", label: "Devotional", blurb: "Scripture, teaching, reflection and prayer pages.", status: "ready", start: { type: "devotional", section: "build" } },
  { id: "workbook", label: "Workbook", blurb: "Lessons with guided exercises and response space.", status: "next", nextNote: "Template system next" },
  { id: "worksheet", label: "Worksheet", blurb: "Single or multi-section worksheets with prompts, tables and response areas.", status: "ready", start: { type: "worksheet", section: "build" } },
  { id: "tracker", label: "Tracker", blurb: "Habit, prayer, reading, progress and custom tracking pages.", status: "ready", start: { type: "tracker", section: "build" } },
  { id: "notepad", label: "Notepad", blurb: "Tear-off to-do, list, note and custom pads.", status: "ready", start: { type: "notepad", section: "build" } },
  { id: "deskpad", label: "Desk Pad", blurb: "Large-format planning and writing pads.", status: "ready", start: { type: "deskpad", section: "build" } },
  { id: "custom", label: "Custom Page", blurb: "Start blank, then add writing lines, checklists, tables, prompts or dot grid.", status: "ready", start: { type: "custom", section: "build" } },
];
