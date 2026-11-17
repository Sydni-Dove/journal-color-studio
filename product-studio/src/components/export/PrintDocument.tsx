/**
 * Renders the print job into #print-root (outside the editor UI) using the
 * exact PrintablePage the editor uses. Print CSS hides the editor.
 */
import { createPortal } from "react-dom";
import { artworkFor, geometryFor, solvePage, type ResolvedDocument } from "../../engines/document/resolve";
import type { PrintPlan } from "../../engines/print/printPlan";
import { PrintablePage } from "../../primitives/PrintablePage";
import type { PageGeometry } from "../../types/geometry";

const MARK_GAP_IN = 0.0625;
const MARK_LEN_IN = 0.25;

/**
 * Cut marks on home paper: short lines in the paper margin, in line with the
 * page's trim edges. Cutting along them gives a page whose art runs to every
 * edge (with bleed on, the art already reaches past the cut).
 */
export function CutMarks({ g, sheetW, sheetH }: { g: PageGeometry; sheetW: number; sheetH: number }) {
  const mx = (sheetW - g.mediaWidthIn) / 2, my = (sheetH - g.mediaHeightIn) / 2;
  if (Math.min(mx, my) < MARK_GAP_IN + MARK_LEN_IN) return null;
  const x0 = mx + g.trimOffset.x, x1 = x0 + g.trimWidthIn, y0 = my + g.trimOffset.y, y1 = y0 + g.trimHeightIn;
  const left = mx - MARK_GAP_IN, right = mx + g.mediaWidthIn + MARK_GAP_IN, top = my - MARK_GAP_IN, bottom = my + g.mediaHeightIn + MARK_GAP_IN;
  const lines: [number, number, number, number][] = [];
  for (const x of [x0, x1]) lines.push([x, top - MARK_LEN_IN, x, top], [x, bottom, x, bottom + MARK_LEN_IN]);
  for (const y of [y0, y1]) lines.push([left - MARK_LEN_IN, y, left, y], [right, y, right + MARK_LEN_IN, y]);
  return (
    <svg className="ps-cut-marks" data-testid="cut-marks" viewBox={`0 0 ${sheetW} ${sheetH}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} aria-hidden="true">
      {lines.map(([a, b, c, d], k) => <line key={k} x1={a} y1={b} x2={c} y2={d} stroke="#000" strokeWidth={0.005} />)}
    </svg>
  );
}

/**
 * Cut marks for two designs on one sheet: every trim line of both designs, marked in the paper margin outside
 * them (above and below for the up-and-down cuts, left and right for the across cuts), so the sheet can be cut
 * into two finished pages. Marks that would fall off the paper are left out.
 */
export function TwoUpCutMarks({ g, slots, sheetW, sheetH }: { g: PageGeometry; slots: { x: number; y: number }[]; sheetW: number; sheetH: number }) {
  const trims = slots.map((s) => ({ x0: s.x + g.trimOffset.x, x1: s.x + g.trimOffset.x + g.trimWidthIn, y0: s.y + g.trimOffset.y, y1: s.y + g.trimOffset.y + g.trimHeightIn }));
  const top = Math.min(...slots.map((s) => s.y)) - MARK_GAP_IN, bottom = Math.max(...slots.map((s) => s.y + g.mediaHeightIn)) + MARK_GAP_IN;
  const left = Math.min(...slots.map((s) => s.x)) - MARK_GAP_IN, right = Math.max(...slots.map((s) => s.x + g.mediaWidthIn)) + MARK_GAP_IN;
  const xs = [...new Set(trims.flatMap((t) => [t.x0, t.x1]).map((v) => +v.toFixed(4)))];
  const ys = [...new Set(trims.flatMap((t) => [t.y0, t.y1]).map((v) => +v.toFixed(4)))];
  const len = (room: number) => Math.min(MARK_LEN_IN, room);
  const lines: [number, number, number, number][] = [];
  for (const x of xs) {
    if (top > 0.05) lines.push([x, top - len(top), x, top]);
    if (sheetH - bottom > 0.05) lines.push([x, bottom, x, bottom + len(sheetH - bottom)]);
  }
  for (const y of ys) {
    if (left > 0.05) lines.push([left - len(left), y, left, y]);
    if (sheetW - right > 0.05) lines.push([right, y, right + len(sheetW - right), y]);
  }
  if (!lines.length) return null;
  return (
    <svg className="ps-cut-marks" data-testid="cut-marks" viewBox={`0 0 ${sheetW} ${sheetH}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} aria-hidden="true">
      {lines.map(([a, b, c, d], k) => <line key={k} x1={a} y1={b} x2={c} y2={d} stroke="#000" strokeWidth={0.005} />)}
    </svg>
  );
}

export function PrintDocument({ doc, plan }: { doc: ResolvedDocument; plan: PrintPlan }) {
  const target = document.getElementById("print-root");
  if (!target) return null;
  return createPortal(<PrintSheets doc={doc} plan={plan} />, target);
}

const pageAt = (doc: ResolvedDocument, i: number) => (
  <PrintablePage
    geometry={geometryFor(doc, doc.recipe.pages[i])}
    solved={solvePage(doc, i)}
    colors={doc.colors}
    typography={doc.typography}
    decorative={doc.decorative}
    background={doc.background}
    spacing={doc.spacing}
    mode="print"
    art={artworkFor(doc, i)}
  />
);

/** The print job's sheets, one per page in the plan's order — or two designs on each, at actual size. */
export function PrintSheets({ doc, plan }: { doc: ResolvedDocument; plan: PrintPlan }) {
  if (plan.perSheet === 2) {
    return (
      <>
        <style>{plan.pageCss}</style>
        {plan.sheets.map((sheet, k) => {
          const g = geometryFor(doc, doc.recipe.pages[sheet[0]]);
          return (
            <div className="ps-print-sheet" data-per-sheet="2" key={k} style={{ position: "relative", width: `${plan.sheetWidthIn}in`, height: `${plan.sheetHeightIn}in`, overflow: "hidden" }}>
              {plan.showTrimMarks && <TwoUpCutMarks g={g} slots={plan.slots} sheetW={plan.sheetWidthIn} sheetH={plan.sheetHeightIn} />}
              {sheet.map((i, n) => (
                <div key={n} data-slot={n} style={{ position: "absolute", left: `${plan.slots[n]?.x ?? 0}in`, top: `${plan.slots[n]?.y ?? 0}in` }}>
                  {pageAt(doc, i)}
                </div>
              ))}
            </div>
          );
        })}
      </>
    );
  }
  return (
    <>
      <style>{plan.pageCss}</style>
      {plan.sequence.map((i, k) => {
        const g = geometryFor(doc, doc.recipe.pages[i]);
        const home = plan.sheetWidthIn > g.mediaWidthIn + 1e-6 || plan.sheetHeightIn > g.mediaHeightIn + 1e-6;
        return (
        // The sheet is the page, or home paper with the page centred on it (no browser margins either way).
        <div className="ps-print-sheet" key={`${i}-${k}`} style={{ position: "relative", width: `${plan.sheetWidthIn}in`, height: `${plan.sheetHeightIn}in`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {home && plan.showTrimMarks && <CutMarks g={g} sheetW={plan.sheetWidthIn} sheetH={plan.sheetHeightIn} />}
          <PrintablePage
            geometry={g}
            solved={solvePage(doc, i)}
            colors={doc.colors}
            typography={doc.typography}
            decorative={doc.decorative}
            background={doc.background}
            spacing={doc.spacing}
            mode="print"
            art={artworkFor(doc, i)}
          />
        </div>
        );
      })}
    </>
  );
}
