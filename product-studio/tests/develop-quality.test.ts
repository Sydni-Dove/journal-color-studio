import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { lessonQualityGap } from "../../supabase/functions/generate-document/quality";

const request = "A journal for children ages 6–9. Each lesson has a 100–180 word story, Scripture reference, activity, two reflection questions, and a prayer.";
const story = "Maya brought her favorite blue pencil to school. During art time, she saw Eli looking worried because his pencil had broken. She wanted to keep hers safe, but she remembered how lonely it felt to be left out. Maya offered to share the blue pencil. Eli smiled and drew a bright bird while Maya sketched beside him. When the bell rang, Maya noticed her pencil was shorter. She felt a little disappointed, then saw Eli proudly show his drawing to their teacher. On the walk home, Maya told her mother what happened. Her mother said sharing can cost us something and still bring joy. The next day, Eli brought an extra pencil for another classmate. Maya saw that her small choice had helped their whole table work together.";
function answer(overrides: Record<string, string> = {}) {
  const values = { story, verse: "Proverbs 11:25", activity: "Share a pencil with a friend and talk about how it felt.", q1: "Why did Maya share?", q2: "What happened after Maya shared?", prayer: "God, help me share kindly. Amen.", ...overrides };
  return JSON.stringify({ entries: { fields: Object.keys(values).map((key) => ({ key, label: key })), records: [{ values: Object.entries(values).map(([key, value]) => ({ key, value })) }] } });
}
describe("developed lesson depth", () => {
  it("accepts a complete story and all requested parts", () => expect(lessonQualityGap(answer(), request)).toBeNull());
  it("reports a short story", () => expect(lessonQualityGap(answer({ story: "Maya shared a pencil." }), request)).toMatch(/4-word story/));
  it("reports a missing activity", () => expect(lessonQualityGap(answer({ activity: "" }), request)).toMatch(/missing its activity/));
  it("reports missing questions", () => expect(lessonQualityGap(answer({ q2: "" }), request)).toMatch(/two reflection questions/));
  it("does not impose children's story depth on unrelated requests", () => expect(lessonQualityGap(answer({ story: "Short." }), "A reading log for adults")).toBeNull());
  it("honors a maker's shorter explicit story length", () => expect(lessonQualityGap(answer({ story: "Maya shared a pencil." }), "A children's journal with a 40-word story in each lesson")).toMatch(/36–44 words/));
  it("catches the short story in the recorded live answer", () => {
    const response = JSON.parse(readFileSync("tests/fixtures/live/develop-children-2026-10-15.json", "utf8"));
    const sent = JSON.parse(readFileSync("tests/fixtures/live/develop-children-2026-10-15.request.json", "utf8"));
    expect(lessonQualityGap(response.spec, sent.description)).toMatch(/word story/);
  });
});
