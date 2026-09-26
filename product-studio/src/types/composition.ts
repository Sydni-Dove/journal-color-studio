/**
 * COMPOSITION LAYER — sits between the functional layout and decoration.
 *
 *   PageGeometry → Functional layout → Composition regions / anchors
 *                → Decoration placement → Renderer
 *
 * Every rect is in TRIM coordinates (inches), the same space as layout nodes.
 */
import type { Rect } from "./geometry";

export type CompositionAnchor =
  | "page"
  | "safeArea"
  | "header"
  | "title"
  | "titleRule"
  | "mainContent"
  | "calendar"
  | "notes"
  | "sidebar"
  | "writingArea"
  | "footer"
  | "topLeftAccent"
  | "topRightAccent"
  | "bottomLeftAccent"
  | "bottomRightAccent";

export const COMPOSITION_ANCHORS: { value: CompositionAnchor; label: string }[] = [
  { value: "page", label: "Page" },
  { value: "safeArea", label: "Safe area" },
  { value: "header", label: "Header" },
  { value: "title", label: "Title" },
  { value: "titleRule", label: "Title rule" },
  { value: "mainContent", label: "Main content" },
  { value: "calendar", label: "Calendar / grid" },
  { value: "notes", label: "Notes" },
  { value: "sidebar", label: "Sidebar" },
  { value: "writingArea", label: "Writing area" },
  { value: "footer", label: "Footer" },
  { value: "topLeftAccent", label: "Top-left accent zone" },
  { value: "topRightAccent", label: "Top-right accent zone" },
  { value: "bottomLeftAccent", label: "Bottom-left accent zone" },
  { value: "bottomRightAccent", label: "Bottom-right accent zone" },
];

/** Regions a layout declares for its page (the rest are derived from nodes/geometry). */
export type LayoutRegions = Partial<Record<CompositionAnchor, Rect>>;

export type ProtectedKind = "text" | "rule" | "surface" | "box" | "mark" | "keepout";

/** Functional content decoration must not hit (unless a placement allows overlap). */
export type ProtectedRect = { id: string; kind: ProtectedKind; rect: Rect };

export type Corner = "tl" | "tr" | "bl" | "br";

/**
 * The physical region a CONTAINED corner decoration may occupy: the page
 * quadrant inset from the trim by `cornerInset`. Clearance from content is
 * enforced against the protected rects (already inflated by it), so the
 * artwork's real footprint can wrap around the content's corner.
 */
export type CornerRegion = {
  corner: Corner;
  x: number;
  y: number;
  width: number;
  height: number;
  insetFromTrimIn: number;
  clearanceFromContentIn: number;
};

/** Decoration spacing tokens (inches) the planner places against. */
export type DecorationGaps = {
  toContent: number;
  toTitle: number;
  toRule: number;
  titleAccent: number;
  cornerInset: number;
  edgeBleed: number;
};

export type Composition = {
  /** Resolved physical regions (only anchors that exist on this page). */
  regions: LayoutRegions;
  /** Protected content footprints, already inflated by the clearance. */
  protected: ProtectedRect[];
  /** Bounding box of all functional content (not inflated). */
  content: Rect | null;
  /** The rule under the page title, when the header has one (and its node id). */
  headerRule: Rect | null;
  headerRuleId: string | null;
  /** The page title node (its protected rect id) and how it is aligned. */
  titleId: string | null;
  titleAlign: "start" | "center" | "end";
  /** Contained corner regions. */
  corners: Record<Corner, CornerRegion>;
  /** Decoration spacing tokens. */
  gaps: DecorationGaps;
  /** Font size of the page title (inches) — scales title-relative ornaments. */
  titleEmIn: number;
  /** Decoration ↔ content clearance used to inflate `protected`. */
  clearanceIn: number;
  /** Trim size and bleed (media extends `bleedIn` past each trim edge). */
  trim: { w: number; h: number };
  bleedIn: { x: number; y: number };
};

export type AlignX = "start" | "center" | "end";
export type AlignY = "start" | "center" | "end";

/**
 * How one decorative object is placed. Offsets are nudges from the solved
 * position; the system still enforces clipping / overlap rules afterwards.
 */
export type DecorationPlacement = {
  anchor: CompositionAnchor;
  /** inside = within the anchor region; outside = beside it (e.g. flanking a title). */
  attach: "inside" | "outside";
  alignX: AlignX;
  alignY: AlignY;
  fit: "contain" | "cover" | "natural";
  maxWidthIn?: number;
  maxHeightIn?: number;
  offsetXIn: number;
  offsetYIn: number;
  allowContentOverlap: boolean;
  allowBleed: boolean;
  allowClipping: boolean;
};

/** Fields the editor exposes as user overrides (advanced placement). */
export type DecorationPlacementOverrides = Partial<Omit<DecorationPlacement, "attach">>;
