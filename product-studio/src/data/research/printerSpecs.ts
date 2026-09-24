/**
 * Print-on-demand printer specifications — research sections A1, A2, A3 and
 * JSON fragment 2 ("podSpecs"). All values here are Printer Standard.
 */
import type { Measurement } from "../../types/measurement";
import { m } from "./measure";

export type PageCountBand = {
  /** Inclusive lower bound. */
  minPages: number;
  /** Inclusive upper bound; Infinity for open-ended. */
  maxPages: number;
};

export type GutterBand = PageCountBand & { gutter: Measurement };

export type BleedEdges = "outer-three" | "all-four";

// ─── KDP (A1) ──────────────────────────────────────────────────────────────
export const KDP = {
  bleed: m(0.125, "in", "printer-standard", "kdp", "3.2 mm"),
  /** Bleed on top, bottom, outside only — NOT on the gutter/binding edge. */
  bleedEdges: "outer-three" as BleedEdges,
  /** Safe distance for live content, no-bleed pages. */
  minLiveMarginNoBleed: m(0.25, "in", "printer-standard", "kdp"),
  /** Safe distance for live content, bleed pages. */
  minLiveMarginWithBleed: m(0.375, "in", "printer-standard", "kdp"),
  gutterByPageCount: [
    { minPages: 24, maxPages: 150, gutter: m(0.375, "in", "printer-standard", "kdp") },
    { minPages: 151, maxPages: 300, gutter: m(0.5, "in", "printer-standard", "kdp") },
    { minPages: 301, maxPages: 500, gutter: m(0.625, "in", "printer-standard", "kdp") },
    { minPages: 501, maxPages: 700, gutter: m(0.75, "in", "printer-standard", "kdp") },
    { minPages: 701, maxPages: 828, gutter: m(0.875, "in", "printer-standard", "kdp") },
  ] as readonly GutterBand[],
  minPages: 24,
  maxPages: 828,
  /** Spine text allowed only at ≥ 79 pages (A4 perfect-bound row). */
  spineTextMinPages: 79,
  spinePerPage: {
    white: m(0.002252, "in", "printer-standard", "kdp"),
    cream: m(0.0025, "in", "printer-standard", "kdp"),
    standardColor: m(0.002347, "in", "printer-standard", "kdpSpecsMirror"),
  },
  /** Cover: width = 0.125 + trimW + spine + trimW + 0.125; height = trimH + 0.25. */
  coverBleedEachSide: m(0.125, "in", "printer-standard", "kdp"),
} as const;

// ─── IngramSpark (A2) ──────────────────────────────────────────────────────
export const INGRAM_SPARK = {
  bleed: m(0.125, "in", "printer-standard", "ingramSpark"),
  bleedEdges: "outer-three" as BleedEdges,
  /** 0.5" (13 mm) from trim on ALL sides, including page numbers. */
  minMargin: m(0.5, "in", "printer-standard", "ingramSpark", "13 mm; all sides incl. page numbers"),
  printVariance: m(0.0625, "in", "printer-standard", "ingramSpark", "1/16\" print variance"),
  /** Perfect bound floor (A4). */
  minPages: 18,
  /** Case wrap: 0.625" bleed + 0.5" hinge each side (A4 case-binding row). */
  caseWrapBleed: m(0.625, "in", "printer-standard", "ingramSparkGuide"),
  caseWrapHinge: m(0.5, "in", "printer-standard", "ingramSparkGuide"),
} as const;

// ─── Lulu (A3) ─────────────────────────────────────────────────────────────
export type LuluInsideBand = PageCountBand & {
  /** Recommended TOTAL inside margin, no bleed. */
  inside: Measurement;
  /** Recommended TOTAL inside margin, full-bleed build. */
  insideFullBleed: Measurement;
};

export const LULU = {
  bleed: m(0.125, "in", "printer-standard", "lulu", "file printed 0.125\" larger per side then trimmed"),
  bleedEdges: "all-four" as BleedEdges,
  safetyMargin: m(0.5, "in", "printer-standard", "lulu", "12.7 mm, all content"),
  minGutter: m(0.2, "in", "printer-standard", "lulu"),
  /**
   * Research bands: <60 / 61–150 / 151–400 / 400–600 / >600. The published
   * bands leave page 60 unassigned and overlap at 400; normalized here as
   * 1–60, 61–150, 151–400, 401–600, 601+ (60 joins the first band, 400 the
   * third). Values unchanged.
   */
  insideByPageCount: [
    { minPages: 1, maxPages: 60, inside: m(0.5, "in", "printer-standard", "lulu"), insideFullBleed: m(0.625, "in", "printer-standard", "lulu") },
    { minPages: 61, maxPages: 150, inside: m(0.625, "in", "printer-standard", "lulu"), insideFullBleed: m(0.75, "in", "printer-standard", "lulu") },
    { minPages: 151, maxPages: 400, inside: m(1.0, "in", "printer-standard", "lulu"), insideFullBleed: m(1.125, "in", "printer-standard", "lulu") },
    { minPages: 401, maxPages: 600, inside: m(1.125, "in", "printer-standard", "lulu"), insideFullBleed: m(1.25, "in", "printer-standard", "lulu") },
    { minPages: 601, maxPages: Infinity, inside: m(1.25, "in", "printer-standard", "lulu"), insideFullBleed: m(1.375, "in", "printer-standard", "lulu") },
  ] as readonly LuluInsideBand[],
} as const;
