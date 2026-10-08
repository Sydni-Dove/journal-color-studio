/**
 * UNIVERSAL DOCUMENT MODEL — conversions and checks (types/document.ts).
 *
 *   promptSetToDocument / documentToPromptSet
 *     Today's pages store PromptSet. These convert it to the universal model
 *     (structure + presentation + page-level settings) and back. Converting
 *     and converting back draws exactly the same pages (tests/document-model):
 *     the model is a faithful view of every existing page before anything is
 *     drawn from it.
 *
 *   semanticFingerprint
 *     A short fingerprint of what a component asks for (its kind, wording,
 *     fields, columns, space) — never its styling, which lives in
 *     PresentationHints. Requirement links store it when approved; a later
 *     mismatch is a material change, a restyle is not.
 *
 *   requirementStandings
 *     Each requirement's standing, one by one (met / changed / missing /
 *     unverified / operational). Never a blanket compliance claim.
 *
 * Pure functions, no DOM: they run the same in the editor and in tests.
 */
import type { PromptBlock, PromptSet } from "../../types/prompts";
import type {
  ComponentPresentation,
  DocComponent,
  DocumentStructure,
  FieldDef,
  PresentationHints,
  Requirement,
  RequirementLink,
  RequirementStanding,
  SpaceRequest,
} from "../../types/document";

/** PromptSet settings that are page-level and not yet modelled as components (kept exactly as they are). */
export type PageSettings = Pick<PromptSet, "spacing" | "frame" | "instructions" | "header" | "legacyWeights">;
export type DocumentView = { structure: DocumentStructure; presentation: PresentationHints; page: PageSettings };

// ─── PromptSet → document ────────────────────────────────────────────────────

const spaceOf = (b: PromptBlock): SpaceRequest => {
  const s: SpaceRequest = { mode: b.space ?? (b.lineCount !== undefined ? "fixed" : "fill") };
  if (b.lineCount !== undefined) s.lines = b.lineCount;
  if (b.minLines !== undefined) s.minLines = b.minLines;
  if (b.weight !== undefined) s.weight = b.weight;
  return s;
};
const textField = (key: string, label: string): FieldDef => ({ key, label, valueType: "text" });

function presentationOf(b: PromptBlock): ComponentPresentation {
  const p: ComponentPresentation = {};
  if (b.frame !== undefined) p.frame = b.frame;
  if (b.badge !== undefined) p.badge = b.badge;
  if (b.headingAlign !== undefined) p.headingAlign = b.headingAlign;
  if (b.headingRule !== undefined) p.headingRule = b.headingRule;
  if (b.headingFont !== undefined) p.headingFont = b.headingFont;
  if (b.headingSizePt !== undefined) p.headingSizePt = b.headingSizePt;
  if (b.beside !== undefined) p.beside = b.beside;
  if (b.kind === "heading" && b.textStyle === "body") p.bodyText = true;
  if (b.fieldStyles !== undefined) p.fieldStyles = b.fieldStyles;
  if (b.table?.borders !== undefined) p.tableBorders = b.table.borders;
  return p;
}

export function blockToComponent(b: PromptBlock): DocComponent {
  const base = { id: b.id, ...(b.content ? { binding: { mode: b.content.mode, key: b.content.key ?? b.id } } : {}) };
  const prompt = b.prompt !== undefined ? { prompt: b.prompt } : {};
  switch (b.kind ?? "prompt") {
    case "heading":
      return { ...base, kind: "heading", text: b.label, level: b.textStyle === "title" ? "title" : "heading", ...(b.prompt !== undefined ? { detail: b.prompt } : {}) };
    case "info":
      return { ...base, kind: "fieldGroup", fields: (b.fields ?? []).map((label, i) => textField(`${b.id}.${i}`, label)) };
    case "divider":
      return { ...base, kind: "divider" };
    case "spacer":
      return { ...base, kind: "spacer", size: b.spacer ?? "medium" };
    default:
      if (b.responseStyle === "checkboxes")
        return {
          ...base, kind: "checklist", label: b.label, ...prompt, space: spaceOf(b),
          ...(b.taskMarker !== undefined ? { marker: b.taskMarker } : {}),
          ...(b.taskMarkerPosition !== undefined ? { markerPosition: b.taskMarkerPosition } : {}),
          ...(b.taskLines !== undefined ? { lines: b.taskLines } : {}),
        };
      if (b.responseStyle === "table") {
        const t = b.table ?? { columns: [], rows: 0 };
        return {
          ...base, kind: "table", label: b.label, ...prompt, space: spaceOf(b),
          columns: t.columns.map((label, i) => textField(`${b.id}.c${i}`, label)), rows: t.rows,
          ...(t.showHeader !== undefined ? { showHeader: t.showHeader } : {}),
          ...(t.rowSpace !== undefined ? { rowSpace: t.rowSpace } : {}),
        };
      }
      return { ...base, kind: "question", label: b.label, ...prompt, response: b.responseStyle ?? "pattern", space: spaceOf(b) };
  }
}

/** A page's PromptSet as the universal model: components, their styling, and the page-level settings. */
export function promptSetToDocument(set: PromptSet): DocumentView {
  const presentation: PresentationHints = {};
  const components = set.blocks.map((b) => {
    const p = presentationOf(b);
    if (Object.keys(p).length) presentation[b.id] = p;
    return blockToComponent(b);
  });
  const structure: DocumentStructure = { components };
  if (set.whenFull !== undefined) structure.whenFull = set.whenFull;
  if (set.sameLines !== undefined) structure.sameLines = set.sameLines;
  const page: PageSettings = {};
  for (const k of ["spacing", "frame", "instructions", "header", "legacyWeights"] as const) if (set[k] !== undefined) (page as Record<string, unknown>)[k] = set[k];
  return { structure, presentation, page };
}

// ─── document → PromptSet ────────────────────────────────────────────────────

function spaceToBlock(s: SpaceRequest): Partial<PromptBlock> {
  return { space: s.mode, ...(s.lines !== undefined ? { lineCount: s.lines } : {}), ...(s.minLines !== undefined ? { minLines: s.minLines } : {}), ...(s.weight !== undefined ? { weight: s.weight } : {}) };
}

/**
 * A component as a PromptSet section, for the components today's pages can
 * draw. Records, sections and images are not drawable yet: they are reported
 * (null) rather than silently dropped or approximated.
 */
export function componentToBlock(c: DocComponent, p: ComponentPresentation = {}): PromptBlock | null {
  const style: Partial<PromptBlock> = {
    ...(p.frame !== undefined ? { frame: p.frame } : {}),
    ...(p.badge !== undefined ? { badge: p.badge } : {}),
    ...(p.headingAlign !== undefined ? { headingAlign: p.headingAlign } : {}),
    ...(p.headingRule !== undefined ? { headingRule: p.headingRule } : {}),
    ...(p.headingFont !== undefined ? { headingFont: p.headingFont } : {}),
    ...(p.headingSizePt !== undefined ? { headingSizePt: p.headingSizePt } : {}),
    ...(p.beside !== undefined ? { beside: p.beside } : {}),
    ...(c.binding ? { content: { mode: c.binding.mode, key: c.binding.key } } : {}),
  };
  switch (c.kind) {
    case "heading":
      return { id: c.id, kind: "heading", label: c.text, textStyle: c.level === "title" ? "title" : p.bodyText ? "body" : "heading", ...(c.detail !== undefined ? { prompt: c.detail } : {}), ...style };
    case "text":
      return { id: c.id, kind: "heading", label: c.text, textStyle: "body", ...style };
    case "fieldGroup":
      return { id: c.id, kind: "info", label: "", fields: c.fields.map((f) => f.label), ...(p.fieldStyles !== undefined ? { fieldStyles: p.fieldStyles } : {}), ...style };
    case "divider":
      return { id: c.id, kind: "divider", label: "", ...style };
    case "spacer":
      return { id: c.id, kind: "spacer", label: "", spacer: c.size, ...style };
    case "checklist":
      return {
        id: c.id, label: c.label, ...(c.prompt !== undefined ? { prompt: c.prompt } : {}), responseStyle: "checkboxes", ...spaceToBlock(c.space),
        ...(c.marker !== undefined ? { taskMarker: c.marker } : {}), ...(c.markerPosition !== undefined ? { taskMarkerPosition: c.markerPosition } : {}), ...(c.lines !== undefined ? { taskLines: c.lines } : {}), ...style,
      };
    case "table":
      return {
        id: c.id, label: c.label, ...(c.prompt !== undefined ? { prompt: c.prompt } : {}), responseStyle: "table", ...spaceToBlock(c.space),
        table: { columns: c.columns.map((f) => f.label), rows: c.rows, ...(c.showHeader !== undefined ? { showHeader: c.showHeader } : {}), ...(c.rowSpace !== undefined ? { rowSpace: c.rowSpace } : {}), ...(p.tableBorders !== undefined ? { borders: p.tableBorders } : {}) },
        ...style,
      };
    case "question":
      return { id: c.id, label: c.label, ...(c.prompt !== undefined ? { prompt: c.prompt } : {}), ...(c.response !== "pattern" ? { responseStyle: c.response } : {}), ...spaceToBlock(c.space), ...style };
    default:
      return null;
  }
}

export type PromptSetResult = { set: PromptSet; notDrawable: string[] };

/** The universal model back as a PromptSet. Components today's pages cannot draw are listed, never dropped silently. */
export function documentToPromptSet(view: DocumentView): PromptSetResult {
  const notDrawable: string[] = [];
  const blocks: PromptBlock[] = [];
  for (const c of view.structure.components) {
    const b = componentToBlock(c, view.presentation[c.id]);
    if (b) blocks.push(b);
    else notDrawable.push(c.id);
  }
  const set: PromptSet = { blocks, ...view.page };
  if (view.structure.whenFull !== undefined) set.whenFull = view.structure.whenFull;
  if (view.structure.sameLines !== undefined) set.sameLines = view.structure.sameLines;
  return { set, notDrawable };
}

// ─── Semantic fingerprint ────────────────────────────────────────────────────

/** Deterministic JSON: object keys sorted, so equal content always gives the same text. */
function canonical(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonical).join(",")}]`;
  if (x && typeof x === "object") return `{${Object.keys(x).sort().filter((k) => (x as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical((x as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(x);
}
/** cyrb53: a small, fast, well-distributed 53-bit string hash (browser-safe, no crypto needed). */
function hash53(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * What a component asks for — its kind, wording, fields, columns and space —
 * as a short fingerprint. Styling is not part of a component (it is in
 * PresentationHints), so restyling never changes it. Children of a section
 * are included: removing a required field inside a section changes the
 * section's fingerprint too.
 */
export function semanticFingerprint(c: DocComponent): string {
  return hash53(canonical(c));
}

// ─── Requirement standings (reserved) ────────────────────────────────────────

/** Every component in a structure, sections included, by id. */
export function componentsById(components: DocComponent[], out = new Map<string, DocComponent>()): Map<string, DocComponent> {
  for (const c of components) {
    out.set(c.id, c);
    if (c.kind === "section") componentsById(c.children, out);
  }
  return out;
}

export type RequirementReport = { requirementId: string; standing: RequirementStanding; changedComponents: string[]; missingComponents: string[] };

/**
 * Each requirement's standing, reported one by one. "met" means only that the
 * document has the linked parts, unchanged since approval, from a verified
 * source; it is never reported as legal compliance.
 */
export function requirementStandings(requirements: Requirement[], links: RequirementLink[], components: DocComponent[]): RequirementReport[] {
  const byId = componentsById(components);
  return requirements.map((r) => {
    const mine = links.filter((l) => l.requirementId === r.id);
    const missingComponents = mine.filter((l) => !byId.has(l.componentId)).map((l) => l.componentId);
    const changedComponents = mine.filter((l) => byId.has(l.componentId) && semanticFingerprint(byId.get(l.componentId)!) !== l.approvedFingerprint).map((l) => l.componentId);
    const standing: RequirementStanding =
      r.satisfiedBy === "operational" ? "operational"
      : !mine.length ? "missing"
      : missingComponents.length || changedComponents.length ? "changed"
      : r.verification.status !== "verified" ? "unverified"
      : "met";
    return { requirementId: r.id, standing, changedComponents, missingComponents };
  });
}
