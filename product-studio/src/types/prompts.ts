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

export type PromptBlock = {
  /** Stable id (recipe zone key, or generated). */
  id: string;
  /** The prompt wording shown as the section heading ("What did God say?"). */
  label: string;
  /** undefined = the page's own writing style (its recipe surface or the project's writing lines). */
  responseStyle?: ResponseStyle;
  /** Writing lines requested; undefined = fill the space left on the page. */
  lineCount?: number;
  /** Never fewer lines than this when the page is short (default 2; migrated pages: 0 = as before). */
  minLines?: number;
  /** Share of the free space for "fill the space" prompts (default 1). */
  weight?: number;
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
  /**
   * When the prompts don't fit: continue on another page (default — never
   * cramped), or first use fewer lines (down to each prompt's minimum).
   */
  whenFull?: "continue" | "fewer-lines";
  /**
   * Pages saved before prompt blocks existed: section heights follow the
   * weights of the whole section (heading included), exactly as before.
   */
  legacyWeights?: boolean;
};

export const SPACING_FACTOR: Record<PromptSpacing, number> = { tight: 0.5, standard: 1, roomy: 1.75 };
export const DEFAULT_MIN_LINES = 2;

/** The writing lines a prompt asks for (undefined = fill the space). */
export function requestedLines(set: PromptSet, b: PromptBlock): number | undefined {
  return set.sameLines !== undefined ? set.sameLines : b.lineCount;
}

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
