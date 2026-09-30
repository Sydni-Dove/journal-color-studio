/** The five Prophetic Journal step headers (composed page header only — no page-specific code). */
import type { GuidedHeader, PromptSet } from "../../src/types/prompts";

const MARK = "FROM\nREVELATION\nTO\nEXECUTION";
export const STEP_HEADERS: GuidedHeader[] = [
  { eyebrow: "STEP ONE", number: "01", title: "RECEIVE", subtitle: "THE WORD", tagline: "WRITE IT • PRESERVE IT", meta: ["Date", "Time", "Received through", "Type"] },
  { eyebrow: "STEP TWO", number: "02", title: "DISCERN", subtitle: "THE WORD", tagline: "SEEK UNDERSTANDING • CONFIRM WITH SCRIPTURE", mark: MARK },
  { eyebrow: "STEP THREE", number: "03", title: "RESPOND", subtitle: "TO THE WORD", tagline: "OBEY • ACT • BUILD", mark: MARK },
  { eyebrow: "STEP FOUR", number: "04", title: "WATCH", tagline: "RECORD WHAT UNFOLDS", mark: MARK },
  { eyebrow: "STEP FIVE", number: "05", title: "TESTIFY", tagline: "GIVE GOD THE GLORY", mark: MARK },
];

/** A step page: the composed header, then its writing. */
export const stepPage = (header: GuidedHeader): PromptSet => ({
  header,
  blocks: [
    { id: "word", label: "What I believe God is saying", badge: "1", prompt: "What is the cohesive message or meaning you believe God is highlighting?", space: "fill", responseStyle: "ruled", frame: "rule" },
    { id: "scripture", label: "Scripture confirmation", badge: "2", space: "fixed", lineCount: 5, responseStyle: "ruled", frame: "rule" },
  ],
});
