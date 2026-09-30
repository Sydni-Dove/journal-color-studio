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
