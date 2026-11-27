/**
 * MY PROMPTS — every ChatGPT prompt Product Studio has made, ready to read, copy or download again.
 *
 *   saved     rebuilt from every saved coloring book and Cover Studio collection (they are made from the book's own
 *             data, so a saved book always gives back its prompts): the cover, every page's artwork instructions,
 *             every Devotional Spread page's Art Prompt, the lessons prompt, the characters' design sheet.
 *   history   each prompt as it was the moment it was sent to ChatGPT or copied (kept on this device, newest first),
 *             so a prompt used before a book changed can still be downloaded word for word.
 */
import type { CoverBrief, CoverCollection } from "../cover/brief";
import type { ColoringBook } from "../coloringBook/book";
import { bookTitle } from "../coloringBook/book";
import { briefFor } from "../coloringBook/assembleBook";
import { isSpread, spreadArtPrompt } from "../coloringBook/spread";
import { lessonsPrompt } from "../coloringBook/spreadImport";
import { castDesignPrompt, coloringCoverBlocker, coloringCoverPrompt, scenePrompt, verseArtBlocker } from "../cover/coloring";
import { categoryBlocker, categoryPrompt } from "../cover/categories";

export type SavedPrompt = { title: string; text: string };
export type PromptGroup = { id: string; name: string; kind: "Coloring book" | "Cover Studio"; updatedAt: string; prompts: SavedPrompt[] };

const safe = (f: () => string | null): string | null => {
  try {
    return f();
  } catch {
    return null;
  }
};

/** Every prompt a coloring book makes, in book order. */
export function bookPrompts(book: ColoringBook): SavedPrompt[] {
  const b = briefFor(book);
  const out: SavedPrompt[] = [];
  const add = (title: string, text: string | null) => { if (text?.trim()) out.push({ title, text }); };
  const spreads = b.scenes.filter(isSpread);
  if (spreads.length || book.spread) add("Lessons prompt (write the lessons with ChatGPT)", safe(() => lessonsPrompt(b.theme || "growing close to God together", Math.max(spreads.length, 12), { title: bookTitle(book), translation: b.translation, ages: b.ageGroup })));
  const cover: CoverBrief = { ...b, category: "coloring-cover", format: "front", bleed: 0.125 };
  if (!coloringCoverBlocker(cover)) add("Cover artwork", safe(() => coloringCoverPrompt(cover)));
  if (b.cast.length) add("Character design sheet", safe(() => castDesignPrompt(b)));
  let spreadNo = 0, sceneNo = 0;
  b.scenes.forEach((s, i) => {
    const name = (s.pageTitle ?? s.title).trim();
    if (isSpread(s)) {
      spreadNo++;
      add(`Spread ${spreadNo} · left (daughter page)${name ? `: ${name}` : ""}`, safe(() => spreadArtPrompt(book, b, s, "daughter")));
      add(`Spread ${spreadNo} · right (Mommy page)${s.mommy?.title ? `: ${s.mommy.title}` : ""}`, safe(() => spreadArtPrompt(book, b, s, "mommy")));
    } else {
      sceneNo++;
      if (!verseArtBlocker(b, s)) add(`Scene ${sceneNo}${name ? `: ${name}` : ""}`, safe(() => scenePrompt(b, s, i)));
    }
  });
  return out;
}

/** Every prompt a Cover Studio collection makes: its design prompt, its scenes and its characters. */
export function collectionPrompts(c: Pick<CoverCollection, "brief" | "items" | "direction">): SavedPrompt[] {
  const b = c.brief;
  const out: SavedPrompt[] = [];
  const add = (title: string, text: string | null) => { if (text?.trim()) out.push({ title, text }); };
  if (!categoryBlocker(b)) add(b.category === "cover" ? "Cover prompt" : "Design prompt", safe(() => categoryPrompt(b, c.direction, c.items)));
  if (b.cast.length) add("Character design sheet", safe(() => castDesignPrompt(b)));
  b.scenes.forEach((s, i) => { if (!verseArtBlocker(b, s)) add(`Scene ${i + 1}${s.title ? `: ${s.title}` : ""}`, safe(() => scenePrompt(b, s, i))); });
  return out;
}

/** All saved books and collections that have prompts, newest first. */
export function savedPromptGroups(books: ColoringBook[], collections: CoverCollection[]): PromptGroup[] {
  return [
    ...books.map((bk) => ({ id: bk.id, name: bookTitle(bk) || "Untitled coloring book", kind: "Coloring book" as const, updatedAt: bk.updatedAt, prompts: bookPrompts(bk) })),
    ...collections.map((c) => ({ id: c.id, name: c.name || c.brief.title || c.brief.collection || "Untitled collection", kind: "Cover Studio" as const, updatedAt: c.updatedAt, prompts: collectionPrompts(c) })),
  ]
    .filter((g) => g.prompts.length)
    .sort((x, y) => (x.updatedAt < y.updatedAt ? 1 : -1));
}

/** A group (or several) as one plain-text file: each prompt under its title. */
export function promptsText(groups: { name: string; kind?: string; prompts: SavedPrompt[] }[]): string {
  return groups
    .map((g) => [`######## ${g.name}${g.kind ? ` (${g.kind})` : ""} ########`, ...g.prompts.map((p) => `===== ${p.title} =====\n\n${p.text}`)].join("\n\n"))
    .join("\n\n\n");
}

// ---- History ------------------------------------------------------------------------------------------

export type PromptUse = { id: string; at: string; title: string; source: string; text: string };
const KEY = "dove-product-studio:v1:prompt-history";
/** The most kept (oldest dropped first). */
export const HISTORY_MAX = 500;

export function promptHistory(): PromptUse[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return (Array.isArray(raw) ? raw : []).filter((x): x is PromptUse => !!x && typeof x.text === "string" && typeof x.at === "string").map((x) => ({ id: String(x.id), at: x.at, title: String(x.title ?? "Prompt"), source: String(x.source ?? ""), text: x.text }));
  } catch {
    return [];
  }
}

/** Keep a prompt as it was used (the same prompt used again moves to the top, not twice). Never throws. */
export function rememberPrompt(text: string, title: string, source = "", now = new Date().toISOString()): void {
  if (!text.trim()) return;
  try {
    const list = promptHistory().filter((x) => x.text !== text);
    list.unshift({ id: `${now}-${Math.random().toString(36).slice(2, 8)}`, at: now, title, source, text });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
    window.dispatchEvent?.(new Event("dove-prompts-changed"));
  } catch {
    /* storage full or unavailable: the prompt itself still works */
  }
}

export function clearPromptHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* unavailable */
  }
}

export function historyText(list: PromptUse[]): string {
  return list.map((p) => `===== ${p.title}${p.source ? ` · ${p.source}` : ""} · ${new Date(p.at).toLocaleString()} =====\n\n${p.text}`).join("\n\n\n");
}

/** A prompt's own heading for the history: its first line, shortened. */
export const promptTitle = (text: string) => {
  const line = text.split(/\n/).map((l) => l.trim()).find(Boolean) ?? "Prompt";
  return line.length > 90 ? `${line.slice(0, 87)}…` : line;
};
/** Copied text that is a prompt (not a short line such as the print specs). */
export const isPrompt = (text: string) => text.trim().length >= 150;
