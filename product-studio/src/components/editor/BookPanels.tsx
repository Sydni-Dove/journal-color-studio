/**
 * BOOK STRUCTURE — the composite recipe as the book reads: sections (Front
 * Matter, Every Month, Every Week, End of…), and in each the pages it holds,
 * how often, and in what design. Structure only: page design (wording, type,
 * colour, surface, decoration, spacing) stays in the design panels.
 */
import { Visual } from "../help/visuals";
import { layoutAvailability, type ResolvedDocument } from "../../engines/document/resolve";
import { addNode, bookOutline, duplicateNode, moveNode, newSection, newStep, removeNode, structureFromItems, updateNode } from "../../engines/recipe/bookEdit";
import { getLayout } from "../../layouts/registry";
import { BOOK_PRESETS } from "../../presets/bookRecipes";
import { MONTH_NAMES } from "../../engines/calendar/calendar";
import { getModule, moduleTitle, PAGE_MODULES, supportsCadence } from "../../presets/modules";
import type { ProductProject } from "../../types/project";
import type { BookGroup, CadenceKind, BookNode, BookStep, PageStartRule, RecipeCadence } from "../../types/recipe";
import { Field, NumberField, Section, Select } from "./ui";

type Update = (fn: (p: ProductProject) => ProductProject) => void;
type Props = { project: ProductProject; update: Update; doc: ResolvedDocument };

type Scope = "none" | "year" | "quarter" | "month" | "week";
const SCOPE_WORD: Record<Scope, string> = { none: "", year: "year", quarter: "quarter", month: "month", week: "week" };
const SMALLER: Record<Scope, ("year" | "quarter" | "month" | "week" | "day")[]> = {
  none: ["year", "quarter", "month", "week", "day"],
  year: ["quarter", "month", "week", "day"],
  quarter: ["month", "week", "day"],
  month: ["week", "day"],
  week: ["day"],
};
const ENDS: Record<Scope, ("week" | "month" | "quarter" | "year")[]> = {
  none: ["week", "month", "quarter", "year"],
  year: ["week", "month", "quarter", "year"],
  quarter: ["week", "month", "quarter"],
  month: ["week", "month"],
  week: ["week"],
};
const EVERY: Record<string, RecipeCadence["type"]> = { year: "yearly", quarter: "quarterly", month: "monthly", week: "weekly", day: "daily" };
const SECTION_LABEL: Record<Scope, string> = { none: "Once (doesn't repeat)", year: "Every year", quarter: "Every quarter", month: "Every month", week: "Every week" };
const START_LABEL: Record<PageStartRule, string> = { any: "Either side", recto: "Right-hand page", verso: "Left-hand page", spread: "Two-page spread (starts on a left-hand page)" };

const cadenceValue = (c: RecipeCadence): string => (c.type === "after-module" ? `after:${c.moduleId}` : c.type === "end-of-period" ? `end:${c.period}` : c.type);

function cadenceFrom(v: string, prev: RecipeCadence): RecipeCadence {
  if (v.startsWith("after:")) return { type: "after-module", moduleId: v.slice(6) };
  if (v.startsWith("end:")) return { type: "end-of-period", period: v.slice(4) as "week" | "month" | "quarter" | "year" };
  if (v === "copies") return { type: "copies", count: prev.type === "copies" ? prev.count : 1 };
  return { type: v } as RecipeCadence;
}

const stepName = (s: BookStep, scope: Scope) =>
  s.title || (s.module === "monthly-calendar" || s.module === "weekly-planner" ? getModule(s.module).label : moduleTitle(s.module, scope === "none" ? "none" : scope));

function StepCard({ s, siblings, scope, props, first, last }: { s: BookStep; siblings: BookNode[]; scope: Scope; props: Props & { goToStep: (id: string) => void }; first: boolean; last: boolean }) {
  const { update, doc } = props;
  const set = (patch: Partial<BookStep>) => update((p) => ({ ...p, recipe: { ...p.recipe, structure: updateNode(p.recipe.structure!, s.id, (n) => ({ ...n, ...patch }) as BookNode) } }));
  const edit = (fn: (nodes: BookNode[]) => BookNode[]) => update((p) => ({ ...p, recipe: { ...p.recipe, structure: fn(p.recipe.structure!) } }));
  const mod = getModule(s.module);
  const avail = layoutAvailability(doc);
  const layout = getLayout(s.layoutId);
  const two = layout.pages === 2;
  const word = SCOPE_WORD[scope];
  // Only the cadences this purpose declares (presets/modules.ts MODULE_CADENCES). A saved cadence outside that
  // list (older books) is kept and shown, never silently changed.
  const ok = (k: CadenceKind) => supportsCadence(s.module, k);
  const allCadences = [
    { kind: "once" as CadenceKind, value: "once", label: word ? `Once each ${word}` : "Once" },
    { kind: "copies" as CadenceKind, value: "copies", label: "A number of copies" },
    ...SMALLER[scope].map((k) => ({ kind: EVERY[k] as CadenceKind, value: EVERY[k], label: `Every ${k}${word ? ` of the ${word}` : ""}` })),
    ...ENDS[scope].map((k) => ({ kind: "end-of-period" as CadenceKind, value: `end:${k}`, label: `End of each ${k}` })),
    ...siblings.filter((x): x is BookStep => x.kind === "step" && x.id !== s.id).map((x) => ({ kind: "after-module" as CadenceKind, value: `after:${x.id}`, label: `After “${stepName(x, scope)}”` })),
  ];
  const cadenceOptions = allCadences.filter((o) => ok(o.kind) || o.value === cadenceValue(s.cadence)).map((o) => (ok(o.kind) ? o : { ...o, label: `${o.label} (saved — not offered for this page)` }));
  const guided = s.layoutId === "guided-page";
  return (
    <details className="card book-step" data-step={s.id}>
      <summary className="book-step__title">
        <strong>{stepName(s, scope)}</strong>
        {(s.copies ?? 1) > 1 ? ` × ${s.copies}` : s.cadence.type === "copies" && s.cadence.count > 1 ? ` × ${s.cadence.count}` : ""}
        <span className="hint"> · {cadenceOptions.find((o) => o.value === cadenceValue(s.cadence))?.label ?? s.cadence.type} · {layout.label}</span>
      </summary>
      <div className="row">
        <Select
          label="Page purpose"
          value={s.module}
          options={PAGE_MODULES.map((m) => ({ value: m.type, label: m.label }))}
          onChange={(module) => {
            const m = getModule(module);
            // A cadence the new purpose does not support falls back to that purpose's default.
            const cadence = m.cadences.includes(s.cadence.type) ? s.cadence : m.defaultCadence;
            set({ module, layoutId: m.layouts.includes(s.layoutId) ? s.layoutId : m.layouts[0], title: undefined, prompts: undefined, cadence });
          }}
        />
        <Select
          label="Design"
          value={s.layoutId}
          options={mod.layouts.map((id) => {
            const a = avail.find((x) => x.layoutId === id);
            return { value: id, label: `${getLayout(id).label}${a && !a.fit.ok ? " — not enough room at this size" : ""}` };
          })}
          onChange={(layoutId) => set({ layoutId, start: getLayout(layoutId).pages === 2 ? undefined : s.start })}
        />
      </div>
      <div className="row">
        <Select label="How often this page repeats" value={cadenceValue(s.cadence)} options={cadenceOptions} onChange={(v) => set({ cadence: cadenceFrom(v, s.cadence) })} />
        {s.cadence.type === "copies" ? (
          <NumberField label="Number of copies" step={1} min={1} value={s.cadence.count} onChange={(count) => set({ cadence: { type: "copies", count: Math.max(1, Math.round(count)) } })} />
        ) : (
          <NumberField label="Pages each time it repeats" step={1} min={1} value={s.copies ?? 1} onChange={(c) => set({ copies: Math.max(1, Math.round(c)) === 1 ? undefined : Math.max(1, Math.round(c)) })} />
        )}
      </div>
      {two ? (
        <>
          <p className="hint">Two-page spread: it always starts on a left-hand page so both pages face each other. A notes page is added before it when needed.</p>
          <Visual kind="page-sides" side="both" caption="A two-page spread fills both pages of an open book." />
        </>
      ) : (
        <>
          <Select label="Which side should this page start on?" value={s.start ?? "any"} options={(["any", "recto", "verso"] as const).map((v) => ({ value: v, label: START_LABEL[v] }))} onChange={(start) => set({ start: start === "any" ? undefined : start })} />
          {s.start && <Visual kind="page-sides" side={s.start === "recto" ? "right" : "left"} caption={s.start === "recto" ? "Starts on the right-hand page of an open book." : "Starts on the left-hand page of an open book."} />}
        </>
      )}
      {mod.type !== "monthly-calendar" && mod.type !== "weekly-planner" && (
        <Field label="Page title">
          <input type="text" value={s.title ?? ""} placeholder={moduleTitle(s.module, scope === "none" ? "none" : scope)} onChange={(e) => set({ title: e.target.value || undefined })} />
        </Field>
      )}
      {guided && (
        <Field label="Prompts (one per line)">
          <textarea
            rows={Math.max(3, (s.prompts ?? mod.prompts.none).length)}
            value={(s.prompts ?? mod.prompts[scope === "none" ? "none" : scope] ?? mod.prompts.none).join("\n")}
            onChange={(e) => set({ prompts: e.target.value.split("\n") })}
            onBlur={(e) => set({ prompts: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })}
          />
        </Field>
      )}
      <div className="card-actions">
        <button className="btn" disabled={first} onClick={() => edit((n) => moveNode(n, s.id, -1))}>Move up</button>
        <button className="btn" disabled={last} onClick={() => edit((n) => moveNode(n, s.id, 1))}>Move down</button>
        <button className="btn" onClick={() => edit((n) => duplicateNode(n, s.id))}>Duplicate</button>
        <button className="btn btn--danger" onClick={() => edit((n) => removeNode(n, s.id))}>Remove</button>
        <button className="btn btn--ghost" onClick={() => props.goToStep(s.id)}>Show pages</button>
      </div>
    </details>
  );
}

function NodeList({ nodes, scope, parentId, props }: { nodes: BookNode[]; scope: Scope; parentId: string | null; props: Props & { goToStep: (id: string) => void } }) {
  const edit = (fn: (n: BookNode[]) => BookNode[]) => props.update((p) => ({ ...p, recipe: { ...p.recipe, structure: fn(p.recipe.structure!) } }));
  return (
    <div className="book-list">
      {nodes.map((n, i) =>
        n.kind === "step" ? (
          <StepCard key={n.id} s={n} siblings={nodes} scope={scope} props={props} first={i === 0} last={i === nodes.length - 1} />
        ) : (
          <GroupCard key={n.id} g={n} scope={scope} props={props} first={i === 0} last={i === nodes.length - 1} edit={edit} />
        ),
      )}
      <div className="card-actions">
        <button className="btn" onClick={() => edit((x) => addNode(x, parentId, newStep("lined-journal", { type: "once" })))}>+ Add page</button>
        {scope !== "week" && (
          <button className="btn" onClick={() => edit((x) => addNode(x, parentId, newSection(scope === "none" ? "Front Matter" : "Every Week", scope === "none" ? undefined : "week")))}>+ Add section</button>
        )}
      </div>
    </div>
  );
}

function GroupCard({ g, scope, props, first, last, edit }: { g: BookGroup; scope: Scope; props: Props & { goToStep: (id: string) => void }; first: boolean; last: boolean; edit: (fn: (n: BookNode[]) => BookNode[]) => void }) {
  const inner: Scope = g.period ?? scope;
  const periods: Scope[] = ["none", ...(SMALLER[scope].filter((k) => k !== "day") as Scope[])];
  const set = (patch: Partial<BookGroup>) => edit((n) => updateNode(n, g.id, (x) => ({ ...x, ...patch }) as BookNode));
  return (
    <fieldset className="book-section" data-section={g.id}>
      <legend>{g.label || SECTION_LABEL[g.period ?? "none"]}</legend>
      <NodeList nodes={g.children} scope={inner} parentId={g.id} props={props} />
      <details className="book-section__settings">
        <summary>Section settings</summary>
        <div className="row">
          <Field label="Section name">
            <input type="text" value={g.label ?? ""} placeholder={SECTION_LABEL[g.period ?? "none"]} onChange={(e) => set({ label: e.target.value })} />
          </Field>
          <Select label="How often this section repeats" value={g.period ?? "none"} options={periods.map((p) => ({ value: p, label: SECTION_LABEL[p] }))} onChange={(v) => set({ period: v === "none" ? undefined : (v as BookGroup["period"]) })} />
        </div>
        <div className="card-actions">
          <button className="btn" disabled={first} onClick={() => edit((n) => moveNode(n, g.id, -1))}>Move section up</button>
          <button className="btn" disabled={last} onClick={() => edit((n) => moveNode(n, g.id, 1))}>Move section down</button>
          <button className="btn" onClick={() => edit((n) => duplicateNode(n, g.id))}>Duplicate section</button>
          <button className="btn btn--danger" onClick={() => edit((n) => removeNode(n, g.id))}>Remove section</button>
        </div>
      </details>
    </fieldset>
  );
}

/** Book structure editor (composite recipe). Existing flat recipes convert on request. */
export function BookStructurePanel(props: Props & { goToStep: (id: string) => void }) {
  const { project, update, doc } = props;
  const structure = project.recipe.structure;
  const applyPreset = (id: string) => {
    const preset = BOOK_PRESETS.find((b) => b.id === id);
    if (!preset) return;
    update((p) => ({
      ...p,
      calendar: p.calendar ?? { startDate: `${new Date().getFullYear() + 1}-01-01`, endDate: `${new Date().getFullYear() + 1}-12-31`, weekStart: 1, sixRowMonths: true },
      recipe: { ...p.recipe, structure: preset.build() },
    }));
  };
  return (
    <Section title={`Book structure${structure ? ` · ${doc.recipe.pageCount} pages` : ""}`} open={!!structure}>
      {!structure ? (
        <>
          <p className="hint">Build a planner inside a journal (or a journal inside a planner): sections that repeat every month or week, with the pages each one holds.</p>
          <div className="card-actions">
            <button className="btn" onClick={() => update((p) => ({ ...p, recipe: { ...p.recipe, structure: structureFromItems(p.recipe) } }))}>Edit as book structure</button>
          </div>
          <Select label="Or start from a book structure" value="__none" options={[{ value: "__none", label: "Choose…" }, ...BOOK_PRESETS.map((b) => ({ value: b.id, label: b.label }))]} onChange={applyPreset} />
        </>
      ) : (
        <>
          <p className="hint">The book reads top to bottom. Sections that repeat expand across the date range {doc.calendar ? `(${doc.calendar.settings.startDate} – ${doc.calendar.settings.endDate})` : "(set one under Pages)"}.</p>
          <NodeList nodes={structure} scope="none" parentId={null} props={props} />
          <div className="card-actions">
            <button className="btn" onClick={() => update((p) => ({ ...p, recipe: { ...p.recipe, structure: addNode(p.recipe.structure!, null, newSection("Every Month", "month")) } }))}>+ Add repeating section</button>
          </div>
          <Select label="Replace with a book structure" value="__none" options={[{ value: "__none", label: "Choose…" }, ...BOOK_PRESETS.map((b) => ({ value: b.id, label: b.label }))]} onChange={applyPreset} />
          <button className="btn btn--ghost" onClick={() => update((p) => ({ ...p, recipe: { ...p.recipe, structure: undefined } }))}>Back to the simple page list</button>
        </>
      )}
    </Section>
  );
}

/** Generated pages as text rows (one per module occurrence); click to open that page. */
export function BookOutlinePanel({ doc, current, goTo }: { doc: ResolvedDocument; current: number; goTo: (index: number) => void }) {
  const owner = new Map((doc.calendar?.weeks ?? []).map((w) => [w.key, w.ownerMonthKey]));
  const monthName = (k: string) => `${MONTH_NAMES[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
  const rows = bookOutline(doc.recipe, (id) => getLayout(id).label, owner, monthName);
  const curPage = doc.recipe.pages[current]?.pageNumber;
  return (
    <Section title={`Book outline · ${doc.recipe.pageCount} pages`}>
      <ol className="book-outline" aria-label="Generated pages">
        {rows.map((r, i) =>
          r.kind === "heading" ? (
            <li key={`h${i}`} className="book-outline__heading">{r.label}</li>
          ) : (
            <li key={`p${r.from}`} className={`${r.filler ? "book-outline__filler" : ""} ${curPage !== undefined && curPage >= r.from && curPage <= r.to ? "book-outline__current" : ""}`}>
              <button type="button" onClick={() => goTo(r.index)}>
                <span className="book-outline__pages">{r.from === r.to ? r.from : `${r.from}–${r.to}`}</span> {r.label}
                {r.detail && <span className="hint book-outline__detail">{r.detail}</span>}
              </button>
            </li>
          ),
        )}
      </ol>
    </Section>
  );
}
