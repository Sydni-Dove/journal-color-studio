import type { Provenance } from "./measurement";
import type { BindingType } from "./binding";

/** All geometry is in inches. Origin (0,0) is the TRIM top-left corner. */
export type Orientation = "portrait" | "landscape";

export type PhysicalSize = {
  widthIn: number;
  heightIn: number;
};

export type Rect = { x: number; y: number; w: number; h: number };

/** Physical page edges as seen when looking at the printed side. */
export type Edge = "top" | "bottom" | "left" | "right";

/** Book-logical edges. "inside" = bound/gutter side, "outside" = fore-edge. */
export type LogicalEdge = "top" | "bottom" | "inside" | "outside";

export type EdgeBox = Record<Edge, number>;

/**
 * recto = right-hand page of a spread (odd page numbers)
 * verso = left-hand page of a spread (even page numbers)
 * single = standalone sheet (notepads, desk pads, single-sided inserts)
 */
export type PageSide = "recto" | "verso" | "single";

export type KeepOutKind = "binding" | "glue" | "printer-safety";

export type KeepOutZone = {
  id: string;
  kind: KeepOutKind;
  edge: Edge;
  /** Depth measured inward from the trim edge. */
  depthIn: number;
  rect: Rect;
  label: string;
  provenance: Provenance;
};

export type PunchHole = {
  shape: "round" | "mushroom" | "rect";
  cx: number;
  cy: number;
  w: number;
  h: number;
};

/**
 * Per-edge margin resolution. Keeps the three geometry classes separate:
 * required (printer/binding) · recommended (studio) · user (design choice).
 */
export type EdgeMarginResolution = {
  edge: Edge;
  logicalEdge: LogicalEdge;
  requiredIn: number;
  /** Sorted: governing (largest) requirement first. */
  requiredBasis: Provenance[];
  recommendedIn: number;
  recommendedBasis: Provenance;
  userIn?: number;
  /** max(required, user ?? recommended) — never below required. */
  effectiveIn: number;
  /** True when a user value below `required` was clamped. */
  clamped: boolean;
};

export type PageGeometry = {
  trimWidthIn: number;
  trimHeightIn: number;
  orientation: Orientation;
  side: PageSide;
  bindingType: BindingType;
  /** Physical edge carrying binding/glue on THIS page, or null. */
  boundEdge: Edge | null;

  /** Bleed per physical edge (0 where the printer forbids bleed, e.g. gutter). */
  bleed: EdgeBox;
  bleedTopIn: number;
  bleedBottomIn: number;
  bleedInsideIn: number;
  bleedOutsideIn: number;

  /** Effective safe margins per physical edge. */
  safe: EdgeBox;
  safeTopIn: number;
  safeBottomIn: number;
  safeInsideIn: number;
  safeOutsideIn: number;

  /** Safe (live) area rectangle in trim coordinates. */
  safeRect: Rect;
  usableWidthIn: number;
  usableHeightIn: number;

  /** Output media = trim + bleed. */
  mediaWidthIn: number;
  mediaHeightIn: number;
  /** Where the trim origin sits inside the media box. */
  trimOffset: { x: number; y: number };

  keepOuts: KeepOutZone[];
  holes: PunchHole[];
  margins: EdgeMarginResolution[];
};
