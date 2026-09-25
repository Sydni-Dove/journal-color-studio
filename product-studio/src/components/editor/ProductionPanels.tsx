import { layoutAvailability, type ResolvedDocument } from "../../engines/document/resolve";
import type { ProjectUsage } from "../../engines/document/usage";
import { getLayout } from "../../layouts/registry";
import { BINDING_CHOICES, getBindingProfile } from "../../presets/bindingProfiles/bindingProfiles";
import { PRINT_PROFILES } from "../../presets/printProfiles/printProfiles";
import { newId } from "../../presets/products/projectFactory";
import { PRODUCT_TYPES } from "../../presets/products/productTypes";
import { CUSTOM_SIZE_ID, sizePresetsFor } from "../../presets/sizes/sizePresets";
import { STUDIO_PAD } from "../../presets/studioDefaults";
import type { Edge, LogicalEdge } from "../../types/geometry";
import type { ProductProject } from "../../types/project";
import type { RecipeItem, RepeatRule } from "../../types/recipe";
import { Check, Field, LabeledNumeric, NumberField, Section, Segmented, Select, type EditorNav } from "./ui";

/** Upper bound for a user margin entry (inches); larger values leave no usable page. */
const MAX_USER_MARGIN_IN = 3;
import { representativeGeometry } from "../../engines/document/resolve";

type Update = (fn: (p: ProductProject) => ProductProject) => void;
type PanelProps = { project: ProductProject; update: Update };

export function ProductPanel({ project, update }: PanelProps) {
  const d = project.dimensions;
  const set = (patch: Partial<ProductProject["dimensions"]>) => update((p) => ({ ...p, dimensions: { ...p.dimensions, ...patch } }));
  return (
    <Section title="Size" open>
      <p className="hint">{PRODUCT_TYPES[project.productType].label} — {PRODUCT_TYPES[project.productType].description}</p>
      <Select
        label="Trim size"
        value={d.sizePresetId}
        options={[...sizePresetsFor(project.productType).map((s) => ({ value: s.id, label: s.label })), { value: CUSTOM_SIZE_ID, label: "Custom…" }]}
        onChange={(sizePresetId) => set({ sizePresetId, custom: sizePresetId === CUSTOM_SIZE_ID ? d.custom ?? { width: 6, height: 9, unit: "in" } : d.custom })}
      />
      {d.sizePresetId === CUSTOM_SIZE_ID && d.custom && (
        <div className="row">
          <NumberField label="Width" value={d.custom.width} onChange={(width) => set({ custom: { ...d.custom!, width } })} />
          <NumberField label="Height" value={d.custom.height} onChange={(height) => set({ custom: { ...d.custom!, height } })} />
          <Select label="Unit" value={d.custom.unit} options={[{ value: "in", label: "in" }, { value: "mm", label: "mm" }]} onChange={(unit) => set({ custom: { ...d.custom!, unit } })} />
        </div>
      )}
      <Segmented label="Orientation" value={d.orientation} options={[{ value: "portrait", label: "Portrait" }, { value: "landscape", label: "Landscape" }]} onChange={(orientation) => set({ orientation })} />
    </Section>
  );
}

const EDGE_LABEL: Record<Edge, string> = { top: "Top", bottom: "Bottom", left: "Left", right: "Right" };

export function ProductionPanel({ project, update, doc, nav }: PanelProps & { doc: ResolvedDocument | null; nav: EditorNav | null }) {
  const prod = project.production;
  const binding = getBindingProfile(prod.bindingType);
  const set = (patch: Partial<ProductProject["production"]>) => update((p) => ({ ...p, production: { ...p.production, ...patch } }));
  const allowed = PRODUCT_TYPES[project.productType].allowedBindings;
  const choices = BINDING_CHOICES.filter((c) => allowed.includes(c.bindingType));
  const choiceId = choices.find((c) => c.bindingType === prod.bindingType && (!c.boundEdge || c.boundEdge === prod.boundEdge || (c.boundEdge === "left" && prod.boundEdge !== "top")))?.id ?? choices[0]?.id;
  const profiles = PRINT_PROFILES.filter((p) => p.bindingRules.supported.includes(prod.bindingType));
  const setMargin = (edge: LogicalEdge, v: number | undefined) => set({ userMargins: { ...(prod.userMargins ?? {}), [edge]: v } });

  return (
    <Section title="Binding & printer" open>
      {choices.length > 1 && (
        <Select
          label="Binding"
          value={choiceId}
          options={choices.map((c) => ({ value: c.id, label: c.label }))}
          onChange={(id) => {
            const c = BINDING_CHOICES.find((x) => x.id === id)!;
            const b = getBindingProfile(c.bindingType);
            const profile = PRINT_PROFILES.find((pp) => pp.id === prod.printProfileId && pp.bindingRules.supported.includes(c.bindingType)) ?? PRINT_PROFILES.find((pp) => pp.bindingRules.supported.includes(c.bindingType))!;
            set({ bindingType: c.bindingType, boundEdge: c.boundEdge ?? b.defaultBoundEdge ?? undefined, printProfileId: profile.id });
          }}
        />
      )}
      {binding.allowedBoundEdges.length > 1 && (
        <Segmented
          label={binding.boundEdgeMode === "glued-edge" ? "Glue edge" : "Bound edge"}
          value={prod.boundEdge ?? binding.defaultBoundEdge ?? "left"}
          options={binding.allowedBoundEdges.map((e) => ({ value: e, label: EDGE_LABEL[e] }))}
          onChange={(boundEdge) => set({ boundEdge })}
        />
      )}
      {profiles.length > 1 ? (
        <Select label="Printer profile" value={prod.printProfileId} options={profiles.map((p) => ({ value: p.id, label: p.label }))} onChange={(printProfileId) => set({ printProfileId })} />
      ) : (
        <p className="hint">Printer: {profiles[0]?.label}</p>
      )}
      <p className="hint">{PRINT_PROFILES.find((p) => p.id === prod.printProfileId)?.description}</p>
      {doc && <RequirementSummary doc={doc} />}
      {prod.bindingType === "case-bound" && <p className="hint">Case binding shares the perfect-bound interior geometry; it changes printer compatibility (validated) and the cover.</p>}
      <Check label="Include bleed" checked={prod.includeBleed} onChange={(includeBleed) => set({ includeBleed })} />
      {binding.boundEdgeMode === "punched-leaf" && (
        <>
          <Check label="Printed double-sided (back mirrors punched edge)" checked={prod.duplex} onChange={(duplex) => set({ duplex })} />
          <p className="hint">
            Changes the back (left-hand) pages: the punched-edge margin moves to the right.
            {nav && prod.duplex && (
              <>
                {" "}
                <button type="button" className="btn btn--ghost" style={{ minHeight: 44, padding: "0 10px" }} onClick={() => nav.goToSide("verso")}>Show a back page</button>
              </>
            )}
          </p>
        </>
      )}
      {binding.sheetCountIsMetadata && (
        <Field label="Sheets per pad (manufacturing metadata — sets pad count and home-print repeats, not the page design)">
          <select
            value={String(prod.sheetsPerPad ?? STUDIO_PAD.defaultSheets)}
            onChange={(e) => {
              const sheetsPerPad = +e.target.value;
              update((p) => ({
                ...p,
                production: { ...p.production, sheetsPerPad },
                recipe: { ...p.recipe, items: p.recipe.items.map((it) => (it.repeat.kind === "repeated-sheet" ? { ...it, repeat: { kind: "repeated-sheet", sheets: sheetsPerPad } } : it)) },
              }));
            }}
          >
            {[...STUDIO_PAD.sheetOptions, STUDIO_PAD.deskPadSheets].sort((a, b) => a - b).map((n) => (
              <option key={n} value={n}>{n} sheets</option>
            ))}
          </select>
        </Field>
      )}
      <div className="field-label">Margins (blank = studio default; never below required)</div>
      <div className="row">
        {(["top", "bottom", "inside", "outside"] as LogicalEdge[]).map((e) => (
          <LabeledNumeric
            key={e}
            label={e}
            step={0.05}
            placeholder="auto"
            rules={{ min: 0, max: MAX_USER_MARGIN_IN, allowEmpty: true }}
            value={prod.userMargins?.[e]}
            onCommit={(v) => setMargin(e, v ?? undefined)}
          />
        ))}
      </div>
    </Section>
  );
}

const REPEAT_LABELS: Record<RepeatRule["kind"], string> = {
  once: "Once",
  count: "Copies",
  "every-year": "Every year",
  "every-quarter": "Every quarter",
  "every-month": "Every month",
  "every-week": "Every week",
  "every-day": "Every day",
  "repeated-sheet": "Pad master sheet",
};

function repeatFor(kind: RepeatRule["kind"], prev: RepeatRule, sheets: number): RepeatRule {
  if (kind === "count") return { kind, count: prev.kind === "count" ? prev.count : 10 };
  if (kind === "repeated-sheet") return { kind, sheets };
  return { kind } as RepeatRule;
}

/** Repeat rules a layout supports for this product (pads use one master sheet). */
export function repeatsFor(layoutId: string, isPad: boolean): RepeatRule["kind"][] {
  const r = getLayout(layoutId).capability.repeats;
  return isPad ? r.filter((k) => k === "repeated-sheet") : r.filter((k) => k !== "repeated-sheet");
}

const nextYear = new Date().getFullYear() + 1;

export function PagesPanel({ project, update, doc, usage, nav }: PanelProps & { doc: ResolvedDocument; usage: ProjectUsage; nav: EditorNav }) {
  const items = project.recipe.items;
  const isPad = doc.binding.sheetCountIsMetadata;
  const sheets = project.production.sheetsPerPad ?? STUDIO_PAD.defaultSheets;
  const avail = layoutAvailability(doc).filter((a) => a.supportedType);
  const setItems = (next: RecipeItem[]) => update((p) => ({ ...p, recipe: { ...p.recipe, items: next } }));

  const changeLayout = (item: RecipeItem, layoutId: string) =>
    update((p) => {
      const layout = getLayout(layoutId);
      const kinds = repeatsFor(layoutId, isPad);
      const kind = kinds.includes(item.repeat.kind) ? item.repeat.kind : kinds.includes(layout.capability.defaultRepeat) ? layout.capability.defaultRepeat : kinds[0];
      const calendar = layout.capability.requiresCalendar && !p.calendar ? { startDate: `${nextYear}-01-01`, endDate: `${nextYear}-12-31`, weekStart: 1 as const, sixRowMonths: true } : p.calendar;
      return {
        ...p,
        calendar,
        recipe: { ...p.recipe, items: p.recipe.items.map((x) => (x.id === item.id ? { ...x, layoutId, repeat: repeatFor(kind, x.repeat, sheets) } : x)) },
      };
    });

  const cal = project.calendar;
  const setCal = (patch: Partial<NonNullable<ProductProject["calendar"]>>) =>
    update((p) => ({ ...p, calendar: { ...(p.calendar ?? { startDate: `${nextYear}-01-01`, endDate: `${nextYear}-12-31`, weekStart: 1, sixRowMonths: true }), ...patch } }));

  return (
    <Section title={`Pages${isPad ? "" : ` · ${doc.recipe.pageCount} page${doc.recipe.pageCount === 1 ? "" : "s"}`}`} open>
      {items.map((it, i) => {
        const a = avail.find((x) => x.layoutId === it.layoutId);
        const kinds = repeatsFor(it.layoutId, isPad);
        return (
          <div key={it.id} className="card">
            <Field label={isPad ? "Sheet layout" : `Step ${i + 1} layout`}>
              <select value={it.layoutId} onChange={(e) => changeLayout(it, e.target.value)}>
                {avail.map((x) => (
                  <option key={x.layoutId} value={x.layoutId} disabled={!x.fit.ok}>
                    {x.label}
                    {x.fit.ok ? (x.fit.variant !== "standard" ? ` — ${x.fit.variantLabel}` : "") : " — doesn't fit this size"}
                  </option>
                ))}
              </select>
            </Field>
            {a && !a.fit.ok && <div className="issue issue--error">{a.fit.reason}</div>}
            {items.length > 1 && nav.currentLayoutId !== it.layoutId && (
              <button type="button" className="btn btn--ghost" style={{ justifySelf: "start" }} onClick={() => nav.goToItem(it.id)}>Show this step's first page</button>
            )}
            {kinds.length > 1 ? (
              <div className="row">
                <Select label="Repeat" value={it.repeat.kind} options={kinds.map((k) => ({ value: k, label: REPEAT_LABELS[k] }))} onChange={(kind) => setItems(items.map((x) => (x.id === it.id ? { ...x, repeat: repeatFor(kind, x.repeat, sheets) } : x)))} />
                {it.repeat.kind === "count" && (
                  <NumberField label="Copies" step={1} min={1} value={it.repeat.count} onChange={(count) => setItems(items.map((x) => (x.id === it.id ? { ...x, repeat: { kind: "count", count: Math.max(1, Math.round(count)) } } : x)))} />
                )}
              </div>
            ) : (
              <p className="hint">Repeats: {REPEAT_LABELS[kinds[0]]}{it.repeat.kind === "repeated-sheet" ? ` (${sheets} sheets, one master design)` : ""}</p>
            )}
            {!isPad && items.length > 1 && (
              <div className="card-actions">
                <button className="btn" disabled={i === 0} onClick={() => setItems(items.map((x, k) => (k === i - 1 ? it : k === i ? items[i - 1] : x)))}>Move up</button>
                <button className="btn btn--danger" onClick={() => setItems(items.filter((x) => x.id !== it.id))}>Remove</button>
              </div>
            )}
          </div>
        );
      })}
      {!isPad && (
        <button className="btn" onClick={() => setItems([...items, { id: newId("r"), layoutId: "notes-page", repeat: { kind: "count", count: 1 } }])}>Add page step</button>
      )}
      {!isPad && items.length > 1 && usage.calendar && (
        <Segmented
          label="Page order"
          value={project.recipe.ordering}
          options={[{ value: "chronological", label: "Chronological" }, { value: "sequential", label: "As listed" }]}
          onChange={(ordering) => update((p) => ({ ...p, recipe: { ...p.recipe, ordering } }))}
        />
      )}
      {usage.calendar && (
        <>
          <div className="field-label">Date range</div>
          <div className="row">
            <Field label="Start">
              <input type="date" value={cal?.startDate ?? ""} onChange={(e) => e.target.value && setCal({ startDate: e.target.value })} />
            </Field>
            <Field label="End">
              <input type="date" value={cal?.endDate ?? ""} onChange={(e) => e.target.value && setCal({ endDate: e.target.value })} />
            </Field>
          </div>
          {usage.datePlacement && (
            <>
              <Check label="Six-row month grids (universal)" checked={cal?.sixRowMonths ?? true} onChange={(sixRowMonths) => setCal({ sixRowMonths })} />
              <p className="hint">
                Only changes months that need 4 or 5 rows; cell heights then follow the month.
                {(() => {
                  const m = doc.calendar?.months.find((x) => x.naturalRows < 6);
                  return m ? (
                    <>
                      {" "}
                      <button type="button" className="btn btn--ghost" style={{ minHeight: 44, padding: "0 10px" }} onClick={() => nav.goToMonth(m.key)}>Show {m.name}</button>
                    </>
                  ) : null;
                })()}
              </p>
            </>
          )}
        </>
      )}
      {usage.weekStart && (
        <Segmented label="Week starts" value={String(cal?.weekStart ?? 1) as "0" | "1"} options={[{ value: "0", label: "Sunday" }, { value: "1", label: "Monday" }]} onChange={(v) => setCal({ weekStart: v === "0" ? 0 : 1 })} />
      )}
    </Section>
  );
}

/**
 * What the chosen printer + binding actually change. They set REQUIREMENTS
 * (minimum margins, binding keep-out, bleed); the page only moves when a
 * requirement exceeds the margin already in use — this says which case applies.
 */
function RequirementSummary({ doc }: { doc: ResolvedDocument }) {
  const g = representativeGeometry(doc);
  const bleed = doc.printProfile.bleedRules.bleed ? `${doc.printProfile.bleedRules.bleed.value}" (${doc.printProfile.bleedRules.edges})` : "none";
  const binding = g.keepOuts.filter((k) => k.kind !== "glue").map((k) => `${k.label} ${+k.depthIn.toFixed(3)}"`).join(", ");
  const glue = g.keepOuts.filter((k) => k.kind === "glue").map((k) => `${k.label} ${+k.depthIn.toFixed(3)}"`).join(", ");
  const driving = g.margins.filter((m) => m.requiredIn >= m.effectiveIn - 1e-6);
  // Other printers with exactly the same requirements for this product (the choice then records the target printer).
  const sig = (id: string) => {
    const pr = PRINT_PROFILES.find((x) => x.id === id)!;
    return JSON.stringify([pr.safeMargins.noBleed?.value ?? null, pr.safeMargins.withBleed?.value ?? null, pr.bleedRules.bleed?.value ?? null, pr.bleedRules.edges, pr.gutterRules]);
  };
  const twins = PRINT_PROFILES.filter((x) => x.id !== doc.printProfile.id && x.bindingRules.supported.includes(doc.project.production.bindingType) && sig(x.id) === sig(doc.printProfile.id)).map((x) => x.label);
  const ring = doc.project.production.bindingType.startsWith("ring");
  return (
    <div className="hint" data-testid="requirement-summary">
      <p style={{ margin: 0 }}>
        {`On this page: ${g.margins.map((m) => `${m.logicalEdge} ${+m.effectiveIn.toFixed(3)}" (needs ≥ ${+m.requiredIn.toFixed(3)}")`).join(" · ")}. Bleed: ${bleed}.${binding ? ` Binding clearance: ${binding}.` : ""}${glue ? ` Glue zone: ${glue}.` : ""}`}
      </p>
      <p style={{ margin: "4px 0 0" }}>
        {driving.length
          ? `The ${driving.map((m) => m.logicalEdge).join(", ")} margin${driving.length > 1 ? "s are" : " is"} set by this printer/binding requirement — changing them moves the page.`
          : "Every margin already exceeds what this printer and binding require, so switching printer or binding does not move this page; it changes the requirements, keep-out zones, validation and export."}
      </p>
      {twins.length > 0 && <p style={{ margin: "4px 0 0" }}>{`${twins.join(", ")} ${twins.length > 1 ? "have" : "has"} the same requirements for this product — the choice records which printer the file is for.`}</p>}
      {ring && <p style={{ margin: "4px 0 0" }}>6-ring and 7-ring share the same page clearance; the ring count sets the punch pattern (production), not the page.</p>}
    </div>
  );
}
