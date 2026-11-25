/**
 * Step 5 — Preview and Export: "What's Missing?" (blocking problems, warnings, suggestions, each with a link to fix
 * it), the complete book as it prints (the cover, then every interior page), and the print files.
 */
import { useMemo, useState } from "react";
import { resolveDocument } from "../../engines/document/resolve";
import { assembleCover, interiorPageCount } from "../../engines/coloringBook/assembleBook";
import { bookTitle, formatOf } from "../../engines/coloringBook/book";
import { printReady, type MissingIssue, type Severity } from "../../engines/coloringBook/missing";
import { PageThumb } from "../preview/PageThumb";
import { isSpread } from "../../engines/coloringBook/spread";
import type { StepProps } from "./shared";

const HEAD: Record<Severity, string> = { blocking: "Must fix before printing", warning: "Warnings", suggestion: "Suggestions" };
const STEP_NAME = { setup: "Book Setup", characters: "Characters", pages: "Interior Pages", cover: "Cover Design", preview: "Preview and Export" } as const;

export function PreviewStep({ book, update, go, interior, issues, onExport }: StepProps & { issues: MissingIssue[]; onExport: (what: "interior" | "cover" | "digital", proof: boolean) => void }) {
  const spreads = book.brief.scenes.some(isSpread);
  const [facing, setFacing] = useState(spreads);
  const f = formatOf(book.printFormat);
  const pages = interiorPageCount(book);
  const ready = printReady(issues);
  const cover = useMemo(() => resolveDocument(assembleCover(book)), [book]);
  const [limit, setLimit] = useState(24);
  const short = Math.max(0, f.minPages - pages);
  const perDrawing = book.sides === "single" ? 2 : 1;
  return (
    <section className="cover-step book-step" aria-label="Preview and export">
      <div className={`cover-panel ready-banner${ready ? " ready-banner--ok" : ""}`} data-testid="print-ready" data-ready={ready}>
        <h2 className="book-h">{ready ? "Print-ready" : "Not print-ready yet"}</h2>
        <p>
          “{bookTitle(book) || "Untitled"}” · {(() => { const sp = book.brief.scenes.filter(isSpread).length, sc = book.brief.scenes.length - sp; return [sc ? `${sc} scene${sc === 1 ? "" : "s"}` : "", sp ? `${sp} Devotional Spread${sp === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || "0 scenes"; })()} · {pages} interior pages · {f.label} · {book.sides === "single" ? "single-sided" : "double-sided"}
        </p>
        {!ready && <p className="hint">Fix the items under “Must fix before printing”. Until then you can export a proof copy to check, but not a print-ready file.</p>}
      </div>

      <div className="cover-panel" data-testid="whats-missing">
        <h2 className="book-h">What's missing?</h2>
        {!issues.length && <p className="hint">Nothing: every page, the cover and the print format check out.</p>}
        {(["blocking", "warning", "suggestion"] as Severity[]).map((sev) => {
          const list = issues.filter((i) => i.severity === sev);
          if (!list.length) return null;
          return (
            <div key={sev} className={`missing-group missing-group--${sev}`} data-severity={sev}>
              <h3>{HEAD[sev]} · {list.length}</h3>
              <ul className="issues">
                {list.map((i) => (
                  <li key={i.id} className={`issue issue--${sev === "blocking" ? "error" : sev === "warning" ? "warning" : "info"}`} data-issue={i.id}>
                    <div className="issue-title">{i.title}</div>
                    {i.detail && <div className="issue-advice">{i.detail}</div>}
                    {i.id === "min-pages" && short > 0 ? (
                      <button type="button" className="btn" onClick={() => update({ drawingPages: book.drawingPages + Math.ceil(short / perDrawing) })} data-testid="add-drawing-pages">
                        Add {Math.ceil(short / perDrawing)} “Draw your own picture” page{Math.ceil(short / perDrawing) === 1 ? "" : "s"}
                      </button>
                    ) : null}
                    {i.step !== "preview" && <button type="button" className="btn btn--ghost" onClick={() => go(i.step, i.sceneId)}>Fix in {STEP_NAME[i.step]}{i.where ? ` · ${i.where}` : ""}</button>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {book.drawingPages > 0 && (
          <p className="hint">
            {book.drawingPages} “Draw your own picture” page{book.drawingPages === 1 ? "" : "s"} at the end.{" "}
            <button type="button" className="btn btn--ghost" onClick={() => update({ drawingPages: 0 })}>Remove them</button>
          </p>
        )}
      </div>

      <div className="cover-panel">
        <h2 className="book-h">Export</h2>
        <div className="row">
          <button type="button" className="btn btn--primary" disabled={!ready} onClick={() => onExport("interior", false)} data-testid="export-interior">Export print-ready interior PDF</button>
          <button type="button" className="btn btn--primary" disabled={!ready} onClick={() => onExport("digital", false)} data-testid="export-digital">Export printable digital PDF</button>
          <button type="button" className="btn" disabled={!book.cover.front} onClick={() => onExport("cover", !ready)} data-testid="export-cover">Export front cover PDF</button>
          <button type="button" className="btn btn--ghost" disabled={!book.brief.scenes.length} onClick={() => onExport("interior", true)} data-testid="export-proof">Export a proof copy (not print-ready)</button>
        </div>
        <p className="hint">Both interiors are {book.brief.size.replace("×", " × ")} in. The print-ready PDF follows {f.label}'s rules; the printable digital PDF is the same pages for customers to print at home. Exporting saves the finished pages as a product in your projects and opens the print step, where you save the PDF. Printers take the interior and the cover as separate files.</p>
      </div>

      <div className="cover-panel" data-testid="book-preview">
        <h2 className="book-h">The complete book</h2>
        <label className="check"><input type="checkbox" checked={facing} onChange={(e) => setFacing(e.target.checked)} data-testid="facing-pages" /> <span>Show as facing pages (left and right, as the open book)</span></label>
        {facing ? (
          <div className="book-facing" data-testid="facing-view">
            <figure className="finished-page"><PageThumb doc={cover} index={0} heightPx={240} /><figcaption className="hint">Front cover</figcaption></figure>
            {/* Page 1 is a right-hand page on its own; then each left-hand page beside the right-hand page facing it. */}
            {pairs(interior.recipe.pages.slice(0, limit).map((p, i) => ({ p, i }))).map((pair, k) => (
              <div key={k} className={`spread-pair${pair.length === 1 && k === 0 ? " spread-pair--right" : ""}`} data-spread={pair.map((x) => x.p.pageNumber).join("-")}>
                {pair.map(({ p, i }) => (
                  <figure key={p.key} className="finished-page" data-page={p.pageNumber}>
                    <PageThumb doc={interior} index={i} heightPx={240} />
                    <figcaption className="hint">Page {p.pageNumber}</figcaption>
                  </figure>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="book-spread-grid">
            <figure className="finished-page"><PageThumb doc={cover} index={0} heightPx={240} /><figcaption className="hint">Front cover</figcaption></figure>
            {interior.recipe.pages.slice(0, limit).map((p, i) => (
              <figure key={p.key} className="finished-page" data-page={p.pageNumber}>
                <PageThumb doc={interior} index={i} heightPx={240} />
                <figcaption className="hint">Page {p.pageNumber}</figcaption>
              </figure>
            ))}
          </div>
        )}
        {interior.recipe.pages.length > limit && <button type="button" className="btn" onClick={() => setLimit(interior.recipe.pages.length)}>Show all {interior.recipe.pages.length} pages</button>}
      </div>
    </section>
  );
}

/** Print order as an open book: page 1 alone (a right-hand page), then pages 2–3, 4–5… side by side. */
function pairs<T>(items: T[]): T[][] {
  const out: T[][] = items.length ? [[items[0]]] : [];
  for (let k = 1; k < items.length; k += 2) out.push(items.slice(k, k + 2));
  return out;
}
