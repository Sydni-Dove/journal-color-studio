import { useState } from "react";
import { layoutAvailability, type ResolvedDocument } from "../../engines/document/resolve";
import { updateNode } from "../../engines/recipe/bookEdit";
import { getLayout } from "../../layouts/registry";
import { getModule, PAGE_MODULES } from "../../presets/modules";
import type { ProductProject } from "../../types/project";
import type { BookNode, BookStep, RepeatRule } from "../../types/recipe";
import { CoverDividerControls } from "./CoverDividerControls";
import { TabSheetControls } from "./TabSheetControls";
import { Field, Section } from "./ui";
import { createProject } from "../../presets/products/projectFactory";
import { localProjectStore } from "../../persistence/projectStore";
import { LayoutThumbnail } from "../preview/LayoutThumbnail";
import { repeatsFor } from "./ProductionPanels";

type Update = (fn: (p: ProductProject) => ProductProject) => void;
type Props = { project: ProductProject; update: Update; doc: ResolvedDocument; index: number };

function findStep(nodes: BookNode[] | undefined, id: string): BookStep | undefined {
  for (const node of nodes ?? []) {
    if (node.kind === "step" && node.id === id) return node;
    if (node.kind === "group") {
      const found = findStep(node.children, id);
      if (found) return found;
    }
  }
}

function selection({ project, doc, index }: Props) {
  const page = doc.recipe.pages[index];
  return { page, step: findStep(project.recipe.structure, page?.recipeItemId), item: project.recipe.items.find((x) => x.id === page?.recipeItemId) };
}

export function SelectedLayoutPanel(props: Props) {
  const { update, doc } = props;
  const { page, step, item } = selection(props);
  if (!page) return null;
  const choices = step ? getModule(step.module).layouts : item ? layoutAvailability(doc).filter((x) => x.supportedType).map((x) => x.layoutId) : [];
  const fits = layoutAvailability(doc);
  const setLayout = (layoutId: string) => update((p) => {
    const layout = getLayout(layoutId);
    const allowed = repeatsFor(layoutId, doc.binding.sheetCountIsMetadata);
    const defaultRepeat = layout.capability.defaultRepeat;
    const repeat: RepeatRule = item && allowed.includes(item.repeat.kind) ? item.repeat : defaultRepeat === "count" ? { kind: "count", count: 1 } : defaultRepeat === "repeated-sheet" ? { kind: "repeated-sheet", sheets: p.production.sheetsPerPad ?? 50 } : { kind: defaultRepeat } as RepeatRule;
    return { ...p,
      calendar: layout.capability.requiresCalendar && !p.calendar ? { startDate: `${new Date().getFullYear() + 1}-01-01`, endDate: `${new Date().getFullYear() + 1}-12-31`, weekStart: 1 as const, sixRowMonths: true } : p.calendar,
      recipe: step && p.recipe.structure
        ? { ...p.recipe, structure: updateNode(p.recipe.structure, step.id, (node) => ({ ...node, layoutId, start: layout.pages === 2 ? undefined : (node as BookStep).start })) }
        : { ...p.recipe, items: p.recipe.items.map((x) => x.id === item?.id ? { ...x, layoutId, repeat } : x) },
    };
  });
  return <Section title="Layout for selected page" open>
    <p className="hint">Page {page.pageNumber} · {step ? getModule(step.module).label : getLayout(page.layoutId).label}. This choice changes arrangement, not the page's purpose or book order.</p>
    <div className="layout-gallery">
      {choices.map((id) => {
        const layout = getLayout(id);
        const fit = fits.find((x) => x.layoutId === id)?.fit;
        return <button className="layout-card" type="button" key={id} aria-pressed={page.layoutId === id} disabled={!!fit && !fit.ok} onClick={() => setLayout(id)}>
          <LayoutThumbnail project={doc.project} layoutId={id}/>
          <strong>{layout.label}</strong><span>{layout.pages === 2 ? "Two-page spread" : "Single page"} · {layout.description}</span><small>{fit?.ok ? fit.variantLabel : fit?.reason ?? ""}</small>
        </button>;
      })}
    </div>
  </Section>;
}

export function SelectedContentPanel(props: Props) {
  const { project, update, doc } = props;
  const { page, step } = selection(props);
  const [saved, setSaved] = useState(false);
  if (!page) return null;
  if (!step) return <Section title="Content on selected page" open><p className="hint">This page uses its layout's built-in labels. To add guided sections or companion pages, choose “Edit as book structure” under Pages & order.</p></Section>;
  const mod = getModule(step.module);
  const set = (patch: Partial<BookStep>) => update((p) => ({ ...p, recipe: { ...p.recipe, structure: updateNode(p.recipe.structure!, step.id, (node) => ({ ...node, ...patch }) as BookNode) } }));
  const prompts = step.prompts ?? mod.prompts.none;
  const guided = step.layoutId === "guided-page" || step.layoutId === "tracker-weekly";
  return <Section title="Content on selected page" open>
    <p className="hint">Page {page.pageNumber} · {mod.label}. Titles and guided sections are content; writing lines and color have separate controls.</p>
    <Field label="Page category"><select value={step.module} onChange={(e) => {
      const next = getModule(e.target.value as BookStep["module"]);
      set({ module: next.type, layoutId: next.layouts.includes(step.layoutId) ? step.layoutId : next.layouts[0], title: undefined, prompts: undefined });
    }}>{!PAGE_MODULES.some((m) => m.type === step.module) && <option value={step.module}>Current saved category · {step.module}</option>}{PAGE_MODULES.map((m) => <option key={m.type} value={m.type}>{m.label}</option>)}</select></Field>
    {step.module !== "monthly-calendar" && step.module !== "weekly-planner" && <Field label={step.module === "divider-page" ? "Section name" : "Page title"}><input value={step.title ?? ""} placeholder={mod.titles.none} onChange={(e) => set({ title: e.target.value || undefined })}/></Field>}
    {guided && <div>
      <h4>{step.layoutId === "tracker-weekly" ? "Tracked items" : "Guided sections / custom blocks"}</h4><p className="hint">{step.layoutId === "tracker-weekly" ? "Each item becomes a row with seven check boxes. Move or remove rows here." : "Each label creates a separate writing section. Move or remove sections here; the guided page allocates the writing space."}</p>
      {prompts.map((prompt, i) => <div className="row" key={i}><input aria-label={`Section ${i + 1}`} value={prompt} onChange={(e) => set({ prompts: prompts.map((p, j) => j === i ? e.target.value : p) })}/><button className="btn" type="button" disabled={i === 0} onClick={() => { const next = [...prompts]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; set({ prompts: next }); }}>↑</button><button className="btn" type="button" disabled={i === prompts.length - 1} onClick={() => { const next = [...prompts]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; set({ prompts: next }); }}>↓</button><button className="btn" type="button" onClick={() => set({ prompts: prompts.filter((_, j) => j !== i) })}>Remove</button></div>)}
      <button className="btn" type="button" disabled={step.layoutId === "tracker-weekly" && prompts.length >= 16} onClick={() => set({ prompts: [...prompts, step.layoutId === "tracker-weekly" ? "New item" : "New section"] })}>+ Add {step.layoutId === "tracker-weekly" ? "item" : "section"}</button>
    </div>}
    {(step.module === "cover-page" || step.module === "divider-page") && <CoverDividerControls step={step} set={set} titleFont={doc.typography.fonts.cover} onTitleFont={(cover) => update((p) => ({ ...p, typography: { ...p.typography, fonts: { ...p.typography.fonts, cover } } }))} applyPreset={() => update((p) => ({ ...p, colors: { paletteId: "neutral-cheetah-luxe", overrides: {} } }))}/>}
    {step.module === "tab-sheet" && <><TabSheetControls step={step} entries={page.module?.tabSheet?.entries} set={set} saveLetter={() => {
      const settings = page.module?.tabSheet ?? step.tabSheet;
      localProjectStore.save(createProject("worksheet", { name: `${project.name} · Separate Tabs`, dimensions: { sizePresetId: "8.5x11", orientation: "portrait" }, colors: { paletteId: project.colors.paletteId, overrides: doc.colors }, typography: { fonts: doc.typography.fonts, roleOverrides: doc.typography.roles }, recipe: { items: [], ordering: "sequential", structure: [{ ...step, cadence: { type: "once" }, copies: 1, start: "any", tabSheet: { ...settings, fromDividers: false, dividerHeightIn: settings?.dividerHeightIn ?? doc.trim.heightIn } }] } }));
      setSaved(true);
    }}/>{saved && <p role="status">Separate Letter tab product saved. Return to Projects to open it.</p>}</>}
  </Section>;
}
