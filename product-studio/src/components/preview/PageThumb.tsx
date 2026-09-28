/** One page drawn by the real page renderer (the same PrintablePage the editor and print use), scaled to `heightPx`. */
import { useMemo } from "react";
import { geometryFor, solvePage, type ResolvedDocument } from "../../engines/document/resolve";
import { CSS_PX_PER_IN } from "../../engines/units/units";
import { PrintablePage } from "../../primitives/PrintablePage";

export function PageThumb({ doc, index, heightPx }: { doc: ResolvedDocument; index: number; heightPx: number }) {
  const page = doc.recipe.pages[index];
  const g = geometryFor(doc, page);
  const solved = useMemo(() => solvePage(doc, index), [doc, index]);
  const scale = heightPx / (g.mediaHeightIn * CSS_PX_PER_IN);
  return (
    <div className="page-thumb" style={{ width: g.mediaWidthIn * CSS_PX_PER_IN * scale, height: heightPx }} data-trim={`${doc.trim.widthIn}x${doc.trim.heightIn}`}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", width: g.mediaWidthIn * CSS_PX_PER_IN }}>
        <PrintablePage geometry={g} solved={solved} colors={doc.colors} typography={doc.typography} decorative={doc.decorative} background={doc.background} spacing={doc.spacing} mode="print" />
      </div>
    </div>
  );
}
