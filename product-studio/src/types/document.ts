/**
 * UNIVERSAL DOCUMENT MODEL — the structure every Product Studio document
 * shares, whatever it is (devotional, workbook, inventory notebook, notary
 * journal, intake form, planner…), whatever its template, size, orientation
 * or style.
 *
 *   DocumentStructure  WHAT the document is: a tree of components with stable
 *                      ids and typed fields. No fonts, colors or positions.
 *   PresentationHints  HOW a component is styled, keyed by component id
 *                      (template / style layer). Never content.
 *   DocumentData       WHAT is filled in: values and records keyed by field
 *                      (absent for a blank printable form).
 *   Requirements       (reserved) why parts of the document exist and where
 *                      that came from. Never affects layout or rendering.
 *
 * Layout is computed from structure + presentation + page geometry by the
 * existing solvers; nothing here holds coordinates. Manual templates and the
 * future AI generator produce this same structure.
 *
 * Status: foundation only. Today's pages still store PromptSet
 * (types/prompts.ts); engines/document/model.ts converts it to and from this
 * model losslessly, and nothing draws from this model yet.
 */

// ─── Values ──────────────────────────────────────────────────────────────────

/**
 * What a field or table column holds. Typed now so records can later be
 * sorted, totalled or exported (CSV / spreadsheet) without changing the
 * model. "computed" is reserved: no formulas are evaluated in this phase.
 */
export type ValueType =
  | "text"
  | "longText"
  | "number"
  | "currency"
  | "date"
  | "time"
  | "quantity"
  | "boolean"
  | "choice"
  | "signature"
  | "reference"
  | "computed";

/** A labelled value a component asks for (a blank on a form, a column of a table). */
export type FieldDef = {
  /** Stable key the value is stored under. */
  key: string;
  label: string;
  valueType: ValueType;
  /** quantity: its unit ("lb", "hours"); choice: its options. */
  unit?: string;
  options?: string[];
  /** How much room a value usually needs, in characters (guides column widths and wrapping). */
  expectedLength?: number;
};

// ─── Components ──────────────────────────────────────────────────────────────

/** How a writing area asks for room: an exact number of lines, the space left, or an equal share. */
export type SpaceRequest = { mode: "fixed" | "fill" | "equal"; lines?: number; minLines?: number; weight?: number };

/** How a component's content is filled in later: one value, or a repeatable list of entries. */
export type DataBinding = { mode: "field" | "list"; key: string };

type Base = {
  /** Stable for the life of the document (requirement links, page ↔ entry navigation, data keys). */
  id: string;
  binding?: DataBinding;
};

export type TextComponent = Base & { kind: "text"; text: string };
export type HeadingComponent = Base & { kind: "heading"; text: string; level: "title" | "heading"; detail?: string };
export type FieldGroupComponent = Base & { kind: "fieldGroup"; fields: FieldDef[] };
/** A prompt (optional heading and question) with room to answer in the page's writing style or a chosen surface. */
export type QuestionComponent = Base & {
  kind: "question";
  label: string;
  prompt?: string;
  response: "pattern" | "ruled" | "blank" | "dot-grid" | "graph-grid";
  space: SpaceRequest;
};
export type ChecklistComponent = Base & {
  kind: "checklist";
  label: string;
  prompt?: string;
  space: SpaceRequest;
  marker?: "square" | "circle" | "none";
  markerPosition?: "left" | "right";
  /** A writing line on each row (default true). */
  lines?: boolean;
};
export type TableComponent = Base & {
  kind: "table";
  label: string;
  prompt?: string;
  columns: FieldDef[];
  rows: number;
  showHeader?: boolean;
  rowSpace?: "compact" | "standard" | "spacious";
  space: SpaceRequest;
};
/**
 * A repeating record (reserved): one record template drawn as many times as
 * the data or the page allows — notary journal entries, inventory items,
 * maintenance visits. Records never split across pages; `numbering`
 * continues across the whole document.
 */
export type RecordComponent = Base & {
  kind: "record";
  label: string;
  fields: FieldDef[];
  perPage?: number | "fill";
  numbering?: { prefix?: string; start: number };
};
/** A titled group of components; it may repeat once per entry of a list binding (reserved). */
export type SectionComponent = Base & { kind: "section"; label?: string; children: DocComponent[]; repeat?: "once" | "per-entry" };
/** An image (reserved): a reference to an uploaded or library asset, never embedded pixels. */
export type ImageComponent = Base & { kind: "image"; assetRef: string; alt: string };
export type DividerComponent = Base & { kind: "divider" };
export type SpacerComponent = Base & { kind: "spacer"; size: "small" | "medium" | "large" };

export type DocComponent =
  | TextComponent
  | HeadingComponent
  | FieldGroupComponent
  | QuestionComponent
  | ChecklistComponent
  | TableComponent
  | RecordComponent
  | SectionComponent
  | ImageComponent
  | DividerComponent
  | SpacerComponent;
export type DocComponentKind = DocComponent["kind"];

// ─── Presentation (template / style layer) ───────────────────────────────────

/**
 * Styling for one component. Changing any of these is cosmetic: it never
 * changes what the document asks for (requirement checks ignore it).
 */
export type ComponentPresentation = {
  frame?: "open" | "divider" | "outline" | "panel" | "rounded" | "rule";
  badge?: string;
  headingAlign?: "left" | "center" | "right";
  headingRule?: boolean;
  headingFont?: string;
  headingSizePt?: number;
  /** Sit beside the component above, as two columns. */
  beside?: boolean;
  /** Text: printed as body text rather than a heading. */
  bodyText?: boolean;
  /** Field group: each blank as a line or a box, by position. */
  fieldStyles?: ("line" | "box")[];
  /** Table: rule treatment (never changes table geometry). */
  tableBorders?: "grid" | "horizontal" | "minimal" | "none";
};
export type PresentationHints = Record<string, ComponentPresentation>;

/** A whole page / document section: its components and the page-level rules that are not styling. */
export type DocumentStructure = {
  components: DocComponent[];
  /** When the content doesn't fit: continue on more pages (default), first use fewer lines, or report it. */
  whenFull?: "continue" | "fewer-lines" | "stop";
  /** Every writing area gets this many lines. */
  sameLines?: number;
};

// ─── Data ────────────────────────────────────────────────────────────────────

export type FieldValue = string | number | boolean | null;
/** One entry of a list (a devotional day, an inventory item): stable id, values by field key. */
export type DataRecord = { id: string; values: Record<string, FieldValue> };
export type DocumentData = { values: Record<string, FieldValue>; lists: Record<string, DataRecord[]> };

// ─── Requirements (reserved — not used by any feature yet) ───────────────────

/** Where a requirement came from. These are never merged or upgraded into one another. */
export type RequirementSource =
  | { kind: "regulation"; title: string; url?: string; quote: string; retrievedAt: string }
  | { kind: "user"; title?: string; fileRef?: string; quote?: string; providedAt: string }
  | { kind: "ai-suggestion"; rationale?: string; suggestedAt: string };

export type Requirement = {
  id: string;
  /** What is required, in plain words ("Record the signer's identification type"). */
  statement: string;
  source: RequirementSource;
  verification: { status: "unverified" | "verified" | "stale" | "disputed"; by?: string; at?: string };
  /** Where it applies (empty for business procedures, curricula, organizational policies). */
  jurisdiction?: string;
  strength: "mandatory" | "recommended" | "optional";
  /**
   * "document": satisfied by components of the document (a field, a column).
   * "operational": depends on conduct outside the document (how long records
   * are kept, who may sign); the document can never mark it satisfied.
   */
  satisfiedBy: "document" | "operational";
};

/** A requirement linked to the component that addresses it, with that component's approved configuration. */
export type RequirementLink = {
  requirementId: string;
  componentId: string;
  /** Semantic fingerprint (engines/document/model.ts) of the component when the link was approved. */
  approvedFingerprint: string;
};

/** How the document was set up: researched requirements, the user's own specifications, or a general template (no claims). */
export type DocumentMode = "researched" | "user-specification" | "general";

/**
 * Per-requirement standing — reported one by one, never as a blanket claim:
 *   met          structurally present: its linked components exist, unchanged since approval
 *   changed      a linked component was materially changed or removed since approval
 *   missing      nothing in the document addresses it
 *   unverified   its source has not been verified (or is stale / disputed)
 *   operational  depends on conduct outside the document; never satisfiable here
 * Even "met" only means the document has the right parts; it is not a legal
 * compliance claim.
 */
export type RequirementStanding = "met" | "changed" | "missing" | "unverified" | "operational";
