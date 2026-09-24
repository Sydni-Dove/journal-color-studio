import type { MeasurementConfidence } from "../../types/measurement";
import type { Orientation } from "../../types/geometry";
import type { ProductType } from "../../types/product";
import type { SourceKey } from "../../data/research/sources";

/**
 * Size presets. Stored in their NATIVE published unit (inch sizes in inches,
 * ISO/Filofax sizes in millimetres) so no rounding is baked in; the dimension
 * engine converts to canonical inches.
 *
 * `short` × `long` are orientation-free (short ≤ long). Orientation is applied
 * by the dimension engine.
 */
export type SizePreset = {
  id: string;
  label: string;
  unit: "in" | "mm";
  short: number;
  long: number;
  defaultOrientation: Orientation;
  /** Research confidence of the trim size, when the size traces to a research row. */
  confidence?: MeasurementConfidence;
  source?: SourceKey;
  note?: string;
  families: ProductType[];
};

const P: ProductType[] = ["planner", "insert", "worksheet", "tracker"];
const BOOK: ProductType[] = ["journal", "notebook", "planner"];
const PAD: ProductType[] = ["notepad"];

export const SIZE_PRESETS: SizePreset[] = [
  { id: "3x5", label: "3 × 5", unit: "in", short: 3, long: 5, defaultOrientation: "portrait", confidence: "manufacturer-published", source: "velocityBp", note: "retail memo pad", families: PAD },
  { id: "4x6", label: "4 × 6", unit: "in", short: 4, long: 6, defaultOrientation: "portrait", confidence: "manufacturer-published", source: "velocityBp", note: "retail memo pad", families: [...PAD, "insert"] },
  { id: "4x9", label: "4 × 9", unit: "in", short: 4, long: 9, defaultOrientation: "portrait", note: "notepad size list (research JSON fragment 3); no manufacturer row", families: PAD },
  { id: "5x7", label: "5 × 7", unit: "in", short: 5, long: 7, defaultOrientation: "portrait", confidence: "printer-standard", source: "ingramSpark", note: "IngramSpark trim; notepad size list", families: [...PAD, "journal", "insert"] },
  { id: "5x8", label: "5 × 8", unit: "in", short: 5, long: 8, defaultOrientation: "portrait", confidence: "printer-standard", source: "kdp", note: "KDP / IngramSpark trim; memo pad", families: [...BOOK, ...PAD] },
  { id: "5.5x8.5", label: "5.5 × 8.5 (Half Letter)", unit: "in", short: 5.5, long: 8.5, defaultOrientation: "portrait", confidence: "manufacturer-published", source: "franklinPlanner", note: "Franklin Classic; Lulu Digest; half-letter discbound", families: [...BOOK, ...PAD, ...P] },
  { id: "6x9", label: "6 × 9", unit: "in", short: 6, long: 9, defaultOrientation: "portrait", confidence: "printer-standard", source: "kdp", note: "KDP / IngramSpark / Lulu US Trade", families: [...BOOK, ...PAD] },
  { id: "7x9", label: "7 × 9", unit: "in", short: 7, long: 9, defaultOrientation: "portrait", confidence: "manufacturer-published", source: "erinCondren", note: "coiled planner trim", families: [...P, "journal"] },
  { id: "7x9.25", label: "7 × 9.25", unit: "in", short: 7, long: 9.25, defaultOrientation: "portrait", confidence: "observed-estimated", source: "lovelyPlanner", note: "classic disc planner page (third-party sources)", families: P },
  { id: "8x10", label: "8 × 10", unit: "in", short: 8, long: 10, defaultOrientation: "portrait", confidence: "manufacturer-published", source: "erinCondren", note: "large coiled planner; IngramSpark trim", families: [...P, ...BOOK] },
  { id: "8.5x11", label: "8.5 × 11 (Letter)", unit: "in", short: 8.5, long: 11, defaultOrientation: "portrait", confidence: "manufacturer-published", source: "franklinPlanner", note: "Franklin Monarch; KDP/Ingram trim; 50-sheet ruled pad", families: [...P, ...BOOK, ...PAD] },
  { id: "11x17", label: "11 × 17 (Tabloid)", unit: "in", short: 11, long: 17, defaultOrientation: "landscape", confidence: "manufacturer-published", source: "michaelsWeeklyDeskPad", note: "weekly desk pad, landscape, 52 top-glued sheets", families: ["deskpad", "worksheet"] },
  { id: "18x11", label: "18 × 11 Desk Pad", unit: "in", short: 11, long: 18, defaultOrientation: "landscape", confidence: "manufacturer-published", source: "kirkCompactDeskPad", note: "compact monthly desk pad", families: ["deskpad"] },
  { id: "18x12", label: "18 × 12 Desk Pad", unit: "in", short: 12, long: 18, defaultOrientation: "landscape", confidence: "manufacturer-published", source: "amazonPostIt", note: "weekly planner pad", families: ["deskpad"] },
  { id: "22x17", label: "22 × 17 Desk Pad", unit: "in", short: 17, long: 22, defaultOrientation: "landscape", confidence: "manufacturer-published", source: "kirkRuledDeskPad", note: "large monthly desk pad (21.75 × 17 bound)", families: ["deskpad"] },
  { id: "a4", label: "A4", unit: "mm", short: 210, long: 297, defaultOrientation: "portrait", confidence: "canva-published", note: "8.27 × 11.69 (Canva planner document size; ISO 216)", families: [...P, ...BOOK] },
  { id: "a5", label: "A5", unit: "mm", short: 148, long: 210, defaultOrientation: "portrait", confidence: "manufacturer-published", source: "hobonichi", note: "Hobonichi Cousin / Filofax A5", families: [...P, ...BOOK] },
  { id: "a6", label: "A6", unit: "mm", short: 105, long: 148, defaultOrientation: "portrait", confidence: "manufacturer-published", source: "hobonichi", note: "Hobonichi Original", families: [...P, ...BOOK, ...PAD] },
  { id: "filofax-personal", label: "Filofax Personal", unit: "mm", short: 95, long: 171, defaultOrientation: "portrait", confidence: "manufacturer-published", source: "a1Size", note: "6-ring insert", families: ["insert", "planner"] },
  { id: "filofax-pocket", label: "Filofax Pocket", unit: "mm", short: 81, long: 120, defaultOrientation: "portrait", confidence: "observed-estimated", source: "a1Size", note: "6-ring insert", families: ["insert", "planner"] },
  { id: "franklin-compact", label: "Franklin Compact", unit: "in", short: 4.25, long: 6.75, defaultOrientation: "portrait", confidence: "manufacturer-published", source: "franklinPlanner", families: ["insert", "planner"] },
  { id: "franklin-classic", label: "Franklin Classic", unit: "in", short: 5.5, long: 8.5, defaultOrientation: "portrait", confidence: "manufacturer-published", source: "franklinPlanner", families: ["insert", "planner"] },
];

export const CUSTOM_SIZE_ID = "custom";

export function findSizePreset(id: string): SizePreset | undefined {
  return SIZE_PRESETS.find((s) => s.id === id);
}

export function sizePresetsFor(productType: ProductType): SizePreset[] {
  const primary = SIZE_PRESETS.filter((s) => s.families.includes(productType));
  const rest = SIZE_PRESETS.filter((s) => !s.families.includes(productType));
  return [...primary, ...rest];
}
