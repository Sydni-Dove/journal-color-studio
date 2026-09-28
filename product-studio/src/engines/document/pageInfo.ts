/**
 * PAGE INFO — what each generated page is, in plain language, for navigation
 * (the label beside the page number, the Pages list, its filter and jumps).
 *
 * Read-only: derived from metadata every page instance already carries (its
 * layout, the book module it belongs to — purpose and title — its date period,
 * side and spread part). It never changes pages, their order or their content,
 * and never infers anything from the page number.
 */
import { formatWeekRange, MONTH_NAMES, WEEKDAY_NAMES } from "../calendar/calendar";
import { STATIONERY_RECIPES, stationeryLayoutId } from "../../presets/stationery/catalog";
import type { PageInstance } from "../../types/recipe";
import type { ResolvedDocument } from "./resolve";

export type PageCategory =
  | "cover"
  | "divider"
  | "monthly"
  | "weekly"
  | "daily"
  | "journal"
  | "meeting"
  | "reflection"
  | "devotional"
  | "worksheet"
  | "notes"
  | "other";

/** User-facing names, in the order the filter lists them. */
export const PAGE_CATEGORIES: { id: PageCategory; label: string; plural: string }[] = [
  { id: "monthly", label: "Monthly Planner", plural: "Monthly" },
  { id: "weekly", label: "Weekly Planner", plural: "Weekly" },
  { id: "daily", label: "Daily Planner", plural: "Daily" },
  { id: "journal", label: "Journal Page", plural: "Journal" },
  { id: "meeting", label: "Meeting With God", plural: "Meeting With God" },
  { id: "reflection", label: "Reflection", plural: "Reflection" },
  { id: "devotional", label: "Devotional", plural: "Devotional" },
  { id: "worksheet", label: "Worksheet", plural: "Worksheet" },
  { id: "cover", label: "Cover", plural: "Cover" },
  { id: "divider", label: "Divider", plural: "Divider" },
  { id: "notes", label: "Notes", plural: "Notes" },
  { id: "other", label: "Other", plural: "Other" },
];
const LABEL = Object.fromEntries(PAGE_CATEGORIES.map((c) => [c.id, c.label])) as Record<PageCategory, string>;

export type PageInfo = {
  index: number;
  pageNumber: number;
  category: PageCategory;
  /** Plain-language page type ("Daily Planner"). */
  typeLabel: string;
  /** The page's own name where it has one ("Prayer", "Monthly Review"); never a layout or recipe id. */
  title?: string;
  /** Date or date range ("Friday, January 1", "Dec 28, 2026 – Jan 3, 2027", "January 2027"). */
  dateLabel?: string;
  /** "January 2027" — the month a dated page belongs to (a week belongs to the month that owns it). */
  monthKey?: string;
  side: "left" | "right" | "single";
  /** Left or right half of a two-page spread. */
  spread?: "left" | "right";
  /** An extra notes page the book adds to keep a spread facing. */
  filler: boolean;
};

const LAYOUT_CATEGORY: Record<string, PageCategory> = {
  "cover-page": "cover",
  "divider-page": "divider",
  "planner-monthly": "monthly",
  "planner-weekly-spread": "weekly",
  "weekly-plan-spread": "weekly",
  "weekly-plan-mwg-spread": "weekly",
  "deskpad-weekly": "weekly",
  "meeting-with-god-spread": "meeting",
  "planner-daily": "daily",
  "daily-luxury-execution": "daily",
  "notepad-daily": "daily",
  "journal-lined": "journal",
  "notes-page": "notes",
};

/** Book purposes (modules) whose page is identified by what it is for, not by its layout. */
const MODULE_CATEGORY: Partial<Record<string, PageCategory>> = {
  "meeting-with-god": "meeting",
  review: "reflection",
  reflection: "reflection",
  devotional: "devotional",
  prayer: "journal",
  "lined-journal": "journal",
  notes: "notes",
  "daily-planner": "daily",
  "monthly-calendar": "monthly",
};

const STATIONERY_CATEGORY: Record<string, PageCategory> = { devotional: "devotional", worksheet: "worksheet", journal: "journal", planner: "other" };
const stationery = new Map(STATIONERY_RECIPES.map((r) => [stationeryLayoutId(r.comboId), r]));

function categoryOf(p: PageInstance): PageCategory {
  if (p.filler) return "notes";
  // The hybrid week spread: its right-hand page is the Meeting With God page.
  if (p.layoutId === "weekly-plan-mwg-spread" && p.spreadPart === 1) return "meeting";
  const byLayout = LAYOUT_CATEGORY[p.layoutId];
  if (byLayout && byLayout !== "journal" && byLayout !== "notes") return byLayout;
  const byModule = p.module && MODULE_CATEGORY[p.module.type];
  if (byModule) return byModule;
  if (byLayout) return byLayout;
  const st = stationery.get(p.layoutId);
  if (st) return STATIONERY_CATEGORY[st.family] ?? "other";
  return "other";
}

const monthLabel = (key: string) => `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

function dateOf(doc: ResolvedDocument, p: PageInstance): { dateLabel?: string; monthKey?: string } {
  const period = p.period;
  switch (period.kind) {
    case "day": {
      const [y, m, d] = period.iso.split("-").map(Number);
      const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      return { dateLabel: `${WEEKDAY_NAMES[weekday]}, ${MONTH_NAMES[m - 1]} ${d}`, monthKey: period.iso.slice(0, 7) };
    }
    case "week": {
      const week = doc.calendar?.weeks.find((w) => w.key === period.key);
      return { dateLabel: week ? formatWeekRange(week) : undefined, monthKey: week?.ownerMonthKey };
    }
    case "month":
      return { dateLabel: monthLabel(period.key), monthKey: period.key };
    case "quarter": {
      const q = doc.calendar?.quarters.find((x) => x.key === period.key);
      return { dateLabel: q ? `Q${q.quarter} ${q.year}` : undefined };
    }
    case "year":
      return { dateLabel: String(period.year) };
    default:
      return {};
  }
}

/** Titles worth showing: a module's own name, when it says more than the page type. */
function titleOf(p: PageInstance, category: PageCategory): string | undefined {
  if (p.filler) return undefined;
  const st = stationery.get(p.layoutId);
  if (st) return st.label;
  const t = p.module?.title?.trim();
  if (!t) return undefined;
  // A cover or divider is named by its title, whatever it says ("Notes" divider).
  if (category === "cover" || category === "divider") return t;
  const generic = ["Month", "Week", "Day", "Journal", "Notes", "Meeting With God"];
  if (generic.includes(t) || t === LABEL[category]) return undefined;
  if (category === "monthly" || category === "weekly" || category === "daily") return undefined;
  return t;
}

export function pageInfo(doc: ResolvedDocument, index: number): PageInfo {
  const p = doc.recipe.pages[index];
  const category = categoryOf(p);
  return {
    index,
    pageNumber: p.pageNumber,
    category,
    typeLabel: LABEL[category],
    title: titleOf(p, category),
    ...dateOf(doc, p),
    side: p.side === "recto" ? "right" : p.side === "verso" ? "left" : "single",
    spread: p.spreadPart === 0 ? "left" : p.spreadPart === 1 ? "right" : undefined,
    filler: !!p.filler,
  };
}

const cache = new WeakMap<ResolvedDocument, PageInfo[]>();
/** Every page's info (cached per resolved document). */
export function allPageInfo(doc: ResolvedDocument): PageInfo[] {
  let v = cache.get(doc);
  if (!v) cache.set(doc, (v = doc.recipe.pages.map((_, i) => pageInfo(doc, i))));
  return v;
}

/** One line for lists: "Daily Planner — Friday, January 1", "Divider — Prayer". */
export function pageSummary(info: PageInfo): string {
  return [info.typeLabel, info.title, info.dateLabel].filter(Boolean).join(" — ");
}

export type JumpTarget = { label: string; index: number; group: "Months" | "Sections" | "Page types" };

/**
 * Where "Jump to" can go: each month's first page (dated books), each divider
 * (books split into sections), and the first page of each page type.
 */
export function jumpTargets(doc: ResolvedDocument): JumpTarget[] {
  const info = allPageInfo(doc);
  const out: JumpTarget[] = [];
  // A month opens where its section starts: its monthly calendar when the book has one (the first page dated
  // in a month can sit in the previous month's section — a week that begins there owns its days).
  const months = new Map<string, number>();
  for (const i of info) if (i.monthKey && !months.has(i.monthKey)) months.set(i.monthKey, i.index);
  for (const [key, first] of [...months].sort((a, b) => a[0].localeCompare(b[0]))) {
    const own = doc.recipe.pages.findIndex((p) => p.period.kind === "month" && p.period.key === key);
    out.push({ label: monthLabel(key), index: own >= 0 ? own : first, group: "Months" });
  }
  for (const i of info) if (i.category === "divider") out.push({ label: i.title ?? `Divider (page ${i.pageNumber})`, index: i.index, group: "Sections" });
  for (const c of PAGE_CATEGORIES) {
    const first = info.find((i) => i.category === c.id);
    if (first) out.push({ label: `First ${c.label.toLowerCase().replace("meeting with god", "Meeting With God")} page`, index: first.index, group: "Page types" });
  }
  return out;
}
