/**
 * Where the hardcover outputs go on paper: the cover sheets (one per cover, with room for the chosen marks)
 * and the actual-size alignment template, split into overlapping tiles when it is bigger than the paper.
 * Pure layout in inches; the components draw it.
 */
import type { AssemblyPaper } from "../../types/project";
import type { HardcoverPlan } from "./hardcover";
import { inches } from "./hardcover";

export const ASSEMBLY_PAPER: Record<Exclude<AssemblyPaper, "sheet">, { w: number; h: number; label: string }> = {
  letter: { w: 8.5, h: 11, label: "Letter 8.5 × 11" },
  legal: { w: 8.5, h: 14, label: "Legal 8.5 × 14" },
  tabloid: { w: 11, h: 17, label: "Tabloid 11 × 17" },
  "super-b": { w: 13, h: 19, label: "Super B 13 × 19" },
};

/** Room around a cover sheet for marks drawn outside it (cut marks in the margin). */
export const MARK_MARGIN_IN = 0.5;
/** Home printers can't print to the paper's edge. */
export const PRINTER_MARGIN_IN = 0.25;
/** Template tiles overlap this much so they can be taped together. */
export const TILE_OVERLAP_IN = 0.5;

/**
 * `outsideMarks`: there is printable room around the sheet for crop-style marks. Without it, cut marks go just
 * inside the sheet's corners — the triangles the 45° corner cuts remove — so the sheet never needs a margin.
 */
export type CoverSheetLayout = { pageW: number; pageH: number; x: number; y: number; outsideMarks: boolean; error?: string };

/** The page a cover sheet prints on, and where the sheet sits on it (centred). */
export function coverSheetLayout(plan: HardcoverPlan, withMarks: boolean, paper: AssemblyPaper = "sheet"): CoverSheetLayout {
  const m = withMarks ? MARK_MARGIN_IN : 0;
  const needW = plan.sheet.w + 2 * m, needH = plan.sheet.h + 2 * m;
  if (paper === "sheet") return { pageW: needW, pageH: needH, x: m, y: m, outsideMarks: m > 0 };
  const p = ASSEMBLY_PAPER[paper];
  // Either way round; the sheet must fit inside the printer's margins.
  for (const [w, h] of [[p.w, p.h], [p.h, p.w]] as const) {
    if (plan.sheet.w + 2 * PRINTER_MARGIN_IN <= w + 1e-6 && plan.sheet.h + 2 * PRINTER_MARGIN_IN <= h + 1e-6) {
      const room = Math.min(w - plan.sheet.w, h - plan.sheet.h) / 2;
      return { pageW: w, pageH: h, x: (w - plan.sheet.w) / 2, y: (h - plan.sheet.h) / 2, outsideMarks: m > 0 && room >= PRINTER_MARGIN_IN + 0.3 };
    }
  }
  const [w, h] = plan.sheet.w > plan.sheet.h ? [p.h, p.w] : [p.w, p.h];
  return {
    pageW: w, pageH: h, x: (w - plan.sheet.w) / 2, y: (h - plan.sheet.h) / 2, outsideMarks: false,
    error: `A ${inches(plan.sheet.w)} × ${inches(plan.sheet.h)} cover sheet doesn't fit on ${p.label} paper. Choose larger paper, or "Exact size" and print at a print shop.`,
  };
}

export type TemplateTile = { col: number; row: number; cols: number; rows: number; x0: number; y0: number; w: number; h: number };
export type TemplateLayout = { pageW: number; pageH: number; tiles: TemplateTile[]; bounds: { x: number; y: number; w: number; h: number } };

/** The drawing's extent: the sheet plus room for its labels. */
const templateBounds = (plan: HardcoverPlan) => ({ x: -0.25, y: -0.25, w: plan.sheet.w + 0.5, h: plan.sheet.h + 0.5 });

/** Actual-size template pages: one page when it fits, else overlapping tiles (the fewer of the two paper turns). */
export function templateLayout(plan: HardcoverPlan, paper: AssemblyPaper = "letter"): TemplateLayout {
  const b = templateBounds(plan);
  if (paper === "sheet") return { pageW: b.w, pageH: b.h, bounds: b, tiles: [{ col: 0, row: 0, cols: 1, rows: 1, x0: b.x, y0: b.y, w: b.w, h: b.h }] };
  const p = ASSEMBLY_PAPER[paper];
  const options = ([[p.w, p.h], [p.h, p.w]] as const).map(([pw, ph]) => {
    const aw = pw - 2 * PRINTER_MARGIN_IN, ah = ph - 2 * PRINTER_MARGIN_IN;
    const cols = b.w <= aw + 1e-6 ? 1 : Math.ceil((b.w - TILE_OVERLAP_IN) / (aw - TILE_OVERLAP_IN) - 1e-9);
    const rows = b.h <= ah + 1e-6 ? 1 : Math.ceil((b.h - TILE_OVERLAP_IN) / (ah - TILE_OVERLAP_IN) - 1e-9);
    return { pw, ph, aw, ah, cols, rows };
  });
  const o = options.sort((a, c) => a.cols * a.rows - c.cols * c.rows)[0];
  const tiles: TemplateTile[] = [];
  for (let row = 0; row < o.rows; row++)
    for (let col = 0; col < o.cols; col++)
      tiles.push({ col, row, cols: o.cols, rows: o.rows, x0: b.x + col * (o.aw - TILE_OVERLAP_IN), y0: b.y + row * (o.ah - TILE_OVERLAP_IN), w: o.aw, h: o.ah });
  return { pageW: o.pw, pageH: o.ph, tiles, bounds: b };
}
