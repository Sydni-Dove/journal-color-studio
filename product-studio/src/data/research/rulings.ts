/**
 * Ruled / grid standards — research sections 3.1, 3.2.1, 3.4, J-B2 and JSON
 * fragment 3 ("rulings").
 *
 * Note on precision: JSON fragment 3 rounds wide ruling to 0.34 and college to
 * 0.28, while table 3.2.1 gives the exact fractions 11/32" (0.3438) and 9/32"
 * (0.2813). The exact fractions are used here, because the research's own line
 * count table (3.2.2) and blueprint J-B1 are computed with them.
 */
import { m, r } from "./measure";

export const RULINGS = {
  wide: {
    spacing: m(11 / 32, "in", "printer-standard", "findAnyAnswer", "11/32\" = 8.7 mm; wide (legal) ruled"),
    marginLine: m(1.25, "in", "printer-standard", "findAnyAnswer", "32 mm from left edge"),
  },
  college: {
    spacing: m(9 / 32, "in", "printer-standard", "erinCondren", "9/32\" = 7.1 mm; college (medium) ruled"),
    marginLine: r(1.0, 1.25, "in", "printer-standard", "erinCondren"),
    /** Letter page reference: 31 lines per page. */
    letterLinesPerPage: 31,
  },
  narrow: {
    spacing: m(0.25, "in", "printer-standard", "erinCondren", "1/4\" = 6.35 mm"),
    marginLine: r(1.0, 1.25, "in", "printer-standard", "erinCondren"),
  },
  a5RefillLined: {
    spacing: m(7, "mm", "manufacturer-published", "amazonA5RingRefill", "0.7 cm (0.275\")"),
  },
} as const;

export const GRIDS = {
  dotGrid5mm: m(5, "mm", "manufacturer-published", "michaelsDotGrid", "0.1969\""),
  graphGrid5mm: m(5, "mm", "observed-estimated", "gridTool", "typical; 5×5 mm cross-brand"),
  hobonichiDaily: m(3.7, "mm", "manufacturer-published", "hobonichi"),
  hobonichiMonthly: m(3.45, "mm", "manufacturer-published", "amazonHobonichiMonthly"),
  /** J-B2: dot size 0.5–0.8 pt, light gray. */
  dotSize: r(0.5, 0.8, "pt", "derived-calculation", "researchDerivation", "J-B2"),
} as const;

export const CORNELL = {
  cueColumn: m(2.5, "in", "printer-standard", "tuitionCentre", "Pauk convention"),
  conventionalNotesColumn: m(6.0, "in", "printer-standard", "notesForShs", "consumes full letter width before margins"),
  blueprintNotesColumn: m(4.5, "in", "derived-calculation", "researchDerivation", "adapted for 0.75\" side margins (J-B3)"),
  summaryHeight: m(2.0, "in", "printer-standard", "wcu"),
  headerHeight: m(1.0, "in", "derived-calculation", "researchDerivation", "J-B3"),
} as const;

/**
 * Research table 3.2.2 — practical line counts.
 * Derived Calculation: lines = floor((H − topStart − bottomEnd) / spacing),
 * topStart 1.0", bottomEnd 0.75". Kept as a verification fixture: the
 * geometry engine must reproduce these numbers.
 */
export const PRACTICAL_LINE_COUNTS = {
  topStartIn: 1.0,
  bottomEndIn: 0.75,
  rows: [
    { size: "8.5 × 11", heightIn: 11, wide: 26, college: 32, narrow: 37 },
    { size: "8 × 10", heightIn: 10, wide: 24, college: 29, narrow: 33 },
    { size: "7 × 9", heightIn: 9, wide: 21, college: 25, narrow: 29 },
    { size: "6 × 9", heightIn: 9, wide: 21, college: 25, narrow: 29 },
    { size: "A5 5.83 × 8.27", heightIn: 8.27, wide: 18, college: 23, narrow: 26 },
    { size: "5.5 × 8.5", heightIn: 8.5, wide: 19, college: 24, narrow: 27 },
    { size: "5 × 7", heightIn: 7, wide: 15, college: 18, narrow: 21 },
  ],
} as const;
