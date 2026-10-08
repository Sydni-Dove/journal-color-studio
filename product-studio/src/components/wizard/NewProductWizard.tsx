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
import { section, step } from "../../presets/bookRecipes";
import type { ProductRecipe } from "../../types/recipe";
import { LayoutThumbnail } from "../preview/LayoutThumbnail";

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

const PRODUCT_ORDER: ProductType[] = ["planner", "journal", "notepad", "deskpad", "notebook", "insert", "worksheet", "tracker", "custom"];
const PAGE_LAYOUTS: Record<string, { id: string; label: string; detail: string }[]> = {
  "notepad-todo": [{ id: "notepad-todo", label: "To-do sheet", detail: "One repeated master sheet with checklist rows." }],
  "notepad-grocery": [{ id: "notepad-grocery", label: "Grocery list", detail: "One repeated master sheet with list sections." }],
  "notepad-lined": [{ id: "notes-page", label: "Writing sheet", detail: "One repeated sheet for open notes." }],
  "planner-monthly": [{ id: "planner-monthly", label: "Monthly calendar", detail: "One dated calendar page each month." }],
  "planner-weekly": [
    { id: "planner-weekly-spread", label: "Classic Weekly — day columns", detail: "Two pages; automatically uses day rows when columns cannot fit." },
    { id: "planner-weekly-writing-spread", label: "Classic Weekly — day rows", detail: "Two pages; full-width writing space for each day." },
  ],
  "planner-daily": [{ id: "planner-daily", label: "Daily schedule", detail: "One dated page per day with schedule and task areas." }],
  "journal-lined": [{ id: "journal-lined", label: "Full-page writing", detail: "Choose ruled, blank, dot or graph writing space in the editor." }],
  "journal-guided": [{ id: "guided-page", label: "Guided journal", detail: "A titled page with editable guided writing sections." }],
  "worksheet-guided": [{ id: "guided-page", label: "Guided worksheet", detail: "One page with editable prompt and response sections." }],
  "tracker-weekly": [{ id: "tracker-weekly", label: "Weekly tracker grid", detail: "Editable item rows with seven check boxes each." }],
  "custom-guided": [{ id: "guided-page", label: "Custom guided page", detail: "Start with editable sections; add or reorder pages later." }],
  "deskpad-weekly": [{ id: "deskpad-weekly", label: "Weekly desk pad", detail: "One large repeated master sheet." }],
};
const WEEKLY_EXTRAS = [
  { id: "notes", label: "Notes page", module: "notes" },
  { id: "reflection", label: "Guided reflection page", module: "reflection" },
  { id: "meeting-with-god", label: "Meeting With God page", module: "meeting-with-god" },
] as const;
export function weeklyRecipeWithExtras(layoutId: string, extras: string[]): ProductRecipe {
  const weekly = step("weekly-planner", { type: "once" }, { layoutId });
  let previousId = weekly.id;
  const additions = WEEKLY_EXTRAS.filter((x) => extras.includes(x.id)).map((x) => {
    const next = step(x.module, { type: "after-module", moduleId: previousId });
    previousId = next.id;
    return next;
  });
  return { items: [], ordering: "chronological", structure: [section("Every Week", [weekly, ...additions], "week")] };
}
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
  const preparedBooks = recipes.filter((r) => r.id.startsWith("book-") || r.id === "planner-monthly-weekly");
  const pageRecipes = recipes.filter((r) => !preparedBooks.includes(r));
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [weeklyExtras, setWeeklyExtras] = useState<string[]>([]);
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
    setLayoutId(null);
    setWeeklyExtras([]);
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
  const thumbnailProject = useMemo(() => createProject(type, {
    dimensions: { sizePresetId: sizeId, custom: sizeId === CUSTOM_SIZE_ID ? custom : undefined, orientation },
    production: { bindingType: binding.bindingType, boundEdge: binding.boundEdge, printProfileId: profileId, duplex: getBindingProfile(binding.bindingType).boundEdgeMode === "book-spine" },
    spacing: { density, overrides: {} }, colors: { paletteId, overrides: {} },
    typography: { fonts: { ...DEFAULT_FONTS, headings: heading, accent: heading }, roleOverrides: {} },
    layoutOptions: recipe.layoutOptions,
  }), [type, sizeId, custom, orientation, binding, profileId, density, paletteId, heading, recipe]);

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
  const recipeFit = (r: (typeof recipes)[number], chosenLayout?: string | null) => {
    const ids = recipeSteps(r.build({ count: 1, sheets: 1 })).map((i) => r.id === recipeId && chosenLayout && r.id === "planner-weekly" ? chosenLayout : i.layoutId);
    const bad = ids.map((id) => fitById.get(id)).find((f) => f && !f.ok);
    return bad && !bad.ok ? bad.reason : null;
  };
  const recipeProblem = recipeFit(recipe, layoutId);
  const needsCount = recipe.id === "journal-lined" || recipe.id === "journal-guided" || recipe.id === "planner-monthly-weekly";

  const generate = () => {
    const sizeLabel = sizeId === CUSTOM_SIZE_ID ? `${custom.width}×${custom.height}${custom.unit}` : sizes.find((s) => s.id === sizeId)?.label ?? sizeId;
    const b = getBindingProfile(binding.bindingType);
    let built: ProductRecipe = recipe.build({ count: needsCount ? (recipe.id === "planner-monthly-weekly" ? 10 : count) : count, sheets });
    if (recipe.id === "planner-weekly") {
      built = weeklyRecipeWithExtras(layoutId ?? "planner-weekly-spread", weeklyExtras);
    }
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
      recipe: built,
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
      <p className="hint">A template combines pages, content, order and a starting design. You can edit all of them afterward.</p>
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
          <h3>4 · Pages and layout</h3>
          <p className="hint">First choose the kind of page or prepared book. Then choose how the page is arranged.</p>
          <h4>Page category</h4>
          <div className="choice-row" role="group" aria-label="Page category">
            {pageRecipes.map((r) => {
              const problem = recipeFit(r);
              return (
                <button key={r.id} type="button" className="choice" aria-pressed={r.id === recipeId} disabled={!!problem} title={problem ?? undefined} onClick={() => { setRecipeId(r.id); setLayoutId(null); setWeeklyExtras([]); }}>
                  {r.label}
                  {problem ? " (doesn't fit this size)" : ""}
                </button>
              );
            })}
          </div>
          {preparedBooks.length > 0 && <><h4>Prepared book structures</h4><p className="hint">These combine several page categories and set their order and repeat rules. You can edit each page afterward.</p><div className="choice-row" role="group" aria-label="Prepared books">{preparedBooks.map((r) => {
            const problem = recipeFit(r);
            return <button key={r.id} type="button" className="choice" aria-pressed={r.id === recipeId} disabled={!!problem} title={problem ?? undefined} onClick={() => { setRecipeId(r.id); setLayoutId(null); setWeeklyExtras([]); }}>{r.label}{problem ? " (doesn't fit this size)" : ""}</button>;
          })}</div></>}
          {PAGE_LAYOUTS[recipe.id] && (
            <div>
              <h4>Layout</h4>
              <div className="layout-gallery">
                {PAGE_LAYOUTS[recipe.id].map((option) => {
                  const fit = fitById.get(option.id);
                  return <button key={option.id} type="button" className="layout-card" aria-pressed={(layoutId ?? PAGE_LAYOUTS[recipe.id][0].id) === option.id} disabled={!!fit && !fit.ok} onClick={() => setLayoutId(option.id)}>
                    <LayoutThumbnail project={thumbnailProject} layoutId={option.id}/>
                    <strong>{option.label}</strong><span>{option.detail}</span><small>{fit?.ok ? fit.variantLabel : fit?.reason ?? ""}</small>
                  </button>;
                })}
              </div>
            </div>
          )}
          {recipe.id === "planner-weekly" && <div><h4>Additional pages after each weekly spread</h4><p className="hint">Day writing space stays inside the weekly layout. These are separate pages in the weekly section.</p>{WEEKLY_EXTRAS.map((extra) => <label key={extra.id} className="check"><input type="checkbox" checked={weeklyExtras.includes(extra.id)} onChange={(e) => setWeeklyExtras((xs) => e.target.checked ? [...xs, extra.id] : xs.filter((x) => x !== extra.id))}/>{extra.label}</label>)}</div>}
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
          {(recipe.id === "journal-lined" || recipe.id === "journal-guided") && <NumberField label="Pages" step={1} min={1} value={count} onChange={(c) => setCount(Math.max(1, Math.round(c)))} />}
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
          <h3>5 · Starting design</h3>
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
