/**
 * ROWS THAT FILL A PAGE — a numbered table prints exactly its chosen rows, and a
 * record section exactly its records (their numbers are counted in book order),
 * so "fill the page" is decided once, by measuring: the product is laid out
 * with a long table (or many records) and the units its first page holds
 * become the section's count. Uses the shared paginator's own piece
 * (SolvedPage.fragments) — no separate estimate that could disagree with it.
 */
import { resolveDocument, solvePage } from "../document/resolve";
import type { BookNode } from "../../types/recipe";
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
