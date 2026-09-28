/**
 * Full planners & books: complete products to start from. Each card is
 * previewed with the real page renderer (the same PrintablePage the editor
 * and print use — never a screenshot). "View template" shows its pages at the
 * chosen size; "Use this template" creates an ordinary, editable project from
 * the same book recipe the Book structure editor works on.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { geometryFor, layoutAvailability, resolveDocument, solvePage, type ResolvedDocument } from "../../engines/document/resolve";
import { CSS_PX_PER_IN } from "../../engines/units/units";
import { PrintablePage } from "../../primitives/PrintablePage";
import { BINDING_CHOICES, getBindingProfile } from "../../presets/bindingProfiles/bindingProfiles";
import { BOOK_TEMPLATES, type RecipePreset } from "../../presets/layouts/recipePresets";
import { PRINT_PROFILES } from "../../presets/printProfiles/printProfiles";
import { PRODUCT_TYPES } from "../../presets/products/productTypes";
import { createProject } from "../../presets/products/projectFactory";
import { sizePresetsFor } from "../../presets/sizes/sizePresets";
import type { WeekStart } from "../../types/calendar";
import type { ProductProject } from "../../types/project";
import { Field, NumberField } from "../editor/ui";
import { TechnicalDetails } from "../help/visuals";

const nextYear = new Date().getFullYear() + 1;

type Choice = { sizeId: string; bindingId: string; weekStart: WeekStart; year: number };

/** The project a template makes — the recipe exactly as the book defines it, with the chosen size and dates. */
export function projectFromTemplate(t: RecipePreset, c: Choice, calendar?: { startDate: string; endDate: string }): ProductProject {
  const type = t.productTypes[0];
  const def = PRODUCT_TYPES[type];
  const binding = BINDING_CHOICES.find((b) => b.id === c.bindingId) ?? BINDING_CHOICES.find((b) => b.bindingType === def.defaultBinding)!;
  const b = getBindingProfile(binding.bindingType);
  const profile = PRINT_PROFILES.find((p) => p.id === def.defaultPrintProfile && p.bindingRules.supported.includes(binding.bindingType)) ?? PRINT_PROFILES.find((p) => p.bindingRules.supported.includes(binding.bindingType))!;
  const size = sizePresetsFor(type).find((s) => s.id === c.sizeId);
  return createProject(type, {
    name: `${size?.label ?? c.sizeId} ${t.label}`,
    dimensions: { sizePresetId: c.sizeId, orientation: size?.defaultOrientation ?? "portrait" },
    production: { bindingType: binding.bindingType, boundEdge: binding.boundEdge ?? b.defaultBoundEdge ?? undefined, printProfileId: profile.id, includeBleed: false, duplex: b.boundEdgeMode === "book-spine" },
    recipe: t.build({ count: 1, sheets: 1 }),
    calendar: { startDate: calendar?.startDate ?? `${c.year}-01-01`, endDate: calendar?.endDate ?? `${c.year}-12-31`, weekStart: c.weekStart, sixRowMonths: true },
    layoutOptions: t.layoutOptions,
  });
}

/** Page indices to preview: the first page of each listed layout (`layout#1` = the right-hand page of its spread). */
export function previewPages(doc: ResolvedDocument, keys: string[]): number[] {
  return keys
    .map((k) => {
      const [layoutId, part] = k.split("#");
      return doc.recipe.pages.findIndex((p) => !p.filler && p.layoutId === layoutId && (part == null || p.spreadPart === +part));
    })
    .filter((i) => i >= 0);
}

/** One page drawn by the real renderer, scaled to `heightPx`. */
export function PageThumb({ doc, index, heightPx }: { doc: ResolvedDocument; index: number; heightPx: number }) {
  const page = doc.recipe.pages[index];
  const g = geometryFor(doc, page);
  const solved = useMemo(() => solvePage(doc, index), [doc, index]);
  const scale = heightPx / (g.mediaHeightIn * CSS_PX_PER_IN);
  return (
    <div className="page-thumb" style={{ width: g.mediaWidthIn * CSS_PX_PER_IN * scale, height: heightPx }} data-trim={`${doc.trim.widthIn}x${doc.trim.heightIn}`}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", width: g.mediaWidthIn * CSS_PX_PER_IN }}>
        <PrintablePage geometry={g} solved={solved} colors={doc.colors} typography={doc.typography} decorative={doc.decorative} background={doc.background} spacing={doc.spacing} mode="print" />
      </div>
    </div>
  );
}

/** A month is enough to show every page a template makes (and resolves in milliseconds). */
function previewDoc(t: RecipePreset, c: Choice): { doc?: ResolvedDocument; problem?: string } {
  try {
    const doc = resolveDocument(projectFromTemplate(t, c, { startDate: `${c.year}-01-01`, endDate: `${c.year}-01-31` }));
    const ids = new Set(t.template!.preview.map((k) => k.split("#")[0]));
    const bad = layoutAvailability(doc).find((a) => ids.has(a.layoutId) && !a.fit.ok);
    return { doc, problem: bad && !bad.fit.ok ? bad.fit.reason : undefined };
  } catch (e) {
    return { problem: String(e instanceof Error ? e.message : e) };
  }
}

export function BookTemplates({ onCreate, focusId }: { onCreate: (p: ProductProject) => void; focusId?: string }) {
  const [viewing, setViewing] = useState<string | null>(focusId && BOOK_TEMPLATES.some((t) => t.id === focusId) ? focusId : null);
  const def = PRODUCT_TYPES.planner;
  const [choice, setChoice] = useState<Choice>({ sizeId: def.suggestedSizes[0], bindingId: "coil", weekStart: 1, year: nextYear });
  const cards = useMemo(() => BOOK_TEMPLATES.map((t) => ({ t, ...previewDoc(t, { sizeId: def.suggestedSizes[0], bindingId: "coil", weekStart: 1, year: nextYear }) })), []);
  const t = BOOK_TEMPLATES.find((x) => x.id === viewing);
  const view = useMemo(() => (t ? previewDoc(t, choice) : null), [t, choice]);
  const viewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (viewing) viewRef.current?.scrollIntoView({ block: "start" });
  }, [viewing]);

  const sizes = sizePresetsFor("planner").filter((s) => s.families.includes("planner"));
  const bindings = BINDING_CHOICES.filter((c) => def.allowedBindings.includes(c.bindingType));

  return (
    <>
      <h2 id="wizard-books">Full planners &amp; books</h2>
      <p className="hint">Start with a complete product — every month, week and day is already arranged. You can change anything after.</p>
      <div className="card-grid book-templates">
        {cards.map(({ t, doc }) => (
          <div key={t.id} className="card book-card" data-template={t.id}>
            <div className="book-card-preview" aria-hidden>
              {doc && previewPages(doc, t.template!.card ?? t.template!.preview.slice(0, 2)).map((i) => <PageThumb key={i} doc={doc} index={i} heightPx={150} />)}
            </div>
            <h3>{t.label}</h3>
            <p>{t.template!.summary}</p>
            <div className="card-actions">
              <button type="button" className="btn" aria-pressed={viewing === t.id} onClick={() => setViewing(t.id)}>View template</button>
            </div>
          </div>
        ))}
      </div>

      {t && view && (
        <div className="card book-view" ref={viewRef} role="region" aria-label={t.label}>
          <div className="row">
            <h3 style={{ flex: 1 }}>{t.label}</h3>
            <button type="button" className="btn btn--ghost" onClick={() => setViewing(null)}>Close</button>
          </div>
          <p>{t.template!.summary}</p>
          <div className="row book-view-controls">
            <Field label="Page size">
              <select value={choice.sizeId} onChange={(e) => setChoice({ ...choice, sizeId: e.target.value })}>
                {sizes.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Binding">
              <select value={choice.bindingId} onChange={(e) => setChoice({ ...choice, bindingId: e.target.value })}>
                {bindings.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
            </Field>
            <NumberField label="Year" step={1} value={choice.year} onChange={(y) => setChoice({ ...choice, year: Math.round(y) })} />
            <Field label="Week starts">
              <select value={choice.weekStart} onChange={(e) => setChoice({ ...choice, weekStart: +e.target.value as WeekStart })}>
                <option value={1}>Monday</option>
                <option value={0}>Sunday</option>
              </select>
            </Field>
          </div>
          {view.doc && (
            <div className="book-view-pages">
              {previewPages(view.doc, t.template!.preview).map((i) => <PageThumb key={i} doc={view.doc!} index={i} heightPx={320} />)}
            </div>
          )}
          {view.problem && (
            <div className="issue issue--error">
              <div className="issue-title">This template doesn't have enough room at this size.</div>
              <div className="issue-advice">Choose a larger page size.</div>
              <TechnicalDetails label="Show details">{view.problem}</TechnicalDetails>
            </div>
          )}
          <button type="button" className="btn btn--primary" style={{ justifySelf: "start" }} disabled={!!view.problem} onClick={() => onCreate(projectFromTemplate(t, choice))}>
            Use this template
          </button>
        </div>
      )}
    </>
  );
}
