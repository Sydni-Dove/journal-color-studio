/**
 * ROWS THAT FILL A PAGE — a numbered table prints exactly its chosen rows, and a
 * record section exactly its records (their numbers are counted in book order),
 * so "fill the page" is decided once, by measuring: the product is laid out
 * with a long table (or many records) and the units its first page holds
 * become the section's count. Uses the shared paginator's own piece
 * (SolvedPage.fragments) — no separate estimate that could disagree with it.
 */
import { resolveDocument, solvePage } from "../document/resolve";
import type { BookNode, BookStep } from "../../types/recipe";
import type { PromptBlock } from "../../types/prompts";
import type { ProductProject } from "../../types/project";

const PROBE_ROWS = 200;

const withRows = (nodes: BookNode[], blockId: string, rows: number): BookNode[] =>
  nodes.map((n) =>
    n.kind === "group"
      ? { ...n, children: withRows(n.children, blockId, rows) }
      : n.promptSet?.blocks.some((b) => b.id === blockId)
        ? {
            ...n,
            promptSet: {
              ...n.promptSet,
              blocks: n.promptSet.blocks.map((b) =>
                b.id !== blockId ? b : b.kind === "record" ? { ...b, recordCount: rows } : b.table ? { ...b, lineCount: rows, table: { ...b.table, rows } } : b,
              ),
            },
          }
        : n,
  );

/** How many rows of table `blockId` (or records of record section `blockId`) fit on its page in this product (null when it isn't in the product). */
export function rowsFillingOnePage(project: ProductProject, blockId: string): number | null {
  const structure = project.recipe.structure;
  if (!structure) return null;
  const probe = { ...project, recipe: { ...project.recipe, structure: withRows(structure, blockId, PROBE_ROWS) } };
  const doc = resolveDocument(probe);
  const i = doc.recipe.pages.findIndex((p) => !p.filler && p.module?.promptSet?.blocks.some((b) => b.id === blockId));
  if (i < 0) return null;
  const piece = solvePage(doc, i).fragments?.find((f) => f.componentId === blockId && f.part === 0);
  return piece ? piece.to - piece.from : PROBE_ROWS;
}

/** The product with table / record section `blockId` set to the rows (records) that fill its page. */
export function fitTableToPage(project: ProductProject, blockId: string): ProductProject {
  const rows = rowsFillingOnePage(project, blockId);
  return rows && project.recipe.structure ? { ...project, recipe: { ...project.recipe, structure: withRows(project.recipe.structure, blockId, Math.max(1, rows)) } } : project;
}

/** A section whose count follows the page: a numbered table, or a record section, marked to fill the page. */
export const fillsPage = (b: PromptBlock) => !!b.fillPage && (b.kind === "record" || (b.responseStyle === "table" && !!b.table?.numbering));

function stepsOf(nodes: BookNode[]): BookStep[] {
  return nodes.flatMap((n) => (n.kind === "group" ? stepsOf(n.children) : [n]));
}

/** Every page-filling section of a product (by block id, once each). */
export function pageFillingBlocks(project: ProductProject): string[] {
  const ids = new Set<string>();
  for (const s of stepsOf(project.recipe.structure ?? [])) for (const b of s.promptSet?.blocks ?? []) if (fillsPage(b)) ids.add(b.id);
  return [...ids];
}

/**
 * What a page-filling section's count depends on: the page (size, orientation, binding, printer,
 * margins), the type and spacing, and the other sections on its page — not its own count.
 */
export function pageFillKey(project: ProductProject): string {
  const steps = stepsOf(project.recipe.structure ?? []).filter((s) => s.promptSet?.blocks.some(fillsPage));
  if (!steps.length) return "";
  const neutral = (b: PromptBlock): PromptBlock => (fillsPage(b) ? { ...b, lineCount: undefined, recordCount: undefined, ...(b.table ? { table: { ...b.table, rows: 0 } } : {}) } : b);
  return JSON.stringify([
    project.dimensions, project.production, project.typography, project.spacing, project.layoutOptions, project.functionalPattern,
    steps.map((s) => [s.id, s.layoutId, s.title, { ...s.promptSet, blocks: s.promptSet!.blocks.map(neutral) }]),
  ]);
}

/** The product with every page-filling section measured to fill its page. */
export function refitPageFilling(project: ProductProject): ProductProject {
  return pageFillingBlocks(project).reduce((p, id) => fitTableToPage(p, id), project);
}

/**
 * After an edit: refit page-filling sections when what they depend on changed (a quiet, automatic
 * improvement — the same edit, one undo step). Deliberate counts are not page-filling, so never touched.
 */
export function refitAfterEdit(before: ProductProject, after: ProductProject): ProductProject {
  const key = pageFillKey(after);
  return key && key !== pageFillKey(before) ? refitPageFilling(after) : after;
}
