import { weeklyDeskPad } from "./deskpad/weeklyDeskPad";
import { linedJournal, notesPage } from "./journal/linedJournal";
import { todoNotepad } from "./notepad/todoNotepad";
import { monthlyCalendar } from "./planner/monthlyCalendar";
import { weeklySpread } from "./planner/weeklySpread";
import type { LayoutDefinition } from "./shared/types";

/**
 * Layout registry. Milestone 1 ships the five geometry-proving layouts plus
 * the shared notes page (used as spread filler). The full template library
 * is Phase 6 — added only after these validate.
 */
export const LAYOUTS: LayoutDefinition[] = [todoNotepad, linedJournal, monthlyCalendar, weeklySpread, weeklyDeskPad, notesPage];

export const FILLER_LAYOUT_ID = notesPage.id;

export function getLayout(id: string): LayoutDefinition {
  const l = LAYOUTS.find((x) => x.id === id);
  if (!l) throw new Error(`Unknown layout: ${id}`);
  return l;
}
