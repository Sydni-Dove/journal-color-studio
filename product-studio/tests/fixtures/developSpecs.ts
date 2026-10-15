/**
 * A recorded "Develop original content" answer (the strict document specification), for testing Phase 8.1 without
 * calling the provider: AI-written days, the maker's own opening (used exactly), an AI-written introduction.
 */
import type { DocSpec } from "../../src/engines/generate/spec";
import { part, section } from "./aiSpecs";

/** The maker's own opening, pasted as their content: used exactly, never marked AI-written. */
export const MAKER = "This journal is for the week before our church's fast. Read slowly, write honestly, and let God speak.";
export const day = (n: number, extra: Partial<Record<string, string>> = {}) => ({
  values: [
    { key: "title", value: extra.title ?? `Day ${n}: Drawing Near` },
    { key: "scripture", value: extra.scripture ?? `James 4:${n}` },
    { key: "teaching", value: extra.teaching ?? `Day ${n}. Drawing near is not a feeling we wait for; it is a step we take. Today, notice where you have kept God at a distance, and bring that place to Him in prayer.` },
    { key: "question", value: extra.question ?? "Where have you kept God at a distance?" },
    { key: "prayer", value: extra.prayer ?? "Lord, I come near. Meet me here." },
  ],
});
/** A recorded "develop" answer: seven AI-written days, the maker's opening, an AI-written introduction. */
export function developed(days = 7, d: (n: number) => ReturnType<typeof day> = day): DocSpec {
  return {
    title: "Seven Days of Drawing Near",
    summary: "A seven-day prayer journal.",
    page: { size: "6x9", orientation: "portrait", binding: "spiral", why: "Spiral lies flat for writing." },
    entries: {
      name: "Days",
      fields: [
        { key: "title", label: "Title", valueType: "text" },
        { key: "scripture", label: "Scripture", valueType: "reference" },
        { key: "teaching", label: "Teaching", valueType: "longText" },
        { key: "question", label: "Reflection question", valueType: "text" },
        { key: "prayer", label: "Prayer", valueType: "longText" },
      ],
      records: Array.from({ length: days }, (_, i) => d(i + 1)),
      source: "suggested",
    },
    sections: [
      section("intro", "Before You Begin", [part("text", { id: "maker-intro", text: MAKER, source: "user" }), part("text", { id: "ai-intro", label: "How to use this journal", text: "Each day has a short teaching, a question and a prayer. Take your time.", source: "suggested" })]),
      section("day", "{title}", [
        part("text", { id: "d-scripture", fromEntryField: "scripture" }),
        part("text", { id: "d-teaching", fromEntryField: "teaching" }),
        part("writing", { id: "d-question", fromEntryField: "question", lines: 6 }),
        part("text", { id: "d-prayer", fromEntryField: "prayer" }),
        part("writing", { id: "d-notes", label: "Notes", lines: null }),
      ], { repeat: { mode: "per-entry", count: 1 } }),
    ],
    notes: ["Seven days, one per day of the week before the fast."],
  };
}
export const DESCRIPTION = "A seven-day prayer journal for the week before our fast. Write the days for me: a title, a Scripture, a short teaching, a question and a prayer each day.";
