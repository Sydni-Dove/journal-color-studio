/**
 * LAYOUT SUGGESTIONS — the Smart Layout Assistant (engines/layout/assistant.ts)
 * in the editor: what could fit better, and alternatives measured on real pages.
 * Nothing changes until the maker previews an alternative and chooses it (one
 * undo step); quiet, non-destructive fixes (rows and records that fill each
 * page) already happen as the product changes.
 */
import { useEffect, useMemo, useState } from "react";
import { reviewLayout, type Alternative, type LayoutReview } from "../../engines/layout/assistant";
import { resolveDocument } from "../../engines/document/resolve";
import type { ProductProject } from "../../types/project";
import { PageThumb } from "../preview/PageThumb";
import { Section } from "./ui";

function Compare({ project, alt }: { project: ProductProject; alt: Alternative }) {
  const before = useMemo(() => resolveDocument(project), [project]);
  const after = useMemo(() => resolveDocument(alt.apply(project)), [project, alt]);
  return (
    <div className="layout-compare">
      <figure>
        <PageThumb doc={before} index={Math.min(alt.previewBefore, before.recipe.pages.length - 1)} heightPx={220} />
        <figcaption>Now · page {alt.previewBefore + 1} of {before.recipe.pageCount}</figcaption>
      </figure>
      <figure>
        <span className="layout-compare__pages">
          <PageThumb doc={after} index={Math.min(alt.previewAfter, after.recipe.pages.length - 1)} heightPx={220} />
          {/* A spread (a table split across facing pages): both pages. */}
          {after.recipe.pages[alt.previewAfter]?.side === "verso" && after.recipe.pages[alt.previewAfter + 1] && !after.recipe.pages[alt.previewAfter + 1].filler && alt.id.startsWith("split:") && (
            <PageThumb doc={after} index={alt.previewAfter + 1} heightPx={220} />
          )}
        </span>
        <figcaption>With this · page {alt.previewAfter + 1}{alt.id.startsWith("split:") ? `–${alt.previewAfter + 2}` : ""} of {after.recipe.pageCount}</figcaption>
      </figure>
    </div>
  );
}

export function LayoutAssistant({ project, update }: { project: ProductProject; update: (fn: (p: ProductProject) => ProductProject) => void }) {
  const [review, setReview] = useState<LayoutReview | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // Reviewed shortly after edits settle (it lays the product out several times).
  useEffect(() => {
    const t = window.setTimeout(() => setReview(reviewLayout(project)), 250);
    return () => window.clearTimeout(t);
  }, [project]);
  const alts = review?.alternatives ?? [];
  return (
    <Section title={`Layout suggestions${review ? ` · ${alts.length || "none"}` : ""}`} open>
      {!review && <p className="hint">Checking the layout…</p>}
      {review && (
        <>
          {review.findings.length ? (
            <>
              <div className="group-label">What could fit better</div>
              <ul className="layout-findings">
                {review.findings.slice(0, 6).map((f, i) => <li key={i}>{f.message}</li>)}
              </ul>
            </>
          ) : (
            <p className="hint">The layout fits comfortably: nothing crowded, squeezed, or left mostly empty.</p>
          )}
          {alts.length > 0 && <div className="group-label">Alternatives, measured on your pages</div>}
          {alts.map((a) => (
            <div key={a.id} className="layout-alt" data-alternative={a.id}>
              <strong>{a.title}</strong>
              <p className="hint">{a.reason}</p>
              <ul className="layout-outcome">{a.outcome.map((o) => <li key={o}>{o}</li>)}</ul>
              <div className="row">
                <button type="button" className="btn" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? "Hide preview" : "Preview"}</button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    update((p) => a.apply(p));
                    setOpen(null);
                    setDone(`Done: ${a.title}. Undo goes back.`);
                  }}
                >
                  Use this
                </button>
              </div>
              {open === a.id && <Compare project={project} alt={a} />}
            </div>
          ))}
          {done && <p className="hint" role="status">{done}</p>}
          <p className="hint">Suggestions never change your words, remove a column or field, or change a width or count you set. Rows and records set to fill each page already follow the page size by themselves.</p>
        </>
      )}
    </Section>
  );
}
