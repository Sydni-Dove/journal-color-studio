/**
 * DEVOTIONAL STRUCTURES — ready-made ways to print a devotional from a
 * content list (one entry per day). Each is ordinary book structure: a
 * section that repeats once per entry, holding guided pages whose sections
 * name the list's fields (engines/data/bind.ts). No words are stored here;
 * switching structures, page sizes or bindings never touches the entries.
 *
 * A structure asks for roles (title, Scripture, teaching, reflection
 * questions, prayer, application, day); each is matched to one of the list's
 * fields by its key or label. A role with no field is left out of the pages,
 * and any field no role uses is reported — so nothing is dropped silently.
 */
import type { DataCollection, FieldDef } from "../types/document";
import type { PromptBlock } from "../types/prompts";
import type { BookGroup, BookNode, BookStep } from "../types/recipe";

export type DevotionalRole = "day" | "title" | "scripture" | "teaching" | "questions" | "prayer" | "application";

export const ROLE_LABEL: Record<DevotionalRole, string> = {
  day: "Day number",
  title: "Title",
  scripture: "Scripture",
  teaching: "Teaching",
  questions: "Reflection questions",
  prayer: "Prayer",
  application: "Application",
};

const ROLE_NAMES: Record<DevotionalRole, string[]> = {
  day: ["day", "day number", "day no", "number", "no"],
  title: ["title", "theme", "topic", "heading", "name"],
  scripture: ["scripture", "scriptures", "verse", "verses", "key verse", "reference", "passage", "bible reading", "reading passage"],
  teaching: ["teaching", "reading", "devotional", "devotional text", "devotion", "message", "narrative", "lesson", "story", "body"],
  questions: ["questions", "reflection questions", "reflection", "reflect", "discussion questions", "journal prompts", "prompts"],
  prayer: ["prayer", "closing prayer"],
  application: ["application", "apply", "action", "action step", "challenge", "response", "practice"],
};
const ROLES = Object.keys(ROLE_NAMES) as DevotionalRole[];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export type RoleMap = Partial<Record<DevotionalRole, string>>;

/** Each role's field (by key or label; each field used once), and the fields no role prints. */
export function matchRoles(c: DataCollection): { map: RoleMap; unused: FieldDef[] } {
  const map: RoleMap = {};
  const taken = new Set<string>();
  for (const role of ROLES) {
    const names = ROLE_NAMES[role];
    const f = c.fields.find((x) => !taken.has(x.key) && (names.includes(norm(x.key)) || names.includes(norm(x.label))));
    if (f) {
      map[role] = f.key;
      taken.add(f.key);
    }
  }
  // Signatures are signed on paper; they have no words to print.
  return { map, unused: c.fields.filter((f) => !taken.has(f.key) && f.valueType !== "signature") };
}

type Build = (collectionId: string, map: RoleMap) => BookNode[];

const body = (id: string, label: string, key: string | undefined): PromptBlock[] => (key ? [{ id, kind: "heading", textStyle: "body", label, content: { mode: "field", key } }] : []);
const questions = (id: string, key: string | undefined): PromptBlock[] => (key ? [{ id, kind: "list", label: "Reflect", listMarker: "number", items: [], content: { mode: "field", key } }] : []);
const writing = (id: string, label: string, lines?: number): PromptBlock => (lines ? { id, label, space: "fixed", lineCount: lines, minLines: 2 } : { id, label, space: "fill", minLines: 4 });

function titles(map: RoleMap): Pick<BookStep, "title" | "subtitle"> {
  const day = map.day ? `{${map.day}|#}` : "{#}";
  return map.title ? { title: `{${map.title}}`, subtitle: `Day ${day}` } : { title: `Day ${day}` };
}

const perEntry = (id: string, collectionId: string, children: BookNode[]): BookGroup => ({ kind: "group", id, label: "Each day", entries: { collectionId }, children });
const page = (id: string, map: RoleMap, blocks: PromptBlock[], extra: Partial<BookStep> = {}): BookStep => ({
  kind: "step",
  id,
  module: "devotional",
  layoutId: "guided-page",
  cadence: { type: "once" },
  start: "any",
  ...titles(map),
  promptSet: { blocks, spacing: "standard" },
  ...extra,
});

/** Everything for one day on its own pages, in order: Scripture, teaching, questions with room to write, prayer, application. */
const flowing: Build = (collectionId, m) => [
  perEntry("dev-each-day", collectionId, [
    page("dev-day", m, [
      ...body("dev-scripture", "Scripture", m.scripture),
      ...body("dev-teaching", "", m.teaching),
      ...questions("dev-questions", m.questions),
      writing("dev-response", m.questions ? "Your reflections" : "Reflect", 8),
      ...body("dev-prayer", "Prayer", m.prayer),
      ...body("dev-application", "Apply", m.application),
      writing("dev-next-step", "My next step", 3),
    ]),
  ]),
];

/** A reading page (Scripture and teaching), then a journaling page (questions, writing space, prayer, application). */
const readingThenJournal: Build = (collectionId, m) => [
  perEntry("dev-each-day", collectionId, [
    page("dev-reading", m, [...body("dev-scripture", "Scripture", m.scripture), ...body("dev-teaching", "", m.teaching)]),
    page("dev-journal", m, [...questions("dev-questions", m.questions), writing("dev-response", m.questions ? "Your reflections" : "Reflect"), ...body("dev-prayer", "Prayer", m.prayer), ...body("dev-application", "Apply", m.application)], { subtitle: titles(m).subtitle ?? titles(m).title }),
  ]),
];

/** As "one flowing entry", but every day opens on a right-hand page (a bound book adds a labelled notes page when needed). */
const rightHandStart: Build = (collectionId, m) => {
  const [g] = flowing(collectionId, m) as BookGroup[];
  return [{ ...g, children: g.children.map((c) => (c.kind === "step" ? { ...c, start: "recto" as const } : c)) }];
};

export const DEVOTIONAL_STRUCTURES: { id: string; label: string; description: string; build: Build }[] = [
  { id: "flowing", label: "One flowing day", description: "Each day's Scripture, teaching, questions with room to write, prayer and application, continuing onto more pages when long.", build: flowing },
  { id: "reading-journal", label: "Reading page + journaling page", description: "Each day: Scripture and teaching first, then a page for the questions, your writing, prayer and application.", build: readingThenJournal },
  { id: "right-hand", label: "Each day starts on a right-hand page", description: "As “One flowing day”; in a bound book a notes page is added where needed so every day opens on the right.", build: rightHandStart },
];

/**
 * The book with a devotional structure for `c`: the current book's leading
 * cover / divider pages and trailing back cover are kept around it.
 */
export function withDevotionalStructure(current: BookNode[] | undefined, structureId: string, c: DataCollection): BookNode[] {
  const s = DEVOTIONAL_STRUCTURES.find((x) => x.id === structureId) ?? DEVOTIONAL_STRUCTURES[0];
  const nodes = s.build(c.id, matchRoles(c).map);
  const cur = current ?? [];
  const isFront = (n: BookNode) => n.kind === "step" && (n.module === "cover-page" || n.module === "divider-page");
  const lead: BookNode[] = [];
  for (const n of cur) if (isFront(n)) lead.push(n); else break;
  const tail: BookNode[] = [];
  for (const n of [...cur].reverse()) if (n.kind === "step" && n.module === "back-cover") tail.unshift(n); else break;
  return [...lead, ...nodes, ...tail];
}

/** The per-entry section of a book that reads list `collectionId`, if any. */
export const usesCollection = (nodes: BookNode[] | undefined, collectionId: string): boolean =>
  !!nodes?.some((n) => n.kind === "group" && (n.entries?.collectionId === collectionId || usesCollection(n.children, collectionId)));
