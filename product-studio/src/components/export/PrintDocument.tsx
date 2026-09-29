/**
 * Renders the print job into #print-root (outside the editor UI) using the
 * exact PrintablePage the editor uses. Print CSS hides the editor.
 */
import { createPortal } from "react-dom";
import { geometryFor, solvePage, type ResolvedDocument } from "../../engines/document/resolve";
import type { PrintPlan } from "../../engines/print/printPlan";
import { PrintablePage } from "../../primitives/PrintablePage";

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
      {plan.sequence.map((i, k) => (
        // The sheet is the page, or home paper with the page centred on it (no browser margins either way).
        <div className="ps-print-sheet" key={`${i}-${k}`} style={{ width: `${plan.sheetWidthIn}in`, height: `${plan.sheetHeightIn}in`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <PrintablePage
            geometry={geometryFor(doc, doc.recipe.pages[i])}
            solved={solvePage(doc, i)}
            colors={doc.colors}
            typography={doc.typography}
            decorative={doc.decorative}
            background={doc.background}
            spacing={doc.spacing}
            mode="print"
          />
        </div>
      ))}
    </>
  );
}
