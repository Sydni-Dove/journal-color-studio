/**
 * PRODUCT FAMILIES — how the studio names what you are making. A family is
 * a user-facing starting point (Planner, Planner + Journal, Devotional, …); it
 * maps onto the engine's product type + a page structure, or is marked
 * "next" when its foundation (e.g. the Content Template Engine for
 * devotionals and workbooks) does not exist yet. "Next" families are shown
 * but never clickable — no workflow that leads nowhere.
 */
import type { ProductType } from "../../types/product";

export type ProductFamilyId = "planner" | "daily-planner" | "journal" | "planner-journal" | "devotional" | "workbook" | "worksheet" | "notepad" | "deskpad" | "custom";

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
  {
    id: "daily-planner",
    label: "Daily Planner",
    blurb: "A dated page for every day — with the month, the week's plan and Meeting With God around it.",
    status: "ready",
    start: { type: "planner", recipeId: "book-daily-planner", section: "build" },
  },
  {
    id: "devotional",
    label: "Devotional",
    blurb: "Daily Reflection, SOAP and Verse Mapping — Scripture with room to respond, proportioned for your trim.",
    status: "ready",
    start: { type: "devotional", section: "build" },
  },
  {
    id: "worksheet",
    label: "Worksheet",
    blurb: "Prompt worksheets, Reading Tracker and Prayer Log tables.",
    status: "ready",
    start: { type: "worksheet", section: "build" },
  },
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
  { id: "custom", label: "Custom Product", blurb: "Any size, binding and page sequence.", status: "ready", start: { section: "build" } },
  { id: "workbook", label: "Workbook", blurb: "Lessons with guided exercises and response space.", status: "next", nextNote: "Template system next" },
];
