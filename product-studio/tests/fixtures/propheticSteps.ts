/** The five Prophetic Journal step headers (composed page header only — no page-specific code). */
import type { GuidedHeader, PromptSet } from "../../src/types/prompts";

export const STEP_HEADERS: GuidedHeader[] = [
  { eyebrow: "STEP ONE", number: "01", overline: "PROPHETIC WORD", title: "RECEIVE", subtitle: "THE WORD", meta: ["Date", "Time", "Received through", "Type"] },
  { eyebrow: "STEP TWO", number: "02", overline: "PROPHETIC WORD", title: "DISCERN", subtitle: "THE WORD", meta: ["Date"] },
  { eyebrow: "STEP THREE", number: "03", overline: "PROPHETIC WORD", title: "RESPOND", subtitle: "TO THE WORD", meta: ["Date"] },
  { eyebrow: "STEP FOUR", number: "04", overline: "PROPHETIC WORD", title: "WATCH", meta: ["Date"] },
  { eyebrow: "STEP FIVE", number: "05", overline: "PROPHETIC WORD", title: "TESTIFY", meta: ["Date"] },
];

/** A step page: the composed header, then its writing. */
export const stepPage = (header: GuidedHeader): PromptSet => ({
  header,
  blocks: [
    { id: "word", label: "The word", prompt: "Write the word exactly as you received it, without interpreting it yet.", space: "fill", responseStyle: "ruled" },
  ],
});
