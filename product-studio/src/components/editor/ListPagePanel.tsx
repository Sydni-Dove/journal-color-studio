/**
 * List pages (Grocery List, Checklist): add, remove, rename and reorder the sections; set how many lines each has
 * (or as many as fit); choose square, circle or no checkboxes. Nothing set = the layout's own design.
 */
import type { ProjectUsage } from "../../engines/document/usage";
import type { ListPageOptions, ProductProject } from "../../types/project";
import { DEFAULT_WORDING } from "../../presets/wording";
import { Section, Segmented } from "./ui";

type Update = (fn: (p: ProductProject) => ProductProject) => void;
const BUILT_IN = ["produce", "dairy", "protein", "pantry", "frozen", "household"] as const;
const LIST_LAYOUTS = new Set(["notepad-grocery", "notepad-checklist"]);

export function ListPagePanel({ project, update, usage }: { project: ProductProject; update: Update; usage: ProjectUsage }) {
  const ids = usage.layouts.map((l) => l.layout.id).filter((id) => LIST_LAYOUTS.has(id));
  if (!ids.length) return null;
  const grocery = ids.includes("notepad-grocery");
  const opts = project.layoutOptions.listPage ?? {};
  const set = (patch: Partial<ListPageOptions>) =>
    update((p) => {
      const next = { ...(p.layoutOptions.listPage ?? {}), ...patch };
      for (const k of Object.keys(next) as (keyof ListPageOptions)[]) if (next[k] === undefined) delete next[k];
      return { ...p, layoutOptions: { ...p.layoutOptions, listPage: Object.keys(next).length ? next : undefined } };
    });
  // The sections as the page shows them: the maker's list, or the built-in categories (with any renamed wording).
  const sections = opts.sections ?? BUILT_IN.map((k) => project.wording[k] ?? DEFAULT_WORDING[k]);
  const setSections = (list: string[]) => set({ sections: list });
  const move = (i: number, d: number) => {
    const next = [...sections];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    setSections(next);
  };
  return (
    <Section title="List sections, lines and checkboxes" open>
      {grocery && (
        <div className="field" data-testid="list-sections">
          <span className="field-label">Sections ({sections.length})</span>
          <ol className="list-sections">
            {sections.map((t, i) => (
              <li key={i} className="list-sections__row">
                <input value={t} aria-label={`Section ${i + 1} title`} onChange={(e) => setSections(sections.map((x, j) => (j === i ? e.target.value : x)))} />
                <button type="button" className="btn btn--ghost" disabled={i === 0} aria-label={`Move section ${i + 1} up`} onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="btn btn--ghost" disabled={i === sections.length - 1} aria-label={`Move section ${i + 1} down`} onClick={() => move(i, 1)}>↓</button>
                <button type="button" className="btn btn--ghost" disabled={sections.length <= 1} aria-label={`Remove section ${i + 1}`} onClick={() => setSections(sections.filter((_, j) => j !== i))}>Remove</button>
              </li>
            ))}
          </ol>
          <div className="row">
            <button type="button" className="btn" onClick={() => setSections([...sections, `Section ${sections.length + 1}`])}>Add a section</button>
            {opts.sections && <button type="button" className="btn btn--ghost" onClick={() => set({ sections: undefined })}>Back to the built-in sections</button>}
          </div>
        </div>
      )}
      <div className="field" data-testid="list-lines">
        <span className="field-label">{grocery ? "Lines in each section" : "Checkbox rows"}</span>
        <div className="row">
          <button type="button" className="btn" aria-label="One line fewer" disabled={!opts.lines || opts.lines <= 1} onClick={() => set({ lines: Math.max(1, (opts.lines ?? 2) - 1) })}>−</button>
          <span className="list-lines__value" aria-live="polite">{opts.lines ? `${opts.lines} line${opts.lines === 1 ? "" : "s"}` : "As many as fit"}</span>
          <button type="button" className="btn" aria-label="One line more" onClick={() => set({ lines: (opts.lines ?? (grocery ? 3 : 12)) + 1 })}>+</button>
          {opts.lines && <button type="button" className="btn btn--ghost" onClick={() => set({ lines: undefined })}>As many as fit</button>}
        </div>
        <span className="hint">If more lines are chosen than the sheet holds, the page shows what fits and says so.</span>
      </div>
      <Segmented<"square" | "circle" | "none">
        label="Checkboxes"
        value={opts.marker ?? "square"}
        options={[{ value: "square", label: "Square" }, { value: "circle", label: "Circle" }, { value: "none", label: "None" }]}
        onChange={(m) => set({ marker: m === "square" ? undefined : m })}
      />
    </Section>
  );
}
