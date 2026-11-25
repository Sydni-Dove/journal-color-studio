/**
 * DEVOTIONAL SPREAD — a page type of the Coloring Book: two facing pages printed as a pair.
 *
 *   left   the daughter page: a coloring picture for ages 4–8 with its title, verse and reference across the top
 *          (bubble or elegant lettering, per page), or the picture alone when the lettering is drawn into the art
 *   right  the Mommy page (layouts/book/devotionalMommy.ts): her art on the inner side, an activity column (or a
 *          bottom band) on the outer side: Read the Word, Fill in the Blank, Listen & Reflect, Heart to Heart
 *
 * In print order the daughter page is always a left-hand page and the Mommy page the right-hand page facing it
 * (assembleBook adds a blank page before a spread when needed), so the binding margin mirrors correctly on both.
 *
 * Art Prompts: one ChatGPT prompt per page, built from the page's theme, scene, lettering and chosen character
 * (its saved description pasted word for word), under the fixed style rules below. Product Studio never makes images.
 */
import type { CoverBrief, LetterStyle, MommyPage, ReadWordLine, Scene } from "../cover/brief";
import { pageBlocks, pageContentOf, sceneBrief, verseWords } from "../cover/assemble";
import type { PromptBlock } from "../../types/prompts";
import { artCharactersOf, bookTitle, spreadOf, type ArtCharacter, type ColoringBook } from "./book";
import { wordCount } from "./scripture";

export const SPREAD_PAGE_TYPE = "devotional-spread" as const;
export const isSpread = (s: Scene) => s.pageType === SPREAD_PAGE_TYPE;

/** The smallest image that prints sharp across a whole 8.5 × 11 in page at 300 DPI. */
export const PRINT_PX = { w: 2550, h: 3300 } as const;
export const belowPrintSize = (w?: number, h?: number) => !!w && !!h && (w < PRINT_PX.w || h < PRINT_PX.h);

export function newMommy(): MommyPage {
  return { readWord: [], blanks: [], reflect: { question: "", lines: 4 }, heart: "", qr: false };
}
/** The Mommy page with its defaults filled in. */
export const mommyOf = (s: Scene): MommyPage => ({ ...newMommy(), ...(s.mommy ?? {}), reflect: { ...newMommy().reflect, ...(s.mommy?.reflect ?? {}) } });

/** A new Devotional Spread, ready to fill in: three Read the Word lines, three blanks, a reflection and a heart question. */
export function newSpread(id: string, n: number): Scene {
  return {
    id, title: `Spread ${n}`, text: "", pageType: SPREAD_PAGE_TYPE, letterStyle: "bubble",
    mommy: {
      ...newMommy(), letterStyle: "elegant", textOff: true,
      readWord: [{ text: "", ref: "", kind: "exact" }, { text: "", ref: "", kind: "exact" }],
      blanks: [{ text: "", answer: "", ref: "" }, { text: "", answer: "", ref: "" }, { text: "", answer: "", ref: "" }],
    },
  };
}

// ---- The daughter page ---------------------------------------------------------------------------

/** The daughter page's blocks and layout: its words across the top (bubble or elegant), or the picture alone. */
export function daughterPage(b: CoverBrief, s: Scene): { blocks: PromptBlock[]; layoutId: string } {
  const sb = sceneBrief(b, s);
  if (s.textOff) return { blocks: [{ id: "art", label: "", space: "fill", responseStyle: "blank", weight: 3 }], layoutId: "guided-page" };
  if (sb.pageTypography.letterStyle === "bubble") {
    return { blocks: [{ id: "place-top", label: "", space: "fixed" }, ...pageBlocks(sb, s).filter((x) => x.id !== "raise")], layoutId: "coloring-lettering" };
  }
  return { blocks: pageBlocks({ ...sb, textPlacement: "top" }, s), layoutId: "guided-page" };
}

// ---- The Mommy page ------------------------------------------------------------------------------

/** How a Read the Word line's reference prints: the translation only on exact quotes; a paraphrase is labelled. */
export function readRef(b: CoverBrief, r: ReadWordLine): { ref: string; label: string } {
  const ref = r.ref.trim();
  if (!ref) return { ref: "", label: r.kind === "paraphrase" ? "paraphrase" : "" };
  if (r.kind === "exact") return { ref: b.translation === "KJV" ? ref : `${ref} (${b.translation})`, label: "" };
  return { ref, label: r.kind === "paraphrase" ? "paraphrase" : "" };
}

/** A Fill in the Blank statement as printed: "___" becomes the write-on line (at the end when it isn't marked). */
export function blankPrinted(text: string): string {
  const t = text.trim();
  if (!t) return "";
  const line = "______________";
  return /_{2,}/.test(t) ? t.replace(/_{2,}/, line) : `${t} ${line}`;
}

export function mommyPage(b: CoverBrief, s: Scene): { blocks: PromptBlock[]; layoutId: string } {
  const m = mommyOf(s);
  const head = (id: string, label: string): PromptBlock => ({ id, kind: "heading", label, textStyle: "body" });
  const mark = (id: string): PromptBlock => ({ id, label: "", space: "fixed" });
  const blocks: PromptBlock[] = [];
  if (!m.textOff && m.title?.trim()) blocks.push({ ...head("title", m.title.trim()), textStyle: "title" });
  if (m.letterStyle === "bubble") blocks.push(mark("style-bubble"));
  if (m.layout === "band") blocks.push(mark("band"));
  if (m.qr) blocks.push(mark("qr"));
  m.readWord.filter((r) => r.text.trim()).slice(0, 6).forEach((r, i) => {
    const p = readRef(b, r);
    blocks.push(head(`read-${i + 1}`, r.text.trim()));
    if (p.ref) blocks.push(head(`read-${i + 1}-ref`, p.ref));
    if (p.label) blocks.push(head(`read-${i + 1}-kind`, p.label));
  });
  m.blanks.filter((x) => x.text.trim()).slice(0, 6).forEach((x, i) => {
    blocks.push(head(`blank-${i + 1}`, blankPrinted(x.text)));
    if (x.ref.trim()) blocks.push(head(`blank-${i + 1}-ref`, x.ref.trim()));
  });
  if (m.reflect.question.trim() || m.reflect.lines) blocks.push({ ...head("reflect", m.reflect.question.trim()), weight: m.reflect.lines });
  if (m.heart.trim()) blocks.push(head("heart", m.heart.trim()));
  return { blocks, layoutId: "devotional-mommy" };
}

/** The Mommy page's art: a whole-page image (same shape as the page) fills the page; any other is fitted to the art side. */
export function isWholePage(w?: number, h?: number) {
  return !!w && !!h && Math.abs(w / h - 8.5 / 11) < 0.012;
}

// ---- Checks ----------------------------------------------------------------------------------------

const words = (t: string) => t.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);

/** Does `answer` (one word or a phrase) appear, as whole words, in `text`? */
export function containsAnswer(text: string, answer: string): boolean {
  const a = words(answer), t = words(text);
  if (!a.length) return false;
  for (let i = 0; i + a.length <= t.length; i++) if (a.every((w, k) => t[i + k] === w)) return true;
  return false;
}

/** Blanks whose answer isn't in the page's printed Read the Word excerpts (and blanks with no answer recorded). */
export type AnswerProblem = { index: number; answer: string; kind: "missing" | "no-answer" };
export function answerProblems(s: Scene): AnswerProblem[] {
  const m = mommyOf(s);
  const printed = m.readWord.filter((r) => r.text.trim()).map((r) => r.text).join(" \n ");
  return m.blanks.flatMap((x, i): AnswerProblem[] => {
    if (!x.text.trim()) return [];
    if (!x.answer.trim()) return [{ index: i, answer: "", kind: "no-answer" }];
    return containsAnswer(printed, x.answer) ? [] : [{ index: i, answer: x.answer.trim(), kind: "missing" }];
  });
}

/** The Mommy page's exact Scripture quotes (their references and words), for the translation's free-use limits. */
export function mommyScripture(s: Scene): { refs: string[]; words: number; allWords: number } {
  const m = mommyOf(s);
  const exact = m.readWord.filter((r) => r.kind === "exact" && r.text.trim());
  const all = [m.textOff ? "" : m.title ?? "", ...m.readWord.map((r) => `${r.text} ${r.ref}`), ...m.blanks.map((x) => `${x.text} ${x.ref}`), m.reflect.question, m.heart].join(" ");
  return { refs: exact.map((r) => r.ref.trim()).filter(Boolean), words: exact.reduce((n, r) => n + wordCount(r.text), 0), allWords: wordCount(all) };
}

// ---- Art Prompts -----------------------------------------------------------------------------------

export type SpreadSide = "daughter" | "mommy";

const STYLE_LOCK = [
  "Pure black line art on pure white. No gray, no shading, no gradients, no shadows and no solid black fills.",
  "Portrait 8.5 x 11 inches, one page per image. Keep a clear half-inch margin on every side.",
];
const JESUS = "Jesus: natural adult proportions, wearing a robe, cloak and sandals. Draw a complete, natural head and neck outline with no facial features: the face is left as plain white light, with simple straight rays around the head. His hair, if shown, is outlined and left white. Show emotion through posture.";
const END = "Spell every word exactly as written.";

/** The character chosen for a page's prompt (the book's saved list), or null. */
export function artCharacterFor(book: ColoringBook, id?: string): ArtCharacter | null {
  if (!id) return null;
  return artCharactersOf(book).find((c) => c.id === id) ?? null;
}

/** The words a page letters (title, verse words, reference), for the prompt's lettering line. */
function daughterWords(b: CoverBrief, s: Scene): { title: string; verse: string; ref: string } {
  const c = pageContentOf(b, s);
  const ref = c && c.scripture !== "none" ? (s.scriptureRef ?? "").trim() : "";
  return { title: c?.title === false ? "" : (s.pageTitle ?? s.title).trim(), verse: c?.scripture === "full" ? verseWords(b, s) : "", ref };
}

const quote = (t: string) => `“${t}”`;

/** The ChatGPT prompt for one page of a Devotional Spread: that page's art only. */
export function spreadArtPrompt(book: ColoringBook, b: CoverBrief, s: Scene, side: SpreadSide): string {
  const out: string[] = [];
  const title = bookTitle(book);
  if (side === "daughter") {
    const ch = artCharacterFor(book, s.artCharacterId);
    const lettering: LetterStyle = s.letterStyle ?? (b.pageTypography.letterStyle === "bubble" ? "bubble" : "elegant");
    const w = daughterWords(b, s);
    out.push(`Create one black-and-white coloring page: the daughter page (left-hand page) of a Devotional Spread${title ? ` in ${quote(title)}` : ""}.`);
    if (s.theme?.trim()) out.push(`Theme: ${s.theme.trim()}`);
    out.push(`Scene: ${s.text.trim() || "(describe the scene)"}`);
    out.push("", "STYLE", ...STYLE_LOCK.map((x) => `- ${x}`), "- Thick rounded outlines and large coloring spaces for ages 4 to 8.");
    out.push("", "CHARACTERS", "- One girl with Jesus.");
    out.push(ch ? `- The girl: ${ch.description}` : "- The girl: (choose a saved character for this page)");
    out.push("- Her hair is outlined and left white. Natural anatomy, five fingers on each hand.", `- ${JESUS}`);
    out.push("", "LETTERING");
    if (!s.textOff) out.push("- Leave the top quarter of the page completely blank: the words are added there later. Draw no letters or words anywhere.");
    else {
      const style = lettering === "bubble" ? "large hollow bubble letters" : "large, elegant hollow script letters";
      const main = [w.title, w.verse].filter(Boolean).map(quote).join(", then ");
      out.push(main ? `- Letter ${main} in ${style} across the top third of the page, with vines curling around a few of the letters. No banner.` : "- (Add the page's title to letter it.)");
      if (w.ref) out.push(`- Underneath, letter the reference ${quote(w.ref)} in smaller hollow letters.`);
    }
  } else {
    const m = mommyOf(s);
    const ch = artCharacterFor(book, m.artCharacterId);
    const scene = (m.scene ?? "").trim();
    const split = Math.round(spreadOf(book).split * 100);
    const jesus = /\bjesus\b/i.test(scene);
    out.push(`Create one black-and-white coloring page: the Mommy page (right-hand page) of a Devotional Spread${title ? ` in ${quote(title)}` : ""}.`);
    if ((m.theme ?? s.theme)?.trim()) out.push(`Theme: ${(m.theme ?? s.theme)!.trim()}`);
    out.push(`Scene: ${scene || "(describe the art for the Mommy page)"}`);
    out.push("", "STYLE", ...STYLE_LOCK.map((x) => `- ${x}`), "- A finer, feminine botanical line style.");
    out.push("", "LAYOUT");
    if (m.layout === "band") out.push(`- Place all of the art${m.textOff ? " and the lettering" : ""} in the top ${split}% of the page height. The bottom ${100 - split}% stays completely blank, for the activities.`);
    else out.push(`- Place all of the art${m.textOff ? " and the lettering" : ""} in the inner ${split}% of the page width (the left side, next to the binding). The outer ${100 - split}% (the right side) stays completely blank, for the activity column.`);
    out.push("", "PEOPLE");
    if (ch) out.push(`- ${ch.description}`, "- Hair outlined and left white. Natural anatomy, five fingers on each hand.");
    if (jesus) out.push(`- ${JESUS}`);
    if (!ch && !jesus) out.push(/\b(girl|mom|mommy|mother|woman|daughter|child|people|family)\b/i.test(scene) ? "- Draw only the people the scene names." : "- No people.");
    out.push("", "LETTERING");
    if (!m.textOff) out.push("- Draw no letters or words. Leave the top 1.5 inches of the art area blank: the words are added there later.");
    else if (m.title?.trim()) out.push(`- Letter the declaration ${quote(m.title.trim())} in ${m.letterStyle === "bubble" ? "large hollow bubble letters" : "elegant hollow script letters"} inside the art area. No banner.`);
    else out.push("- Draw no letters or words.");
  }
  out.push("", END);
  return out.join("\n");
}

// ---- Every page at once ----------------------------------------------------------------------------

/** Every spread's two Art Prompts, in print order, ready to paste one by one into ChatGPT. */
export function allArtPrompts(book: ColoringBook, b: CoverBrief): string {
  const spreads = b.scenes.filter(isSpread);
  return spreads
    .flatMap((s, i) => [
      `===== Spread ${i + 1} · LEFT (daughter page): ${(s.pageTitle ?? s.title).trim()} =====\n\n${spreadArtPrompt(book, b, s, "daughter")}`,
      `===== Spread ${i + 1} · RIGHT (Mommy page): ${(s.mommy?.title ?? "").trim() || "Mommy page"} =====\n\n${spreadArtPrompt(book, b, s, "mommy")}`,
    ])
    .join("\n\n\n");
}

/** The pages pictures go on, in print order: each spread's daughter page, then its Mommy page. */
export const picturePages = (b: CoverBrief) => b.scenes.filter(isSpread).flatMap((s, i) => [{ sceneId: s.id, side: "daughter" as SpreadSide, spread: i + 1 }, { sceneId: s.id, side: "mommy" as SpreadSide, spread: i + 1 }]);

/**
 * Which page each uploaded picture goes on. A file named with its spread number and side ("3-mommy.png",
 * "spread 3 left.png", "lesson3_daughter.png") goes there; the rest fill the remaining pages in print order, in the
 * order the files were chosen. Pages that already have art are filled only when `replace` is on.
 */
export function assignPictures(names: string[], b: CoverBrief, replace = false): { file: number; sceneId: string; side: SpreadSide }[] {
  const pages = picturePages(b);
  const has = (p: (typeof pages)[number]) => {
    const s = b.scenes.find((x) => x.id === p.sceneId)!;
    return p.side === "daughter" ? !!s.illustrationId : !!s.mommy?.illustrationId;
  };
  const free = pages.filter((p) => replace || !has(p));
  const taken = new Set<number>();
  const out: { file: number; sceneId: string; side: SpreadSide }[] = [];
  names.forEach((n, file) => {
    const num = /(\d+)/.exec(n)?.[1];
    const side: SpreadSide | null = /mom|mommy|mother|right/i.test(n) ? "mommy" : /daughter|girl|left|kid/i.test(n) ? "daughter" : null;
    if (!num || !side) return;
    const k = free.findIndex((p) => p.spread === +num && p.side === side);
    if (k >= 0 && !taken.has(k)) {
      taken.add(k);
      out.push({ file, sceneId: free[k].sceneId, side });
    }
  });
  let k = 0;
  names.forEach((_, file) => {
    if (out.some((o) => o.file === file)) return;
    while (k < free.length && taken.has(k)) k++;
    if (k >= free.length) return;
    taken.add(k);
    out.push({ file, sceneId: free[k].sceneId, side: free[k].side });
  });
  return out.sort((x, y) => x.file - y.file);
}
