/**
 * New Product flow: the user makes product decisions; the system solves the
 * geometry. Every step is a choice — nothing is positioned by hand.
 *   Type → Size → Orientation → Binding → Printer → Layout → Spacing →
 *   Theme → Fonts → Dates / sheets / pages → Generate
 */
import { recipeSteps } from "../../engines/recipe/recipe";
import { useEffect, useMemo, useState } from "react";
import type { WizardStart } from "../../presets/products/productFamilies";
import { BINDING_CHOICES, getBindingProfile } from "../../presets/bindingProfiles/bindingProfiles";
import { PRINT_PROFILES } from "../../presets/printProfiles/printProfiles";
import { PRODUCT_TYPES } from "../../presets/products/productTypes";
import { createProject } from "../../presets/products/projectFactory";
import { TEST_PRODUCTS } from "../../presets/products/testProducts";
import { recipePresetsFor } from "../../presets/layouts/recipePresets";
import { CUSTOM_SIZE_ID, sizePresetsFor } from "../../presets/sizes/sizePresets";
import { SPACING_LABELS } from "../../presets/spacing/spacingPresets";
import { STUDIO_PAD } from "../../presets/studioDefaults";
import { PALETTES } from "../../presets/themes/palettes";
import { DEFAULT_FONTS, FONT_CATALOG } from "../../presets/typography/typography";
import type { Orientation } from "../../types/geometry";
import type { ProductType } from "../../types/product";
import type { ProductProject } from "../../types/project";
import type { SpacingDensity } from "../../types/tokens";
import type { WeekStart } from "../../types/calendar";
import { Field, NumberField } from "../editor/ui";
import { layoutAvailability, resolveDocument } from "../../engines/document/resolve";

function Choices<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="choice-row" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" className="choice" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const PRODUCT_ORDER: ProductType[] = ["notepad", "journal", "planner", "deskpad", "notebook", "insert", "worksheet", "tracker"];
const nextYear = new Date().getFullYear() + 1;

export function NewProductWizard({ onCreate, onCancel, start }: { onCreate: (p: ProductProject) => void; onCancel: () => void; start?: WizardStart }) {
  const [type, setType] = useState<ProductType>(start?.type ?? "notepad");
  const def = PRODUCT_TYPES[type];
  const sizes = useMemo(() => sizePresetsFor(type), [type]);
  const [sizeId, setSizeId] = useState(def.suggestedSizes[0]);
  const [custom, setCustom] = useState({ width: 6, height: 9, unit: "in" as "in" | "mm" });
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const bindingChoices = BINDING_CHOICES.filter((c) => def.allowedBindings.includes(c.bindingType));
  const [bindingChoice, setBindingChoice] = useState(bindingChoices[0].id);
  const binding = BINDING_CHOICES.find((b) => b.id === bindingChoice) ?? bindingChoices[0];
  const profiles = PRINT_PROFILES.filter((p) => p.bindingRules.supported.includes(binding.bindingType));
  const [profileId, setProfileId] = useState(def.defaultPrintProfile);
  const recipes = recipePresetsFor(type);
  const [recipeId, setRecipeId] = useState(start?.recipeId && recipes.some((r) => r.id === start.recipeId) ? start.recipeId : recipes[0].id);
  const recipe = recipes.find((r) => r.id === recipeId) ?? recipes[0];
  const [density, setDensity] = useState<SpacingDensity>("balanced");
  const [paletteId, setPaletteId] = useState(PALETTES[0].id);
  const [heading, setHeading] = useState(DEFAULT_FONTS.headings);
  const [sheets, setSheets] = useState<number>(type === "deskpad" ? STUDIO_PAD.deskPadSheets : STUDIO_PAD.defaultSheets);
  const [count, setCount] = useState(120);
  const [year, setYear] = useState(nextYear);
  const [weekStart, setWeekStart] = useState<WeekStart>(1);
  const [name, setName] = useState("");

  const pickType = (t: ProductType) => {
    const d = PRODUCT_TYPES[t];
    setType(t);
    setSizeId(d.suggestedSizes[0]);
    const sp = sizePresetsFor(t).find((s) => s.id === d.suggestedSizes[0]);
    setOrientation(sp?.defaultOrientation ?? "portrait");
    const bc = BINDING_CHOICES.filter((c) => d.allowedBindings.includes(c.bindingType));
    const preferred = bc.find((c) => c.bindingType === d.defaultBinding) ?? bc[0];
    setBindingChoice(preferred.id);
    setProfileId(d.defaultPrintProfile);
    setRecipeId(recipePresetsFor(t)[0].id);
    setSheets(t === "deskpad" ? STUDIO_PAD.deskPadSheets : STUDIO_PAD.defaultSheets);
  };

  // Arriving from a product family / quick action: apply its type's defaults, its page structure, and scroll to the step.
  useEffect(() => {
    if (start?.type) {
      pickType(start.type);
      if (start.recipeId) setRecipeId(start.recipeId);
    }
    const target = start?.section === "templates" ? "wizard-templates" : start?.section === "build" ? "wizard-build" : null;
    if (target) document.getElementById(target)?.scrollIntoView({ block: "start" });
  }, []);

  const pickBinding = (id: string) => {
    setBindingChoice(id);
    const b = BINDING_CHOICES.find((x) => x.id === id)!;
    if (!PRINT_PROFILES.find((p) => p.id === profileId)?.bindingRules.supported.includes(b.bindingType)) {
      setProfileId(PRINT_PROFILES.find((p) => p.bindingRules.supported.includes(b.bindingType))!.id);
    }
  };

  const isPad = getBindingProfile(binding.bindingType).sheetCountIsMetadata;

  // Which layouts fit the chosen size + binding (same fit() the editor uses).
  const fitById = useMemo(() => {
    try {
      const b = getBindingProfile(binding.bindingType);
      const probe = createProject(type, {
        dimensions: { sizePresetId: sizeId, custom: sizeId === CUSTOM_SIZE_ID ? custom : undefined, orientation },
        production: { bindingType: binding.bindingType, boundEdge: binding.boundEdge ?? b.defaultBoundEdge ?? undefined, printProfileId: profileId, duplex: b.boundEdgeMode === "book-spine" },
        spacing: { density, overrides: {} },
        layoutOptions: recipe.layoutOptions,
      });
      return new Map(layoutAvailability(resolveDocument(probe)).map((a) => [a.layoutId, a.fit]));
    } catch {
      return new Map();
    }
  }, [type, sizeId, custom, orientation, binding, profileId, density, recipe]);
  const recipeFit = (r: (typeof recipes)[number]) => {
    const ids = recipeSteps(r.build({ count: 1, sheets: 1 })).map((i) => i.layoutId);
    const bad = ids.map((id) => fitById.get(id)).find((f) => f && !f.ok);
    return bad && !bad.ok ? bad.reason : null;
  };
  const recipeProblem = recipeFit(recipe);
  const needsCount = recipe.id === "journal-lined" || recipe.id === "planner-monthly-weekly";

  const generate = () => {
    const sizeLabel = sizeId === CUSTOM_SIZE_ID ? `${custom.width}×${custom.height}${custom.unit}` : sizes.find((s) => s.id === sizeId)?.label ?? sizeId;
    const b = getBindingProfile(binding.bindingType);
    const project = createProject(type, {
      name: name.trim() || `${sizeLabel} ${recipe.label} ${def.label}`,
      dimensions: { sizePresetId: sizeId, custom: sizeId === CUSTOM_SIZE_ID ? custom : undefined, orientation },
      production: {
        bindingType: binding.bindingType,
        boundEdge: binding.boundEdge ?? b.defaultBoundEdge ?? undefined,
        printProfileId: profileId,
        includeBleed: false,
        duplex: b.boundEdgeMode === "book-spine",
        sheetsPerPad: isPad ? sheets : undefined,
      },
      recipe: recipe.build({ count: needsCount ? (recipe.id === "planner-monthly-weekly" ? 10 : count) : count, sheets }),
      calendar: recipe.needsCalendar ? { startDate: `${year}-01-01`, endDate: `${year}-12-31`, weekStart, sixRowMonths: true } : undefined,
      spacing: { density, overrides: {} },
      colors: { paletteId, overrides: {} },
      typography: { fonts: { ...DEFAULT_FONTS, headings: heading, accent: heading }, roleOverrides: {} },
      layoutOptions: recipe.layoutOptions,
    });
    onCreate(project);
  };

  return (
    <div className="page-shell">
      <div className="row">
        <h1 style={{ flex: 1 }}>New product</h1>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
      <p className="lede">You decide the product. Product Studio solves the geometry.</p>

      <h2 id="wizard-templates">Starter templates</h2>
      <div className="card-grid">
        {TEST_PRODUCTS.map((t) => (
          <button key={t.id} className="card card--pick" onClick={() => onCreate(t.build())}>
            <h3>{t.label}</h3>
            <p>{t.summary}</p>
          </button>
        ))}
      </div>

      <h2 id="wizard-build">Build your own</h2>
      <div className="wizard">
        <section className="step">
          <h3>1 · Product</h3>
          <Choices value={type} options={PRODUCT_ORDER.map((t) => ({ value: t, label: PRODUCT_TYPES[t].label }))} onChange={pickType} />
          <p className="hint">{def.description}</p>
        </section>

        <section className="step">
          <h3>2 · Size & orientation</h3>
          <Field label="Trim size">
            <select value={sizeId} onChange={(e) => {
              setSizeId(e.target.value);
              const sp = sizes.find((s) => s.id === e.target.value);
              if (sp) setOrientation(sp.defaultOrientation);
            }}>
              {sizes.map((s) => (
                <option key={s.id} value={s.id}>{s.label}{s.families.includes(type) ? "" : " ·"}</option>
              ))}
              <option value={CUSTOM_SIZE_ID}>Custom…</option>
            </select>
          </Field>
          {sizeId === CUSTOM_SIZE_ID && (
            <div className="row">
              <NumberField label="Width" value={custom.width} onChange={(width) => setCustom({ ...custom, width })} />
              <NumberField label="Height" value={custom.height} onChange={(height) => setCustom({ ...custom, height })} />
              <Field label="Unit">
                <select value={custom.unit} onChange={(e) => setCustom({ ...custom, unit: e.target.value as "in" | "mm" })}>
                  <option value="in">in</option>
                  <option value="mm">mm</option>
                </select>
              </Field>
            </div>
          )}
          <Choices value={orientation} options={[{ value: "portrait", label: "Portrait" }, { value: "landscape", label: "Landscape" }]} onChange={setOrientation} />
        </section>

        <section className="step">
          <h3>3 · Binding & printer</h3>
          <Choices value={bindingChoice} options={bindingChoices.map((c) => ({ value: c.id, label: c.label }))} onChange={pickBinding} />
          <Field label="Printer profile">
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </Field>
        </section>

        <section className="step">
          <h3>4 · Layout</h3>
          <div className="choice-row" role="group">
            {recipes.map((r) => {
              const problem = recipeFit(r);
              return (
                <button key={r.id} type="button" className="choice" aria-pressed={r.id === recipeId} disabled={!!problem} title={problem ?? undefined} onClick={() => setRecipeId(r.id)}>
                  {r.label}
                  {problem ? " (doesn't fit this size)" : ""}
                </button>
              );
            })}
          </div>
          {recipeProblem && <div className="issue issue--error">{recipeProblem}</div>}
          {recipe.needsCalendar && (
            <div className="row">
              <NumberField label="Year" step={1} value={year} onChange={(y) => setYear(Math.round(y))} />
              <Field label="Week starts">
                <select value={weekStart} onChange={(e) => setWeekStart(+e.target.value as WeekStart)}>
                  <option value={1}>Monday</option>
                  <option value={0}>Sunday</option>
                </select>
              </Field>
            </div>
          )}
          {recipe.id === "journal-lined" && <NumberField label="Pages" step={1} min={1} value={count} onChange={(c) => setCount(Math.max(1, Math.round(c)))} />}
          {isPad && (
            <Field label="Sheets per pad">
              <select value={sheets} onChange={(e) => setSheets(+e.target.value)}>
                {[...STUDIO_PAD.sheetOptions, STUDIO_PAD.deskPadSheets].sort((a, b) => a - b).map((n) => (
                  <option key={n} value={n}>{n} sheets</option>
                ))}
              </select>
            </Field>
          )}
        </section>

        <section className="step">
          <h3>5 · Look</h3>
          <Choices value={density} options={(Object.keys(SPACING_LABELS) as SpacingDensity[]).map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }))} onChange={setDensity} />
          <Field label="Colors">
            <select value={paletteId} onChange={(e) => setPaletteId(e.target.value)}>
              {PALETTES.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Heading font">
            <select value={heading} onChange={(e) => setHeading(e.target.value)}>
              {FONT_CATALOG.filter((f) => f.category === "serif" || f.category === "display" || f.category === "sans-serif").map((f) => (
                <option key={f.family} value={f.family}>{f.family}</option>
              ))}
            </select>
          </Field>
        </section>

        <section className="step">
          <h3>6 · Generate</h3>
          <Field label="Project name (optional)">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Prayer Journal — Burgundy" />
          </Field>
          <button className="btn btn--primary" onClick={generate} disabled={!!recipeProblem} style={{ justifySelf: "start" }}>
            Generate
          </button>
        </section>
      </div>
    </div>
  );
}
