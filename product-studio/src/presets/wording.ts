import type { Wording, WordingKey } from "../types/tokens";

/**
 * Semantic wording. Layouts only ever reference keys; changing
 * "Weekly Priorities" → "Kingdom Assignments" propagates everywhere.
 */
export const DEFAULT_WORDING: Wording = {
  productTitle: "Dove Expressions",
  productSubtitle: "",
  toDo: "To Do",
  notes: "Notes",
  priorities: "Priorities",
  topPriorities: "Top Priorities",
  weeklyFocus: "Weekly Focus",
  monthlyGoals: "Monthly Goals",
  goals: "Goals",
  schedule: "Schedule",
  gratitude: "Gratitude",
  prayer: "Prayer",
  prayerRequests: "Prayer Requests",
  scripture: "Scripture",
  reflection: "Reflection",
  kingdomAssignments: "Kingdom Assignments",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  week: "Week",
  weekOf: "Week of",
  date: "Date",
  journalTitle: "Journal",
  prompt: "Prompt",
  habits: "Habits",
  brainDump: "Brain Dump",
  groceryList: "Grocery List",
  mealPlan: "Meal Plan",
  meetingNotes: "Meeting Notes",
  dailyPlan: "Daily Plan",
  produce: "Produce",
  dairy: "Dairy",
  protein: "Meat & Seafood",
  pantry: "Pantry",
  frozen: "Frozen",
  household: "Household",
};

export const WORDING_LABELS: Partial<Record<WordingKey, string>> = {
  productTitle: "Product title",
  productSubtitle: "Subtitle",
  toDo: "To-do heading",
  priorities: "Priorities heading",
  weeklyFocus: "Weekly focus / sidebar heading",
  notes: "Notes heading",
  morning: "Morning section",
  afternoon: "Afternoon section",
  evening: "Evening section",
};

export function resolveWording(overrides: Partial<Wording> = {}): Wording {
  return { ...DEFAULT_WORDING, ...overrides };
}
