import type { Rect } from "./geometry";
import type { Provenance } from "./measurement";
import type { ColorToken, TextAlign, TypographyRole } from "./tokens";

/**
 * Layout nodes are the single hand-off between the pure layout solvers and
 * every renderer (editor preview, print, validation). All coordinates are in
 * inches relative to the TRIM top-left corner. Renderers never compute
 * geometry; they only draw these nodes. This is what guarantees
 * Preview = Print.
 */

export type PrimitiveName =
  | "PageHeader"
  | "PageFooter"
  | "Section"
  | "SectionHeader"
  | "Grid"
  | "GridCell"
  | "CalendarCell"
  | "MiniCalendar"
  | "Divider"
  | "WritingLines"
  | "DotGrid"
  | "GraphGrid"
  | "ChecklistRow"
  | "Checkbox"
  | "ScheduleRow"
  | "TimeLabel"
  | "NotesArea"
  | "Sidebar"
  | "Text";

type NodeBase = {
  id: string;
  component: PrimitiveName;
  /** Bounding box used for validation + debug "component bounds". */
  rect: Rect;
  /**
   * Functional content (writing lines, checkboxes, dates, labels) must stay
   * inside the safe area. Purely structural bounds (group) are exempt.
   */
  functional: boolean;
};

export type BoxNode = NodeBase & {
  type: "box";
  stroke: ColorToken | null;
  strokePt: number;
  fill: ColorToken | null;
  fillOpacity: number;
  radiusIn: number;
};

export type TextNode = NodeBase & {
  type: "text";
  text: string;
  role: TypographyRole;
  /** Overrides the role's alignment when set. */
  align?: TextAlign;
  vAlign: "top" | "middle" | "bottom";
  /** Single-line labels must not wrap; prompts may. */
  wrap: boolean;
  color?: ColorToken;
};

export type LinesNode = NodeBase & {
  type: "lines";
  orientation: "horizontal" | "vertical";
  /** Absolute y (horizontal) or x (vertical) of each line. */
  positions: number[];
  /** Line extent along the other axis. */
  from: number;
  to: number;
  strokePt: number;
  color: ColorToken;
  opacity: number;
};

export type DotsNode = NodeBase & {
  type: "dots";
  xs: number[];
  ys: number[];
  dotPt: number;
  color: ColorToken;
  opacity: number;
};

export type CheckboxNode = NodeBase & {
  type: "checkbox";
  strokePt: number;
  color: ColorToken;
  radiusIn: number;
};

export type RuleNode = NodeBase & {
  type: "rule";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokePt: number;
  color: ColorToken;
};

/** Structural grouping — bounds only (debug + validation). */
export type GroupNode = NodeBase & {
  type: "group";
  /** Optional column / row boundaries for the debug row/column overlay. */
  columnEdges?: number[];
  rowEdges?: number[];
};

export type LayoutNode = BoxNode | TextNode | LinesNode | DotsNode | CheckboxNode | RuleNode | GroupNode;

export type LayoutDiagnosticSeverity = "error" | "warning" | "info";

/** Problems detected while SOLVING (e.g. fixed modules exceed space). */
export type LayoutDiagnostic = {
  severity: LayoutDiagnosticSeverity;
  rule: string;
  componentId: string;
  message: string;
  measurement?: { actualIn: number; limitIn: number };
};

/** A named derived value surfaced in the Geometry Info view. */
export type LayoutMetric = {
  label: string;
  value: number;
  unit: "in" | "pt" | "count";
  provenance: Provenance;
};

export type SolvedPage = {
  nodes: LayoutNode[];
  diagnostics: LayoutDiagnostic[];
  metrics: LayoutMetric[];
};
