/**
 * HOPE PLANNER — an undated journal for writing down hopes and following each one through to its
 * fulfilment. Built only from shared parts (Custom Page sections: heading / text, info row, writing
 * lines, checklist, table), like the Inventory Notebook: no Hope-specific layout or renderer.
 *
 *   Title page                      black on white; an interior page, not the cover
 *                                   (the cover artwork is made and supplied separately)
 *   Notes                           inside the front cover
 *   How to Use                      one page, right-hand
 *   Hope spread × 30                left: the hope · right: steps, prayers, what God did
 *   Fulfilled Hopes Index × 2       at the back, facing
 *   End cover
 *
 * Prompts and tips are margin notes (PromptBlock.marginNote): they print in the page's outer margin,
 * never inside the writing area. Every writing line, checklist row and table row sits on the
 * product's own ruling (college ruled, 9/32"); the index rows are two lines tall.
 */
import { RULINGS } from "../data/research/rulings";
import { measurementIn } from "../engines/units/units";
import type { ProjectPatch } from "./products/projectFactory";
import type { PromptSet } from "../types/prompts";
import type { BookNode } from "../types/recipe";
import { step } from "./bookRecipes";
import { DOVE_BRAND } from "./themes/palettes";

export const HOPE_SPREADS = 30;
export const HOPE_INDEX_ROWS = 15;
/**
 * The book's name: "Hope" with "Planner" (default) or "Journal" under it, on the title page only
 * (Pages → the title page → Subtitle). Nothing else in the interior names it.
 */
export const HOPE_TITLE_WORDS = ["JOURNAL", "PLANNER"] as const;
export type HopeTitleWord = (typeof HOPE_TITLE_WORDS)[number];

/** Label of the optional target date at the end of each step row (Steps I Am Taking). */
export const HOPE_STEP_DATE_LABEL = "By";

/** Hebrews 6:19a (KJV, public domain: no notice needed), on the interior title page. */
export const HOPE_TITLE_VERSE = "Which hope we have as an anchor of the soul, both sure and stedfast. Hebrews 6:19 (KJV)";

/** Black text on white paper; burgundy lines and borders; pale pink behind the margin notes (Dove brand). */
const INK = "#000000";
const BURGUNDY = DOVE_BRAND.burgundy;

/**
 * What the template sets on the product besides its pages: college ruling, checklist and table rows
 * on that same ruling, and black on white. Size, binding, bleed and margins stay the maker's choice.
 */
export const HOPE_JOURNAL_SETTINGS: ProjectPatch = {
  functionalPattern: { kind: "ruled", rulingPreset: "college" },
  spacing: { density: "balanced", overrides: { listRow: measurementIn(RULINGS.college.spacing) } },
  // Sized for reading on paper at arm's length: body 11 pt (How to Use), section headings 10 pt,
  // small labels 8.5 pt (studio default 7), margin prompts 11 pt italic.
  typography: {
    roleOverrides: {
      body: { sizePt: 11, lineHeight: 1.45 },
      sectionHeading: { sizePt: 10 },
      label: { sizePt: 8.5 },
      prompt: { sizePt: 11, lineHeight: 1.3 },
      coverSubtitle: { sizePt: 14 },
    },
  },
  colors: {
    paletteId: "dove-charcoal",
    paper: "white",
    overrides: { primary: INK, secondary: INK, accent: INK, text: INK, mutedText: INK, line: BURGUNDY, border: BURGUNDY, lineArt: BURGUNDY, goldInk: INK, goldPaper: INK, decorHighlight: DOVE_BRAND.palePink, lineOpacity: 1 },
  },
};

export function hopeHowToSet(): PromptSet {
  return {
    spacing: "tight",
    // One page, always: the hope spreads after it must stay on facing pages.
    whenFull: "stop",
    blocks: [
      { id: "hope-how-title", kind: "heading", label: "How to Use", textStyle: "title" },
      {
        id: "hope-how-teaching", kind: "heading", label: "", textStyle: "body",
        prompt:
          "Biblical hope is confident expectation that rests on the character of God. It is stronger than a wish because it stands on what He has said. Romans 15:13 names Him the God of hope and asks Him to fill you with all joy and peace as you trust in Him. That same verse says you will overflow with hope by the power of the Holy Spirit. Hope is something God supplies while you trust Him.\n\n" +
          "Hebrews 6:19 describes this hope as an anchor of the soul, both sure and stedfast. An anchor holds a ship in place while the water keeps moving. Your circumstances may shift between the day you write a hope and the day it is fulfilled. The anchor keeps you steady through that stretch of time. These pages give you a place to set that anchor and to watch what God does.",
      },
      { id: "hope-how-gap-1", kind: "spacer", label: "", spacer: "small" },
      { id: "hope-how-1", kind: "heading", label: "1. Write the Hope" },
      { id: "hope-how-1-text", kind: "heading", label: "", textStyle: "body", prompt: "Give each hope its own spread and its own number. Write it plainly, in the words you would use in prayer. Record the date so you can see how long you have carried it. A specific hope is easier to pray for and easier to recognize when it arrives." },
      { id: "hope-how-gap-2", kind: "spacer", label: "", spacer: "small" },
      { id: "hope-how-2", kind: "heading", label: "2. Anchor It in Scripture" },
      { id: "hope-how-2-text", kind: "heading", label: "", textStyle: "body", prompt: "Ask what God has already said about this hope. Write the verse, promise, or word that it rests on. Return to that anchor whenever the wait feels long. Let it shape what you expect and how you pray. Use the lines beneath it to say why this hope matters to you." },
      { id: "hope-how-gap-3", kind: "spacer", label: "", spacer: "small" },
      { id: "hope-how-3", kind: "heading", label: "3. Take Steps and Pray" },
      { id: "hope-how-3-text", kind: "heading", label: "", textStyle: "body", prompt: "Hope grows when it is joined to obedience. List the steps you are taking and check each one off as you finish it. The target date beside each step is optional. Use it when a date helps, and change it whenever the timing shifts. Write your prayers in short lines and date every one. Over time the dates will show you a pattern of faithfulness, both yours and His." },
      { id: "hope-how-gap-4", kind: "spacer", label: "", spacer: "small" },
      { id: "hope-how-4", kind: "heading", label: "4. Record How God Fulfilled It" },
      { id: "hope-how-4-text", kind: "heading", label: "", textStyle: "body", prompt: "Use the God Moved lines for every sign of movement, including the small ones. When the hope is fulfilled, check the box at the bottom of the page and write the date. Add the hope to the Fulfilled Hopes Index at the back of the book. That index will become your record of what God has done, ready for the day you need to remember." },
    ],
  };
}

/** Notes, inside the front cover: a title and lines. */
export function hopeNotesSet(): PromptSet {
  return {
    whenFull: "stop",
    blocks: [
      { id: "hope-notes-title", kind: "heading", label: "Notes", textStyle: "title" },
      { id: "hope-notes-lines", label: "", space: "fill", responseStyle: "ruled" },
    ],
  };
}

/** Left page of a hope spread: the hope itself. Each section takes as many lines as fit. */
export function hopeLeftSet(): PromptSet {
  return {
    whenFull: "stop",
    blocks: [
      { id: "hope-info", kind: "info", label: "", fields: ["Hope No.", "Date Recorded"] },
      { id: "hope-mine", label: "My Hope", space: "fill", weight: 2, responseStyle: "ruled", marginNote: "Write it plainly." },
      { id: "hope-anchor", label: "Anchoring Scripture or Word", space: "fill", responseStyle: "ruled", marginNote: "What has God already said about this?" },
      { id: "hope-why", label: "Why This Matters", space: "fill", responseStyle: "ruled", marginNote: "What would fulfillment look like?" },
    ],
  };
}

/** Right page of a hope spread: steps, dated prayers, what God did, and the day it was fulfilled. */
export function hopeRightSet(opts: { stepDates?: boolean } = {}): PromptSet {
  return {
    whenFull: "stop",
    blocks: [
      { id: "hope-steps", label: "Steps I Am Taking", space: "fixed", lineCount: 6, responseStyle: "checkboxes", taskMarker: "square", taskMarkerPosition: "left", ...(opts.stepDates ? { taskDate: HOPE_STEP_DATE_LABEL } : {}), marginNote: "One step this week is enough." },
      {
        id: "hope-prayers", label: "Prayers I Have Prayed", space: "fixed", lineCount: 6, responseStyle: "table", marginNote: "Date every prayer so you can see the pattern.",
        table: { columns: ["Date", "Prayer"], columnTypes: ["date", "longText"], columnWidths: [1.1, null], rows: 6, showHeader: true, borders: "grid", headerLines: 2 },
      },
      { id: "hope-moved", label: "God Moved", space: "fill", responseStyle: "ruled", marginNote: "Record small movement too." },
      { id: "hope-fulfilled", kind: "info", label: "", fields: ["Fulfilled on"], fieldStyles: ["check-line"] },
    ],
  };
}

/** Fulfilled Hopes Index: one row per hope, two writing lines tall. */
export function hopeIndexSet(rows = HOPE_INDEX_ROWS): PromptSet {
  return {
    whenFull: "stop",
    blocks: [
      { id: "hope-index-title", kind: "heading", label: "Fulfilled Hopes Index", textStyle: "title" },
      {
        id: "hope-index", label: "", space: "fixed", lineCount: rows, responseStyle: "table",
        table: { columns: ["Hope No.", "Date Recorded", "Date Fulfilled", "How God Did It"], columnTypes: ["number", "date", "date", "longText"], columnWidths: [0.8, 1.2, 1.2, null], rows, showHeader: true, borders: "grid", rowSpace: "double" },
      },
    ],
  };
}

/** The book: How to Use, then a left + right page for each hope (always facing), then the index. */
export function hopeJournalBook(spreads = HOPE_SPREADS, opts: { title?: HopeTitleWord; stepDates?: boolean } = {}): BookNode[] {
  const { title = "PLANNER", stepDates = true } = opts;
  const left = step("custom", { type: "copies", count: Math.max(1, Math.round(spreads)) }, { id: "hope-left", layoutId: "guided-page", title: "Hope (left page)", start: "verso", promptSet: hopeLeftSet() });
  return [
    // The interior title page: white paper, black ink. Not the cover: the cover artwork is supplied separately.
    step("cover-page", { type: "once" }, { id: "hope-cover", title: "Hope", cover: { preset: "solid", solidColor: "background", solidTextColor: "text", subtitle: title, quote: HOPE_TITLE_VERSE, smallLine: true, alignment: "center", position: "middle" } }),
    // Inside the front cover: a notes page, made like How to Use so the two facing headers line up.
    step("custom", { type: "once" }, { id: "hope-notes", layoutId: "guided-page", title: "Notes", promptSet: hopeNotesSet() }),
    // How to Use on a right-hand page, so every hope spread after it faces.
    step("custom", { type: "once" }, { id: "hope-how-to", layoutId: "guided-page", title: "How to Use", start: "recto", promptSet: hopeHowToSet() }),
    left,
    step("custom", { type: "after-module", moduleId: left.id }, { id: "hope-right", layoutId: "guided-page", title: "Hope (right page)", promptSet: hopeRightSet({ stepDates }) }),
    step("custom", { type: "copies", count: 2 }, { id: "hope-index", layoutId: "guided-page", title: "Fulfilled Hopes Index", promptSet: hopeIndexSet() }),
    step("back-cover", { type: "once" }, { id: "hope-back-cover", cover: { preset: "plain" } }),
  ];
}
