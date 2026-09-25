/**
 * Editor preview. Renders ONLY the visible page (or spread) at full fidelity
 * — hundreds of generated pages are never mounted at once. Zoom is a CSS
 * transform on top of physical inches; it never changes page geometry.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { geometryFor, solvePage, type ResolvedDocument } from "../../engines/document/resolve";
import { CSS_PX_PER_IN } from "../../engines/units/units";
import { PrintablePage } from "../../primitives/PrintablePage";
import { DebugOverlay, type DebugFlags } from "../debug/DebugOverlay";

export type FitMode = "page" | "width" | "zoom";

/** Vertical space reserved for the sticky bars when fitting a page (px). */
const CHROME_PX = 190;
/** Gap between the two pages of a spread (px, screen only). */
const SPREAD_GAP_PX = 0;

export function visibleIndices(doc: ResolvedDocument, index: number, spread: boolean): number[] {
  const pages = doc.recipe.pages;
  if (!spread || pages[index]?.side === "single") return [index];
  const p = pages[index];
  if (p.side === "verso") return index + 1 < pages.length ? [index, index + 1] : [index];
  return index > 0 && pages[index - 1].side === "verso" ? [index - 1, index] : [index];
}

/**
 * Screen footprint of the preview. The page keeps its physical size; only the
 * visual scale changes. In "page"/"width" modes the scaled footprint always
 * fits `avail`; only a manual zoom can exceed it, and then the preview pans
 * internally (never the page).
 */
export function previewFrame(natural: { w: number; h: number }, avail: { w: number; h: number }, fit: FitMode, zoom: number) {
  const scale = fit === "page" ? Math.min(avail.w / natural.w, avail.h / natural.h) : fit === "width" ? avail.w / natural.w : zoom;
  const width = natural.w * scale;
  return { scale, width, height: natural.h * scale, pan: fit === "zoom" && width > avail.w + 0.5 };
}

type Props = {
  doc: ResolvedDocument;
  index: number;
  onIndex: (i: number) => void;
  debug: DebugFlags;
  issueIds: Set<string>;
};

export function PagePreview({ doc, index, onIndex, debug, issueIds }: Props) {
  const pages = doc.recipe.pages;
  const paged = pages.some((p) => p.side !== "single");
  const [spread, setSpread] = useState(false);
  const [fit, setFit] = useState<FitMode>("page");
  const [zoom, setZoom] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 800, h: 700 });

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setAvail({ w: Math.max(200, el.clientWidth - 32), h: Math.max(240, window.innerHeight - CHROME_PX) });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    if (index >= pages.length) onIndex(Math.max(0, pages.length - 1));
  }, [index, pages.length, onIndex]);

  const shown = useMemo(() => (pages.length ? visibleIndices(doc, Math.min(index, pages.length - 1), spread && paged) : []), [doc, index, spread, paged, pages.length]);
  const geos = shown.map((i) => geometryFor(doc, pages[i]));
  const totalWIn = geos.reduce((s, g) => s + g.mediaWidthIn, 0);
  const maxHIn = Math.max(...geos.map((g) => g.mediaHeightIn), 1);
  const naturalW = totalWIn * CSS_PX_PER_IN + SPREAD_GAP_PX * (geos.length - 1);
  const naturalH = maxHIn * CSS_PX_PER_IN;
  const frame = previewFrame({ w: naturalW, h: naturalH }, avail, fit, zoom);
  const scale = frame.scale;

  const step = (d: number) => {
    const next = Math.min(pages.length - 1, Math.max(0, index + d * (spread && paged ? 2 : 1)));
    onIndex(next);
  };

  if (!pages.length) return <div className="preview-caption">This recipe produces no pages yet.</div>;
  const current = pages[Math.min(index, pages.length - 1)];

  return (
    <>
      <div className="preview-toolbar">
        <button className="btn btn--icon" onClick={() => step(-1)} disabled={index === 0} aria-label="Previous page">‹</button>
        <div className="page-counter">
          <span>Page</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={pages.length}
            value={current.pageNumber}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (n >= 1 && n <= pages.length) onIndex(n - 1);
            }}
            aria-label="Page number"
          />
          <span>of {pages.length}</span>
        </div>
        <button className="btn btn--icon" onClick={() => step(1)} disabled={index >= pages.length - 1} aria-label="Next page">›</button>
        <div className="segmented" role="group" aria-label="Fit">
          <button aria-pressed={fit === "page"} onClick={() => setFit("page")}>Fit page</button>
          <button aria-pressed={fit === "width"} onClick={() => setFit("width")}>Fit width</button>
          <button
            aria-pressed={fit === "zoom"}
            onClick={() => {
              setZoom(Math.round(scale * 100) / 100);
              setFit("zoom");
            }}
          >
            {Math.round(scale * 100)}%
          </button>
        </div>
        {fit === "zoom" && (
          <>
            <button className="btn btn--icon" onClick={() => setZoom((z) => Math.max(0.1, +(z - 0.1).toFixed(2)))} aria-label="Zoom out">−</button>
            <button className="btn btn--icon" onClick={() => setZoom((z) => Math.min(4, +(z + 0.1).toFixed(2)))} aria-label="Zoom in">+</button>
            <button className="btn" onClick={() => setZoom(1)}>100%</button>
          </>
        )}
        {paged && (
          <label className="check">
            <input type="checkbox" checked={spread} onChange={(e) => setSpread(e.target.checked)} /> Spread view
          </label>
        )}
      </div>
      <div className="preview-viewport" ref={viewportRef} data-pan={frame.pan}>
        <div className="preview-canvas" style={{ width: frame.width, height: frame.height }}>
          <div className="preview-scaler" style={{ transform: `scale(${scale})`, width: naturalW, gap: SPREAD_GAP_PX }}>
            {shown.map((i, k) => {
              const solved = solvePage(doc, i);
              return (
                <PrintablePage
                  key={pages[i].key + i}
                  geometry={geos[k]}
                  solved={solved}
                  colors={doc.colors}
                  typography={doc.typography}
                  decorative={doc.decorative}
                  mode="editor"
                  overlay={<DebugOverlay geometry={geos[k]} nodes={solved.nodes} flags={debug} issueIds={issueIds} />}
                />
              );
            })}
          </div>
        </div>
      </div>
      <div className="preview-caption">
        {shown.map((i) => `p.${pages[i].pageNumber} ${pages[i].side}`).join("  ·  ")}
        {"  ·  "}
        {doc.trim.widthIn}" × {doc.trim.heightIn}" trim
        {current.physicalSheets ? `  ·  master sheet × ${current.physicalSheets} sheets (manufacturing metadata)` : ""}
        {current.filler ? "  ·  filler page (keeps spreads on a left-hand page)" : ""}
      </div>
    </>
  );
}
