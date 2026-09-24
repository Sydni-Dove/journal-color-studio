/**
 * Binding / punch geometry — research section A4, the binding keep-out table
 * (2.2), blueprints A-B2..A-B5, and JSON fragment 2 ("bindingKeepOut").
 */
import { m, r } from "./measure";

export const COIL = {
  /** ≥ 0.5" clear margin along punched edge. */
  boundEdgeKeepOut: m(0.5, "in", "printer-standard", "printivity"),
  /** PrintNinja variant: 0.525" inside bound edge (0.4"/10 mm inside trim). */
  boundEdgeKeepOutPrintNinja: m(0.525, "in", "printer-standard", "printNinja"),
  otherEdges: m(0.25, "in", "printer-standard", "printNinja", "0.125\" inside trim"),
  /** 4:1 pitch = 4 holes/inch. */
  holePitch: m(0.25, "in", "manufacturer-published", "amazonCoilPaper", "4:1 pitch; 44 holes on 11\" edge"),
  holeCenterFromEdgeOptions: [
    m(3, "mm", "manufacturer-published", "tiendamiaCoilMachine"),
    m(5, "mm", "manufacturer-published", "tiendamiaCoilMachine"),
    m(7, "mm", "manufacturer-published", "tiendamiaCoilMachine"),
  ],
  /** A-B2: "hole-center 5 mm (0.20") from edge typical". */
  holeCenterTypical: m(5, "mm", "manufacturer-published", "tiendamiaCoilMachine", "typical per A-B2"),
} as const;

export const WIRE_O = {
  boundEdgeKeepOut: m(0.525, "in", "printer-standard", "printNinja"),
  otherEdges: m(0.25, "in", "printer-standard", "printNinja"),
  /** "Same punch family as coil." Pitch not separately published. */
} as const;

export const DISC = {
  /** Disc holes spaced 0.98" (≈25 mm) apart; compatible across HP/Arc/Circa/TUL. */
  holePitch: m(0.98, "in", "manufacturer-published", "amazonDiscPunch", "≈25 mm"),
  /** Keep functional content ≥ 0.5" from punched edge. */
  writingSafe: m(0.5, "in", "derived-calculation", "researchDerivation", "mushroom holes remove ~0.25–0.35\" + handling"),
  mushroomCutDepth: r(0.25, 0.35, "in", "derived-calculation", "researchDerivation", "not published"),
  mushroomCutTypical: m(0.3, "in", "derived-calculation", "researchDerivation", "A-B3 ≈0.3\" deep"),
  otherEdges: m(0.5, "in", "derived-calculation", "researchDerivation", "keep-out table 2.2"),
  discDiameter: {
    mini: m(0.75, "in", "observed-estimated", "etsyHappyPlannerDisc", "19 mm"),
    classic: m(1.25, "in", "observed-estimated", "etsyHappyPlannerDisc", "32 mm"),
    expander: m(1.75, "in", "observed-estimated", "etsyHappyPlannerDisc", "44 mm"),
  },
} as const;

export const SIX_RING = {
  adjacentHoleSpacing: m(19, "mm", "observed-estimated", "mayPaperCo", "refill-maker consensus"),
  groupGapPersonalPocket: m(50, "mm", "observed-estimated", "mayPaperCo"),
  groupGapA5: m(70, "mm", "observed-estimated", "mayPaperCo"),
  /** Not published — derived assumption 11–12 mm. */
  holeCenterFromEdge: r(11, 12, "mm", "derived-calculation", "researchDerivation", "assumption; not published"),
  holeCenterFromEdgeTypical: m(11.5, "mm", "derived-calculation", "researchDerivation", "A-B4"),
  /** Content keep-out 15 mm (0.6"). */
  contentKeepOut: m(15, "mm", "derived-calculation", "researchDerivation", "A-B4: 0.6\""),
  otherEdges: m(0.5, "in", "observed-estimated", "mayPaperCo", "keep-out table 2.2"),
} as const;

export const FRANKLIN_RING = {
  /** 2 groups of 3 holes. */
  groupGapClassic: m(70, "mm", "observed-estimated", "etsyFranklinPunch", "between group centers"),
  groupGapCompact: m(50, "mm", "observed-estimated", "etsyFranklinPunch", "between group centers"),
} as const;

export const SADDLE_STITCH = {
  pageMultiple: 4,
  minPagesPractical: 8,
  /** Practical max ~48–100 pages depending on stock (page counts, not lengths). */
  maxPagesPractical: { min: 48, max: 100, confidence: "printer-standard", source: "designYourWay" },
  innerMargin: r(0.25, 0.375, "in", "printer-standard", "designYourWay"),
  otherEdges: m(0.25, "in", "printer-standard", "designYourWay"),
  /** Creep is applied at imposition by the printer — never baked into files. */
  creepHandledBy: "printer-imposition" as const,
} as const;

export const PERFECT_BOUND = {
  innerMargin: r(0.5, 0.75, "in", "printer-standard", "designYourWay", "per KDP table; grows with page count"),
  otherEdges: r(0.25, 0.375, "in", "printer-standard", "designYourWay"),
} as const;

export const CASE_BOUND = {
  /** Board = trim + 0.25" (squares/overhang). */
  boardOverTrim: m(0.25, "in", "printer-standard", "ingramSparkGuide"),
} as const;

export const NOTEPAD_GLUE = {
  /** Keep important elements ≥ 0.5" from the glued edge. */
  boundEdgeClearance: m(0.5, "in", "manufacturer-published", "uPrinting"),
  otherEdges: r(0.25, 0.5, "in", "manufacturer-published", "uPrinting", "keep-out table 2.2"),
  /** ≈0.25"–0.375" glue band + chipboard backer (trade convention). */
  glueBand: r(0.25, 0.375, "in", "derived-calculation", "researchDerivation", "trade convention"),
  /** A-B5: glue band 0.375 at top; live top starts at glue + 0.125. */
  glueBandBlueprint: m(0.375, "in", "derived-calculation", "researchDerivation", "A-B5"),
  liveStartBeyondGlue: m(0.125, "in", "derived-calculation", "researchDerivation", "A-B5"),
  perforationBelowGlue: m(0.375, "in", "derived-calculation", "researchDerivation", "tear-off perf pads"),
  sheetCounts: [25, 50, 100] as const,
  glueEdges: ["top", "bottom", "left", "right"] as const,
  /** Full-bleed backgrounds discouraged on writable pads (UPrinting artwork guidance). */
  fullBleedDiscouraged: true,
} as const;
