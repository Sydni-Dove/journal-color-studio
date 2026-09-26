/**
 * Design tokens. Layout code reads ONLY these semantic tokens — never raw
 * colors, raw font names, or unnamed spacing numbers.
 */

// ─── Spacing ───────────────────────────────────────────────────────────────
export type SpacingDensity = "compact" | "balanced" | "airy";

/** All values in inches. */
export type SpacingTokens = {
  /** Extra inset inside the safe area before content starts (usually 0). */
  page: number;
  /** Gap between major page sections (e.g. grid ↔ sidebar). */
  section: number;
  /** Gap between stacked blocks inside a section. */
  block: number;
  /** Gap between equal columns (calendar, day columns). */
  column: number;
  /** Gap between equal rows. */
  row: number;
  /** Inner padding of boxes and cells. */
  boxPadding: number;
  /** Gap below the page header. */
  headerGap: number;
  /** Gap above the page footer. */
  footerGap: number;
  /** Height of a writing/checklist row in list layouts. */
  listRow: number;
  /** Checkbox edge length. */
  checkbox: number;
  /** Checkbox → text/line gap. */
  checkboxGap: number;
  // ── Semantic spacing (shared components read these; never local nudges) ──
  /** Title ink bottom → the rule (or content) under it. */
  titleToRuleGap: number;
  /** Section heading → the content it labels. */
  headingToContentGap: number;
  /** Label text → the border of the box / cell it sits in. */
  labelToBorderInset: number;
  /** Calendar date → its cell's borders. */
  dateToCellInset: number;
  /** Section heading → its section's edges. */
  sectionHeadingInset: number;
  // ── Decoration composition (physical inches; decoration is placed relative to semantic targets) ──
  /** Decoration → any protected functional content (calendar, notes, writing area, labels). */
  decorationToContentGap: number;
  /** Decoration above / below the title → the title's ink. */
  decorationToTitleGap: number;
  /** Decoration resting on the title rule → the rule. */
  decorationToRuleGap: number;
  /** Accent beside the title (left / right) → the title's ink. */
  titleAccentGap: number;
  /** Contained corner / edge decoration → the trim edge (keeps art clear of trim drift). */
  cornerInset: number;
  /** Bleed decoration: how far the artwork runs past the trim edge (intentional crop). */
  edgeBleedAmount: number;
};

// ─── Typography ────────────────────────────────────────────────────────────
export type TypographyRole =
  | "coverTitle"
  | "coverSubtitle"
  | "productTitle"
  | "monthTitle"
  | "weekTitle"
  | "pageTitle"
  | "sectionHeading"
  | "subheading"
  | "body"
  | "prompt"
  | "label"
  | "accent"
  | "date"
  | "number"
  | "time"
  | "footer";

/** Font selection groups: a role draws its family from one group. */
export type FontGroup = "cover" | "headings" | "subheadings" | "body" | "accent";

export type FontCategory = "serif" | "sans-serif" | "script" | "handwritten" | "display";

export type TextAlign = "left" | "center" | "right";
export type TextTransform = "none" | "uppercase" | "lowercase" | "capitalize" | "small-caps";

export type TypographyRoleStyle = {
  group: FontGroup;
  sizePt: number;
  weight: number;
  style: "normal" | "italic";
  color: ColorToken;
  /** Letter spacing in em. */
  trackingEm: number;
  lineHeight: number;
  align: TextAlign;
  transform: TextTransform;
};

export type FontSelection = Record<FontGroup, string>;

export type TypographySettings = {
  fonts: FontSelection;
  roles: Record<TypographyRole, TypographyRoleStyle>;
};

// ─── Color ─────────────────────────────────────────────────────────────────
export type ColorToken =
  | "primary"
  | "secondary"
  | "accent"
  | "background"
  | "text"
  | "mutedText"
  | "line"
  | "border"
  | "decorativeAccent"
  /** Decoration base (marble stone, floral leaves, watercolor wash). */
  | "decorBase"
  /** Decoration highlight (marble highlights, soft flowers). */
  | "decorHighlight";

export type ColorTokens = Record<ColorToken, string> & {
  /** Opacity applied to `line` for functional writing lines/grids (0–1). */
  lineOpacity: number;
};

export type ColorPalette = {
  id: string;
  label: string;
  /** False when a palette uses colors outside the approved Dove brand palette. */
  brandPalette: boolean;
  /** Where the palette came from (e.g. "journal-color-studio snapshot"). */
  source?: string;
  colors: ColorTokens;
  note?: string;
};

// ─── Wording ───────────────────────────────────────────────────────────────
export type WordingKey =
  | "productTitle"
  | "productSubtitle"
  | "toDo"
  | "notes"
  | "priorities"
  | "topPriorities"
  | "weeklyFocus"
  | "monthlyGoals"
  | "goals"
  | "schedule"
  | "gratitude"
  | "prayer"
  | "prayerRequests"
  | "scripture"
  | "reflection"
  | "kingdomAssignments"
  | "morning"
  | "afternoon"
  | "evening"
  | "week"
  | "weekOf"
  | "date"
  | "journalTitle"
  | "prompt"
  | "habits"
  | "brainDump"
  | "groceryList"
  | "mealPlan"
  | "meetingNotes"
  | "dailyPlan"
  | "produce"
  | "dairy"
  | "protein"
  | "pantry"
  | "frozen"
  | "household"
  | "meetingWithGod"
  | "whatGodSaid"
  | "responseAction";

export type Wording = Record<WordingKey, string>;
