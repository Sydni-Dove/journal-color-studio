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
export type ResponseStyle = "ruled" | "blank" | "dot-grid" | "checkboxes";

/**
 * How a section's writing space is set:
 *   fixed  exactly `lineCount` lines
 *   fill   takes the space the other sections leave (shared by weight when several fill)
 *   equal  an equal share: every "equal" section on the page gets the same number of whole lines
 */
export type SpaceMode = "fixed" | "fill" | "equal";

export type PromptBlock = {
  /** Stable id (recipe zone key, or generated). */
  id: string;
  /** The section heading ("MY RESPONSE", "What did God say?"); may be empty (prompt only). */
  label: string;
  /** Optional smaller prompt / instruction under the heading ("What obedience does this word call for?"). */
  prompt?: string;
  /** How the writing space is set (default: fixed when `lineCount` is set, otherwise fill). */
  space?: SpaceMode;
  /** undefined = the page's own writing style (its recipe surface or the project's writing lines). */
  responseStyle?: ResponseStyle;
  /** Writing lines requested; undefined = fill the space left on the page. */
  lineCount?: number;
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
};

/** Space between prompt sections. */
export type PromptSpacing = "tight" | "standard" | "roomy";

export type PromptSet = {
  blocks: PromptBlock[];
  /** When set, every prompt gets this many writing lines ("Use the same number of lines for every prompt"). */
  sameLines?: number;
  spacing?: PromptSpacing;
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
