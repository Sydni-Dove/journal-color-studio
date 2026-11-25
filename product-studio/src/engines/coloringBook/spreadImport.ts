/**
 * A WHOLE DEVOTIONAL SPREAD BOOK FROM ONE IDEA — the few-buttons path:
 *
 *   1. `lessonsPrompt`  the idea becomes a ChatGPT prompt asking for every lesson in one plain format
 *   2. `parseLessons`   the answer, pasted back, becomes one Devotional Spread per lesson: the daughter page (title,
 *                       theme, scene, verse), the Mommy page (declaration, art, Read the Word, Fill in the Blank,
 *                       Listen & Reflect, Heart to Heart). Lenient: labels in any case, bullets or numbers, "|" or
 *                       " — " between parts, lessons headed "Lesson 3", "Spread 3", "Day 3" or "Week 3".
 *   3. `fillScripture`  Scripture is never taken from ChatGPT: every exact quote and every daughter verse is filled in
 *                       word for word from the public-domain text (KJV, WEB). ChatGPT's shorter wording is kept only
 *                       when it is the verse's own words, in order (a true excerpt); otherwise the full verse is used.
 *                       Nothing is approved here: the maker reads them and approves them all with one button.
 */
import type { BlankLine, ExcerptKind, ReadWordLine, Scene } from "../cover/brief";
import { excerptFromVerse } from "../cover/assemble";
import { fetchPublicDomain, normalizeReference, translationOf, type FetchResult } from "./scripture";
import { containsAnswer, newMommy, SPREAD_PAGE_TYPE } from "./spread";

// ---- 1. The prompt ------------------------------------------------------------------------------

/** The ChatGPT prompt that writes every lesson, in the format `parseLessons` reads. */
export function lessonsPrompt(idea: string, count: number, opts: { title?: string; translation?: string; ages?: string } = {}): string {
  const t = opts.translation || "KJV";
  return [
    `Write ${count} mother-and-daughter devotional lessons for a coloring book${opts.title ? ` called "${opts.title}"` : ""}.`,
    `The idea: ${idea.trim()}`,
    `Each lesson is a two-page spread: a coloring page for a daughter (${opts.ages || "ages 4 to 8"}) and a devotional page for her mother.`,
    `Use the ${t} Bible. Give real references; quote only the ${t}'s exact words.`,
    "",
    "Write every lesson in exactly this format, with these labels, and nothing else before or after:",
    "",
    "LESSON 1: (short title for the daughter page, 2 to 5 words)",
    "Theme: (one short line)",
    "Daughter scene: (what the coloring picture shows: one girl with Jesus, doing something simple)",
    "Verse: (one Bible reference, e.g. Psalm 139:14)",
    `Verse words: (a short excerpt of that verse, the ${t}'s exact words, 3 to 10 words)`,
    "Mommy declaration: (one short declaration for the mother, under 9 words)",
    "Mommy art: (a botanical scene for the mother's page; no people unless needed)",
    "Read the Word:",
    `- (reference) | exact | (the ${t}'s exact words, one verse or part of one)`,
    `- (reference) | exact | (the ${t}'s exact words)`,
    "- (reference) | paraphrase | (a simple paraphrase for a mother)",
    "Fill in the Blank:",
    "- (a statement with ___ where one word is missing) | (the missing word) | (reference)",
    "- (statement with ___) | (missing word) | (reference)",
    "- (statement with ___) | (missing word) | (reference)",
    "Listen & Reflect: (one question for the mother)",
    "Heart to Heart: (one question the mother asks her daughter)",
    "",
    "Rules: each missing word must appear in one of that lesson's Read the Word lines. Keep everything warm, simple and true to Scripture.",
  ].join("\n");
}

// ---- 2. Reading the answer -------------------------------------------------------------------------

export type ImportedLesson = {
  number: number;
  title: string;
  theme: string;
  scene: string;
  verseRef: string;
  verseWords: string;
  declaration: string;
  mommyArt: string;
  readWord: ReadWordLine[];
  blanks: BlankLine[];
  reflect: string;
  heart: string;
};

const HEAD = /^\s*(?:#+\s*)?(?:\*\*)?\s*(lesson|spread|day|week)\s*(\d+)\s*(?:\*\*)?\s*[:.\-–—)]?\s*(.*)$/i;
const clean = (s: string) => s.replace(/\*\*/g, "").replace(/^["“]|["”]$/g, "").trim();
/** A list line: "- a | b | c", "• a — b — c", "1. a | b". */
const item = (l: string) => clean(l.replace(/^\s*(?:[-*•–]|\d+[.)])\s*/, ""));
const parts = (l: string) => item(l).split(/\s*\|\s*|\s+[—–]\s+/).map(clean).filter(Boolean);

/** A label at the start of a line ("Daughter scene:"), and what follows it. */
function labelled(line: string): { key: string; rest: string } | null {
  const m = /^\s*(?:[-*•]\s*)?(?:\*\*)?([A-Za-z&' ]{3,30}?)(?:\*\*)?\s*:\s*(.*)$/.exec(line);
  if (!m) return null;
  return { key: m[1].toLowerCase().replace(/[^a-z&]+/g, " ").trim(), rest: clean(m[2]) };
}

const KEY: [RegExp, keyof ImportedLesson | "read" | "blank"][] = [
  [/^theme$/, "theme"],
  [/^(daughter )?(scene|picture|art|illustration)$|^daughter (scene|picture|art)$/, "scene"],
  [/^(verse|scripture|bible verse|key verse)$/, "verseRef"],
  [/^(verse words|excerpt|verse text|words)$/, "verseWords"],
  [/^(mommy|mom|mother)( page)? (declaration|title)$|^declaration$/, "declaration"],
  [/^(mommy|mom|mother)( page)? (art|scene|picture)$/, "mommyArt"],
  [/^read the word$/, "read"],
  [/^fill in the blanks?$/, "blank"],
  [/^listen (&|and) reflect$|^reflect(ion)?$/, "reflect"],
  [/^heart to heart$/, "heart"],
  [/^title$/, "title"],
];

const KINDS: Record<string, ExcerptKind> = { exact: "exact", quote: "exact", "exact quote": "exact", paraphrase: "paraphrase", reflection: "reflection", "scripture based reflection": "reflection" };

/** Every lesson found in the pasted text, in order. */
export function parseLessons(text: string): ImportedLesson[] {
  const out: ImportedLesson[] = [];
  let cur: ImportedLesson | null = null;
  let list: "read" | "blank" | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = HEAD.exec(line);
    if (h) {
      cur = { number: +h[2], title: clean(h[3]), theme: "", scene: "", verseRef: "", verseWords: "", declaration: "", mommyArt: "", readWord: [], blanks: [], reflect: "", heart: "" };
      out.push(cur);
      list = null;
      continue;
    }
    if (!cur) continue;
    const l = labelled(line);
    const key = l ? KEY.find(([re]) => re.test(l.key))?.[1] : undefined;
    if (l && key) {
      list = key === "read" || key === "blank" ? key : null;
      if (list && l.rest) addTo(cur, list, l.rest);
      else if (!list) (cur as Record<string, unknown>)[key] = l.rest;
      continue;
    }
    if (list && /^\s*(?:[-*•–]|\d+[.)])/.test(raw)) addTo(cur, list, line);
  }
  return out.filter((x) => x.title || x.scene || x.readWord.length);
}

function addTo(l: ImportedLesson, list: "read" | "blank", line: string) {
  const p = parts(line);
  if (list === "read") {
    // "ref | kind | words", or "ref | words" (exact), or "words (ref)".
    let ref = "", kind: ExcerptKind = "exact", words = "";
    if (p.length >= 3) [ref, kind, words] = [p[0], KINDS[p[1].toLowerCase().replace(/[^a-z ]+/g, " ").trim()] ?? "exact", p.slice(2).join(" | ")];
    else if (p.length === 2) [ref, words] = normalizeReference(p[0]) ? [p[0], p[1]] : [p[1], p[0]];
    else {
      const m = /^(.*)\(([^)]+)\)\s*$/.exec(p[0] ?? "");
      if (m) [words, ref] = [m[1].trim(), m[2].trim()];
      else words = p[0] ?? "";
    }
    if (words) l.readWord.push({ ref: normalizeReference(ref) ?? ref, kind, text: clean(words) });
  } else {
    const [statement = "", answer = "", ref = ""] = p;
    if (statement) l.blanks.push({ text: statement, answer, ref: normalizeReference(ref) ?? ref });
  }
}

/** The lessons as Devotional Spreads (bubble daughter page, elegant Mommy page with its declaration drawn into the art). */
export function spreadsFromLessons(lessons: ImportedLesson[], id: () => string, characterId?: string): Scene[] {
  return lessons.map((l) => {
    const ref = normalizeReference(l.verseRef) ?? l.verseRef.trim();
    return {
      id: id(), title: l.title || `Lesson ${l.number}`, pageTitle: l.title || `Lesson ${l.number}`, text: l.scene, pageType: SPREAD_PAGE_TYPE, letterStyle: "bubble" as const,
      ...(l.theme ? { theme: l.theme } : {}),
      ...(characterId ? { artCharacterId: characterId } : {}),
      ...(ref ? { scriptureRef: ref } : {}),
      // The short excerpt is checked against the real verse once it is filled in (fillScripture).
      ...(l.verseWords ? { verseUse: "excerpt" as const, verseExcerpt: l.verseWords } : {}),
      mommy: {
        ...newMommy(), letterStyle: "elegant" as const, textOff: true,
        ...(l.declaration ? { title: l.declaration } : {}),
        ...(l.mommyArt ? { scene: l.mommyArt } : {}),
        readWord: l.readWord.slice(0, 3),
        blanks: l.blanks.slice(0, 3),
        reflect: { question: l.reflect, lines: 4 },
        heart: l.heart,
      },
    };
  });
}

// ---- 3. Scripture, word for word ------------------------------------------------------------------

export type FillReport = { filled: number; kept: number; replaced: string[]; failed: string[] };

/**
 * Every daughter verse and every exact Read the Word quote filled in from the public-domain text. An excerpt is kept
 * only when it is the verse's own words in order; otherwise the full verse prints (and it is listed in `replaced`).
 * Copyrighted translations are never fetched: their quotes stay as pasted, unapproved, for the maker to check.
 */
export async function fillScripture(scenes: Scene[], translation: string, fetcher: (ref: string, t: string) => Promise<FetchResult> = fetchPublicDomain): Promise<{ scenes: Scene[]; report: FillReport }> {
  const report: FillReport = { filled: 0, kept: 0, replaced: [], failed: [] };
  if (!translationOf(translation).publicDomain) return { scenes, report };
  const cache = new Map<string, Promise<FetchResult>>();
  const get = (ref: string) => {
    if (!cache.has(ref)) cache.set(ref, fetcher(ref, translation));
    return cache.get(ref)!;
  };
  const out: Scene[] = [];
  for (const s of scenes) {
    let next: Scene = { ...s };
    const ref = s.scriptureRef && normalizeReference(s.scriptureRef);
    if (ref) {
      const r = await get(ref);
      if (r.ok) {
        report.filled++;
        const keep = s.verseExcerpt && excerptFromVerse(s.verseExcerpt, r.text);
        if (s.verseExcerpt && !keep) report.replaced.push(`${s.pageTitle ?? s.title}: ${ref}`);
        next = { ...next, scriptureRef: ref, verseText: r.text, verseSource: "public-domain", verseApproved: undefined, ...(keep ? { verseUse: "excerpt" as const } : { verseUse: undefined, verseExcerpt: undefined }) };
      } else report.failed.push(`${s.pageTitle ?? s.title}: ${ref}`);
    }
    if (s.mommy) {
      const lines = await Promise.all(
        s.mommy.readWord.map(async (line) => {
          const lref = line.kind === "exact" && normalizeReference(line.ref);
          if (!lref) return line;
          const r = await get(lref);
          if (!r.ok) {
            report.failed.push(`${s.pageTitle ?? s.title}: ${lref}`);
            return line;
          }
          report.filled++;
          if (line.text.trim() && excerptFromVerse(line.text, r.text)) {
            report.kept++;
            return { ...line, ref: lref };
          }
          report.replaced.push(`${s.pageTitle ?? s.title}: ${lref}`);
          return { ...line, ref: lref, text: r.text };
        }),
      );
      // A blank whose answer isn't in the kept (short) excerpt but is in the full verse: print the full verse.
      for (const blank of s.mommy.blanks) {
        if (!blank.answer.trim() || lines.some((l) => containsAnswer(l.text, blank.answer))) continue;
        for (const [k, l] of lines.entries()) {
          const lref = l.kind === "exact" && normalizeReference(l.ref);
          const full = lref ? await get(lref) : null;
          if (full?.ok && containsAnswer(full.text, blank.answer)) {
            lines[k] = { ...l, text: full.text };
            break;
          }
        }
      }
      next = { ...next, mommy: { ...s.mommy, readWord: lines } };
    }
    out.push(next);
  }
  return { scenes: out, report };
}
