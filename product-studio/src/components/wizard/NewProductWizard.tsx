/**
 * New Product flow: the user makes product decisions; the system solves the
 * geometry. Every step is a choice — nothing is positioned by hand.
 * Complete planners & books are templates (BookTemplates); "Page type"
 * lists single page layouts only.
 *   Type → Size → Orientation → Binding → Printer → Layout → Spacing →
 *   Theme → Fonts → Dates / sheets / pages → Generate
 */
import { PageThumb } from "../preview/PageThumb";
import { thumbHeight, usePhone } from "../../utils/usePhone";
import { recipeSteps } from "../../engines/recipe/recipe";
import { useEffect, useMemo, useState } from "react";
import type { WizardStart } from "../../presets/products/productFamilies";
import { BINDING_CHOICES, getBindingProfile } from "../../presets/bindingProfiles/bindingProfiles";
import { PRINT_PROFILES } from "../../presets/printProfiles/printProfiles";
import { PRODUCT_TYPES } from "../../presets/products/productTypes";
import { createProject } from "../../presets/products/projectFactory";
import { TEST_PRODUCTS } from "../../presets/products/testProducts";
import { DEVOTIONAL_CONTENT_PRESET, recipePresetsFor } from "../../presets/layouts/recipePresets";
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
import { TechnicalDetails } from "../help/visuals";
import { layoutAvailability, resolveDocument, type ResolvedDocument } from "../../engines/document/resolve";
import { BookTemplates } from "./BookTemplates";

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

/** The real first page(s) of a layout choice, recomputed only when the size, colors or binding change. */
function LayoutThumb<R>({ preview, r, deps }: { preview: (r: R) => { doc: ResolvedDocument; pages: number[] } | null; r: R; deps: string }) {
  const p = useMemo(() => preview(r), [r, deps]);
  const phone = usePhone();
  if (!p) return null;
  return (
    <span className="choice__thumb" aria-hidden="true">
      {p.pages.filter((i) => i < p.doc.recipe.pages.length).map((i) => <PageThumb key={i} doc={p.doc} index={i} heightPx={thumbHeight(phone, 96, p.pages.length > 1 ? 150 : 200)} />)}
    </span>
  );
}

const PRODUCT_ORDER: ProductType[] = ["planner", "journal", "devotional", "worksheet", "tracker", "notepad", "deskpad", "notebook", "custom"];
const nextYear = new Date().getFullYear() + 1;

type PlannerPageCategory = "Monthly" | "Weekly" | "Daily" | "Notes & Lists";

function plannerCategoryFor(id: string): PlannerPageCategory {
  if (id.includes("monthly")) return "Monthly";
  if (id.includes("weekly") || id.includes("mwg")) return "Weekly";
  if (id.includes("daily")) return "Daily";
  return "Notes & Lists";
}

const PLANNER_CATEGORY_ORDER: PlannerPageCategory[] = ["Monthly", "Weekly", "Daily", "Notes & Lists"];

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
  // A devotional: written here (pages made from its days) or pages to fill in by hand (the page types).
  const [fromContent, setFromContent] = useState(true);
  const recipe = type === "devotional" && fromContent ? DEVOTIONAL_CONTENT_PRESET : recipes.find((r) => r.id === recipeId) ?? recipes[0];
  const [density, setDensity] = useState<SpacingDensity>("balanced");
  const [paletteId, setPaletteId] = useState(PALETTES[0].id);
  const [heading, setHeading] = useState(DEFAULT_FONTS.headings);
  const [sheets, setSheets] = useState<number>(type === "deskpad" ? STUDIO_PAD.deskPadSheets : STUDIO_PAD.defaultSheets);
  const [count, setCount] = useState(120);
  const [year, setYear] = useState(nextYear);
  const [weekStart, setWeekStart] = useState<WeekStart>(1);
  const [name, setName] = useState("");
  const [changingStart, setChangingStart] = useState(false);
  // A planner starts from ONE kind of page; complete products (Monthly + Weekly + Notes, …) are templates, and
  // Meeting With God beside the week is added as content from Pages.
  const plannerStarts = recipes.filter((r) => !r.template && r.id !== "planner-weekly-mwg");

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
    // Worksheets are single printables; devotionals default to a 90-day book.
    setCount(t === "worksheet" ? 1 : t === "devotional" ? 90 : 120);
  };

  // Inventory pages: a notebook's worth of copies (not the 120 pages a lined notebook starts with).
  useEffect(() => {
    if (recipeId.startsWith("inventory-")) setCount(24);
  }, [recipeId]);

  // Arriving from a product family / quick action: apply its type's defaults, its page structure, and scroll to the step.
  useEffect(() => {
    if (start?.type) {
      pickType(start.type);
      if (start.recipeId) setRecipeId(start.recipeId);
    }
    const target = start?.section === "templates" ? "wizard-templates" : start?.section === "books" ? "wizard-books" : start?.section === "build" ? "wizard-build" : null;
    // An opened template scrolls itself into view.
    if (start?.template) return;
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
  /** A layout choice drawn by the real renderer at the chosen size and colors (first page, or both pages of a spread). */
  const previewOf = (r: (typeof recipes)[number]): { doc: ResolvedDocument; pages: number[] } | null => {
    try {
      const b = getBindingProfile(binding.bindingType);
      const doc = resolveDocument(
        createProject(type, {
          dimensions: { sizePresetId: sizeId, custom: sizeId === CUSTOM_SIZE_ID ? custom : undefined, orientation },
          production: { bindingType: binding.bindingType, boundEdge: binding.boundEdge ?? b.defaultBoundEdge ?? undefined, printProfileId: profileId, duplex: b.boundEdgeMode === "book-spine" },
          recipe: r.build({ count: 1, sheets: 1 }),
          calendar: r.needsCalendar ? { startDate: `${year}-01-01`, endDate: `${year}-01-31`, weekStart, sixRowMonths: true } : undefined,
          spacing: { density, overrides: {} },
          colors: { paletteId, overrides: {} },
          layoutOptions: r.layoutOptions,
        }),
      );
      const i = doc.recipe.pages.findIndex((p) => !p.filler);
      if (i < 0) return null;
      return { doc, pages: doc.recipe.pages[i].spreadPart === 0 ? [i, i + 1] : [i] };
    } catch {
      return null;
    }
  };
  const stationery = recipe.id.startsWith("stationery:");
  const inventory = recipe.id.startsWith("inventory-");
  const needsCount = recipe.id === "journal-lined" || recipe.id === "guided-lined" || recipe.id === "planner-monthly-weekly" || stationery || inventory;

  const generate = () => {
    const sizeLabel = sizeId === CUSTOM_SIZE_ID ? `${custom.width}×${custom.height}${custom.unit}` : sizes.find((s) => s.id === sizeId)?.label ?? sizeId;
    const b = getBindingProfile(binding.bindingType);
    const data = recipe.content?.();
    const project = createProject(type, {
      name: name.trim() || (data ? `${sizeLabel} ${def.label}` : `${sizeLabel} ${recipe.label} ${def.label}`),
      dimensions: { sizePresetId: sizeId, custom: sizeId === CUSTOM_SIZE_ID ? custom : undefined, orientation },
      production: {
        bindingType: binding.bindingType,
        boundEdge: binding.boundEdge ?? b.defaultBoundEdge ?? undefined,
        printProfileId: profileId,
        includeBleed: false,
        duplex: b.boundEdgeMode === "book-spine",
        sheetsPerPad: isPad ? sheets : undefined,
      },
      recipe: recipe.build({ count: needsCount ? (recipe.id === "planner-monthly-weekly" ? 10 : count) : count, sheets, data }),
      calendar: recipe.needsCalendar ? { startDate: `${year}-01-01`, endDate: `${year}-12-31`, weekStart, sixRowMonths: true } : undefined,
      spacing: { density, overrides: {} },
      colors: { paletteId, overrides: {} },
      typography: { fonts: { ...DEFAULT_FONTS, headings: heading, accent: heading }, roleOverrides: {} },
      layoutOptions: recipe.layoutOptions,
    });
    onCreate(data ? { ...project, data } : project);
  };

  return (
    <div className="page-shell">
      <div className="row">
        <h1 style={{ flex: 1 }}>New product</h1>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
      <p className="lede">You choose the product. Product Studio works out the measurements.</p>

      <h2 id="wizard-templates">Starter templates</h2>
      <div className="card-grid">
        {TEST_PRODUCTS.map((t) => (
          <button key={t.id} className="card card--pick" onClick={() => onCreate(t.build())}>
            <h3>{t.label}</h3>
            <p>{t.summary}</p>
          </button>
        ))}
      </div>

      <BookTemplates onCreate={onCreate} focusId={start?.template} />

      <h2 id="wizard-build">Build your own</h2>
      <div className="wizard">
        <section className="step">
          <h3>1 · Product</h3>
          <Choices value={type} options={PRODUCT_ORDER.map((t) => ({ value: t, label: PRODUCT_TYPES[t].label }))} onChange={pickType} />
          <p className="hint">{def.description}</p>
        </section>

        <section className="step">
          <h3>2 · Page size & orientation</h3>
          <Field label="Page size (after trimming)">
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
          <Choices value={orientation} options={[{ value: "portrait", label: "Portrait (tall)" }, { value: "landscape", label: "Landscape (wide)" }]} onChange={setOrientation} />
        </section>

        <section className="step">
          <h3>3 · Binding & printing</h3>
          <Choices value={bindingChoice} options={bindingChoices.map((c) => ({ value: c.id, label: c.label }))} onChange={pickBinding} />
          <Field label="Printer">
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </Field>
        </section>

        <section className="step">
          <h3>4 · {type === "planner" ? "Start with a planner page" : type === "devotional" ? "How you'll make it" : "Page"}</h3>
          {type === "planner" ? (
            <div className="planner-start" data-testid="planner-start">
              {!changingStart ? (
                <>
                  <p className="planner-start__now">
                    Starting with: <strong>{plannerCategoryFor(recipeId)}</strong>{" "}
                    <button type="button" className="btn btn--ghost" onClick={() => setChangingStart(true)}>Change selection</button>
                  </p>
                  <div className="field-label">Choose layout</div>
                  <div className="choice-row" role="group" aria-label="Choose layout">
                    {plannerStarts.filter((r) => plannerCategoryFor(r.id) === plannerCategoryFor(recipeId)).map((r) => {
                      const problem = recipeFit(r);
                      return (
                        <button key={r.id} type="button" className="choice choice--layout choice--thumb" aria-pressed={r.id === recipeId} disabled={!!problem} title={problem ?? undefined} onClick={() => setRecipeId(r.id)}>
                          <LayoutThumb preview={previewOf} r={r} deps={`${sizeId}|${orientation}|${paletteId}|${bindingChoice}|${weekStart}`} />
                          <strong>{r.label}</strong>
                          {problem && <span>Not enough room at this size</span>}
                        </button>
                      );
                    })}
                  </div>
                  <p className="hint">This is the first kind of page. Add a cover, more kinds of pages, dividers and tabs after you start, under Pages.</p>
                </>
              ) : (
                <>
                  <p className="hint">Choose the kind of page to start with.</p>
                  <div className="choice-row" role="group" aria-label="Start with">
                    {PLANNER_CATEGORY_ORDER.filter((c) => plannerStarts.some((r) => plannerCategoryFor(r.id) === c)).map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="choice"
                        aria-pressed={plannerCategoryFor(recipeId) === c}
                        onClick={() => {
                          setRecipeId(plannerStarts.find((r) => plannerCategoryFor(r.id) === c && !recipeFit(r))?.id ?? plannerStarts.find((r) => plannerCategoryFor(r.id) === c)!.id);
                          setChangingStart(false);
                        }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
            {type === "devotional" && (
              <Choices
                value={fromContent ? "content" : "pages"}
                options={[
                  { value: "content", label: "Write my devotional here (one day per entry)" },
                  { value: "pages", label: "Pages to fill in by hand" },
                ]}
                onChange={(v) => setFromContent(v === "content")}
              />
            )}
            {!(type === "devotional" && fromContent) && (
            <div className="choice-row" role="group">
              {recipes.map((r) => {
                const problem = recipeFit(r);
                return (
                  <button key={r.id} type="button" className="choice" aria-pressed={r.id === recipeId} disabled={!!problem} title={problem ?? undefined} onClick={() => setRecipeId(r.id)}>
                    {r.label}
                    {problem ? " (not enough room at this size)" : ""}
                  </button>
                );
              })}
            </div>
            )}
            </>
          )}
          {recipeProblem && (
            <div className="issue issue--error">
              <div className="issue-title">This page type doesn't have enough room at this size.</div>
              <div className="issue-advice">Choose a larger page size or another page type.</div>
              <TechnicalDetails label="Show details">{recipeProblem}</TechnicalDetails>
            </div>
          )}
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
          {recipe.content && <p className="hint">After you create it: add your days (type them, or paste them from a spreadsheet), choose a design, check the preview, then export. You can change the size, design or binding any time without retyping anything.</p>}
          {recipe.id === "guided-lined" && <p className="hint">Choose how many prompt sections each page has and how many writing lines each gets after you create it (Pages & Layouts → the page → Sections).</p>}
          {(recipe.id === "journal-lined" || recipe.id === "guided-lined" || stationery || inventory) && <NumberField label={inventory ? "Copies of this page" : "Pages"} step={1} min={1} value={count} onChange={(c) => setCount(Math.max(1, Math.round(c)))} />}
          {inventory && <p className="hint">Rows and records are numbered straight through every copy. Change the columns, rows or numbering after you create it (the page → Add to page); landscape gives the table more room.</p>}
          {stationery && <p className="hint">Margins, section sizes, writing lines and table columns are worked out for this page size — nothing to measure.</p>}
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
          <p className="hint">Overall spacing, colors and heading font. Everything here can be changed later.</p>
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
          <h3>6 · Name & create</h3>
          <Field label="Project name (optional)">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Prayer Journal — Burgundy" />
          </Field>
          <button className="btn btn--primary" onClick={generate} disabled={!!recipeProblem} style={{ justifySelf: "start" }}>
            {type === "planner" ? "Start planner" : `Create ${def.label.toLowerCase()}`}
          </button>
        </section>
      </div>
    </div>
  );
}
