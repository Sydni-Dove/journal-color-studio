/**
 * A pasted manuscript's own "Day 1 … Day N" headings fill an outline whose daily pages print entry fields the AI
 * never wrote (live test, 2026-11-20: a 21-day fasting journal came back as one page for all 21 days).
 */
import { describe, expect, it } from "vitest";
import { checkSpec } from "../src/engines/generate/spec";
import { projectFromSpec } from "../src/engines/generate/convert";
import { manuscriptDays } from "../src/engines/generate/manuscript";
import { resolveDocument } from "../src/engines/document/resolve";
import type { BookNode } from "../src/types/recipe";
import { part, section } from "./fixtures/aiSpecs";

const day = (n: number, theme: string, ref: string, method: string) => [
  `Day ${n} ${theme}`,
  "",
  `Scripture reading (KJV): ${ref}`,
  "",
  "Devotional",
  "",
  `Day ${n} teaching on ${theme.toLowerCase()}. It is a short paragraph of several sentences. It ends here.`,
  "",
  "Meditation Practice",
  "",
  `${method}: Read the passage twice and write one phrase.`,
  "",
  `Day ${n} Reflection and Prayer`,
  "",
  `Scripture reading (KJV): ${ref}`,
  "",
  `What does ${ref} reveal about God?`,
  "",
  "What is one specific response you will make today?",
  "",
  `Prayer prompt: Lord, help me receive the truth of ${ref}. Bring this need before You:`,
  "",
];
const MANUSCRIPT = [
  "Welcome",
  "Welcome to these days of prayer.",
  "",
  ...day(1, "Begin With Surrender", "Romans 12:1–2", "Writing meditation"),
  ...day(2, "Seek in Secret", "Matthew 6:16–18", "Writing meditation"),
  ...day(3, "Hunger for the Word", "Psalm 119:103", "Speaking meditation"),
  "Closing Reflection",
  "",
  "What did I learn about God?",
].join("\n");

/** What the AI answered: a page "copied" for each day, printing entry fields it never wrote. */
const AI = {
  title: "Fasting Journal", summary: "", notes: [], entries: null,
  page: { size: "6x9", orientation: "portrait", binding: "book", why: "" },
  sections: [
    section("welcome", "Welcome", [part("text", { text: "Welcome to these days of prayer.", source: "user" })]),
    section("days", "Days 1–3", [part("heading", { fromEntryField: "daytitle", source: "user" }), part("text", { fromEntryField: "devotional", source: "user" }), part("writing", { label: "Reflection", lines: 6 })], { repeat: { mode: "copies", count: 3 } }),
    section("closing", "Closing Reflection", [part("writing", { text: "What did I learn about God?", source: "user" })]),
  ],
};

describe("manuscript days", () => {
  it("finds each day once, in order, with its parts in their places", () => {
    const ms = manuscriptDays(MANUSCRIPT)!;
    expect(ms.days.map((d) => d.heading)).toEqual(["Day 1 Begin With Surrender", "Day 2 Seek in Secret", "Day 3 Hunger for the Word"]);
    const d2 = ms.days[1].values;
    expect([...d2.values()]).toContain("Day 2 Reflection and Prayer");
    expect([...d2.values()]).toContain("What does Matthew 6:16–18 reveal about God?");
    // The last day stops where its shape does: the closing pages aren't part of Day 3.
    expect([...ms.days[2].values.values()].join("\n")).not.toContain("Closing Reflection");
  });

  it("needs at least two days numbered from 1", () => {
    expect(manuscriptDays("Day 1 Alone\n\nSome text.")).toBeNull();
    expect(manuscriptDays("Day 2 A\n\nx\n\nDay 3 B\n\ny")).toBeNull();
  });

  it("fills the AI's daily page from the manuscript, word for word, as a two-page spread per day", () => {
    const c = checkSpec(JSON.stringify(AI), { description: "A fasting journal", content: MANUSCRIPT });
    expect(c.problems.some((p) => p.level === "note" && /Your 3 days were read/.test(p.message))).toBe(true);
    expect(c.problems.some((p) => p.level === "left-out")).toBe(false);
    expect(c.spec.entries?.source).toBe("user");
    expect(c.spec.entries?.records).toHaveLength(3);
    const daily = c.spec.sections.filter((s) => s.repeat.mode === "per-entry");
    expect(daily.map((s) => s.title)).toEqual(["{day}", expect.stringMatching(/^\{reflection_and_prayer_heading/)]);
    expect(daily[0].startSpread).toBe(true);
    expect(daily[1].withPrevious).toBe(true);
    // Everything of the days is placed; only the closing page's own lines remain the AI's to place.
    expect(c.unplaced.filter((l) => /Day \d|Scripture reading|Prayer prompt|Devotional|Meditation/.test(l))).toEqual([]);
    // Each day prints its first page then its second, in turn (not all first pages, then all second pages).
    const project = projectFromSpec(c);
    const group = project.recipe.structure!.find((n): n is Extract<BookNode, { kind: "group" }> => n.kind === "group")!;
    expect(group.children).toHaveLength(2);
    const doc = resolveDocument(project);
    const ids = doc.recipe.pages.map((p) => p.recipeItemId);
    const first = ids.indexOf(`gen-days`);
    expect(ids.slice(first, first + 4)).toEqual(["gen-days", "gen-days-page-2", "gen-days", "gen-days-page-2"]);
  });

  it("leaves an outline alone when the AI wrote the days, or the content has no numbered days", () => {
    const written = { ...AI, entries: { name: "Days", fields: [{ key: "daytitle", label: "Day", valueType: "text" }, { key: "devotional", label: "Devotional", valueType: "longText" }], records: [{ values: [{ key: "daytitle", value: "Day 1 Begin With Surrender" }] }], source: "user" } };
    const a = checkSpec(JSON.stringify(written), { description: "A fasting journal", content: MANUSCRIPT });
    expect(a.problems.some((p) => /were read from your manuscript/.test(p.message))).toBe(false);
    const b = checkSpec(JSON.stringify(AI), { description: "A fasting journal", content: "Welcome to these days of prayer." });
    expect(b.problems.some((p) => /were read from your manuscript/.test(p.message))).toBe(false);
  });

  it("also fills a page the AI copied once per day with placeholders instead of entry fields", () => {
    const copied = { ...AI, sections: [AI.sections[0], section("days", "Day {#}", [part("text", { text: "Daily devotional text from the manuscript", source: "user" }), part("writing", { label: "Reflection", lines: 6 })], { repeat: { mode: "copies", count: 3 } }), AI.sections[2]] };
    const c = checkSpec(JSON.stringify(copied), { description: "A fasting journal", content: MANUSCRIPT });
    expect(c.problems.some((p) => /Your 3 days were read/.test(p.message))).toBe(true);
    expect(c.spec.entries?.records).toHaveLength(3);
    expect(c.spec.sections.filter((s) => s.repeat.mode === "per-entry")).toHaveLength(2);
    expect(c.spec.sections.some((s) => s.repeat.mode === "copies")).toBe(false);
    // A copied page whose count isn't the number of days (a blank log) is left alone.
    const log = { ...copied, sections: [copied.sections[0], { ...copied.sections[1], repeat: { mode: "copies", count: 30 } }] };
    expect(checkSpec(JSON.stringify(log), { description: "A fasting journal", content: MANUSCRIPT }).problems.some((p) => /were read from your manuscript/.test(p.message))).toBe(false);
  });
});
