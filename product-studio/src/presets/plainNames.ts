/**
 * PLAIN NAMES — what the person making a product sees. The engine keeps its
 * own vocabulary (module, layout id, cadence, recto / verso); this is the one
 * place those are turned into the words a planner maker uses:
 *
 *   Product → Page type (what kind of page) → Layout (how it is arranged)
 *   → Writing space → Add to page → How often → Style.
 *
 * Read-only lookups: nothing here changes a page.
 */
import type { PageModuleType } from "../types/recipe";

/** The group a page type is listed under ("Cover", "Weekly", …) and its own name. */
export type PageTypeName = { group: PageGroup; name: string; hint?: string };

export type PageGroup = "Cover" | "Yearly" | "Monthly" | "Weekly" | "Daily" | "Journal" | "Guided pages" | "Notes & lists" | "Dividers & tabs" | "Custom";

export const PAGE_GROUP_ORDER: PageGroup[] = ["Cover", "Yearly", "Monthly", "Weekly", "Daily", "Journal", "Guided pages", "Notes & lists", "Dividers & tabs", "Custom"];

export const PAGE_TYPE_NAMES: Record<PageModuleType, PageTypeName> = {
  "cover-page": { group: "Cover", name: "Front cover", hint: "The first page of the book." },
  "back-cover": { group: "Cover", name: "End cover", hint: "The last page: the back of the book." },
  "divider-page": { group: "Dividers & tabs", name: "Divider", hint: "Opens a section; can carry a printed tab." },
  "monthly-calendar": { group: "Monthly", name: "Monthly", hint: "A calendar for each month." },
  "weekly-planner": { group: "Weekly", name: "Weekly", hint: "Two facing pages for each week." },
  "daily-planner": { group: "Daily", name: "Daily", hint: "A page for each day." },
  "meeting-with-god": { group: "Guided pages", name: "Meeting With God", hint: "Open writing, What did God say?, and your response." },
  "lined-journal": { group: "Journal", name: "Journal page", hint: "A title and writing lines." },
  notes: { group: "Notes & lists", name: "Notes", hint: "An open notes page." },
  "dot-journal": { group: "Journal", name: "Dot grid journal page" },
  "blank-journal": { group: "Journal", name: "Blank journal page" },
  prayer: { group: "Guided pages", name: "Prayer" },
  vision: { group: "Guided pages", name: "Vision" },
  mission: { group: "Guided pages", name: "Mission" },
  goals: { group: "Guided pages", name: "Goals" },
  review: { group: "Guided pages", name: "Review" },
  reflection: { group: "Guided pages", name: "Reflection" },
  devotional: { group: "Guided pages", name: "Devotional" },
  guided: { group: "Guided pages", name: "Prompts + writing space", hint: "Your own prompts, each with writing space." },
  "project-planning": { group: "Guided pages", name: "Project planning" },
  worksheet: { group: "Custom", name: "Worksheet" },
  tracker: { group: "Custom", name: "Tracker" },
  custom: { group: "Custom", name: "Custom page", hint: "Starts blank: add what you want on it." },
};

export const pageTypeName = (t: PageModuleType): string => PAGE_TYPE_NAMES[t]?.name ?? t;

/** Layout names: how the page is arranged, never what it is for. */
export const LAYOUT_NAMES: Record<string, { name: string; hint?: string }> = {
  "cover-page": { name: "Cover", hint: "Title, subtitle and the cover artwork." },
  "back-cover-page": { name: "End cover", hint: "The cover artwork turned half a turn, with an optional line of text." },
  "divider-page": { name: "Divider", hint: "Section title with an optional printed tab." },
  "planner-monthly": { name: "Classic Monthly", hint: "A full-page month calendar." },
  "planner-weekly-spread": { name: "Classic Weekly", hint: "Two pages: every day has its own writing space." },
  "weekly-plan-spread": { name: "Weekly Plan", hint: "Two pages: priorities, then the week's days as open writing rows." },
  "weekly-plan-mwg-spread": { name: "Weekly Plan + Meeting With God", hint: "The week on the left, Meeting With God on the facing page." },
  "meeting-with-god-spread": { name: "Meeting With God (two pages)", hint: "Open writing on the left; What did God say? and your response on the right." },
  "planner-daily": { name: "Standard Daily", hint: "The daily sections you choose, in your order." },
  "daily-luxury-execution": { name: "Luxury Daily", hint: "Schedule on one side, priorities and notes on the other." },
  "journal-lined": { name: "Lined journal", hint: "A title and lines to the bottom of the page." },
  "notes-page": { name: "Notes", hint: "Open lined notes." },
  "guided-page": { name: "Prompts + writing space", hint: "A title and your sections, each with its own writing space." },
};

export const layoutName = (id: string, fallback: string): string => LAYOUT_NAMES[id]?.name ?? fallback;

/** Page sides in words. */
export const SIDE_NAMES = { any: "Either side", recto: "Right-hand page", verso: "Left-hand page", spread: "Two facing pages" } as const;
