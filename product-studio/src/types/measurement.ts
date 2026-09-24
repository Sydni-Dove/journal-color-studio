/**
 * Measurement + provenance model.
 *
 * Two independent axes are tracked for every meaningful number:
 *
 * 1. MeasurementConfidence — WHERE the research value came from. These are the
 *    five confidence classes used by the Print Product Geometry Library
 *    (research snapshot 2026-09-24). They are never upgraded: an Observed /
 *    Estimated value is never relabelled Manufacturer Published.
 *
 * 2. GeometryClass — WHAT ROLE the value plays in Product Studio:
 *      required-production  imposed by a printer, manufacturer or binding system
 *      studio-recommended   Dove Expressions Product Studio default
 *      user-design          chosen by the user within safe constraints
 *
 * A studio default can be *based on* research (e.g. coil margin 0.75 = printer
 * keep-out 0.5 + studio comfort 0.25) but it is still a studio default, not a
 * printer requirement.
 */

export type MeasurementConfidence =
  | "manufacturer-published"
  | "printer-standard"
  | "canva-published"
  | "observed-estimated"
  | "derived-calculation";

export type Unit = "in" | "mm" | "pt";

export type Measurement = {
  value: number;
  unit: Unit;
  confidence: MeasurementConfidence;
  /** Key into the source registry (data/research/sources.ts). */
  source?: string;
  note?: string;
};

export type MeasurementRange = {
  min: number;
  max: number;
  unit: Unit;
  confidence: MeasurementConfidence;
  source?: string;
  note?: string;
};

export type GeometryClass = "required-production" | "studio-recommended" | "user-design";

/**
 * Provenance attached to a resolved geometry value so the Geometry Info view can
 * explain every number on the page.
 */
export type Provenance = {
  geometryClass: GeometryClass;
  /** Present when the value is traceable to a research measurement. */
  confidence?: MeasurementConfidence;
  source?: string;
  /** Human explanation, e.g. "0.5 printer keep-out + 0.25 writing comfort". */
  basis?: string;
};

export type ResolvedValue = {
  label: string;
  valueIn: number;
  provenance: Provenance;
};

export const CONFIDENCE_LABEL: Record<MeasurementConfidence, string> = {
  "manufacturer-published": "Manufacturer Published",
  "printer-standard": "Printer Standard",
  "canva-published": "Canva Published",
  "observed-estimated": "Observed / Estimated",
  "derived-calculation": "Derived Calculation",
};

export const GEOMETRY_CLASS_LABEL: Record<GeometryClass, string> = {
  "required-production": "Required Production",
  "studio-recommended": "Studio Default",
  "user-design": "User Design",
};
