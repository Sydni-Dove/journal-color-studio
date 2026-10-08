/**
 * PRODUCT FAMILIES — how the studio names what you are making. A family is
 * a user-facing starting point (Planner, Planner + Journal, Devotional, …); it
 * maps onto the engine's product type + a page structure, or is marked
 * "next" when its foundation (e.g. the Content Template Engine for
 * devotionals and workbooks) does not exist yet. "Next" families are shown
 * but never clickable — no workflow that leads nowhere.
 */
import type { ProductType } from "../../types/product";

export type ProductFamilyId = "planner" | "journal" | "planner-journal" | "devotional" | "workbook" | "worksheet" | "tracker" | "notepad" | "deskpad" | "custom";

export type WizardStart = { type?: ProductType; recipeId?: string; section?: "templates" | "build" };

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
  { id: "planner", label: "Planner", blurb: "Dated monthly and weekly planners that follow your date range.", status: "ready", start: { type: "planner", section: "build" } },
  { id: "journal", label: "Journal", blurb: "Lined, dot, graph and guided writing pages.", status: "ready", start: { type: "journal", section: "build" } },
  {
    id: "planner-journal",
    label: "Planner + Journal",
    blurb: "One book that plans the week and holds the journal — sections that repeat every month and week.",
    status: "ready",
    start: { type: "planner", recipeId: "book-meetings-with-god", section: "build" },
  },
  { id: "notepad", label: "Notepad", blurb: "Tear-off pads: to-do, lists and notes.", status: "ready", start: { type: "notepad", section: "build" } },
  { id: "deskpad", label: "Desk Pad", blurb: "Large-format weekly desk planners.", status: "ready", start: { type: "deskpad", section: "build" } },
  { id: "custom", label: "Custom Product", blurb: "Choose pages, sections, layout and book order yourself.", status: "ready", start: { type: "custom", section: "build" } },
  { id: "devotional", label: "Devotional", blurb: "Daily scripture, reading, reflection and prayer.", status: "next", nextNote: "Template system next" },
  { id: "workbook", label: "Workbook", blurb: "Lessons with guided exercises and response space.", status: "next", nextNote: "Template system next" },
  { id: "worksheet", label: "Worksheet", blurb: "A guided printable with editable sections and writing space.", status: "ready", start: { type: "worksheet", section: "build" } },
  { id: "tracker", label: "Tracker", blurb: "A weekly grid with editable tracked items and seven check boxes per row.", status: "ready", start: { type: "tracker", section: "build" } },
];
