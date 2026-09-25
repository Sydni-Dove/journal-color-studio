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
  return createPortal(
    <>
      <style>{plan.pageCss}</style>
      {plan.sequence.map((i, k) => (
        <div className="ps-print-sheet" key={`${i}-${k}`}>
          <PrintablePage
            geometry={geometryFor(doc, doc.recipe.pages[i])}
            solved={solvePage(doc, i)}
            colors={doc.colors}
            typography={doc.typography}
            decorative={doc.decorative}
            spacing={doc.spacing}
            mode="print"
          />
        </div>
      ))}
    </>,
    target,
  );
}
