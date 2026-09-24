import { COIL, DISC, NOTEPAD_GLUE, SIX_RING } from "../../data/research/bindingGeometry";
import { INGRAM_SPARK, KDP, LULU } from "../../data/research/printerSpecs";
import { PRINTER_TRIM_OFFERINGS } from "../../data/research/trimSizes";
import type { PrintProfile } from "../../types/print";

/**
 * Print profiles control REQUIRED production geometry. Studio defaults never
 * overwrite these; the geometry engine takes max(required, recommended).
 *
 * Profiles backed by a named printer use that printer's published values.
 * "Generic" profiles have no single published spec; where the research gives
 * no printer value, the field is null and nothing is invented.
 */

const ALL_BOOK_BINDINGS = ["perfect-bound", "case-bound"] as PrintProfile["bindingRules"]["supported"];

export const PRINT_PROFILES: PrintProfile[] = [
  {
    id: "generic-commercial",
    label: "Generic Commercial Print",
    description: "Local/commercial printer with no published spec on file. Uses the research's default print target.",
    kind: "commercial",
    bleedRules: { bleed: KDP.bleed, edges: "all-four" },
    safeMargins: { noBleed: null, withBleed: null },
    gutterRules: { kind: "none" },
    bindingRules: {
      supported: ["none", "perfect-bound", "case-bound", "coil", "wire-o", "discbound", "ring-6", "ring-7", "saddle-stitch", "glued-pad"],
    },
    supportedSizes: "any",
    notes: [
      "No single printer standard — confirm bleed and margins with your printer.",
      "Bleed 0.125\" follows the research's KDP/Ingram-compatible default print target (2.4); applied to all four edges for trimmed sheets.",
    ],
  },
  {
    id: "kdp",
    label: "Amazon KDP",
    description: "Kindle Direct Publishing paperback interior.",
    kind: "pod-book",
    bleedRules: { bleed: KDP.bleed, edges: KDP.bleedEdges },
    safeMargins: { noBleed: KDP.minLiveMarginNoBleed, withBleed: KDP.minLiveMarginWithBleed },
    gutterRules: { kind: "page-count-table", bands: [...KDP.gutterByPageCount] },
    pageCountRules: { minPages: KDP.minPages, maxPages: KDP.maxPages },
    bindingRules: { supported: ["perfect-bound"] },
    supportedSizes: [...PRINTER_TRIM_OFFERINGS.kdp],
    notes: [
      "Bleed on top, bottom and outside only — never on the gutter.",
      "Spine text only at ≥ 79 pages.",
      "Spine width = pages × 0.002252\" (white) / 0.0025\" (cream).",
    ],
  },
  {
    id: "ingramspark",
    label: "IngramSpark",
    description: "IngramSpark print book interior.",
    kind: "pod-book",
    bleedRules: { bleed: INGRAM_SPARK.bleed, edges: INGRAM_SPARK.bleedEdges },
    safeMargins: { noBleed: INGRAM_SPARK.minMargin, withBleed: INGRAM_SPARK.minMargin },
    // Research: "0.5\"+ recommended" gutter. The 0.5" all-sides minimum already covers it.
    gutterRules: { kind: "flat", gutter: INGRAM_SPARK.minMargin },
    pageCountRules: { minPages: INGRAM_SPARK.minPages },
    bindingRules: { supported: ALL_BOOK_BINDINGS },
    supportedSizes: [...PRINTER_TRIM_OFFERINGS.ingramSpark],
    printVariance: INGRAM_SPARK.printVariance,
    notes: ["0.5\" minimum on ALL sides including page numbers.", "Allows 1/16\" print variance."],
  },
  {
    id: "lulu",
    label: "Lulu",
    description: "Lulu print book interior.",
    kind: "pod-book",
    bleedRules: { bleed: LULU.bleed, edges: LULU.bleedEdges },
    safeMargins: { noBleed: LULU.safetyMargin, withBleed: LULU.safetyMargin },
    gutterRules: {
      kind: "minimum-plus-recommended-table",
      minimum: LULU.minGutter,
      bands: LULU.insideByPageCount.map((b) => ({ ...b })),
    },
    bindingRules: { supported: [...ALL_BOOK_BINDINGS, "coil", "saddle-stitch"] },
    supportedSizes: [...PRINTER_TRIM_OFFERINGS.lulu],
    notes: [
      "Minimum gutter 0.2\" is the requirement; the inside-margin table is Lulu's recommendation.",
      "Research page bands normalized: 60 joins the first band, 400 the third.",
    ],
  },
  {
    id: "coil-generic",
    label: "Coil / Spiral Generic",
    description: "Spiral/coil-bound planner or notebook at a commercial printer.",
    kind: "binding-generic",
    bleedRules: { bleed: KDP.bleed, edges: "all-four" },
    safeMargins: { noBleed: COIL.otherEdges, withBleed: COIL.otherEdges },
    gutterRules: { kind: "none" },
    bindingRules: { supported: ["coil", "wire-o"] },
    supportedSizes: "any",
    notes: ["Punched-edge keep-out ≥ 0.5\" (Printivity); 0.525\" (PrintNinja).", "Other edges 0.25\" (PrintNinja)."],
  },
  {
    id: "disc-generic",
    label: "Discbound Generic",
    description: "Disc-bound pages (Happy Planner / Arc / Circa / TUL compatible punch).",
    kind: "binding-generic",
    bleedRules: { bleed: KDP.bleed, edges: "all-four" },
    safeMargins: { noBleed: DISC.otherEdges, withBleed: DISC.otherEdges },
    gutterRules: { kind: "none" },
    bindingRules: { supported: ["discbound"] },
    supportedSizes: "any",
    notes: ["Disc holes ≈ 0.98\" apart (tool maker).", "0.5\" writing-safe is a derived recommendation (hole depth unpublished)."],
  },
  {
    id: "notepad-top-glued",
    label: "Top-Glued Notepad",
    description: "Custom notepad / memo pad / desk pad, glued on one edge with chipboard backer.",
    kind: "binding-generic",
    bleedRules: { bleed: KDP.bleed, edges: "all-four" },
    safeMargins: {
      noBleed: { value: NOTEPAD_GLUE.otherEdges.min, unit: "in", confidence: NOTEPAD_GLUE.otherEdges.confidence, source: NOTEPAD_GLUE.otherEdges.source },
      withBleed: { value: NOTEPAD_GLUE.otherEdges.min, unit: "in", confidence: NOTEPAD_GLUE.otherEdges.confidence, source: NOTEPAD_GLUE.otherEdges.source },
    },
    gutterRules: { kind: "none" },
    bindingRules: { supported: ["glued-pad"] },
    supportedSizes: "any",
    notes: [
      "Keep important elements ≥ 0.5\" from the glued edge (UPrinting).",
      "Sheets per pad 25 / 50 / 100; full-bleed backgrounds discouraged on writable pads.",
    ],
  },
  {
    id: "ring-insert",
    label: "Ring Insert",
    description: "Printable 6-ring / 7-ring planner inserts.",
    kind: "binding-generic",
    bleedRules: { bleed: null, edges: "none" },
    safeMargins: { noBleed: SIX_RING.otherEdges, withBleed: SIX_RING.otherEdges },
    gutterRules: { kind: "none" },
    bindingRules: { supported: ["ring-6", "ring-7"] },
    supportedSizes: "any",
    notes: ["Inserts are usually trimmed from letter/A4 sheets; bleed off by default.", "Hole geometry is refill-maker consensus (Observed / Estimated)."],
  },
  {
    id: "custom",
    label: "Custom Printer",
    description: "No printer requirements applied — only binding keep-outs and studio defaults.",
    kind: "custom",
    bleedRules: { bleed: null, edges: "none" },
    safeMargins: { noBleed: null, withBleed: null },
    gutterRules: { kind: "none" },
    bindingRules: {
      supported: ["none", "digital", "perfect-bound", "case-bound", "coil", "wire-o", "discbound", "ring-6", "ring-7", "saddle-stitch", "glued-pad"],
    },
    supportedSizes: "any",
    notes: ["Enter your printer's requirements via user margins; binding keep-outs still apply."],
  },
];

export function getPrintProfile(id: string): PrintProfile {
  const p = PRINT_PROFILES.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown print profile: ${id}`);
  return p;
}
