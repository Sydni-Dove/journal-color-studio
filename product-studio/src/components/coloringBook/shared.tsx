/** Shared bits of the Coloring Book screens: the props every step gets, small fields, and the finished-page preview. */
import { useMemo, type ReactNode } from "react";
import type { CoverBrief, Scene } from "../../engines/cover/brief";
import type { BookStepId, ColoringBook } from "../../engines/coloringBook/book";
import type { ResolvedDocument } from "../../engines/document/resolve";
import { PageThumb } from "../preview/PageThumb";

export type StepProps = {
  book: ColoringBook;
  update: (patch: Partial<ColoringBook>) => void;
  setBrief: (patch: Partial<CoverBrief>) => void;
  setScene: (id: string, patch: Partial<Scene>) => void;
  say: (m: string) => void;
  copy: (t: string) => void;
  go: (s: BookStepId, sceneId?: string) => void;
  /** The finished interior, as the preview draws it and the print file prints it. */
  interior: ResolvedDocument;
};

export function TextInput({ label, value, onChange, placeholder, id, hint, testId }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; id?: string; hint?: ReactNode; testId?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input id={id} type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} data-testid={testId} />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function TextArea({ label, value, onChange, placeholder, rows = 3, testId }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; testId?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} data-testid={testId} />
    </label>
  );
}

export function Choice<T extends string>({ label, value, options, onChange, testId }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; testId?: string }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="segmented segmented--wrap" role="group" aria-label={label} data-testid={testId}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === value} style={{ minHeight: 44 }} onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

/** Where a scene's finished page is in the book (its page index), or -1. */
export const pageIndexOf = (doc: ResolvedDocument, sceneId: string) => doc.recipe.pages.findIndex((p) => p.recipeItemId === `scene-${sceneId}` && (p.flowPart ?? 0) === 0);

/** A finished page exactly as it prints: the same renderer and the same assembled book as the export. */
export function FinishedPage({ doc, index, height = 520, label }: { doc: ResolvedDocument; index: number; height?: number; label?: string }) {
  const page = doc.recipe.pages[index];
  const key = useMemo(() => `${index}`, [index]);
  if (!page) return null;
  return (
    <figure className="finished-page" data-testid="finished-page" data-page={page.pageNumber} key={key}>
      <PageThumb doc={doc} index={index} heightPx={height} />
      {label && <figcaption className="hint">{label}</figcaption>}
    </figure>
  );
}
