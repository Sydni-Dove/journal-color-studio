/**
 * STATIONERY RECIPE CATALOG — semantic page structures by combo id.
 *
 * Pure data: sections, order, relative importance, writing surface, page
 * count and (for tables) research column widths. No margins, safe areas or
 * trim-specific sizes live here: the geometry layer (engines/stationery)
 * turns this into physical rectangles for whatever trim is chosen, and the
 * theme never touches it.
 *
 * New recipes are added as catalog entries, not renderer code, as long as
 * they use the existing surfaces (types/stationery.ts SurfaceKind).
 */
import type { StationeryFamily, StationeryRecipe } from "../../types/stationery";

const EDIT = { rename: true, reorder: true, adjustSpace: true, editPrompts: true } as const;
/** Book-page trims the devotional structures are engineered for. */
const DEVOTIONAL_TRIMS = ["5.5x8.5", "6x9", "7x9", "8x10", "8.5x11", "a5"];

export const STATIONERY_RECIPES: StationeryRecipe[] = [
  // ── Devotional ──────────────────────────────────────────────────────────
  {
    comboId: "devotional-daily-reflection.stacked",
    family: "devotional",
    stationeryType: "daily-reflection",
    variant: "stacked",
    label: "Daily Reflection",
    description: "Date and weekday, Scripture, Reflection, Application, Stand Out Verse, Thankful For and Prayer — writing space dominates every prompt.",
    // Seven parts: on 5.5 × 8.5 and A5 the prompts would take more than 1/5 of the writing space (research ratio), so
    // those trims are not offered for the full structure.
    supportedTrims: ["6x9", "7x9", "8x10", "8.5x11"],
    // Research: prompt : response ≈ 1 : 5 — a prompt label may never crowd its answer.
    minResponseToPromptRatio: 5,
    composition: { lineSnap: true },
    // Smaller trims: the full seven parts would break the 1 : 5 prompt : response rule, so the compact page keeps
    // Date / Day, Scripture, Reflection, Application and Prayer — meaningful writing room over fitting every section.
    sizeVariants: [{ id: "compact", label: "Compact Daily Reflection", omit: ["standOutVerse", "thankfulFor"], supportedTrims: ["5.5x8.5", "a5"] }],
    pages: [
      {
        title: "Daily Reflection",
        zones: [
          { key: "date", label: "Date", surface: "fill-in", weight: 0, fields: ["Date", "Day"] },
          // One writing language across the page: open ruled lines, no boxes. Reflection, Application and Prayer carry
          // the most writing; Scripture and Stand Out Verse keep enough lines to copy a verse.
          { key: "scripture", label: "Scripture", surface: "scripture", treatment: "open", weight: 1.75 },
          { key: "reflection", label: "Reflection", surface: "reflection", weight: 3 },
          { key: "application", label: "Application", surface: "lined", weight: 2.25 },
          { key: "standOutVerse", label: "Stand Out Verse", surface: "scripture", treatment: "callout", weight: 1, optional: true },
          { key: "thankfulFor", label: "Thankful For", surface: "lined", weight: 1, optional: true },
          { key: "prayer", label: "Prayer", surface: "prayer", weight: 2.25 },
        ],
      },
    ],
    customization: EDIT,
  },
  {
    comboId: "devotional-soap.four-band",
    family: "devotional",
    stationeryType: "soap",
    variant: "four-band",
    label: "SOAP",
    description: "Scripture, Observation, Application, Prayer — four equal writing bands.",
    supportedTrims: DEVOTIONAL_TRIMS,
    minResponseToPromptRatio: 5,
    pages: [
      {
        title: "SOAP",
        zones: [
          { key: "date", label: "Date", surface: "fill-in", weight: 0, fields: ["Date"], optional: true },
          { key: "scripture", label: "Scripture", surface: "scripture", weight: 1 },
          { key: "observation", label: "Observation", surface: "reflection", weight: 1 },
          { key: "application", label: "Application", surface: "lined", weight: 1 },
          { key: "prayer", label: "Prayer", surface: "prayer", weight: 1 },
        ],
      },
    ],
    customization: EDIT,
  },
  {
    comboId: "devotional-verse-mapping.spread",
    family: "devotional",
    stationeryType: "verse-mapping",
    variant: "spread",
    label: "Verse Mapping (two-page spread)",
    description: "Left page: the Verse, Translations and Keywords. Right page: Cross References, Reflection and Prayer.",
    supportedTrims: DEVOTIONAL_TRIMS,
    minResponseToPromptRatio: 5,
    pages: [
      {
        title: "Verse Mapping",
        zones: [
          { key: "verse", label: "Verse", surface: "scripture", weight: 1.5 },
          { key: "translations", label: "Translations", surface: "lined", weight: 2 },
          { key: "keywords", label: "Keywords", surface: "lined", weight: 1.5 },
        ],
      },
      {
        title: "",
        zones: [
          { key: "crossReferences", label: "Cross References", surface: "lined", weight: 1.5 },
          { key: "reflection", label: "Reflection", surface: "reflection", weight: 2 },
          { key: "prayer", label: "Prayer", surface: "prayer", weight: 1.5 },
        ],
      },
    ],
    customization: EDIT,
  },

  // ── Worksheet ───────────────────────────────────────────────────────────
  {
    comboId: "worksheet-prompt.prompt-response",
    family: "worksheet",
    stationeryType: "prompt",
    variant: "prompt-response",
    label: "Prompt Worksheet",
    description: "Prompt, then its writable response area — repeated. Write your own prompts.",
    supportedTrims: ["5.5x8.5", "6x9", "7x9", "8x10", "8.5x11", "a4", "a5"],
    minResponseToPromptRatio: 5,
    pages: [
      {
        title: "Worksheet",
        zones: [1, 2, 3, 4].map((n) => ({ key: `prompt${n}`, label: `Prompt ${n}`, surface: "prompt-response" as const, weight: 1, optional: n > 2 })),
      },
    ],
    customization: EDIT,
  },
  {
    comboId: "worksheet-reading-tracker.table",
    family: "worksheet",
    stationeryType: "reading-tracker",
    variant: "table",
    label: "Reading Tracker",
    description: "Book · Chapters · Started · Completed.",
    supportedTrims: ["6x9", "7x9", "8x10", "8.5x11", "a4", "a5"],
    pages: [
      {
        title: "Reading Tracker",
        zones: [
          {
            key: "log",
            label: "",
            surface: "table",
            weight: 1,
            table: {
              basis: "recipe research: Book 2.20\", Chapters 2.60\", Started 1.00\", Completed 1.00\"",
              columns: [
                { key: "book", label: "Book", referenceWidthIn: 2.2 },
                { key: "chapters", label: "Chapters", referenceWidthIn: 2.6 },
                { key: "started", label: "Started", referenceWidthIn: 1.0 },
                { key: "completed", label: "Completed", referenceWidthIn: 1.0 },
              ],
            },
          },
        ],
      },
    ],
    customization: { rename: true, reorder: false, adjustSpace: false, editPrompts: false },
  },
  {
    comboId: "worksheet-prayer-log.table",
    family: "worksheet",
    stationeryType: "prayer-log",
    variant: "table",
    label: "Prayer Log",
    description: "Date · Request · Answered.",
    supportedTrims: ["5.5x8.5", "6x9", "7x9", "8x10", "8.5x11", "a4", "a5"],
    pages: [
      {
        title: "Prayer Log",
        zones: [
          {
            key: "log",
            label: "",
            surface: "table",
            weight: 1,
            table: {
              basis: "recipe research: Date 1.10\", Request 4.30\", Answered 0.75\"",
              columns: [
                { key: "date", label: "Date", referenceWidthIn: 1.1 },
                { key: "request", label: "Request", referenceWidthIn: 4.3 },
                { key: "answered", label: "Answered", referenceWidthIn: 0.75 },
              ],
            },
          },
        ],
      },
    ],
    customization: { rename: true, reorder: false, adjustSpace: false, editPrompts: false },
  },
];

export function getStationeryRecipe(comboId: string): StationeryRecipe | undefined {
  return STATIONERY_RECIPES.find((r) => r.comboId === comboId);
}

export function stationeryRecipesFor(family: StationeryFamily): StationeryRecipe[] {
  return STATIONERY_RECIPES.filter((r) => r.family === family);
}

export function recipeSupportsTrim(recipe: StationeryRecipe, sizePresetId: string): boolean {
  return recipe.supportedTrims.includes(sizePresetId);
}

/** Layout id of the page model generated for a recipe. */
export const stationeryLayoutId = (comboId: string) => `stationery:${comboId}`;
