/**
 * IMPORTING WHAT THE CUSTOMER WROTE ELSEWHERE — a book outline or a character description pasted from ChatGPT,
 * Claude or a document, read into Product Studio's fields for the customer to review before anything is saved.
 *
 * Reads labeled lines in any common form ("Scene 1: The Brave First Step", "**Scripture:** Proverbs 31:26",
 * "- Lesson — …"), Markdown or plain text. A line it doesn't recognise is kept in the scene's description, never
 * dropped; the complete original text is kept with the book as well.
 */
import type { CastMember, Scene } from "../cover/brief";
import { findReferences } from "./scripture";

/** Markdown and list decoration, removed before reading a line. */
const clean = (l: string) => l.replace(/^\s*(?:[-*•>]+\s+|#{1,6}\s*)/, "").replace(/\*\*|__|`/g, "").replace(/^\*(.+)\*$/, "$1").trim();
const unquote = (s: string) => s.trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, "").trim();

/** "Scene 1: Title", "Page 2 — Title", "Illustration 3. Title", "1) Title", "Scene One". */
const NUMBERS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const SCENE_HEAD = new RegExp(`^(?:scene|page|illustration|spread|picture)\\s*(\\d{1,3}|${NUMBERS.join("|")})\\b\\s*[:.)\\-–—]*\\s*(.*)$`, "i");
const NUM_HEAD = /^(\d{1,3})\s*[.)]\s+(.+)$/;

type Field = "title" | "description" | "characters" | "actions" | "scripture" | "verseText" | "lesson" | "style" | "customText" | "bookTitle" | "subtitle" | "audience" | "theme";
const LABELS: [RegExp, Field][] = [
  [/^(?:book\s*title|coloring\s*book\s*title)$/i, "bookTitle"],
  [/^subtitle$/i, "subtitle"],
  [/^(?:audience|age(?:\s*range|\s*group)?|for)$/i, "audience"],
  [/^(?:theme|series)$/i, "theme"],
  [/^(?:scene\s*title|page\s*title|title|name)$/i, "title"],
  [/^(?:scene(?:\s*description)?|description|setting|illustration|image|picture|what\s+we\s+see|visual|summary)$/i, "description"],
  [/^(?:characters?|who(?:'s|\s+is)?\s+in\s+it|cast|featuring)$/i, "characters"],
  [/^(?:actions?|activity|what\s+they(?:'re|\s+are)\s+doing|pose|poses)$/i, "actions"],
  [/^(?:verse\s*text|scripture\s*text|full\s*verse|verse\s*wording|wording)$/i, "verseText"],
  [/^(?:scripture(?:\s*reference)?|bible\s*verse|verse|key\s*verse|reference|memory\s*verse)$/i, "scripture"],
  [/^(?:lesson|reflection|takeaway|devotion(?:al)?|teaching|moral|talk\s*about\s*it|discussion|prayer)$/i, "lesson"],
  [/^(?:style|art\s*style|illustration\s*(?:notes|style)|art\s*notes|style\s*notes|notes\s*for\s*the\s*artist)$/i, "style"],
  [/^(?:custom\s*text|caption|page\s*text|quote|affirmation)$/i, "customText"],
];
/** "Label: value" or "Label — value", the label recognised. */
function labeled(line: string): { field: Field; value: string } | null {
  const m = /^([A-Za-z][A-Za-z '’\s]{0,30}?)\s*[:—–]\s*(.*)$/.exec(line);
  if (!m) return null;
  const hit = LABELS.find(([re]) => re.test(m[1].trim()));
  return hit ? { field: hit[1], value: m[2].trim() } : null;
}

export type ImportedScene = {
  number: number;
  title: string;
  description: string;
  characters: string;
  actions: string;
  scriptureRef: string;
  /** Verse wording supplied in the import (still needs the customer's approval before it is printed). */
  verseText: string;
  lesson: string;
  style: string;
  customText: string;
  /** References found anywhere in the scene, beyond the one used. */
  otherRefs: string[];
};

export type ImportedBook = { title: string; subtitle: string; audience: string; theme: string; scenes: ImportedScene[]; notes: string[] };

/** A verse given with its reference: "Proverbs 31:26 — “She speaks with wisdom…”" → the words after the reference. */
function splitVerse(value: string): { ref: string; words: string } {
  const ref = findReferences(value)[0] ?? "";
  if (!ref) return { ref: "", words: "" };
  const quoted = /["“]([^"”]{8,})["”]/.exec(value)?.[1];
  if (quoted) return { ref, words: quoted.trim() };
  // "Proverbs 31:26 (NIV): She speaks…" / "She speaks… (Proverbs 31:26)"
  const after = value.replace(/^[^:]*?\d+\s*:\s*\d+(?:\s*[-–]\s*\d+)?\s*(?:\([A-Za-z]+\))?\s*[:—–-]?\s*/, "").trim();
  const before = value.replace(/\s*[—–-]?\s*\(?[1-3]?\s*[A-Za-z. ]+\d+\s*:\s*\d+(?:\s*[-–]\s*\d+)?\)?\s*(?:\([A-Za-z]+\))?\s*$/, "").trim();
  const words = after && after !== value.trim() && !findReferences(after).length ? after : before && before !== value.trim() ? before : "";
  return { ref, words: unquote(words) };
}

/** Reads a pasted book outline: the book's title, then each scene and what it says. */
export function parseBookOutline(source: string): ImportedBook {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const book: ImportedBook & { bookTitle?: string } = { title: "", subtitle: "", audience: "", theme: "", scenes: [], notes: [] };
  let cur: (ImportedScene & { last: Field }) | null = null;
  const numberedHeads = lines.filter((l) => NUM_HEAD.test(clean(l)) && !labeled(clean(l))).length;
  const start = (n: number, title: string) => {
    finish();
    cur = { number: n, title: unquote(title), description: "", characters: "", actions: "", scriptureRef: "", verseText: "", lesson: "", style: "", customText: "", otherRefs: [], last: "description" };
  };
  const finish = () => {
    if (!cur) return;
    const s = cur as ImportedScene & { last: Field };
    const all = findReferences([s.title, s.description, s.actions, s.lesson, s.scriptureRef, s.customText].join("\n"));
    if (!s.scriptureRef && all.length) s.scriptureRef = all[0];
    s.otherRefs = all.filter((r) => r !== s.scriptureRef);
    if (!s.title) s.title = firstWords(s.description) || `Scene ${s.number}`;
    const { last: _l, ...scene } = s;
    void _l;
    book.scenes.push({ ...scene, description: scene.description.trim(), lesson: scene.lesson.trim() });
    cur = null;
  };
  for (const raw of lines) {
    const line = clean(raw);
    if (!line) continue;
    const head = SCENE_HEAD.exec(line);
    const num = numberedHeads >= 2 ? NUM_HEAD.exec(line) : null;
    if (head || num) {
      const n = head ? (/^\d+$/.test(head[1]) ? parseInt(head[1], 10) : NUMBERS.indexOf(head[1].toLowerCase()) + 1) : parseInt(num![1], 10);
      const rest = (head ? head[2] : num![2]).trim();
      // "Scene 1: Title: The Brave First Step" / "Scene 1 — Description: …"
      const inner = labeled(rest);
      start(n, inner?.field === "title" ? inner.value : inner ? "" : rest);
      if (inner && inner.field !== "title") add(inner.field, inner.value);
      continue;
    }
    const f = labeled(line);
    if (!cur) {
      if (f && (f.field === "bookTitle" || f.field === "subtitle" || f.field === "audience" || f.field === "theme")) book[f.field] = unquote(f.value);
      else if (f?.field === "title" && !book.title) book.title = unquote(f.value);
      else if (!book.title && /^#\s/.test(raw.trim())) book.title = unquote(line);
      else book.notes.push(line);
      continue;
    }
    if (f) add(f.field, f.value);
    else add(cur ? (cur as { last: Field }).last : "description", line, true);
  }
  finish();
  if (book.bookTitle) book.title = book.bookTitle;
  delete book.bookTitle;
  if (!book.title && book.notes.length && book.notes[0].length <= 80) book.title = unquote(book.notes.shift()!);
  return book;

  function add(field: Field, value: string, continuation = false) {
    const s = cur as (ImportedScene & { last: Field }) | null;
    if (!s) return;
    const v = value.trim();
    switch (field) {
      case "title":
        if (!s.title) s.title = unquote(v);
        else s.description = join(s.description, v);
        break;
      case "scripture": {
        const { ref, words } = splitVerse(v);
        if (ref && !s.scriptureRef) s.scriptureRef = ref;
        else if (ref && ref !== s.scriptureRef) s.otherRefs.push(ref);
        if (words && !s.verseText) s.verseText = words;
        if (!ref && v) s.description = join(s.description, `Scripture: ${v}`);
        break;
      }
      case "verseText":
        s.verseText = join(s.verseText, unquote(v));
        break;
      case "bookTitle": case "subtitle": case "audience": case "theme":
        s.description = join(s.description, v);
        break;
      case "characters": s.characters = join(s.characters, v); break;
      case "actions": s.actions = join(s.actions, v); break;
      case "lesson": s.lesson = join(s.lesson, v, "\n"); break;
      case "style": s.style = join(s.style, v); break;
      case "customText": s.customText = join(s.customText, v); break;
      default: s.description = join(s.description, v, continuation ? " " : " ");
    }
    if (field !== "title") s.last = field === "scripture" ? "verseText" : field;
  }
}
const join = (a: string, b: string, sep = " ") => (a ? `${a}${sep}${b}` : b).trim();
function firstWords(t: string): string {
  const s = t.split(/(?<=[.!?])\s|\n/)[0].trim();
  return s.length > 60 ? s.slice(0, 57).trimEnd() + "…" : s;
}

/** Imported scenes as the book's scenes (new ids). Nothing is approved: verse wording waits for the customer. */
export function scenesFromImport(book: ImportedBook, newId: () => string): Scene[] {
  return book.scenes.map((s) => ({
    id: newId(),
    title: s.title,
    pageTitle: s.title,
    text: [s.description, s.actions && `Action: ${s.actions}`].filter(Boolean).join("\n"),
    ...(s.scriptureRef ? { scriptureRef: s.scriptureRef } : {}),
    ...(s.verseText ? { verseText: s.verseText, verseSource: "customer" as const } : {}),
    ...(s.lesson ? { lessonText: s.lesson } : {}),
    ...(s.customText ? { customText: s.customText } : {}),
    ...(s.characters ? { characters: s.characters } : {}),
    ...(s.actions ? { actions: s.actions } : {}),
    ...(s.style ? { styleNotes: s.style } : {}),
  }));
}

/** The cast members a scene's "Characters:" line names (by first name, case-insensitive). */
export function castNamed(characters: string, cast: CastMember[]): string[] {
  const t = characters.toLowerCase();
  return cast.filter((c) => c.name && t.includes(c.name.toLowerCase().split(/\s+/)[0])).map((c) => c.id);
}

// ---- Characters --------------------------------------------------------------------------------------

type CharField = "name" | "age" | "face" | "hair" | "hairAccessories" | "proportions" | "clothing" | "accessories" | "description" | "traits";
const CHAR_LABELS: [RegExp, CharField][] = [
  [/^(?:name|character(?:\s*name)?)$/i, "name"],
  [/^age$/i, "age"],
  [/^(?:face|facial\s*features|skin(?:\s*tone)?|complexion|eyes|features|appearance)$/i, "face"],
  [/^(?:hair(?:style)?|hair\s*(?:texture|and\s*hairstyle|style)|hairstyle)$/i, "hair"],
  [/^(?:hair\s*accessor(?:y|ies)|bows?|headband|hair\s*bow)$/i, "hairAccessories"],
  [/^(?:body|build|proportions|height|body\s*type|size)$/i, "proportions"],
  [/^(?:clothing|outfit|clothes|signature\s*(?:clothing|outfit)|wardrobe|costume)$/i, "clothing"],
  [/^(?:accessor(?:y|ies)|jewelry|props?)$/i, "accessories"],
  [/^(?:personality|who\s+she\s+is|who\s+he\s+is|about|description|role|notes)$/i, "description"],
  [/^(?:distinctive\s*features|signature\s*features|always|never\s*change|identifying\s*features|key\s*traits|traits)$/i, "traits"],
];

export type ImportedCharacter = Omit<CastMember, "id">;

/**
 * Reads one or more pasted character descriptions. Labeled lines go to their field; free sentences are sorted by
 * what they mention (hair, bows and headbands, clothing), the rest kept as notes.
 */
export function parseCharacters(source: string): ImportedCharacter[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const out: ImportedCharacter[] = [];
  let cur: ImportedCharacter | null = null;
  const fresh = (name = ""): ImportedCharacter => ({ name, description: "", traits: "" });
  for (const raw of lines) {
    const line = clean(raw);
    if (!line) continue;
    // "## Jenny Ballerina", "Character 2: Renae", "1. Robby Ballerina" start a character.
    const head = /^(?:character\s*\d*\s*[:.)\-–—]\s*|\d+\s*[.)]\s+)?(.+)$/i.exec(line)!;
    const m = /^([A-Za-z][A-Za-z '’\s]{0,30}?)\s*[:—–]\s*(.*)$/.exec(line);
    const hit = m ? CHAR_LABELS.find(([re]) => re.test(m[1].trim())) : undefined;
    const isHeading = (/^#{1,6}\s/.test(raw.trim()) || /^character\s*\d*\s*[:.)\-–—]/i.test(line) || /^\d+\s*[.)]\s+[A-Z]/.test(line)) && !hit;
    if (isHeading || (hit?.[1] === "name" && cur?.name)) {
      if (cur && (cur.name || cur.description)) out.push(cur);
      cur = fresh(hit?.[1] === "name" ? m![2].trim() : head[1].replace(/^character\s*\d*\s*[:.)\-–—]\s*/i, "").trim());
      continue;
    }
    cur ??= fresh();
    if (hit) {
      const v = m![2].trim();
      cur[hit[1]] = join((cur[hit[1]] as string | undefined) ?? "", v, hit[1] === "description" ? " " : "; ");
      continue;
    }
    // Free text: sorted sentence by sentence.
    for (const sent of line.split(/(?<=[.!?])\s+/)) {
      const s = sent.trim();
      if (!s) continue;
      const field: CharField = /\b(bow|headband|ribbon|barrette|clip|beads?)\b/i.test(s) ? "hairAccessories"
        : /\b(hair|braids?|cornrows?|puff|curls?|curly|bun|ponytail|locs|afro|twists?)\b/i.test(s) ? "hair"
        : /\b(leotard|tutu|dress|shirt|skirt|tights|outfit|wears|wearing|shoes|slippers)\b/i.test(s) ? "clothing"
        : /\b(skin|eyes|face|cheeks|freckles|smile|dimples)\b/i.test(s) ? "face"
        : /\b(years? old|age \d|aged)\b/i.test(s) ? "age"
        : "description";
      cur[field] = join((cur[field] as string | undefined) ?? "", s, " ");
    }
  }
  if (cur && (cur.name || cur.description || cur.hair)) out.push(cur);
  return out.map((c) => ({ ...c, traits: c.traits || [c.hair, c.hairAccessories].filter(Boolean).join("; ") }));
}

/** A prompt the customer takes to ChatGPT (or any assistant) to get descriptions Product Studio reads field by field. */
export function characterDescriptionPrompt(book: { title: string; audience: string; names: string[] }): string {
  const who = book.names.length ? `the characters ${book.names.join(", ")}` : "each recurring character";
  return [
    `I'm making a coloring book${book.title ? ` called “${book.title}”` : ""}${book.audience ? ` for ${book.audience}` : ""}. Describe ${who} so an illustrator can draw them exactly the same on every page.`,
    "",
    "Use exactly these labels, one per line, for each character. Start each character with its Name line. Describe only what can be seen; keep each line short.",
    "",
    "Name:",
    "Age:",
    "Face: (face shape, skin tone, eyes, expression)",
    "Hair: (texture and hairstyle)",
    "Hair accessories: (bows, headbands, beads — or none)",
    "Body: (height and build compared with the others)",
    "Clothing: (signature outfit)",
    "Accessories: (or none)",
    "Distinctive features: (what must never change)",
    "Personality:",
  ].join("\n");
}
