/**
 * My Prompts (engines/prompts/library.ts): every prompt rebuilt from saved books and collections, and each prompt kept
 * as it was used (sent to ChatGPT or copied), to copy or download again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bookPrompts, clearPromptHistory, collectionPrompts, HISTORY_MAX, historyText, isPrompt, promptHistory, promptsText, promptTitle, rememberPrompt, savedPromptGroups } from "../src/engines/prompts/library";
import { launchChatGpt } from "../src/engines/cover/launch";
import { coloringBrief, newBook } from "../src/engines/coloringBook/book";
import { newBrief } from "../src/engines/cover/brief";
import { mommyAndMe } from "./fixtures/mommyAndMe";

beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
});

describe("Prompts rebuilt from saved books", () => {
  it("a Devotional Spread book gives its lessons prompt, cover and both Art Prompts of every spread, in order", () => {
    const titles = bookPrompts(mommyAndMe()).map((p) => p.title);
    expect(titles).toEqual([
      "Lessons prompt (write the lessons with ChatGPT)",
      "Cover artwork",
      "Spread 1 · left (daughter page): I Am Wonderfully Made",
      "Spread 1 · right (Mommy page): She is fearfully and wonderfully made",
      "Spread 2 · left (daughter page): God Loved Us First",
      "Spread 2 · right (Mommy page): Love is patient, love is kind",
    ]);
    expect(bookPrompts(mommyAndMe())[2].text).toContain("Spell every word exactly as written.");
  });

  it("a regular coloring book gives each scene's artwork instructions", () => {
    const book = newBook("b", { name: "Ballet", brief: coloringBrief({ title: "Ballet", scenes: [{ id: "a", title: "Brave", text: "A girl dances." }, { id: "c", title: "Kind", text: "Two friends share." }] }) });
    const ps = bookPrompts(book);
    expect(ps.map((p) => p.title)).toEqual(["Cover artwork", "Scene 1: Brave", "Scene 2: Kind"]);
    expect(ps[1].text).toContain("A girl dances.");
  });

  it("a Cover Studio collection gives its design prompt and scenes; empty books are left out of the list", () => {
    const c = { brief: newBrief({ category: "cover", title: "Hope Journal", scenes: [] }), items: [], direction: 0 };
    expect(collectionPrompts(c).map((p) => p.title)).toEqual(["Cover prompt"]);
    const groups = savedPromptGroups([mommyAndMe(), newBook("empty")], [{ ...c, schemaVersion: 1, id: "c1", name: "Hope", createdAt: "", updatedAt: "2026-01-01" }]);
    expect(groups.map((g) => [g.name, g.kind])).toEqual([["Mommy & Me: Growing With God Together", "Coloring book"], ["Hope", "Cover Studio"]]);
  });

  it("downloads as one plain-text file, each prompt under its title, each book under its name", () => {
    const t = promptsText(savedPromptGroups([mommyAndMe()], []));
    expect(t.startsWith("######## Mommy & Me: Growing With God Together (Coloring book) ########")).toBe(true);
    expect(t).toContain("===== Spread 2 · left (daughter page): God Loved Us First =====");
  });
});

describe("Prompts used before", () => {
  it("keeps each prompt as it was used, newest first; the same prompt used again moves to the top", () => {
    rememberPrompt("Prompt A ".repeat(30), "A", "Coloring book", "2026-11-27T10:00:00Z");
    rememberPrompt("Prompt B ".repeat(30), "B", "Cover Studio", "2026-11-27T11:00:00Z");
    rememberPrompt("Prompt A ".repeat(30), "A", "Coloring book", "2026-11-27T12:00:00Z");
    expect(promptHistory().map((p) => [p.title, p.at])).toEqual([["A", "2026-11-27T12:00:00Z"], ["B", "2026-11-27T11:00:00Z"]]);
    expect(historyText(promptHistory())).toContain("===== A · Coloring book ·");
    clearPromptHistory();
    expect(promptHistory()).toEqual([]);
  });

  it("keeps at most the last 500", () => {
    for (let i = 0; i < HISTORY_MAX + 5; i++) rememberPrompt(`prompt ${i}`, `P${i}`, "", new Date(2026, 0, 1, 0, 0, i).toISOString());
    expect(promptHistory()).toHaveLength(HISTORY_MAX);
    expect(promptHistory()[0].title).toBe(`P${HISTORY_MAX + 4}`);
  });

  it("every prompt sent to ChatGPT is kept, even when the browser blocks the new tab", () => {
    launchChatGpt("Create one black-and-white coloring page of a lamb.", () => null);
    expect(promptHistory()[0]).toMatchObject({ title: "Create one black-and-white coloring page of a lamb.", source: "Sent to ChatGPT" });
  });

  it("only copied prompts count (not short lines like the print specs); titles are the first line", () => {
    expect(isPrompt("8.5 × 11 in, 300 DPI")).toBe(false);
    expect(isPrompt("x".repeat(200))).toBe(true);
    expect(promptTitle("\n\nFirst line here\nsecond")).toBe("First line here");
  });
});
