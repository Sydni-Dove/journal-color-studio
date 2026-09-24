/**
 * Trim sizes — normalized from research sections 1.1, 1.2.1, 1.2.2, A1–A3.
 * Confidence labels are copied exactly from the research tables.
 */
import type { Measurement, MeasurementConfidence } from "../../types/measurement";
import { m } from "./measure";
import type { SourceKey } from "./sources";

export type ResearchBinding =
  | "coil"
  | "disc"
  | "thread-sewn"
  | "six-ring"
  | "five-hole"
  | "ring"
  | "book"
  | "top-perf-corner"
  | "top-glue"
  | "pad";

/** A sourced integer count (holes, discs, sheets) — not a length. */
export type SourcedCount = { value: number; confidence: MeasurementConfidence; source?: SourceKey };

const count = (value: number, confidence: MeasurementConfidence, source?: SourceKey): SourcedCount => ({
  value,
  confidence,
  source,
});

export type ResearchTrimSize = {
  id: string;
  product: string;
  width: Measurement;
  height: Measurement;
  binding?: ResearchBinding;
  discCount?: SourcedCount;
  note?: string;
};

function trim(
  id: string,
  product: string,
  w: number,
  h: number,
  unit: "in" | "mm",
  confidence: Measurement["confidence"],
  source: SourceKey,
  extra: Partial<ResearchTrimSize> = {},
): ResearchTrimSize {
  return { id, product, width: m(w, unit, confidence, source), height: m(h, unit, confidence, source), ...extra };
}

export const PLANNER_TRIM_SIZES: readonly ResearchTrimSize[] = [
  trim("ec-7x9", "Erin Condren LifePlanner", 7, 9, "in", "manufacturer-published", "erinCondren", { binding: "coil" }),
  trim("ec-8x10", "Erin Condren LifePlanner", 8, 10, "in", "manufacturer-published", "erinCondren", { binding: "coil" }),
  trim("hp-classic", "Happy Planner Classic", 7, 9.25, "in", "observed-estimated", "lovelyPlanner", {
    binding: "disc",
    discCount: count(9, "observed-estimated", "etsyHappyPlannerCovers"),
  }),
  trim("hp-big", "Happy Planner Big", 8.5, 11, "in", "observed-estimated", "lovelyPlanner", {
    binding: "disc",
    discCount: count(11, "observed-estimated", "lovelyPlanner"),
  }),
  trim("hp-mini", "Happy Planner Mini", 4.625, 7, "in", "observed-estimated", "lovelyPlanner", {
    binding: "disc",
    discCount: count(7, "observed-estimated", "lovelyPlanner"),
  }),
  trim("hp-skinny-classic", "Happy Planner Skinny Classic", 4.125, 9.25, "in", "observed-estimated", "etsyHappyPlannerCovers", {
    binding: "disc",
  }),
  trim("hp-skinny-mini", "Happy Planner Skinny Mini", 2.6, 7, "in", "observed-estimated", "etsyHappyPlannerCovers", {
    binding: "disc",
  }),
  trim("hp-micro", "Happy Planner Micro", 3, 4, "in", "observed-estimated", "etsyHappyPlannerCovers", { binding: "disc" }),
  trim("hobonichi-original", "Hobonichi Techo Original (A6)", 105, 148, "mm", "manufacturer-published", "hobonichi", {
    binding: "thread-sewn",
  }),
  trim("hobonichi-cousin", "Hobonichi Techo Cousin (A5)", 148, 210, "mm", "manufacturer-published", "hobonichi", {
    binding: "thread-sewn",
  }),
  trim("hobonichi-weeks", "Hobonichi Techo Weeks", 92, 186, "mm", "manufacturer-published", "haruyama", {
    binding: "thread-sewn",
    note: "≈ size, licensed accessory spec",
  }),
  trim("filofax-personal", "Filofax Personal insert", 95, 171, "mm", "manufacturer-published", "a1Size", {
    binding: "six-ring",
    note: "size Manufacturer Published; reference consensus",
  }),
  trim("filofax-pocket", "Filofax Pocket insert", 81, 120, "mm", "observed-estimated", "a1Size", { binding: "six-ring" }),
  trim("filofax-a5", "Filofax A5 insert", 148, 210, "mm", "manufacturer-published", "a1Size", { binding: "six-ring" }),
  trim("filofax-mini", "Filofax Mini insert", 67, 105, "mm", "observed-estimated", "a1Size", { binding: "five-hole" }),
  trim("franklin-pocket", "Franklin Planner Pocket", 3.5, 6, "in", "manufacturer-published", "franklinPlanner", { binding: "ring" }),
  trim("franklin-compact", "Franklin Planner Compact", 4.25, 6.75, "in", "manufacturer-published", "franklinPlanner", {
    binding: "ring",
  }),
  trim("franklin-classic", "Franklin Planner Classic", 5.5, 8.5, "in", "manufacturer-published", "franklinPlanner", {
    binding: "ring",
  }),
  trim("franklin-monarch", "Franklin Planner Monarch", 8.5, 11, "in", "manufacturer-published", "franklinPlanner", {
    binding: "ring",
  }),
  trim("passion-small", "Passion Planner Small (A5)", 5.8, 8.3, "in", "manufacturer-published", "amazonPassionPlanner", {
    binding: "book",
    note: "via brand listings",
  }),
  trim("passion-medium", "Passion Planner Medium (B5)", 6.9, 9.8, "in", "manufacturer-published", "amazonPassionPlanner", {
    binding: "book",
  }),
  trim("passion-large", "Passion Planner Large (A4)", 8.3, 11.7, "in", "manufacturer-published", "amazonPassionPlanner", {
    binding: "book",
  }),
  trim("clever-fox-weekly", "Clever Fox Weekly (A5)", 5.8, 8.3, "in", "manufacturer-published", "amazonCleverFox", {
    binding: "book",
  }),
  trim("plum-paper-7x9", "Plum Paper", 7, 9, "in", "observed-estimated", "allAboutPlanners", { binding: "coil" }),
  trim("half-letter-disc", "Half-letter discbound (Arc/Circa/TUL Junior)", 5.5, 8.5, "in", "observed-estimated", "wendaful", {
    binding: "disc",
    discCount: count(8, "observed-estimated", "wendaful"),
  }),
];

export const DESK_PAD_SIZES: readonly ResearchTrimSize[] = [
  trim("deskpad-22x17", "Monthly desk pad (large)", 22, 17, "in", "manufacturer-published", "kirkRuledDeskPad", {
    binding: "top-perf-corner",
    note: "21.75 × 17 bound-side first",
  }),
  trim("deskpad-18x11", "Monthly desk pad (compact)", 18, 11, "in", "manufacturer-published", "kirkCompactDeskPad", {
    binding: "top-perf-corner",
  }),
  trim("deskpad-11x17-weekly", "Weekly planner pad (11 × 17 landscape)", 17, 11, "in", "manufacturer-published", "michaelsWeeklyDeskPad", {
    binding: "top-glue",
    note: "52 top-glued sheets; lined day columns",
  }),
  trim("deskpad-18x12-postit", "Post-it Weekly Planner", 18, 12, "in", "manufacturer-published", "amazonPostIt", { binding: "pad" }),
  trim("deskpad-a4-planner-pad", "Weekly/monthly planner pad (A4)", 11.7, 8.3, "in", "observed-estimated", "etsyA4PlannerPad", {
    binding: "top-glue",
  }),
];

/** Desk-pad daily block sizes (section 1.1 rows 28–32, 1.2.2). */
export const DESK_PAD_DAILY_BLOCKS = {
  large22x17Ruled: { w: m(2.88, "in", "manufacturer-published", "kirkRuledDeskPad"), h: m(2.38, "in", "manufacturer-published", "kirkRuledDeskPad") },
  large22x17Unruled: { w: m(3, "in", "manufacturer-published", "kirkUnruledDeskPad"), h: m(2.38, "in", "manufacturer-published", "kirkUnruledDeskPad") },
  perforlife22x17: { w: m(2.36, "in", "manufacturer-published", "amazonPerforlife"), h: m(2.36, "in", "manufacturer-published", "amazonPerforlife") },
  compact18x11: { w: m(1.5, "in", "manufacturer-published", "kirkCompactDeskPad"), h: m(1.5, "in", "manufacturer-published", "kirkCompactDeskPad") },
  promo22x17: { w: m(2.44, "in", "observed-estimated", "calendarCo"), h: m(2.25, "in", "observed-estimated", "calendarCo") },
  // Published as 4.2 × 2.7 cm; stored in mm to keep the unit set to in | mm | pt.
  a4PlannerPad: { w: m(42, "mm", "observed-estimated", "etsyA4PlannerPad", "published as 4.2 cm"), h: m(27, "mm", "observed-estimated", "etsyA4PlannerPad", "published as 2.7 cm") },
} as const;

/** Printer-offered trim sizes (sections A1–A3). Printer Standard. */
export const PRINTER_TRIM_OFFERINGS = {
  kdp: ["5x8", "5.25x8", "6x9", "6.14x9.21", "7x10", "8.5x11", "8.27x11.69"],
  ingramSpark: [
    "5x7", "5x8", "5.25x8", "5.5x8.25", "5.5x8.5", "5.83x8.27", "6x9", "6.14x9.21", "7x10",
    "7.5x9.25", "8x10", "8.25x11", "8.5x11", "11x8.5",
  ],
  lulu: ["4.25x6.875", "5.5x8.5", "5.83x8.27", "6.14x9.21", "6x9"],
} as const;
