import type { Measurement, MeasurementRange, Unit } from "../../types/measurement";

/** Canonical internal unit is the inch. These are exact definitions, not estimates. */
export const MM_PER_IN = 25.4;
export const PT_PER_IN = 72;
/** CSS reference pixel: 1in = 96px. Used ONLY for screen preview math. */
export const CSS_PX_PER_IN = 96;

/**
 * Floating-point tolerance for geometry comparisons (inches).
 * One ten-thousandth of an inch is far below any print tolerance
 * (IngramSpark allows 1/16" print variance).
 */
export const GEOMETRY_EPSILON_IN = 1e-4;

export function toInches(value: number, unit: Unit): number {
  switch (unit) {
    case "in":
      return value;
    case "mm":
      return value / MM_PER_IN;
    case "pt":
      return value / PT_PER_IN;
  }
}

export function fromInches(valueIn: number, unit: Unit): number {
  switch (unit) {
    case "in":
      return valueIn;
    case "mm":
      return valueIn * MM_PER_IN;
    case "pt":
      return valueIn * PT_PER_IN;
  }
}

export const mmToIn = (mm: number) => mm / MM_PER_IN;
export const inToMm = (inches: number) => inches * MM_PER_IN;
export const ptToIn = (pt: number) => pt / PT_PER_IN;
export const inToPt = (inches: number) => inches * PT_PER_IN;

/** Value of a sourced measurement in inches. */
export function measurementIn(m: Measurement): number {
  return toInches(m.value, m.unit);
}

export function rangeIn(r: MeasurementRange): { min: number; max: number } {
  return { min: toInches(r.min, r.unit), max: toInches(r.max, r.unit) };
}

export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Display helper: 0.75 -> 0.75", 5 mm -> "5 mm". */
export function formatLength(valueIn: number, unit: Unit = "in", decimals = 3): string {
  const v = roundTo(fromInches(valueIn, unit), decimals);
  if (unit === "in") return `${v}"`;
  return `${v} ${unit}`;
}

export const approxEqual = (a: number, b: number, eps = GEOMETRY_EPSILON_IN) =>
  Math.abs(a - b) <= eps;
