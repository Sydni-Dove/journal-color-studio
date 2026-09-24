import type {
  Measurement,
  MeasurementConfidence,
  MeasurementRange,
  Unit,
} from "../../types/measurement";
import type { SourceKey } from "./sources";

/** Compact constructors used only by the normalized research data files. */
export function m(
  value: number,
  unit: Unit,
  confidence: MeasurementConfidence,
  source?: SourceKey,
  note?: string,
): Measurement {
  return { value, unit, confidence, source, note };
}

export function r(
  min: number,
  max: number,
  unit: Unit,
  confidence: MeasurementConfidence,
  source?: SourceKey,
  note?: string,
): MeasurementRange {
  return { min, max, unit, confidence, source, note };
}
