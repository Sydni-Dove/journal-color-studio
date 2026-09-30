/**
 * Renders the print job into #print-root (outside the editor UI) using the
 * exact PrintablePage the editor uses. Print CSS hides the editor.
 */
import { createPortal } from "react-dom";
import { geometryFor, solvePage, type ResolvedDocument } from "../../engines/document/resolve";
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

export function PrintDocument({ doc, plan }: { doc: ResolvedDocument; plan: PrintPlan }) {
  const target = document.getElementById("print-root");
  if (!target) return null;
  return createPortal(<PrintSheets doc={doc} plan={plan} />, target);
}

/** The print job's sheets, one per page in the plan's order. */
export function PrintSheets({ doc, plan }: { doc: ResolvedDocument; plan: PrintPlan }) {
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
          />
        </div>
        );
      })}
    </>
  );
}
