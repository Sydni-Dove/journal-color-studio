/**
 * STEPS — the step header (title, "Step N of M", the steps as a progress bar, any step can be opened; steps
 * reached are ticked) and the same Back / Next at the bottom of every step. Shared by the product editor and
 * Cover Studio, so both work the same way.
 */
import type { ReactNode } from "react";

export type StepDef<T extends string> = { id: T; title: string; blurb: string };

export function StepHeader<T extends string>({ steps, current, reached, onGo }: { steps: readonly StepDef<T>[]; current: T; reached: number; onGo: (s: T) => void }) {
  const at = Math.max(0, steps.findIndex((s) => s.id === current));
  const step = steps[at];
  return (
    <div className="steps" data-step={step.id}>
      <ol className="steps__bar" aria-label="Steps" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
        {steps.map((s, i) => {
          const status = i === at ? "current" : i <= reached ? "done" : "todo";
          return (
            <li key={s.id} className={`steps__item steps__item--${status}`}>
              <button type="button" className="steps__dot" aria-current={i === at ? "step" : undefined} onClick={() => onGo(s.id)} title={s.title} aria-label={`Step ${i + 1}: ${s.title}${status === "done" ? " (reached)" : status === "todo" ? " (not reached yet)" : ""}`}>
                <span aria-hidden="true">{status === "done" ? "✓" : i + 1}</span>
                <span className="steps__label">{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="steps__count">Step {at + 1} of {steps.length}</p>
      <h2 className="steps__title">{step.title}</h2>
      <p className="hint steps__blurb">{step.blurb}</p>
    </div>
  );
}

/** Back and Next, the same on every step; the last step shows its own finishing action instead of Next. */
export function StepFooter<T extends string>({ steps, current, onGo, finish }: { steps: readonly StepDef<T>[]; current: T; onGo: (s: T) => void; finish?: ReactNode }) {
  const at = steps.findIndex((s) => s.id === current);
  const prev = steps[at - 1], next = steps[at + 1];
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
        finish ?? <span />
      )}
    </div>
  );
}
