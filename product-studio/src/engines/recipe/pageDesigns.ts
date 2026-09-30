/**
 * SAVED PAGE DESIGNS — a Custom Page built once in the Page Composer, reused
 * as a kind of page in Pages:
 *
 *   Cover → Master Dashboard → Project Snapshot × 8 → Revelation to Execution × 20 → Notes
 *
 * Pure functions over the project and its book structure.
 *
 *   saved page design   the reusable master: a name, a title and the sections
 *                       (structure only — colors, type and background stay in
 *                       Style, so a design follows the product's look)
 *   inserted pages      a group of ordinary Custom Page steps, one per page,
 *                       each with its OWN deep copy of the sections (and
 *                       `designId`), so editing one page never changes the
 *                       other pages or the saved design.
 *
 * Saving never overwrites an existing design: a name already in use is refused
 * and the maker chooses another.
 */
import type { PageDesign, ProductProject } from "../../types/project";
import type { BookGroup, BookNode, BookStep, RecipeCadence } from "../../types/recipe";
import type { PromptSet } from "../../types/prompts";
import { nodeId } from "./bookEdit";

/** Most pages one "Add to product" inserts. */
export const MAX_DESIGN_PAGES = 200;

const copySet = (s: PromptSet): PromptSet => JSON.parse(JSON.stringify(s));
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Whether a page design with this name already exists (names are compared without case). */
export const designNameTaken = (p: ProductProject, name: string) => (p.pageDesigns ?? []).some((d) => sameName(d.name, name));

/**
 * Save a Custom Page step's sections as a new page design. Never overwrites:
 * an empty name or one already in use comes back as an error to show.
 */
export function savePageDesign(p: ProductProject, step: BookStep, name: string, now = new Date().toISOString()): { project: ProductProject; design: PageDesign } | { error: string } {
  const clean = name.trim();
  if (!clean) return { error: "Give the page design a name." };
  if (designNameTaken(p, clean)) return { error: `A page design named “${clean}” already exists. Choose a different name.` };
  const design: PageDesign = { id: nodeId("pd"), name: clean, title: step.title, promptSet: copySet(step.promptSet ?? { blocks: [] }), savedAt: now };
  return { project: { ...p, pageDesigns: [...(p.pageDesigns ?? []), design] }, design };
}

export function removePageDesign(p: ProductProject, id: string): ProductProject {
  return { ...p, pageDesigns: (p.pageDesigns ?? []).filter((d) => d.id !== id) };
}

/** A new page from a design: a Custom Page with its own copy of the sections. */
export function stepFromDesign(d: PageDesign, cadence: RecipeCadence = { type: "copies", count: 1 }): BookStep {
  return { kind: "step", id: nodeId("s"), module: "custom", layoutId: "guided-page", cadence, title: d.title ?? d.name, promptSet: copySet(d.promptSet), designId: d.id };
}

/** `count` independent pages made from a design, kept together under the design's name. */
export function designGroup(d: PageDesign, count: number): BookGroup {
  const n = Math.max(1, Math.min(MAX_DESIGN_PAGES, Math.round(count)));
  return { kind: "group", id: nodeId("g"), label: d.name, designId: d.id, children: Array.from({ length: n }, () => stepFromDesign(d)) };
}

export const isDesignGroup = (n: BookNode): n is BookGroup & { designId: string } => n.kind === "group" && !!n.designId;

/** Add `copies` pages made from a design at the end of the book (before an end cover). */
export function addPageFromDesign(nodes: BookNode[], d: PageDesign, copies = 1): BookNode[] {
  const g = designGroup(d, copies);
  const end = nodes.findIndex((n) => n.kind === "step" && n.module === "back-cover");
  return end < 0 ? [...nodes, g] : [...nodes.slice(0, end), g, ...nodes.slice(end)];
}

/**
 * Change how many pages a design group holds. More pages are new copies of
 * the saved design (or, when it was deleted, of the group's first page); fewer
 * removes pages from the end.
 */
export function setDesignPageCount(nodes: BookNode[], groupId: string, count: number, design?: PageDesign): BookNode[] {
  const n = Math.max(1, Math.min(MAX_DESIGN_PAGES, Math.round(count)));
  return nodes.map(function walk(node): BookNode {
    if (node.kind !== "group") return node;
    if (node.id !== groupId) return { ...node, children: node.children.map(walk) };
    const kids = node.children;
    if (n <= kids.length) return { ...node, children: kids.slice(0, n) };
    const first = kids.find((k): k is BookStep => k.kind === "step");
    const fresh = (): BookStep => (design ? stepFromDesign(design) : { ...first!, id: nodeId("s"), promptSet: first!.promptSet ? copySet(first!.promptSet) : undefined });
    if (!design && !first) return node;
    return { ...node, children: [...kids, ...Array.from({ length: n - kids.length }, fresh)] };
  });
}

/** The design group a page belongs to (null when it is not part of one). */
export function designGroupOf(nodes: BookNode[], stepId: string): BookGroup | null {
  for (const n of nodes) {
    if (n.kind !== "group") continue;
    if (n.designId && n.children.some((c) => c.id === stepId)) return n;
    const inner = designGroupOf(n.children, stepId);
    if (inner) return inner;
  }
  return null;
}

/**
 * Move a top-level node up or down past the nearest top-level node that
 * `among` accepts (the pages listed beside it), keeping everything else in
 * place. Returns the nodes unchanged when there is nothing to pass.
 */
export function moveAmong(nodes: BookNode[], id: string, dir: -1 | 1, among: (n: BookNode) => boolean): BookNode[] {
  const i = nodes.findIndex((n) => n.id === id);
  if (i < 0) return nodes;
  let j = i + dir;
  while (j >= 0 && j < nodes.length && !among(nodes[j])) j += dir;
  if (j < 0 || j >= nodes.length) return nodes;
  const out = [...nodes];
  const [moved] = out.splice(i, 1);
  out.splice(j, 0, moved);
  return out;
}

/** "Discern 1" → "Discern 2", "Custom Page" → "Custom Page 2" — the next name not already used. */
export function nextPageName(name: string, taken: Set<string>): string {
  const m = /^(.*?)(\s*)(\d+)$/.exec(name.trim());
  const stem = m ? m[1] : name.trim();
  let n = m ? Number(m[3]) + 1 : 2;
  const sep = m ? m[2] || " " : " ";
  while (taken.has(`${stem}${sep}${n}`)) n++;
  return `${stem}${sep}${n}`;
}

/**
 * DUPLICATE PAGE — one more page just like this one, right after it, with its
 * own deep copy of everything (sections, section styles, writing space, page
 * header and details, page options). Editing either never changes the other.
 * A page repeated many times (a step of 120 copies) duplicates as one page. A
 * page inside a page-design group joins that group (the saved design is never
 * touched). A Custom Page's name moves on ("Discern 1" → "Discern 2"); other
 * pages keep their printed title.
 */
export function duplicatePage(nodes: BookNode[], stepId: string): { nodes: BookNode[]; id: string } | null {
  const all: BookStep[] = [];
  (function walk(ns: BookNode[]) {
    for (const n of ns) n.kind === "group" ? walk(n.children) : all.push(n);
  })(nodes);
  const src = all.find((s) => s.id === stepId);
  if (!src) return null;
  const copy: BookStep = JSON.parse(JSON.stringify(src));
  copy.id = nodeId("s");
  if (copy.cadence.type === "copies" && copy.cadence.count > 1) copy.cadence = { type: "copies", count: 1 };
  // Pages of a page-design group are numbered by the group; a lone Custom Page gets the next name.
  if (copy.module === "custom" && !designGroupOf(nodes, stepId)) copy.title = nextPageName(src.title || "Custom Page", new Set(all.map((s) => s.title ?? "")));
  const insert = (ns: BookNode[]): BookNode[] => {
    const i = ns.findIndex((n) => n.id === stepId);
    if (i >= 0) return [...ns.slice(0, i + 1), copy, ...ns.slice(i + 1)];
    return ns.map((n) => (n.kind === "group" ? { ...n, children: insert(n.children) } : n));
  };
  return { nodes: insert(nodes), id: copy.id };
}

/**
 * REPEAT PAGES — copy a set of pages (whole rows of the book: one kind of page,
 * several kinds together, or a page-design group) as many more times as asked,
 * in their order, starting at a chosen place. Every copy is independent (new
 * ids all the way down); a Custom Page's copy takes the next free name. A step
 * that prints several pages (e.g. 10 copies) repeats all of them.
 */
export const MAX_REPEATS = 50;
const isCover = (n: BookNode) => n.kind === "step" && (n.module === "cover-page" || n.module === "back-cover");
/** The rows that can be repeated (everything but the front and end covers). */
export const repeatableNodes = (nodes: BookNode[]) => nodes.filter((n) => !isCover(n));
/** Every step inside a row (itself, or a group's pages). */
export function stepsOf(n: BookNode): BookStep[] {
  return n.kind === "step" ? [n] : n.children.flatMap(stepsOf);
}

export type RepeatPlace = { at: "after" } | { at: "end" } | { at: "page"; page: number };

/**
 * Where the copies go, as a top-level index. "page": before the first row that
 * starts at or after that page (a row that is already under way finishes first);
 * past the last page, at the end. "end": before a closing end cover.
 */
export function repeatIndex(nodes: BookNode[], ids: string[], place: RepeatPlace, firstPage: (n: BookNode) => number | null): number {
  const end = nodes.length && isCover(nodes[nodes.length - 1]) && (nodes[nodes.length - 1] as BookStep).module === "back-cover" ? nodes.length - 1 : nodes.length;
  if (place.at === "after") {
    const last = Math.max(...nodes.map((n, i) => (ids.includes(n.id) ? i : -1)));
    return last < 0 ? end : last + 1;
  }
  if (place.at === "end") return end;
  const i = nodes.findIndex((n, k) => k > 0 && (firstPage(n) ?? -1) >= place.page);
  return i < 0 ? end : Math.min(i, end);
}

export function repeatPages(nodes: BookNode[], ids: string[], times: number, index: number): BookNode[] {
  const chosen = nodes.filter((n) => ids.includes(n.id) && !isCover(n));
  const n = Math.max(0, Math.min(MAX_REPEATS, Math.floor(times)));
  if (!chosen.length || !n) return nodes;
  const taken = new Set(nodes.flatMap(stepsOf).map((s) => s.title ?? ""));
  const fresh = (node: BookNode, inDesign: boolean): BookNode => {
    if (node.kind === "group") {
      const g: BookGroup = JSON.parse(JSON.stringify(node));
      return { ...g, id: nodeId("g"), children: node.children.map((c) => fresh(c, inDesign || !!node.designId)) };
    }
    const s: BookStep = JSON.parse(JSON.stringify(node));
    s.id = nodeId("s");
    if (s.module === "custom" && !inDesign) {
      s.title = nextPageName(node.title || "Custom Page", taken);
      taken.add(s.title);
    }
    return s;
  };
  const copies: BookNode[] = [];
  for (let k = 0; k < n; k++) for (const c of chosen) copies.push(fresh(c, false));
  const at = Math.max(0, Math.min(nodes.length, index));
  return [...nodes.slice(0, at), ...copies, ...nodes.slice(at)];
}
