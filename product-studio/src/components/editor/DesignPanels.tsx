import { GRID_PRESETS, RULING_PRESETS } from "../../engines/patterns/patterns";
import { addVariantFromCurrent } from "../../persistence/projectStore";
import { applyVariant } from "../../engines/document/resolve";
import { SPACING_LABELS } from "../../presets/spacing/spacingPresets";
import { PALETTES, findPalette } from "../../presets/themes/palettes";
import { DEFAULT_ROLES, FONT_CATALOG, FONT_CATEGORY_LABEL, ROLE_LABELS } from "../../presets/typography/typography";
import { DEFAULT_WORDING } from "../../presets/wording";
import type { ProductProject } from "../../types/project";
import type { DecorativePlacement, DecorativeStyle, FunctionalPatternKind } from "../../types/theme";
import type { ColorToken, FontCategory, FontGroup, SpacingDensity, TypographyRole, WordingKey } from "../../types/tokens";
import { Check, Field, NumberField, Section, Segmented, Select } from "./ui";

type Update = (fn: (p: ProductProject) => ProductProject) => void;
type PanelProps = { project: ProductProject; update: Update };

const WORDING_CHOICES: WordingKey[] = ["notes", "priorities", "topPriorities", "weeklyFocus", "toDo", "goals", "prayer", "prayerRequests", "gratitude", "scripture", "kingdomAssignments"];

export function LayoutPanel({ project, update }: PanelProps) {
  const o = project.layoutOptions;
  const set = (patch: Partial<ProductProject["layoutOptions"]>) => update((p) => ({ ...p, layoutOptions: { ...p.layoutOptions, ...patch } }));
  return (
    <Section title="Layout">
      <Segmented
        label="Date placement"
        value={o.datePlacement}
        options={[{ value: "top-left", label: "Top left" }, { value: "top-center", label: "Center" }, { value: "top-right", label: "Top right" }]}
        onChange={(datePlacement) => set({ datePlacement })}
      />
      <Check label="Sidebar" checked={o.showSidebar} onChange={(showSidebar) => set({ showSidebar })} />
      {o.showSidebar && (
        <>
          <Select label="Sidebar heading" value={o.sidebarContent} options={WORDING_CHOICES.map((k) => ({ value: k, label: DEFAULT_WORDING[k] }))} onChange={(sidebarContent) => set({ sidebarContent })} />
          <NumberField label="Sidebar width" suffix="in" step={0.05} min={0.5} value={o.sidebarWidthIn} onChange={(sidebarWidthIn) => set({ sidebarWidthIn })} />
        </>
      )}
      <div className="row">
        <NumberField label="Sections per day" step={1} min={1} max={6} value={o.sectionsPerDay} onChange={(v) => set({ sectionsPerDay: Math.max(1, Math.round(v)) })} />
        <NumberField label="Desk-pad rows" step={1} min={1} max={8} value={o.writingRowsPerDay} onChange={(v) => set({ writingRowsPerDay: Math.max(1, Math.round(v)) })} />
      </div>
      <Check label="Page numbers" checked={o.showPageNumbers} onChange={(showPageNumbers) => set({ showPageNumbers })} />
      <Check label="Footer (product title)" checked={o.showFooter} onChange={(showFooter) => set({ showFooter })} />
    </Section>
  );
}

export function PatternPanel({ project, update }: PanelProps) {
  const f = project.functionalPattern;
  const set = (patch: Partial<ProductProject["functionalPattern"]>) => update((p) => ({ ...p, functionalPattern: { ...p.functionalPattern, ...patch } }));
  const kinds: { value: FunctionalPatternKind; label: string }[] = [
    { value: "ruled", label: "Ruled" },
    { value: "margin-ruled", label: "Ruled + margin line" },
    { value: "dot-grid", label: "Dot grid" },
    { value: "graph-grid", label: "Graph grid" },
    { value: "blank", label: "Blank" },
  ];
  const isRuled = f.kind === "ruled" || f.kind === "margin-ruled" || f.kind === "checklist";
  const isGrid = f.kind === "dot-grid" || f.kind === "graph-grid";
  return (
    <Section title="Writing surface">
      <Select label="Pattern" value={kinds.some((k) => k.value === f.kind) ? f.kind : "ruled"} options={kinds} onChange={(kind) => set({ kind })} />
      {isRuled && (
        <>
          <Select label="Ruling" value={f.rulingPreset} options={RULING_PRESETS.map((r) => ({ value: r.id, label: r.label }))} onChange={(rulingPreset) => set({ rulingPreset })} />
          {f.rulingPreset === "custom" && <NumberField label="Line spacing" suffix="in" step={0.01} min={0.15} value={f.customLineSpacingIn} onChange={(customLineSpacingIn) => set({ customLineSpacingIn })} />}
        </>
      )}
      {isGrid && (
        <>
          <Select label="Grid" value={f.gridPreset} options={GRID_PRESETS.map((g) => ({ value: g.id, label: g.label }))} onChange={(gridPreset) => set({ gridPreset })} />
          {f.gridPreset === "custom" && <NumberField label="Pitch" suffix="in" step={0.01} min={0.05} value={f.customPitchIn} onChange={(customPitchIn) => set({ customPitchIn })} />}
        </>
      )}
      {f.kind === "dot-grid" && <NumberField label="Dot size" suffix="pt" step={0.1} min={0.2} value={f.dotSizePt} onChange={(dotSizePt) => set({ dotSizePt })} />}
      {f.kind === "graph-grid" && <NumberField label="Major line every N cells (0 = off)" step={1} min={0} value={f.majorEvery} onChange={(v) => set({ majorEvery: Math.max(0, Math.round(v)) })} />}
      {f.kind === "margin-ruled" && <NumberField label="Margin line from inside edge" suffix="in" step={0.05} value={f.marginLineIn} onChange={(marginLineIn) => set({ marginLineIn })} />}
      <div className="row">
        <NumberField label="Line weight" suffix="pt" step={0.1} min={0.1} value={f.lineWeightPt} onChange={(lineWeightPt) => set({ lineWeightPt })} />
        <NumberField label="Opacity" step={0.05} min={0.05} max={1} value={f.opacity} onChange={(opacity) => set({ opacity: Math.min(1, Math.max(0.05, opacity)) })} />
      </div>
    </Section>
  );
}

export function SpacingPanel({ project, update }: PanelProps) {
  return (
    <Section title="Spacing">
      <Segmented
        label="Density"
        value={project.spacing.density}
        options={(Object.keys(SPACING_LABELS) as SpacingDensity[]).map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }))}
        onChange={(density) => update((p) => ({ ...p, spacing: { ...p.spacing, density } }))}
      />
      <p className="hint">{SPACING_LABELS[project.spacing.density]}</p>
    </Section>
  );
}

const GROUP_LABEL: Record<FontGroup, string> = { cover: "Cover", headings: "Headings", subheadings: "Subheadings & labels", body: "Body", accent: "Accent" };
const EDITABLE_ROLES: TypographyRole[] = ["monthTitle", "weekTitle", "pageTitle", "sectionHeading", "subheading", "date", "label", "body", "prompt", "time", "footer"];

export function TypographyPanel({ project, update }: PanelProps) {
  const fonts = project.typography.fonts;
  const categories = Object.keys(FONT_CATEGORY_LABEL) as FontCategory[];
  return (
    <Section title="Typography">
      {(Object.keys(GROUP_LABEL) as FontGroup[]).map((g) => (
        <Field key={g} label={GROUP_LABEL[g]}>
          <select value={fonts[g]} onChange={(e) => update((p) => ({ ...p, typography: { ...p.typography, fonts: { ...p.typography.fonts, [g]: e.target.value } } }))}>
            {categories.map((c) => (
              <optgroup key={c} label={FONT_CATEGORY_LABEL[c]}>
                {FONT_CATALOG.filter((f) => f.category === c).map((f) => (
                  <option key={f.family} value={f.family}>{f.family}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      ))}
      <div className="field-label">Role sizes (pt)</div>
      <div className="row">
        {EDITABLE_ROLES.map((r) => (
          <NumberField
            key={r}
            label={ROLE_LABELS[r]}
            step={0.5}
            min={6}
            value={project.typography.roleOverrides[r]?.sizePt ?? DEFAULT_ROLES[r].sizePt}
            onChange={(sizePt) => update((p) => ({ ...p, typography: { ...p.typography, roleOverrides: { ...p.typography.roleOverrides, [r]: { ...p.typography.roleOverrides[r], sizePt } } } }))}
          />
        ))}
      </div>
      <p className="hint">Text that no longer fits is reported by validation — type is never shrunk silently.</p>
    </Section>
  );
}

/**
 * Colors and decoration are the variant-overridable "look". While a variant is
 * active, edits go to that variant; otherwise to the base design.
 */
function setLook(update: Update, patch: { colors?: Partial<ProductProject["colors"]["overrides"]>; decorativeTheme?: Partial<ProductProject["decorativeTheme"]> }) {
  update((p) => {
    if (p.activeVariantId) {
      return {
        ...p,
        variants: p.variants.map((v) =>
          v.id !== p.activeVariantId
            ? v
            : {
                ...v,
                overrides: {
                  ...v.overrides,
                  colors: patch.colors ? { ...v.overrides.colors, ...patch.colors } : v.overrides.colors,
                  decorativeTheme: patch.decorativeTheme ? { ...v.overrides.decorativeTheme, ...patch.decorativeTheme } : v.overrides.decorativeTheme,
                },
              },
        ),
      };
    }
    return {
      ...p,
      colors: patch.colors ? { ...p.colors, overrides: { ...p.colors.overrides, ...patch.colors } } : p.colors,
      decorativeTheme: patch.decorativeTheme ? { ...p.decorativeTheme, ...patch.decorativeTheme } : p.decorativeTheme,
    };
  });
}

const COLOR_TOKENS: ColorToken[] = ["primary", "secondary", "accent", "background", "text", "line", "border", "decorativeAccent"];

export function ColorPanel({ project, update }: PanelProps) {
  const palette = findPalette(project.colors.paletteId);
  const view = applyVariant(project);
  const effective = { ...palette.colors, ...view.colors.overrides };
  const active = project.variants.find((v) => v.id === project.activeVariantId);
  return (
    <Section title="Colors">
      <Select label="Palette" value={project.colors.paletteId} options={PALETTES.map((p) => ({ value: p.id, label: p.label }))} onChange={(paletteId) => update((p) => ({ ...p, colors: { paletteId, overrides: {} } }))} />
      {!palette.brandPalette && <p className="hint">⚠ {palette.note}</p>}
      {active && <p className="hint">Editing colors of variant “{active.name}”.</p>}
      <div className="row">
        {COLOR_TOKENS.map((t) => (
          <label key={t} className="field" style={{ flex: "0 0 auto" }}>
            <span>{t}</span>
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(effective[t]) ? effective[t] : "#1b1717"}
              onChange={(e) => setLook(update, { colors: { [t]: e.target.value } })}
            />
          </label>
        ))}
      </div>
      <NumberField
        label="Writing-line strength"
        step={0.05}
        min={0.05}
        max={1}
        value={effective.lineOpacity}
        onChange={(lineOpacity) => setLook(update, { colors: { lineOpacity } })}
      />
      {!active && Object.keys(project.colors.overrides).length > 0 && (
        <button className="btn" onClick={() => update((p) => ({ ...p, colors: { ...p.colors, overrides: {} } }))}>Reset to palette</button>
      )}
    </Section>
  );
}

const WORDING_EDIT: WordingKey[] = ["productTitle", "toDo", "notes", "priorities", "weeklyFocus", "morning", "afternoon", "evening", "weekOf", "date", "prayer", "kingdomAssignments"];

export function WordingPanel({ project, update }: PanelProps) {
  return (
    <Section title="Wording">
      <p className="hint">Labels are semantic: renaming one updates every page that uses it.</p>
      {WORDING_EDIT.map((k) => (
        <Field key={k} label={DEFAULT_WORDING[k] || k}>
          <input
            type="text"
            value={project.wording[k] ?? DEFAULT_WORDING[k]}
            onChange={(e) => update((p) => ({ ...p, wording: { ...p.wording, [k]: e.target.value } }))}
          />
        </Field>
      ))}
    </Section>
  );
}

const DECOR_STYLES: DecorativeStyle[] = ["none", "solid", "marble", "watercolor", "floral", "geometric", "abstract", "stripes", "dots", "minimal", "image"];
const DECOR_PLACEMENTS: { value: DecorativePlacement; label: string }[] = [
  { value: "header-band", label: "Header band" },
  { value: "border-frame", label: "Margin frame" },
  { value: "corners", label: "Corners" },
  { value: "full-page", label: "Full page" },
];

export function DecorationPanel({ project, update }: PanelProps) {
  const d = applyVariant(project).decorativeTheme;
  const set = (patch: Partial<ProductProject["decorativeTheme"]>) => setLook(update, { decorativeTheme: patch });
  return (
    <Section title="Decoration">
      <p className="hint">Decoration is its own layer: it never moves lines, grids or calendars.</p>
      <Select label="Style" value={d.style} options={DECOR_STYLES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} onChange={(style) => set({ style })} />
      {d.style !== "none" && (
        <>
          <Select label="Placement" value={d.placement} options={DECOR_PLACEMENTS} onChange={(placement) => set({ placement })} />
          <div className="row">
            <NumberField label="Scale" step={0.1} min={0.2} value={d.scale} onChange={(scale) => set({ scale })} />
            <NumberField label="Opacity" step={0.05} min={0} max={1} value={d.opacity} onChange={(opacity) => set({ opacity: Math.min(1, Math.max(0, opacity)) })} />
            <NumberField label="Seed" step={1} value={d.seed} onChange={(seed) => set({ seed: Math.round(seed) })} />
          </div>
          <div className="row">
            <Select label="Color A" value={d.colorA} options={COLOR_TOKENS.map((c) => ({ value: c, label: c }))} onChange={(colorA) => set({ colorA })} />
            <Select label="Color B" value={d.colorB} options={COLOR_TOKENS.map((c) => ({ value: c, label: c }))} onChange={(colorB) => set({ colorB })} />
          </div>
          {d.placement === "full-page" && <Check label="Extend under writing areas" checked={d.applyToInterior} onChange={(applyToInterior) => set({ applyToInterior })} />}
          {d.style === "image" && (
            <>
              <Field label="Image URL">
                <input type="text" value={d.imageUrl ?? ""} onChange={(e) => set({ imageUrl: e.target.value })} />
              </Field>
              <Segmented label="Fit" value={d.imageFit} options={[{ value: "cover", label: "Cover" }, { value: "contain", label: "Contain" }, { value: "repeat", label: "Repeat" }]} onChange={(imageFit) => set({ imageFit })} />
            </>
          )}
        </>
      )}
    </Section>
  );
}

export function VariantsPanel({ project, update }: PanelProps) {
  return (
    <Section title={`Variants · ${project.variants.length}`}>
      <p className="hint">Variants share geometry, layout and recipe. They override colors, decoration and title only.</p>
      <Select
        label="Active look"
        value={project.activeVariantId ?? "__base"}
        options={[{ value: "__base", label: "Base design" }, ...project.variants.map((v) => ({ value: v.id, label: v.name }))]}
        onChange={(id) => update((p) => ({ ...p, activeVariantId: id === "__base" ? null : id }))}
      />
      {project.variants.map((v) => (
        <div key={v.id} className="row">
          <input
            type="text"
            value={v.name}
            aria-label="Variant name"
            style={{ flex: 1, border: "1px solid var(--ui-line)", borderRadius: 8, padding: "0 10px" }}
            onChange={(e) => update((p) => ({ ...p, variants: p.variants.map((x) => (x.id === v.id ? { ...x, name: e.target.value } : x)) }))}
          />
          <button
            className="btn"
            onClick={() =>
              update((p) => ({
                ...p,
                variants: p.variants.map((x) => (x.id === v.id ? { ...x, overrides: { colors: { ...findPalette(p.colors.paletteId).colors, ...p.colors.overrides }, decorativeTheme: { ...p.decorativeTheme }, title: p.wording.productTitle } } : x)),
              }))
            }
          >
            Capture current look
          </button>
          <button className="btn btn--danger" onClick={() => update((p) => ({ ...p, variants: p.variants.filter((x) => x.id !== v.id), activeVariantId: p.activeVariantId === v.id ? null : p.activeVariantId }))}>
            Delete
          </button>
        </div>
      ))}
      <button
        className="btn"
        onClick={() =>
          update((p) => {
            const look = applyVariant(p);
            const next = addVariantFromCurrent({ ...p, decorativeTheme: look.decorativeTheme }, `Variant ${p.variants.length + 1}`, { ...findPalette(p.colors.paletteId).colors, ...look.colors.overrides });
            // The base design is untouched; only the new variant captures the look.
            return { ...next, decorativeTheme: p.decorativeTheme };
          })
        }
      >
        Add variant from current look
      </button>
    </Section>
  );
}
