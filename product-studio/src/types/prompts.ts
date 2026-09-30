/**
 * PROMPT + RESPONSE — one content model for every page section that is "a
 * prompt, then room to answer it": guided pages (Meeting With God, vision,
 * goals, reviews, prayer, reflection, custom), devotional recipes (Daily
 * Reflection, SOAP, Verse Mapping) and worksheets.
 *
 * The creator chooses the content (how many prompts, their wording, how many
 * writing lines, the response style). The layout engine decides whether it
 * fits the page and, when it doesn't, continues on another page rather than
 * shrinking the writing space. Locked structures (hourly schedules, calendars,
 * tables) are NOT prompt blocks.
 */

/** How a prompt's answer area is drawn. */
export type ResponseStyle = "ruled" | "blank" | "dot-grid" | "graph-grid" | "checkboxes" | "table";
export type TaskMarker = "square" | "circle" | "none";
export type TaskMarkerPosition = "left" | "right";

export type PromptTable = {
  /** Column headings. Equal widths are used by default; the table solver keeps them printable. */
  columns: string[];
  /** Exact number of writing rows requested. */
  rows: number;
  /** Show the heading row. Default true. */
  showHeader?: boolean;
  /** Visual rule treatment; never changes table geometry. */
  borders?: "grid" | "horizontal" | "minimal" | "none";
  /** Row height in plain words (default standard); "Fill remaining space" is the block's `fill` space. */
  rowSpace?: TableRowSpace;
};

/** Table row heights, as a share of the studio's list-row token. */
export const TABLE_ROW_SCALE = { compact: 0.85, standard: 1, spacious: 1.35 } as const;
export type TableRowSpace = keyof typeof TABLE_ROW_SCALE;
/**
 * A table set to fill the page stretches its rows evenly; rows never grow past
 * this many times their normal height — beyond it more rows are drawn, so
 * every row stays a comfortable writing height.
 */
export const TABLE_MAX_STRETCH = 1.6;

/** Heading / text piece: which of the studio's text roles it prints in. */
export type HeadingTextStyle = "title" | "heading" | "body";

/**
 * How a section's writing space is set:
 *   fixed  exactly `lineCount` lines
 *   fill   takes the space the other sections leave (shared by weight when several fill)
 *   equal  an equal share: every "equal" section on the page gets the same number of whole lines
 */
export type SpaceMode = "fixed" | "fill" | "equal";

/**
 * PAGE COMPOSER — what a section IS. "prompt" (the default) is every section
 * with writing space: a writing area, a prompt + writing space, a checklist /
 * task list or a table (by its responseStyle). The others hold no writing:
 *   heading  a heading and an optional line of text
 *   info     one row of labelled blanks ("Date ____  Project ____")
 *   divider  a thin rule between sections
 *   spacer   open space of a chosen height
 * Every kind flows top to bottom in the page's structured layout: nothing is
 * positioned by hand, overlaps or leaves the print-safe area.
 */
export type PromptBlockKind = "prompt" | "heading" | "info" | "divider" | "spacer";

/**
 * How a section will be filled in (a later Fill Mode attaches real content to
 * it without changing the page's structure):
 *   field  one value or writing area ("Current Focus", "Prayer", "Notes")
 *   list   a repeatable set of entries ("Projects", "Prophetic Words")
 * `key` is the stable name the content is stored under (defaults to the block id).
 */
export type PromptBlockContent = { mode: "field" | "list"; key?: string };

/**
 * How much room a writing section asks for, in plain words. Each is a whole
 * number of writing lines (or list rows) at the page's own ruling; "Fill
 * remaining space" is the `fill` space mode. Exact line counts stay available
 * under a section's "More" options.
 */
export const WRITING_AMOUNTS = { compact: 3, standard: 6, spacious: 10 } as const;
export type WritingAmount = keyof typeof WRITING_AMOUNTS;

/** The plain amount a section's fixed line count matches, if any. */
export function amountOf(lines: number | undefined): WritingAmount | undefined {
  return (Object.keys(WRITING_AMOUNTS) as WritingAmount[]).find((k) => WRITING_AMOUNTS[k] === lines);
}

/** An info-row blank: a writing line after the label, or an open box to write in. */
export type InfoFieldStyle = "line" | "box";
/** Most blanks one info row offers (more are cramped on a journal page). */
export const MAX_INFO_FIELDS = 3;

/**
 * A section's visual treatment. Colors are the palette's semantic tokens, so
 * a section follows the product's Style:
 *   open     no border (default)
 *   divider  a rule under the section
 *   outline  a soft outline
 *   panel    a subtle filled panel
 *   rounded  a rounded, softly filled panel
 *   rule     a line down the left side, the content set in from it
 */
export type SectionFrame = "open" | "divider" | "outline" | "panel" | "rounded" | "rule";

/** Open-space heights a spacer offers (inches). */
export const SPACER_HEIGHTS = { small: 0.25, medium: 0.5, large: 1 } as const;
export type SpacerSize = keyof typeof SPACER_HEIGHTS;

export type PromptBlock = {
  /** Stable id (recipe zone key, or generated). */
  id: string;
  /** What the section is (default "prompt": a section with writing space). */
  kind?: PromptBlockKind;
  /** Heading / text: its text role (default section heading; pages saved before this print as before). */
  textStyle?: HeadingTextStyle;
  /** Info row: its labelled blanks, left to right (up to MAX_INFO_FIELDS). */
  fields?: string[];
  /** Info row: each blank's style, by position (default: a line). */
  fieldStyles?: InfoFieldStyle[];
  /** Visual treatment (default: the page's section style, else open). */
  frame?: SectionFrame;
  /** A number (or short mark) in a soft circle beside the section heading ("1", "2", …). */
  badge?: string;
  /** Sit beside the section above, as two columns (writing sections only). */
  beside?: boolean;
  /** Checklist / task list: a writing line on each row (default true). */
  taskLines?: boolean;
  /** Spacer: how much open space. */
  spacer?: SpacerSize;
  /** How the section is filled in later (default: list for checklists and tables, field otherwise). */
  content?: PromptBlockContent;
  /** The section heading ("MY RESPONSE", "What did God say?"); may be empty (prompt only). */
  label: string;
  /** Optional smaller prompt / instruction under the heading ("What obedience does this word call for?"). */
  prompt?: string;
  /** How the writing space is set (default: fixed when `lineCount` is set, otherwise fill). */
  space?: SpaceMode;
  /** undefined = the page's own writing style (its recipe surface or the project's writing lines). */
  responseStyle?: ResponseStyle;
  /** Writing lines / checklist items requested; undefined = fill the space left on the page. */
  lineCount?: number;
  /** Checklist/task-list marker and placement. */
  taskMarker?: TaskMarker;
  taskMarkerPosition?: TaskMarkerPosition;
  /** Structured table settings when responseStyle is "table". */
  table?: PromptTable;
  /** Never fewer lines than this when the page is short (default 2; migrated pages: 0 = as before). */
  minLines?: number;
  /** Share of the free space for "fill the space" prompts (default 1). */
  weight?: number;
};

/**
 * An optional designed header above the sections (first page): a step label
 * and number, a subtitle, a Scripture reference, a short rule and small
 * fill-in fields. The page title stays the page's title. It is measured before
 * the sections, so the writing space below it is always what is left.
 */
export type GuidedHeader = {
  /** Step label ("STEP TWO"). */
  eyebrow?: string;
  /** Step number ("02"). */
  number?: string;
  /** Subtitle under the title ("The Word"). */
  subtitle?: string;
  /** Scripture or reference line ("Habakkuk 2:2"). */
  reference?: string;
  /** A short decorative rule under the header. */
  rule?: boolean;
  /** Small fill-in fields on one row ("Date", "Source"). */
  fields?: string[];
  /** Composed header: a small overline above the main title ("PROPHETIC WORD"). */
  overline?: string;
  /** Composed header: the dominant title ("RECEIVE"). */
  title?: string;
  /** Composed header: a small spaced line under the subtitle ("SEEK UNDERSTANDING • CONFIRM WITH SCRIPTURE"). */
  tagline?: string;
  /** Composed header: a short mark at the right, between two short rules ("FROM REVELATION TO EXECUTION"); a new line per line. */
  mark?: string;
  /** Composed header: thin rules between the step, the titles and the right side (default on). */
  dividers?: boolean;
  /**
   * Composed header: details to fill in, each its own label and writing line,
   * stacked at the right ("Date", "Time", "Received through", "Type").
   */
  meta?: string[];
};

/** Details the page header offers as ready choices. */
export const HEADER_META_CHOICES = ["Date", "Time", "Received through", "Type"] as const;

/**
 * A header is composed (step at the left, titles in the centre, details at the
 * right) when it uses any of the composed parts; headers saved before keep the
 * stacked look they had.
 */
export const isComposedHeader = (h: GuidedHeader | undefined): boolean =>
  !!h && (!!h.title?.trim() || !!h.overline?.trim() || !!h.tagline?.trim() || !!h.mark?.trim() || !!h.meta?.some((m) => m.trim()));

/** Space between prompt sections. */
export type PromptSpacing = "tight" | "standard" | "roomy";

export type PromptSet = {
  blocks: PromptBlock[];
  /** When set, every prompt gets this many writing lines ("Use the same number of lines for every prompt"). */
  sameLines?: number;
  spacing?: PromptSpacing;
  /** Every section's visual treatment unless it sets its own (default open). */
  frame?: SectionFrame;
  /** Optional instructions under the page title (worksheets). */
  instructions?: string;
  /** Optional designed header above the sections. */
  header?: GuidedHeader;
  /**
   * When the prompts don't fit: continue on another page (default — never
   * cramped), first use fewer lines (down to each prompt's minimum), or keep
   * one page and say it does not fit ("stop").
   */
  whenFull?: "continue" | "fewer-lines" | "stop";
  /**
   * Pages saved before prompt blocks existed: section heights follow the
   * weights of the whole section (heading included), exactly as before.
   */
  legacyWeights?: boolean;
};

export const SPACING_FACTOR: Record<PromptSpacing, number> = { tight: 0.5, standard: 1, roomy: 1.75 };
export const DEFAULT_MIN_LINES = 2;

/** A section's visual treatment: its own, else the page's, else open. */
export const frameOf = (set: Pick<PromptSet, "frame">, b: PromptBlock): SectionFrame => b.frame ?? set.frame ?? "open";

/**
 * Whether a section may sit beside the one above it: both are writing
 * sections, and the one above is not itself already beside another.
 */
export function canSitBeside(blocks: PromptBlock[], i: number): boolean {
  if (i < 1) return false;
  const a = blocks[i - 1], b = blocks[i];
  return kindOf(a) === "prompt" && kindOf(b) === "prompt" && !a.beside;
}

/** A section's kind (sections saved before the Page Composer are prompts). */
export const kindOf = (b: PromptBlock): PromptBlockKind => b.kind ?? "prompt";

/** How a section is filled in: its own choice, else a list for checklists and tables, a single field otherwise. */
export function contentOf(b: PromptBlock): Required<PromptBlockContent> {
  const mode = b.content?.mode ?? (b.responseStyle === "checkboxes" || b.responseStyle === "table" ? "list" : "field");
  return { mode, key: b.content?.key ?? b.id };
}

/** A section's space mode (older blocks: fixed when they ask for lines, otherwise fill). */
export const spaceOf = (b: PromptBlock): SpaceMode => b.space ?? (b.lineCount !== undefined ? "fixed" : "fill");

/** The writing lines a prompt asks for (undefined = it shares the space: fill or equal). */
export function requestedLines(set: PromptSet, b: PromptBlock): number | undefined {
  if (set.sameLines !== undefined) return set.sameLines;
  return spaceOf(b) === "fixed" ? b.lineCount : undefined;
}

/**
 * Starter structures for a Guided Lined Page — editable starting points, not
 * locked layouts: after choosing one, headings, prompts, line counts and the
 * number of sections are all the creator's.
 */
export const PROMPT_STARTERS: { id: string; label: string; set: () => PromptSet }[] = [
  { id: "full-page", label: "Full Page Prompt", set: () => ({ blocks: [{ id: newPromptId(), label: "The Word", prompt: "Write the word exactly as you received it.", space: "fill" }] }) },
  {
    id: "two-prompt",
    label: "Two Prompt Reflection",
    set: () => ({ blocks: [{ id: newPromptId(), label: "What I Believe God Is Saying", space: "equal" }, { id: newPromptId(), label: "Scripture Confirmation", space: "equal" }] }),
  },
  {
    id: "three-prompt",
    label: "Three Prompt Response",
    set: () => ({
      blocks: [
        { id: newPromptId(), label: "My Response", prompt: "What obedience, action, or posture does this word call for?", space: "fixed", lineCount: 8 },
        { id: newPromptId(), label: "What I Will Do", prompt: "List the specific steps, decisions, or changes you will make.", space: "fixed", lineCount: 8 },
        { id: newPromptId(), label: "Prayer", prompt: "Pray in response to this word.", space: "fill" },
      ],
    }),
  },
  {
    id: "four-prompt",
    label: "Four Prompt Review",
    set: () => ({
      blocks: [
        { id: newPromptId(), label: "What God Did", prompt: "Record how God fulfilled, clarified, redirected, or used this word.", space: "fixed", lineCount: 8 },
        { id: newPromptId(), label: "Timeline", space: "fixed", lineCount: 6 },
        { id: newPromptId(), label: "Fruit & Impact", space: "fixed", lineCount: 6 },
        { id: newPromptId(), label: "Praise & Gratitude", space: "fill" },
      ],
    }),
  },
];

/**
 * A guided page's plain prompt list (saved before prompt blocks) as a prompt
 * set that renders exactly as it did: every prompt fills the space, the first
 * of three or more gets twice the room, no minimum.
 */
export function promptSetFromList(prompts: string[]): PromptSet {
  return {
    blocks: prompts.map((label, i) => ({ id: `p${i + 1}`, label, weight: i === 0 && prompts.length >= 3 ? 2 : 1, minLines: 0 })),
    legacyWeights: true,
  };
}

let seq = 0;
export const newPromptId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;
