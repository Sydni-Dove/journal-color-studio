/**
 * EDITOR AREAS — the editor's settings, grouped the way a planner maker
 * thinks: what pages are in the product, how this page is arranged, its
 * writing space, what else is on it, how it looks, its size and binding, and
 * printing. One area is open at a time (a drill-down on phone and desktop
 * alike); technical tools sit under Advanced.
 */
import { useState, type ReactNode } from "react";

export type AreaId = "pages" | "layout" | "writing" | "add" | "style" | "setup" | "print" | "advanced";

export const AREAS: { id: AreaId; title: string; blurb: string }[] = [
  { id: "pages", title: "Pages", blurb: "What's in this product and how often each page repeats" },
  { id: "layout", title: "Page layout", blurb: "How this page is arranged" },
  { id: "writing", title: "Writing", blurb: "Writing lines and writing space" },
  { id: "add", title: "Add to page", blurb: "Sections, prompts and extras on this page" },
  { id: "style", title: "Style", blurb: "Colors, background, decorations and typography" },
  { id: "setup", title: "Page setup", blurb: "Size, binding and printer" },
  { id: "print", title: "Print & export", blurb: "Check the pages, then print or save a PDF" },
  { id: "advanced", title: "Advanced", blurb: "Exact measurements, page guides and fine placement" },
];

const KEY = "dove-product-studio:v1:editor-area";

/**
 * The open area, remembered for this browser (a convenience only: it falls
 * back to the area list). `start` opens a given area instead — a Custom Page
 * opens on "Add to page", where it is built.
 */
export function useArea(start?: AreaId): [AreaId | null, (a: AreaId | null) => void] {
  const [area, setArea] = useState<AreaId | null>(() => {
    if (start) return start;
    try {
      const v = localStorage.getItem(KEY);
      return AREAS.some((a) => a.id === v) ? (v as AreaId) : null;
    } catch {
      return null;
    }
  });
  const set = (a: AreaId | null) => {
    setArea(a);
    try {
      if (a) localStorage.setItem(KEY, a);
      else localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable: the area still opens */
    }
  };
  return [area, set];
}

/** The list of areas, each with a one-line summary of what it holds for this product. */
export function AreaList({ summaries, onOpen }: { summaries: Partial<Record<AreaId, string>>; onOpen: (a: AreaId) => void }) {
  return (
    <nav className="area-list" aria-label="Settings">
      {AREAS.map((a) => (
        <button key={a.id} type="button" className={`area-link${a.id === "advanced" ? " area-link--quiet" : ""}`} data-area={a.id} onClick={() => onOpen(a.id)}>
          <span className="area-link__text">
            <span className="area-link__title">{a.title}</span>
            <span className="area-link__summary">{summaries[a.id] ?? a.blurb}</span>
          </span>
          <span className="area-link__chevron" aria-hidden="true">›</span>
        </button>
      ))}
    </nav>
  );
}

/** One open area: a Back button to the list, its title, then its settings. */
export function AreaView({ id, onBack, children }: { id: AreaId; onBack: () => void; children: ReactNode }) {
  const a = AREAS.find((x) => x.id === id)!;
  return (
    <section className="area" data-area={id} aria-label={a.title}>
      <div className="area__head">
        <button type="button" className="btn btn--ghost area__back" onClick={onBack}>‹ All settings</button>
        <h2 className="area__title">{a.title}</h2>
        <p className="hint area__blurb">{a.blurb}</p>
      </div>
      {children}
    </section>
  );
}
