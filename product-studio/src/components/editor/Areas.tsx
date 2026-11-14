/**
 * EDITOR AREAS — the editor's settings, grouped the way a planner maker
 * thinks: what pages are in the product, how this page is arranged, its
 * writing space, what else is on it, how it looks, its size and binding, and
 * printing. One area is open at a time (a drill-down on phone and desktop
 * alike); technical tools sit under Advanced.
 */
import { useState, type ReactNode } from "react";

export type AreaId = "pages" | "data" | "layout" | "writing" | "add" | "artwork" | "style" | "setup" | "print" | "advanced";

export const AREAS: { id: AreaId; title: string; blurb: string }[] = [
  { id: "pages", title: "Pages", blurb: "What's in this product and how often each page repeats" },
  { id: "data", title: "Your content", blurb: "The words that fill your pages: devotional days, items, entries" },
  { id: "layout", title: "Page layout", blurb: "How this page is arranged" },
  { id: "writing", title: "Writing", blurb: "Writing lines and writing space" },
  { id: "add", title: "Add to page", blurb: "Sections, prompts and extras on this page" },
  { id: "artwork", title: "Artwork", blurb: "Upload your own image: a cover, a page background or an illustration" },
  { id: "style", title: "Style", blurb: "Colors, fonts, covers, background and decorations" },
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

/** The list of areas (or one step's areas), each with a one-line summary of what it holds for this product. */
export function AreaList({ summaries, onOpen, only }: { summaries: Partial<Record<AreaId, string>>; onOpen: (a: AreaId) => void; only?: AreaId[] }) {
  return (
    <nav className="area-list" aria-label="Settings">
      {AREAS.filter((a) => !only || only.includes(a.id)).map((a) => (
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
export function AreaView({ id, onBack, children, backLabel = "All settings" }: { id: AreaId; onBack?: () => void; children: ReactNode; backLabel?: string }) {
  const a = AREAS.find((x) => x.id === id)!;
  return (
    <section className="area" data-area={id} aria-label={a.title}>
      <div className="area__head">
        {onBack && <button type="button" className="btn btn--ghost area__back" onClick={onBack}>‹ {backLabel}</button>}
        <h2 className="area__title">{a.title}</h2>
        <p className="hint area__blurb">{a.blurb}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * THE FOUR STEPS — the editor's areas in the order a product is made:
 * set the product up, fill its pages, give it artwork and style, then review
 * and export. Every existing control is still here, in its step. Steps are
 * free to revisit; the step in view and how far the maker has come are
 * remembered per project in this browser (the work itself is saved with the
 * project as always).
 */
export type StepId = "setup" | "content" | "style" | "export";
export const STEPS: { id: StepId; title: string; blurb: string; areas: AreaId[] }[] = [
  { id: "setup", title: "Product setup", blurb: "Product type, size, orientation, binding and print settings", areas: ["setup"] },
  { id: "content", title: "Pages and content", blurb: "Choose layouts, arrange pages, and add text, prompts, calendars and writing areas", areas: ["pages", "data", "layout", "writing", "add"] },
  { id: "style", title: "Artwork and style", blurb: "Colors, fonts, covers and backgrounds, and your own artwork", areas: ["artwork", "style"] },
  { id: "export", title: "Preview and export", blurb: "Review the finished pages, then print or save a PDF", areas: ["print", "advanced"] },
];
export const stepOfArea = (a: AreaId): StepId => STEPS.find((s) => s.areas.includes(a))!.id;

type StepState = { step: StepId; reached: number };
const stepKey = (projectId: string) => `dove-product-studio:v1:workflow:${projectId}`;

/** The step in view and the furthest step reached, for this project (falls back to step 1). */
export function useStep(projectId: string, start?: StepId, fresh = false): [StepState, (s: StepId) => void] {
  const [state, setState] = useState<StepState>(() => {
    let saved: StepState | null = null;
    try {
      const v = JSON.parse(localStorage.getItem(stepKey(projectId)) ?? "null");
      if (v && STEPS.some((s) => s.id === v.step)) saved = { step: v.step, reached: Math.max(0, Math.min(STEPS.length - 1, Number(v.reached) || 0)) };
    } catch {
      /* storage unavailable or unreadable: start at step 1 */
    }
    // A new product starts at its setup; a product already being made opens on its pages.
    const step = start ?? saved?.step ?? (fresh ? "setup" : "content");
    return { step, reached: Math.max(saved?.reached ?? 0, STEPS.findIndex((s) => s.id === step)) };
  });
  const go = (step: StepId) =>
    setState((prev) => {
      const next = { step, reached: Math.max(prev.reached, STEPS.findIndex((s) => s.id === step)) };
      try {
        localStorage.setItem(stepKey(projectId), JSON.stringify(next));
      } catch {
        /* storage unavailable: the step still changes */
      }
      return next;
    });
  return [state, go];
}

/** Step title, progress ("Step 2 of 4") and the steps themselves; any step can be opened (steps reached are ticked). */
export function StepHeader({ state, onGo }: { state: StepState; onGo: (s: StepId) => void }) {
  const at = STEPS.findIndex((s) => s.id === state.step);
  const step = STEPS[at];
  return (
    <div className="steps" data-step={step.id}>
      <ol className="steps__bar" aria-label="Steps">
        {STEPS.map((s, i) => {
          const status = i === at ? "current" : i <= state.reached ? "done" : "todo";
          return (
            <li key={s.id} className={`steps__item steps__item--${status}`}>
              <button type="button" className="steps__dot" aria-current={i === at ? "step" : undefined} onClick={() => onGo(s.id)} title={s.title} aria-label={`Step ${i + 1}: ${s.title}${status === "done" ? " (reached)" : status === "todo" ? " (not reached yet)" : ""}`}>
                <span aria-hidden="true">{i < at || (status === "done" && i !== at) ? "✓" : i + 1}</span>
                <span className="steps__label">{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="steps__count">Step {at + 1} of {STEPS.length}</p>
      <h2 className="steps__title">{step.title}</h2>
      <p className="hint steps__blurb">{step.blurb}</p>
    </div>
  );
}

/** Back and Next, the same on every step. */
export function StepFooter({ state, onGo, onExport, canExport }: { state: StepState; onGo: (s: StepId) => void; onExport: () => void; canExport: boolean }) {
  const at = STEPS.findIndex((s) => s.id === state.step);
  const prev = STEPS[at - 1], next = STEPS[at + 1];
  return (
    <div className="steps__nav" role="group" aria-label="Step navigation">
      <button type="button" className="btn steps__nav-btn" disabled={!prev} onClick={() => prev && onGo(prev.id)} aria-label={prev ? `‹ Back: ${prev.title}` : "‹ Back"}>
        <span>‹ Back</span>
        {prev ? <span className="steps__nav-to">{prev.title}</span> : null}
      </button>
      {next ? (
        <button type="button" className="btn btn--primary steps__nav-btn steps__nav-btn--next" onClick={() => onGo(next.id)} aria-label={`Next: ${next.title} ›`}>
          <span>Next ›</span>
          <span className="steps__nav-to">{next.title}</span>
        </button>
      ) : (
        <button type="button" className="btn btn--primary" disabled={!canExport} onClick={onExport}>
          Print / Save PDF…
        </button>
      )}
    </div>
  );
}
