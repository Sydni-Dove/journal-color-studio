import { CUSTOM_SIZE_ID, findSizePreset } from "../../presets/sizes/sizePresets";
import type { Orientation, PhysicalSize } from "../../types/geometry";
import type { MeasurementConfidence } from "../../types/measurement";
import type { DimensionSettings } from "../../types/project";
import { toInches } from "../units/units";

/**
 * Sanity bounds for any trim (inches). These are input-validation limits for
 * the editor, not print requirements: 1" is below any researched product
 * (smallest: 2.6" skinny mini) and 48" is well above the largest (22" desk pad).
 */
export const MIN_TRIM_IN = 1;
export const MAX_TRIM_IN = 48;

export type ResolvedTrim = PhysicalSize & {
  orientation: Orientation;
  presetId: string;
  label: string;
  confidence?: MeasurementConfidence;
  note?: string;
};

export type DimensionError = { field: "width" | "height" | "preset"; message: string };

/** Apply orientation to an orientation-free (short, long) pair. */
export function orient(short: number, long: number, orientation: Orientation): PhysicalSize {
  const a = Math.min(short, long);
  const b = Math.max(short, long);
  return orientation === "portrait" ? { widthIn: a, heightIn: b } : { widthIn: b, heightIn: a };
}

export function validateDimensions(d: DimensionSettings): DimensionError[] {
  const errors: DimensionError[] = [];
  if (d.sizePresetId === CUSTOM_SIZE_ID) {
    const c = d.custom;
    if (!c) return [{ field: "preset", message: "Custom size selected but no custom dimensions supplied." }];
    for (const [field, v] of [["width", c.width], ["height", c.height]] as const) {
      const inches = toInches(v, c.unit);
      if (!Number.isFinite(inches) || inches <= 0) errors.push({ field, message: `${field} must be a positive number.` });
      else if (inches < MIN_TRIM_IN) errors.push({ field, message: `${field} is below the ${MIN_TRIM_IN}" minimum.` });
      else if (inches > MAX_TRIM_IN) errors.push({ field, message: `${field} exceeds the ${MAX_TRIM_IN}" maximum.` });
    }
  } else if (!findSizePreset(d.sizePresetId)) {
    errors.push({ field: "preset", message: `Unknown size preset "${d.sizePresetId}".` });
  }
  return errors;
}

/**
 * Resolve project dimensions to a canonical trim in inches.
 * Throws on invalid input — call validateDimensions first in UI code.
 */
export function resolveTrim(d: DimensionSettings): ResolvedTrim {
  const errors = validateDimensions(d);
  if (errors.length) throw new Error(errors.map((e) => e.message).join(" "));

  if (d.sizePresetId === CUSTOM_SIZE_ID) {
    const c = d.custom!;
    const w = toInches(c.width, c.unit);
    const h = toInches(c.height, c.unit);
    // Custom sizes keep the entered width/height; orientation swaps them if
    // the entered shape disagrees with the chosen orientation.
    const size = orient(w, h, d.orientation);
    return { ...size, orientation: d.orientation, presetId: CUSTOM_SIZE_ID, label: "Custom" };
  }

  const preset = findSizePreset(d.sizePresetId)!;
  const size = orient(toInches(preset.short, preset.unit), toInches(preset.long, preset.unit), d.orientation);
  return {
    ...size,
    orientation: d.orientation,
    presetId: preset.id,
    label: preset.label,
    confidence: preset.confidence,
    note: preset.note,
  };
}
