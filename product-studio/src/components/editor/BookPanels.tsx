import { LUXE_SUBTITLE_STYLE, LUXE_TITLE_FONT, luxeTitleStyle, NEUTRAL_LUXE_ID } from "../../presets/coverLuxe";
import { CoverDividerControls } from "./CoverDividerControls";
/**
 * BOOK STRUCTURE — the composite recipe as the book reads: sections (Front
 * Matter, Every Month, Every Week, End of…), and in each the pages it holds,
 * how often, and in what design. Structure only: page design (wording, type,
 * colour, surface, decoration, spacing) stays in the design panels.
 */
import { Visual } from "../help/visuals";
import { useState } from "react";
import { PageThumb } from "../preview/PageThumb";
import { thumbHeight, usePhone } from "../../utils/usePhone";
import { designNameTaken, savePageDesign } from "../../engines/recipe/pageDesigns";
import { PromptEditor, type PromptFit } from "./PromptEditor";
import { sectionLineCounts, sectionPages } from "../../layouts/shared/promptPages";
import { promptSetFromList } from "../../types/prompts";
import { layoutAvailability, solvePage, type ResolvedDocument } from "../../engines/document/resolve";
import { entryContentIds } from "../../engines/data/bind";
import { addNode, bookOutline, duplicateNode, moveNode, newSection, newStep, removeNode, structureFromItems, updateNode } from "../../engines/recipe/bookEdit";
import { getLayout } from "../../layouts/registry";
import { BOOK_PRESETS } from "../../presets/bookRecipes";
import { MONTH_NAMES } from "../../engines/calendar/calendar";
import { getModule, moduleStart, moduleTitle, PAGE_MODULES, supportsCadence } from "../../presets/modules";
import type { ProductProject } from "../../types/project";
import type { BookGroup, CadenceKind, BookNode, BookStep, PageStartRule, RecipeCadence } from "../../types/recipe";
import { Field, NumberField, Section, Select } from "./ui";
import { LAYOUT_NAMES, layoutName, PAGE_GROUP_ORDER, PAGE_TYPE_NAMES, pageTypeName } from "../../presets/plainNames";

type Update = (fn: (p: ProductProject) => ProductProject) => void;
type Props = { project: ProductProject; update: Update; doc: ResolvedDocument };

export type Scope = "none" | "year" | "quarter" | "month" | "week";
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
const START_LABEL: Record<PageStartRule, string> = { any: "Either side", recto: "Right-hand page", verso: "Left-hand page", spread: "Two facing pages (starts on a left-hand page)" };

const cadenceValue = (c: RecipeCadence): string => (c.type === "after-module" ? `after:${c.moduleId}` : c.type === "end-of-period" ? `end:${c.period}` : c.type);

function cadenceFrom(v: string, prev: RecipeCadence): RecipeCadence {
  if (v.startsWith("after:")) return { type: "after-module", moduleId: v.slice(6) };
  if (v.startsWith("end:")) return { type: "end-of-period", period: v.slice(4) as "week" | "month" | "quarter" | "year" };
  if (v === "copies") return { type: "copies", count: prev.type === "copies" ? prev.count : 1 };
  return { type: v } as RecipeCadence;
}

/** How a step's prompts fit: pages each time, and a plain message when they can't. */
function stepFit(doc: ResolvedDocument, stepId: string): PromptFit | undefined {
  const i = doc.recipe.pages.findIndex((p) => p.recipeItemId === stepId && !p.filler);
  if (i < 0) return undefined;
  const page = doc.recipe.pages[i];
  const pages = page.flowCount ?? 1;
  const solved = [...Array(pages).keys()].map((k) => solvePage(doc, i + k));
  const problem = solved.flatMap((s) => s.diagnostics).find((d) => d.rule === "prompt-fit")?.message;
  return { pages, problem, lines: sectionLineCounts(solved, "gp"), pageOf: sectionPages(solved, "gp") };
}

export const stepName = (s: BookStep, scope: Scope) =>
  s.title || (s.module === "monthly-calendar" || s.module === "weekly-planner" || s.module === "back-cover" ? pageTypeName(s.module) : moduleTitle(s.module, scope === "none" ? "none" : scope));

/** Where a step sits: its list (for "After …" choices) and the period it repeats inside. */
export function locateStep(nodes: BookNode[], id: string, scope: Scope = "none"): { step: BookStep; siblings: BookNode[]; scope: Scope } | null {
  for (const n of nodes) {
    if (n.kind === "step" && n.id === id) return { step: n, siblings: nodes, scope };
    if (n.kind === "group") {
      const hit = locateStep(n.children, id, n.period ?? scope);
      if (hit) return hit;
    }
  }
  return null;
}

export type StepPart = "basics" | "cover" | "sections";

/** Page type choices, grouped as a planner maker thinks of them (Cover, Monthly, Weekly, …). */
function PageTypeSelect({ value, onChange }: { value: BookStep["module"]; onChange: (m: BookStep["module"]) => void }) {
  return (
    <Field label="Page type">
      <select value={value} onChange={(e) => onChange(e.target.value as BookStep["module"])}>
        {PAGE_GROUP_ORDER.map((g) => {
          const mods = PAGE_MODULES.filter((m) => PAGE_TYPE_NAMES[m.type]?.group === g);
          return mods.length ? (
            <optgroup key={g} label={g}>
              {mods.map((m) => <option key={m.type} value={m.type}>{pageTypeName(m.type)}</option>)}
            </optgroup>
          ) : null;
        })}
      </select>
    </Field>
  );
}

/** A step's settings, in parts: basics (type, layout, how often, side, title), cover design, and its sections. */
export function StepFields({ s, siblings, scope, props, parts }: { s: BookStep; siblings: BookNode[]; scope: Scope; props: Props; parts: StepPart[] }) {
  const { update, doc } = props;
  const set = (patch: Partial<BookStep>) => update((p) => ({ ...p, recipe: { ...p.recipe, structure: updateNode(p.recipe.structure!, s.id, (n) => ({ ...n, ...patch }) as BookNode) } }));
  const mod = getModule(s.module);
  const avail = layoutAvailability(doc);
  const layout = getLayout(s.layoutId);
  const two = layout.pages === 2;
  /** The side this page actually starts on: its own choice, else its page type's default. */
  const start: PageStartRule = s.start ?? moduleStart(s.module);
  const cadenceOptions = howOftenOptions(s, siblings, scope);
  const guided = s.layoutId === "guided-page";
  /** A page built from pieces (a Custom Page or one made from a saved design): the composer, first thing. */
  const composed = guided && (s.module === "custom" || !!s.designId);
  const has = (p: StepPart) => parts.includes(p);
  return (
    <>
      {has("basics") && (
        <>
          <div className="row">
            <PageTypeSelect
              value={s.module}
              onChange={(module) => {
                const m = getModule(module);
                // A repeat the new page type does not support falls back to that type's default.
                const cadence = m.cadences.includes(s.cadence.type) ? s.cadence : m.defaultCadence;
                set({ module, layoutId: m.layouts.includes(s.layoutId) ? s.layoutId : m.layouts[0], title: undefined, prompts: undefined, cadence });
              }}
            />
            {mod.layouts.length > 1 ? (
              <Select
                label="Layout"
                value={s.layoutId}
                // Meeting With God beside the Weekly Plan is content, not a separate arrangement: it is added from
                // Pages → Weekly → Add guided journal. The combined layout is only listed when a page already uses it.
                options={mod.layouts.filter((id) => id !== "weekly-plan-mwg-spread" || s.layoutId === id).map((id) => {
                  const a = avail.find((x) => x.layoutId === id);
                  return { value: id, label: `${layoutName(id, getLayout(id).label)}${a && !a.fit.ok ? " — not enough room at this size" : ""}` };
                })}
                onChange={(layoutId) => set({ layoutId, start: getLayout(layoutId).pages === 2 ? undefined : s.start })}
              />
            ) : (
              <Field label="Layout"><span className="field-static">{layoutName(s.layoutId, layout.label)}</span></Field>
            )}
          </div>
          {LAYOUT_NAMES[s.layoutId]?.hint && <p className="hint">{LAYOUT_NAMES[s.layoutId].hint}</p>}
          {(s.layoutId === "journal-lined" || s.layoutId === "notes-page") && (
            <div className="customize-page">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  // The same page, made from pieces: one writing section with this page's title, then every builder option.
                  const wt = props.project.layoutOptions.writingTitle ?? {};
                  const heading = s.layoutId === "notes-page" ? props.project.wording.notes ?? "Notes" : "";
                  set({
                    module: "custom",
                    layoutId: "guided-page",
                    title: s.title ?? (heading || "Custom Page"),
                    prompts: undefined,
                    promptSet: { blocks: [{ id: `b${Date.now().toString(36)}`, label: heading, space: "fill", ...(wt.align && wt.align !== "left" ? { headingAlign: wt.align } : {}), ...(wt.rule ? { headingRule: true } : {}), ...(wt.font ? { headingFont: wt.font } : {}) }] },
                  });
                }}
              >
                Customize this page
              </button>
              <p className="hint">Turns this page into a Custom page you build yourself — page header, sections, prompts, tables, checklists, headings anywhere — starting from what it has now. Only this page changes.</p>
            </div>
          )}
          <div className="row">
            <Select label="How often" value={cadenceValue(s.cadence)} options={cadenceOptions} onChange={(v) => set({ cadence: cadenceFrom(v, s.cadence) })} />
            {s.cadence.type === "copies" ? (
              <NumberField label="Number of copies" step={1} min={1} value={s.cadence.count} onChange={(count) => set({ cadence: { type: "copies", count: Math.max(1, Math.round(count)) } })} />
            ) : (
              <NumberField label="Pages each time" step={1} min={1} value={s.copies ?? 1} onChange={(c) => set({ copies: Math.max(1, Math.round(c)) === 1 ? undefined : Math.max(1, Math.round(c)) })} />
            )}
          </div>
          {two ? (
            <>
              <p className="hint">Two facing pages: it always starts on a left-hand page so both pages face each other. A notes page is added before it when needed.</p>
              <SpreadPreview doc={doc} stepId={s.id} />
            </>
          ) : (
            <>
              <Select label="Which side should this start on?" value={start} options={(["any", "recto", "verso"] as const).map((v) => ({ value: v, label: START_LABEL[v] }))} onChange={(v) => set({ start: v === moduleStart(s.module) ? undefined : v })} />
              {start !== "any" && <Visual kind="page-sides" side={start === "recto" ? "right" : "left"} caption={start === "recto" ? "Starts on the right-hand page of an open book." : "Starts on the left-hand page of an open book."} />}
            </>
          )}
          {mod.type !== "monthly-calendar" && mod.type !== "weekly-planner" && mod.type !== "back-cover" && (
            <Field label={s.module === "divider-page" ? "Section name" : s.module === "cover-page" ? "Title" : s.module === "custom" ? "Page name (in Pages and Browse pages — not printed)" : "Page title"}>
              <input type="text" value={s.title ?? ""} placeholder={moduleTitle(s.module, scope === "none" ? "none" : scope)} onChange={(e) => set({ title: e.target.value || undefined })} />
            </Field>
          )}
        </>
      )}
      {has("cover") && (s.module === "cover-page" || s.module === "back-cover" || s.module === "divider-page") && <CoverDividerControls step={s} set={set} colors={doc.colors} titleFont={doc.typography.fonts.cover} onTitleFont={(cover) => update((p) => ({ ...p, typography: { ...p.typography, fonts: { ...p.typography.fonts, cover }, roleOverrides: { ...p.typography.roleOverrides, coverTitle: { ...p.typography.roleOverrides.coverTitle, ...luxeTitleStyle(cover) } } } }))} applyPreset={() => update((p) => ({ ...p, colors: { paletteId: NEUTRAL_LUXE_ID, overrides: {} }, typography: { ...p.typography, fonts: { ...p.typography.fonts, cover: LUXE_TITLE_FONT }, roleOverrides: { ...p.typography.roleOverrides, coverTitle: { ...p.typography.roleOverrides.coverTitle, ...luxeTitleStyle(LUXE_TITLE_FONT) }, coverSubtitle: { ...p.typography.roleOverrides.coverSubtitle, ...LUXE_SUBTITLE_STYLE } } } }))}/>}
      {has("sections") && guided && (() => {
        const editor = (
          <PromptEditor
            composer={composed}
            set={s.promptSet ?? promptSetFromList(s.prompts ?? mod.prompts[scope === "none" ? "none" : scope] ?? mod.prompts.none)}
            onChange={(promptSet) => set({ promptSet, prompts: undefined })}
            ownStyleLabel="Your writing lines style"
            allowInstructions
            allowHeader
            allowStarters
            fit={stepFit(doc, s.id)}
          />
        );
        return composed ? (
          <div className="composer" data-testid="composer">
            {editor}
            <SaveDesign step={s} props={props} />
          </div>
        ) : (
          <details className="subsection" open>
            <summary>What's on this page?</summary>
            {editor}
            <SaveDesign step={s} props={props} />
          </details>
        );
      })()}
    </>
  );
}

/** Save this Custom Page as a reusable page design (Pages → Your page designs adds pages made from it). */
function SaveDesign({ step, props }: { step: BookStep; props: Props }) {
  const { project, update } = props;
  const from = project.pageDesigns?.find((d) => d.id === step.designId);
  const [name, setName] = useState(from || !step.title || step.title === "Custom Page" ? "" : step.title);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const taken = !!name.trim() && designNameTaken(project, name);
  const save = () => {
    const res = savePageDesign(project, step, name);
    if ("error" in res) return setNote({ ok: false, text: res.error });
    update((p) => ({ ...p, pageDesigns: res.project.pageDesigns }));
    setNote({ ok: true, text: `Saved “${res.design.name}”. Add it from Pages → Your page designs.` });
    setName("");
  };
  return (
    <div className="save-design" data-testid="save-design">
      <div className="field-label">Save page design</div>
      <p className="hint">
        {from
          ? `This page is a copy of your page design “${from.name}”. Changes here stay on this page — the saved design and your other “${from.name}” pages don't change. To reuse this version, save it under a new name.`
          : "Save this page's sections to reuse them: add it anywhere in Pages, as many pages as you need. Colors, fonts and background follow the product's Style."}
      </p>
      <Field label="Page design name">
        <input type="text" value={name} placeholder="e.g. Project Snapshot" onChange={(e) => { setName(e.target.value); setNote(null); }} onKeyDown={(e) => e.key === "Enter" && !taken && name.trim() && save()} />
      </Field>
      {taken && <p className="hint" role="status">A page design named “{name.trim()}” already exists. Choose a different name.</p>}
      <button type="button" className="btn btn--primary" disabled={!step.promptSet?.blocks.length || !name.trim() || taken} onClick={save}>
        Save
      </button>
      {note && <p className={note.ok ? "hint" : "hint hint--error"} role="status">{note.text}</p>}
    </div>
  );
}

/** The step's first open spread, drawn by the real renderer (larger on a phone). */
function SpreadPreview({ doc, stepId }: { doc: ResolvedDocument; stepId: string }) {
  const phone = usePhone();
  const i = doc.recipe.pages.findIndex((p) => p.recipeItemId === stepId && p.spreadPart === 0);
  if (i < 0 || i + 1 >= doc.recipe.pages.length) return <Visual kind="page-sides" side="both" caption="Two facing pages of an open book." />;
  const h = thumbHeight(phone, 120, 170);
  return (
    <div className="spread-preview" aria-label="This page's two facing pages">
      <PageThumb doc={doc} index={i} heightPx={h} />
      <PageThumb doc={doc} index={i + 1} heightPx={h} />
    </div>
  );
}

/** "How often" choices a step's page type allows inside the period it sits in. */
function howOftenOptions(s: BookStep, siblings: BookNode[], scope: Scope) {
  const word = SCOPE_WORD[scope];
  // Only the repeats this page type declares (presets/modules.ts MODULE_CADENCES). A saved repeat outside that
  // list (older books) is kept and shown, never silently changed.
  const ok = (k: CadenceKind) => supportsCadence(s.module, k);
  const all = [
    { kind: "once" as CadenceKind, value: "once", label: word ? `Once each ${word}` : "Once" },
    { kind: "copies" as CadenceKind, value: "copies", label: "A number of copies" },
    ...SMALLER[scope].map((k) => ({ kind: EVERY[k] as CadenceKind, value: EVERY[k], label: `Every ${k}${word ? ` of the ${word}` : ""}` })),
    ...ENDS[scope].map((k) => ({ kind: "end-of-period" as CadenceKind, value: `end:${k}`, label: `End of each ${k}` })),
    ...siblings.filter((x): x is BookStep => x.kind === "step" && x.id !== s.id).map((x) => ({ kind: "after-module" as CadenceKind, value: `after:${x.id}`, label: `After “${stepName(x, scope)}”` })),
  ];
  return all.filter((o) => ok(o.kind) || o.value === cadenceValue(s.cadence)).map((o) => (ok(o.kind) ? o : { ...o, label: `${o.label} (saved — not offered for this page)` }));
}

function StepCard({ s, siblings, scope, props, first, last }: { s: BookStep; siblings: BookNode[]; scope: Scope; props: Props & { goToStep: (id: string) => void }; first: boolean; last: boolean }) {
  const edit = (fn: (nodes: BookNode[]) => BookNode[]) => props.update((p) => ({ ...p, recipe: { ...p.recipe, structure: fn(p.recipe.structure!) } }));
  const layout = getLayout(s.layoutId);
  const often = howOftenOptions(s, siblings, scope).find((o) => o.value === cadenceValue(s.cadence))?.label ?? s.cadence.type;
  return (
    <details className="card book-step" data-step={s.id}>
      <summary className="book-step__title">
        <strong>{stepName(s, scope)}</strong>
        {(s.copies ?? 1) > 1 ? ` × ${s.copies}` : s.cadence.type === "copies" && s.cadence.count > 1 ? ` × ${s.cadence.count}` : ""}
        <span className="hint"> · {often} · {layoutName(s.layoutId, layout.label)}</span>
      </summary>
      <StepFields s={s} siblings={siblings} scope={scope} props={props} parts={["basics", "cover", "sections"]} />
      <div className="card-actions">
        <button className="btn" disabled={first} onClick={() => edit((n) => moveNode(n, s.id, -1))}>Move up</button>
        <button className="btn" disabled={last} onClick={() => edit((n) => moveNode(n, s.id, 1))}>Move down</button>
        {!entryContentIds(props.project.recipe.structure ?? []).has(s.id) && <button className="btn" onClick={() => edit((n) => duplicateNode(n, s.id))}>Duplicate</button>}
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
  const list = g.entries ? props.project.data?.collections.find((c) => c.id === g.entries!.collectionId) : undefined;
  return (
    <fieldset className="book-section" data-section={g.id}>
      <legend>{g.label || SECTION_LABEL[g.period ?? "none"]}{g.designId ? ` · ${g.children.length} page${g.children.length === 1 ? "" : "s"} from your page design` : ""}{list ? ` · once per entry of “${list.name}” (${list.records.length})` : ""}</legend>
      {g.entries && (
        <p className="hint">
          {list ? `These pages repeat for each entry of “${list.name}”, in its order, and print that entry's words. Edit the words in Your content. In a page title, {title} or {day|#} prints that field (# = the entry's place).` : "This section repeats for each entry of a list that no longer exists. Choose a list in Your content."}
        </p>
      )}
      <NodeList nodes={g.children} scope={inner} parentId={g.id} props={props} />
      <details className="book-section__settings">
        <summary>Section settings</summary>
        <div className="row">
          <Field label="Section name">
            <input type="text" value={g.label ?? ""} placeholder={SECTION_LABEL[g.period ?? "none"]} onChange={(e) => set({ label: e.target.value })} />
          </Field>
          {/* Pages from a page design are a set number of pages (Pages → Number of pages), never a repeating section. */}
          {!g.designId && !g.entries && <Select label="How often this section repeats" value={g.period ?? "none"} options={periods.map((p) => ({ value: p, label: SECTION_LABEL[p] }))} onChange={(v) => set({ period: v === "none" ? undefined : (v as BookGroup["period"]) })} />}
        </div>
        <div className="card-actions">
          <button className="btn" disabled={first} onClick={() => edit((n) => moveNode(n, g.id, -1))}>Move section up</button>
          <button className="btn" disabled={last} onClick={() => edit((n) => moveNode(n, g.id, 1))}>Move section down</button>
          {!entryContentIds(props.project.recipe.structure ?? []).has(g.id) && <button className="btn" onClick={() => edit((n) => duplicateNode(n, g.id))}>Duplicate section</button>}
          <button className="btn btn--danger" onClick={() => edit((n) => removeNode(n, g.id))}>Remove section</button>
        </div>
      </details>
    </fieldset>
  );
}

/**
 * EDIT THIS PAGE — the settings of the page being viewed, in one of its parts:
 * its layout (type, arrangement, how often, side, title, cover design) or what
 * is on it (its sections). The same step the Pages list edits, so both agree.
 */
export function ThisPagePanel({ project, update, doc, current, parts }: Props & { current: number; parts: StepPart[] }) {
  const page = doc.recipe.pages[current];
  const structure = project.recipe.structure;
  if (!page || !structure) return null;
  const hit = page.recipeItemId ? locateStep(structure, page.recipeItemId) : null;
  if (!hit) return null;
  if (page.filler) return <p className="hint">This is a notes page the book adds so the next page starts on the right side. It has no settings of its own.</p>;
  const { step, siblings, scope } = hit;
  return (
    <div className="this-page" data-step={step.id}>
      <p className="this-page__name"><strong>{stepName(step, scope)}</strong>{page.module?.subtitle ? <span className="hint"> · {page.module.subtitle}</span> : null}</p>
      <StepFields s={step} siblings={siblings} scope={scope} props={{ project, update, doc }} parts={parts} />
    </div>
  );
}

/** Pages & layouts editor (composite recipe). Existing flat recipes convert on request. */
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
    <Section title={`Order & repeats · ${doc.recipe.pageCount} pages`}>
      {!structure ? (
        <>
          <p className="hint">Arrange pages in their exact order, and group them into sections that repeat every month or week.</p>
          <div className="card-actions">
            <button className="btn" onClick={() => update((p) => ({ ...p, recipe: { ...p.recipe, structure: structureFromItems(p.recipe) } }))}>Arrange pages</button>
          </div>
          <Select label="Or start from a template" value="__none" options={[{ value: "__none", label: "Choose…" }, ...BOOK_PRESETS.map((b) => ({ value: b.id, label: b.label }))]} onChange={applyPreset} />
        </>
      ) : (
        <>
          <p className="hint">The exact order, top to bottom. Sections that repeat expand across the planner's dates {doc.calendar ? `(${doc.calendar.settings.startDate} – ${doc.calendar.settings.endDate})` : "(set them under Planner setup)"}.</p>
          <NodeList nodes={structure} scope="none" parentId={null} props={props} />
          <div className="card-actions">
            <button className="btn" onClick={() => update((p) => ({ ...p, recipe: { ...p.recipe, structure: addNode(p.recipe.structure!, null, newSection("Every Month", "month")) } }))}>+ Add repeating section</button>
          </div>
          <Select label="Replace everything with a template" value="__none" options={[{ value: "__none", label: "Choose…" }, ...BOOK_PRESETS.map((b) => ({ value: b.id, label: b.label }))]} onChange={applyPreset} />
          <button className="btn btn--ghost" onClick={() => update((p) => ({ ...p, recipe: { ...p.recipe, structure: undefined } }))}>Back to a simple page list</button>
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
