/**
 * PRINT ENGINE — decides WHICH pages print, how many times, and the @page
 * box. The pages themselves are drawn by the same PrintablePage used in the
 * editor (Preview = Print).
 */
import type { ExportSettings } from "../../types/project";
import type { ProductType } from "../../types/product";
import { SIZE_PRESETS } from "../../presets/sizes/sizePresets";
import { geometryFor, trimForPage, type ResolvedDocument } from "../document/resolve";

export type PrintPlan = {
  /** Page indices in output order (repeats included for repeated sheets). */
  sequence: number[];
  mediaWidthIn: number;
  mediaHeightIn: number;
  pageCss: string;
  /** The printed sheet (the page's own size, or Letter / A4 paper with the page centred). */
  sheetWidthIn: number;
  sheetHeightIn: number;
  errors: string[];
  /** Home-paper only: whether to draw trim/cut marks around the finished page. */
  showTrimMarks: boolean;
  /** Designs on each printed sheet (1, or 2 at actual size). */
  perSheet: 1 | 2;
  /** The printed sheets in order: the page indices on each (one, or two side by side / stacked). */
  sheets: number[][];
  /** Two per sheet: where each design's page box sits on the sheet, in inches from its top-left corner. */
  slots: { x: number; y: number }[];
  /** The sheet's orientation (chosen automatically to fit the page, or two of them). */
  orientation: "portrait" | "landscape";
  /** Things to know that don't stop printing (e.g. art close to the paper edge). */
  notes: string[];
};

/** Home printers can't print right up to the paper edge: about this much is left blank on most. */
export const HOME_PRINTER_MARGIN_IN = 0.25;
/** Two per sheet: the space left between the designs when there's room (a clean cut between them). */
const TWO_UP_GAP_IN = 0.25;

/**
 * Two designs at actual size on one sheet of paper: side by side on landscape paper, or stacked on portrait
 * paper — whichever fits, with the most room to spare. Null when two don't fit at actual size.
 */
export function twoUpLayout(pageW: number, pageH: number, paper: { w: number; h: number }) {
  const options = [
    { orientation: "landscape" as const, sheetW: paper.h, sheetH: paper.w, across: true },
    { orientation: "landscape" as const, sheetW: paper.h, sheetH: paper.w, across: false },
    { orientation: "portrait" as const, sheetW: paper.w, sheetH: paper.h, across: true },
    { orientation: "portrait" as const, sheetW: paper.w, sheetH: paper.h, across: false },
  ]
    .map((o) => {
      const needW = o.across ? 2 * pageW : pageW, needH = o.across ? pageH : 2 * pageH;
      const spareW = o.sheetW - needW, spareH = o.sheetH - needH;
      if (spareW < -1e-6 || spareH < -1e-6) return null;
      // Room between the two: a quarter inch when the sheet has it, otherwise as much as there is.
      const gap = Math.max(0, Math.min(TWO_UP_GAP_IN, o.across ? spareW : spareH));
      const totalW = o.across ? 2 * pageW + gap : pageW, totalH = o.across ? pageH : 2 * pageH + gap;
      const x0 = (o.sheetW - totalW) / 2, y0 = (o.sheetH - totalH) / 2;
      const slots = o.across ? [{ x: x0, y: y0 }, { x: x0 + pageW + gap, y: y0 }] : [{ x: x0, y: y0 }, { x: x0, y: y0 + pageH + gap }];
      return { ...o, slots, margin: Math.min(x0, y0), gap };
    })
    .filter((o): o is NonNullable<typeof o> => !!o)
    .sort((a, b) => b.margin - a.margin);
  return options[0] ?? null;
}

/** Home printer paper, portrait (inches). */
export const PAPER: Record<"letter" | "a4", { w: number; h: number; label: string }> = {
  letter: { w: 8.5, h: 11, label: "Letter" },
  a4: { w: 210 / 25.4, h: 297 / 25.4, label: "A4" },
};

/** @page rule: exact media size, zero browser margins (no accidental scaling or margins). */
export function pageRuleCss(widthIn: number, heightIn: number): string {
  return `@page { size: ${widthIn}in ${heightIn}in; margin: 0; }`;
}

export function planPrint(doc: ResolvedDocument, settings: ExportSettings, currentIndex = 0): PrintPlan {
  const pages = doc.recipe.pages;
  const errors: string[] = [];
  let indices: number[];
  switch (settings.scope) {
    case "current-page":
      indices = [currentIndex];
      break;
    case "page-range": {
      const from = Math.max(1, settings.pageRange?.from ?? 1);
      const to = Math.min(pages.length, settings.pageRange?.to ?? pages.length);
      if (from > to) errors.push(`Page range ${from}–${to} is empty.`);
      indices = pages.map((_, i) => i).filter((i) => pages[i].pageNumber >= from && pages[i].pageNumber <= to);
      break;
    }
    default:
      indices = pages.map((_, i) => i);
  }
  // Mixed-orientation products: export one orientation at a time, so every
  // page in the job shares a media size (a browser print job has one @page box).
  if (settings.scope === "landscape-pages" || settings.scope === "portrait-pages") {
    const want = settings.scope === "landscape-pages" ? "landscape" : "portrait";
    indices = indices.filter((i) => trimForPage(doc, pages[i], i).orientation === want);
    if (!indices.length) errors.push(`This product has no ${want} pages.`);
  }

  const sequence: number[] = [];
  for (const i of indices) {
    const copies = settings.repeatSheets && pages[i].physicalSheets ? pages[i].physicalSheets : 1;
    for (let c = 0; c < copies; c++) sequence.push(i);
  }

  // All pages in one print job must share a media size.
  const sizes = new Set(indices.map((i) => {
    const g = geometryFor(doc, pages[i]);
    return `${g.mediaWidthIn.toFixed(4)}x${g.mediaHeightIn.toFixed(4)}`;
  }));
  if (sizes.size > 1) errors.push("Pages in this export have different sizes — this product mixes landscape and portrait pages. Choose “Landscape pages” or “Portrait pages” under “What to export” to export each orientation on its own.");
  const g0 = geometryFor(doc, pages[indices[0] ?? 0]);
  // The sheet: the page's own size, or home paper turned to match the page (a landscape page on landscape paper).
  let sheetW = g0.mediaWidthIn, sheetH = g0.mediaHeightIn;
  const paper = settings.paper && settings.paper !== "page" ? PAPER[settings.paper] : null;
  if (paper) {
    const landscape = g0.mediaWidthIn > g0.mediaHeightIn;
    [sheetW, sheetH] = landscape ? [paper.h, paper.w] : [paper.w, paper.h];
    if (g0.mediaWidthIn > sheetW + 1e-6 || g0.mediaHeightIn > sheetH + 1e-6) {
      errors.push(`A ${g0.mediaWidthIn.toFixed(2)}" × ${g0.mediaHeightIn.toFixed(2)}" page is larger than ${paper.label} paper. Choose “Page size” and print at a print shop, or save as PDF.`);
    }
  }
  const notes: string[] = [];
  if (settings.perSheet === 2) {
    const sheetPaper = paper ?? PAPER.letter;
    const two = twoUpLayout(g0.mediaWidthIn, g0.mediaHeightIn, sheetPaper);
    if (!two) {
      const max = `${+(sheetPaper.h / 2).toFixed(2)}" × ${+sheetPaper.w.toFixed(2)}"`;
      errors.push(`Two ${+g0.mediaWidthIn.toFixed(2)}" × ${+g0.mediaHeightIn.toFixed(2)}" pages don't fit on one sheet of ${sheetPaper.label} paper at actual size (each can be at most ${max}). Choose “Single design per sheet”.`);
    } else if (two.margin < HOME_PRINTER_MARGIN_IN - 1e-6) {
      notes.push(`The designs reach within ${+two.margin.toFixed(2)}" of the paper edge. Most home printers leave about ${HOME_PRINTER_MARGIN_IN}" blank at the edge, so check a test sheet, or use a printer that prints borderless.`);
    }
    // A single design (a pad's master sheet) fills both places: every printed sheet gives two.
    const seq = sequence.length === 1 ? [sequence[0], sequence[0]] : sequence;
    const sheets: number[][] = [];
    for (let k = 0; k < seq.length; k += 2) sheets.push(seq.slice(k, k + 2));
    const w = two?.sheetW ?? sheetPaper.w, h = two?.sheetH ?? sheetPaper.h;
    return {
      sequence: seq, mediaWidthIn: g0.mediaWidthIn, mediaHeightIn: g0.mediaHeightIn, sheetWidthIn: w, sheetHeightIn: h, pageCss: pageRuleCss(w, h), errors,
      showTrimMarks: settings.showTrimMarks === true, perSheet: 2, sheets, slots: two?.slots ?? [], orientation: two?.orientation ?? "portrait", notes,
    };
  }
  return {
    sequence, mediaWidthIn: g0.mediaWidthIn, mediaHeightIn: g0.mediaHeightIn, sheetWidthIn: sheetW, sheetHeightIn: sheetH, pageCss: pageRuleCss(sheetW, sheetH), errors,
    showTrimMarks: !!paper && settings.showTrimMarks === true, perSheet: 1, sheets: sequence.map((i) => [i]), slots: [], orientation: sheetW > sheetH ? "landscape" : "portrait", notes,
  };
}

/**
 * The studio's sizes for this kind of product that print two per sheet at actual size: "clear" ones keep a home
 * printer's blank edge (and the cut) free on every side; "edge to edge" ones fill the sheet (a borderless printer,
 * or a print shop that trims). Largest first, so the best use of the paper leads.
 */
export function twoPerSheetSizes(productType: ProductType, paperId: "letter" | "a4" = "letter") {
  const paper = PAPER[paperId];
  const toIn = (v: number, unit: string) => (unit === "mm" ? v / 25.4 : v);
  const fits = SIZE_PRESETS.filter((s) => s.families.includes(productType)).flatMap((s) => {
    const w = toIn(s.short, s.unit), h = toIn(s.long, s.unit);
    const [pw, ph] = s.defaultOrientation === "landscape" ? [h, w] : [w, h];
    const best = twoUpLayout(pw, ph, paper);
    return best ? [{ id: s.id, label: s.label, area: w * h, clear: best.margin >= HOME_PRINTER_MARGIN_IN - 1e-6, layout: `${best.across ? "side by side" : "one above the other"} on ${best.orientation} paper` }] : [];
  });
  return fits.sort((a, b) => b.area - a.area);
}
