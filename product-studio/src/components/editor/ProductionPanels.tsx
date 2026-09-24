import { BINDING_CHOICES, getBindingProfile } from "../../presets/bindingProfiles/bindingProfiles";
import { PRINT_PROFILES } from "../../presets/printProfiles/printProfiles";
import { PRODUCT_TYPES } from "../../presets/products/productTypes";
import { STUDIO_PAD } from "../../presets/studioDefaults";
import { CUSTOM_SIZE_ID, sizePresetsFor } from "../../presets/sizes/sizePresets";
import { LAYOUTS } from "../../layouts/registry";
import type { Edge, LogicalEdge } from "../../types/geometry";
import type { ProductProject } from "../../types/project";
import type { RecipeItem, RepeatRule } from "../../types/recipe";
import { newId } from "../../presets/products/projectFactory";
import { Check, Field, NumberField, Section, Segmented, Select } from "./ui";

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

export function ProductionPanel({ project, update }: PanelProps) {
  const prod = project.production;
  const binding = getBindingProfile(prod.bindingType);
  const set = (patch: Partial<ProductProject["production"]>) => update((p) => ({ ...p, production: { ...p.production, ...patch } }));
  const allowed = PRODUCT_TYPES[project.productType].allowedBindings;
  const choices = BINDING_CHOICES.filter((c) => allowed.includes(c.bindingType));
  const choiceId = choices.find((c) => c.bindingType === prod.bindingType && (!c.boundEdge || c.boundEdge === prod.boundEdge || (c.boundEdge === "left" && prod.boundEdge !== "top")))?.id ?? choices[0]?.id;
  const profiles = PRINT_PROFILES.filter((p) => p.bindingRules.supported.includes(prod.bindingType));
  const setMargin = (edge: LogicalEdge, v: number | undefined) =>
    set({ userMargins: { ...(prod.userMargins ?? {}), [edge]: v } });

  return (
    <Section title="Binding & printer" open>
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
      {binding.allowedBoundEdges.length > 1 && (
        <Segmented
          label={binding.boundEdgeMode === "glued-edge" ? "Glue edge" : "Bound edge"}
          value={prod.boundEdge ?? binding.defaultBoundEdge ?? "left"}
          options={binding.allowedBoundEdges.map((e) => ({ value: e, label: EDGE_LABEL[e] }))}
          onChange={(boundEdge) => set({ boundEdge })}
        />
      )}
      <Select label="Printer profile" value={prod.printProfileId} options={profiles.map((p) => ({ value: p.id, label: p.label }))} onChange={(printProfileId) => set({ printProfileId })} />
      <p className="hint">{PRINT_PROFILES.find((p) => p.id === prod.printProfileId)?.description}</p>
      <Check label="Include bleed" checked={prod.includeBleed} onChange={(includeBleed) => set({ includeBleed })} />
      {binding.boundEdgeMode === "punched-leaf" && <Check label="Printed double-sided (back mirrors punched edge)" checked={prod.duplex} onChange={(duplex) => set({ duplex })} />}
      {binding.sheetCountIsMetadata && (
        <Field label="Sheets per pad (manufacturing metadata)">
          <select value={String(prod.sheetsPerPad ?? STUDIO_PAD.defaultSheets)} onChange={(e) => {
            const sheetsPerPad = +e.target.value;
            update((p) => ({
              ...p,
              production: { ...p.production, sheetsPerPad },
              recipe: { ...p.recipe, items: p.recipe.items.map((it) => (it.repeat.kind === "repeated-sheet" ? { ...it, repeat: { kind: "repeated-sheet", sheets: sheetsPerPad } } : it)) },
            }));
          }}>
            {[...STUDIO_PAD.sheetOptions, STUDIO_PAD.deskPadSheets].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n} sheets</option>)}
          </select>
        </Field>
      )}
      <div className="field-label">Margins (blank = studio default; never below required)</div>
      <div className="row">
        {(["top", "bottom", "inside", "outside"] as LogicalEdge[]).map((e) => (
          <Field key={e} label={e}>
            <input
              type="number"
              inputMode="decimal"
              step={0.05}
              placeholder="auto"
              value={prod.userMargins?.[e] ?? ""}
              onChange={(ev) => setMargin(e, ev.target.value === "" ? undefined : parseFloat(ev.target.value))}
            />
          </Field>
        ))}
      </div>
    </Section>
  );
}

const REPEAT_KINDS: { value: RepeatRule["kind"]; label: string }[] = [
  { value: "once", label: "Once" },
  { value: "count", label: "Copies" },
  { value: "every-year", label: "Every year" },
  { value: "every-quarter", label: "Every quarter" },
  { value: "every-month", label: "Every month" },
  { value: "every-week", label: "Every week" },
  { value: "every-day", label: "Every day" },
  { value: "repeated-sheet", label: "Repeated sheet" },
];

function repeatFor(kind: RepeatRule["kind"], prev: RepeatRule, sheets: number): RepeatRule {
  if (kind === "count") return { kind, count: prev.kind === "count" ? prev.count : 10 };
  if (kind === "repeated-sheet") return { kind, sheets };
  return { kind } as RepeatRule;
}

export function PagesPanel({ project, update, pageCount }: PanelProps & { pageCount: number }) {
  const items = project.recipe.items;
  const setItems = (next: RecipeItem[]) => update((p) => ({ ...p, recipe: { ...p.recipe, items: next } }));
  const cal = project.calendar;
  const setCal = (patch: Partial<NonNullable<ProductProject["calendar"]>>) =>
    update((p) => ({ ...p, calendar: { ...(p.calendar ?? { startDate: "2027-01-01", endDate: "2027-12-31", weekStart: 1, sixRowMonths: true }), ...patch } }));
  const sheets = project.production.sheetsPerPad ?? STUDIO_PAD.defaultSheets;

  return (
    <Section title={`Pages & dates · ${pageCount} page${pageCount === 1 ? "" : "s"}`}>
      {items.map((it, i) => (
        <div key={it.id} className="card">
          <Select label={`Step ${i + 1} layout`} value={it.layoutId} options={LAYOUTS.map((l) => ({ value: l.id, label: l.label }))} onChange={(layoutId) => setItems(items.map((x) => (x.id === it.id ? { ...x, layoutId } : x)))} />
          <div className="row">
            <Select label="Repeat" value={it.repeat.kind} options={REPEAT_KINDS} onChange={(kind) => setItems(items.map((x) => (x.id === it.id ? { ...x, repeat: repeatFor(kind, x.repeat, sheets) } : x)))} />
            {it.repeat.kind === "count" && (
              <NumberField label="Copies" step={1} min={1} value={it.repeat.count} onChange={(count) => setItems(items.map((x) => (x.id === it.id ? { ...x, repeat: { kind: "count", count: Math.max(1, Math.round(count)) } } : x)))} />
            )}
          </div>
          <div className="card-actions">
            <button className="btn" disabled={i === 0} onClick={() => setItems(items.map((x, k) => (k === i - 1 ? it : k === i ? items[i - 1] : x)))}>Move up</button>
            <button className="btn btn--danger" onClick={() => setItems(items.filter((x) => x.id !== it.id))}>Remove</button>
          </div>
        </div>
      ))}
      <button className="btn" onClick={() => setItems([...items, { id: newId("r"), layoutId: "notes-page", repeat: { kind: "count", count: 1 } }])}>Add page step</button>
      <Segmented
        label="Page order"
        value={project.recipe.ordering}
        options={[{ value: "chronological", label: "Chronological" }, { value: "sequential", label: "As listed" }]}
        onChange={(ordering) => update((p) => ({ ...p, recipe: { ...p.recipe, ordering } }))}
      />
      <div className="field-label">Date range</div>
      <div className="row">
        <Field label="Start">
          <input type="date" value={cal?.startDate ?? ""} onChange={(e) => e.target.value && setCal({ startDate: e.target.value })} />
        </Field>
        <Field label="End">
          <input type="date" value={cal?.endDate ?? ""} onChange={(e) => e.target.value && setCal({ endDate: e.target.value })} />
        </Field>
      </div>
      <Segmented label="Week starts" value={String(cal?.weekStart ?? 1) as "0" | "1"} options={[{ value: "0", label: "Sunday" }, { value: "1", label: "Monday" }]} onChange={(v) => setCal({ weekStart: v === "0" ? 0 : 1 })} />
      <Check label="Six-row month grids (universal)" checked={cal?.sixRowMonths ?? true} onChange={(sixRowMonths) => setCal({ sixRowMonths })} />
    </Section>
  );
}
