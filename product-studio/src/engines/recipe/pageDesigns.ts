/**
 * SAVED PAGE DESIGNS — a Custom Page built once in the Page Composer, reused
 * as a kind of page in Pages / Order & repeats:
 *
 *   Cover → Master Dashboard → Project Snapshot × 8 → Revelation to Execution × 20 → Notes
 *
 * Pure functions over the project and its book structure. A page made from a
 * design is an ordinary Custom Page step with its own copy of the sections
 * (and `designId`), so it prints, repeats and edits like any other page.
 */
import type { PageDesign, ProductProject } from "../../types/project";
import type { BookNode, BookStep, RecipeCadence } from "../../types/recipe";
import type { PromptSet } from "../../types/prompts";
import { nodeId } from "./bookEdit";

const copySet = (s: PromptSet): PromptSet => JSON.parse(JSON.stringify(s));

/** Save (or update, by name) a page design from a Custom Page step's sections. */
export function savePageDesign(p: ProductProject, step: BookStep, name: string, now = new Date().toISOString()): ProductProject {
  const clean = name.trim() || step.title || "Page design";
  const set = step.promptSet ?? { blocks: [] };
  const designs = p.pageDesigns ?? [];
  const existing = designs.find((d) => d.name === clean);
  const design: PageDesign = { id: existing?.id ?? nodeId("pd"), name: clean, title: step.title, promptSet: copySet(set), savedAt: now };
  return { ...p, pageDesigns: existing ? designs.map((d) => (d.id === existing.id ? design : d)) : [...designs, design] };
}

export function removePageDesign(p: ProductProject, id: string): ProductProject {
  return { ...p, pageDesigns: (p.pageDesigns ?? []).filter((d) => d.id !== id) };
}

/** A new page from a design: a Custom Page with its own copy of the sections. */
export function stepFromDesign(d: PageDesign, cadence: RecipeCadence = { type: "copies", count: 1 }): BookStep {
  return { kind: "step", id: nodeId("s"), module: "custom", layoutId: "guided-page", cadence, title: d.title ?? d.name, promptSet: copySet(d.promptSet), designId: d.id };
}

/** Add a page made from a design at the end of the book (before an end cover). */
export function addPageFromDesign(nodes: BookNode[], d: PageDesign, copies = 1): BookNode[] {
  const s = stepFromDesign(d, { type: "copies", count: Math.max(1, Math.round(copies)) });
  const end = nodes.findIndex((n) => n.kind === "step" && n.module === "back-cover");
  return end < 0 ? [...nodes, s] : [...nodes.slice(0, end), s, ...nodes.slice(end)];
}
