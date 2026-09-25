/**
 * Design controls. Every control here is gated by ProjectUsage: it appears
 * only when the current product consumes it, so none is a placebo.
 */
import { applyVariant } from "../../engines/document/resolve";
import type { ProjectUsage } from "../../engines/document/usage";
import { GRID_PRESETS, RULING_PRESETS } from "../../engines/patterns/patterns";
import { addVariantFromCurrent } from "../../persistence/projectStore";
import { SPACING_LABELS } from "../../presets/spacing/spacingPresets";
import { PALETTES, findPalette } from "../../presets/themes/palettes";
import { DEFAULT_ROLES, FONT_CATALOG, FONT_CATEGORY_LABEL, ROLE_LABELS } from "../../presets/typography/typography";
import { DEFAULT_WORDING } from "../../presets/wording";
import { DESIGN_ASSETS, findAsset } from "../../design-library/library";
import { normalizeDecoration, placementsFor } from "../../themes/decorationPlan";
import type { ProductProject } from "../../types/project";
import type { DecorativePlacement, DecorativeTheme, FunctionalPatternKind } from "../../types/theme";
import type { ColorToken, FontCategory, FontGroup, SpacingDensity, WordingKey } from "../../types/tokens";
import { AppliesTo, Check, Field, NumberField, Section, Segmented, Select, type EditorNav } from "./ui";

type Update = (fn: (p: ProductProject) => ProductProject) => void;
type PanelProps = { project: ProductProject; update: Update; usage: ProjectUsage; nav: EditorNav };

const SIDEBAR_HEADINGS: WordingKey[] = ["notes", "priorities", "topPriorities", "weeklyFocus", "toDo", "goals", "prayer", "prayerRequests", "gratitude", "scripture", "kingdomAssignments"];

export function LayoutPanel({ project, update, usage, nav }: PanelProps) {
  const o = project.layoutOptions;
  const set = (patch: Partial<ProductProject["layoutOptions"]>) => update((p) => ({ ...p, layoutOptions: { ...p.layoutOptions, ...patch } }));
  const any = usage.datePlacement || usage.sidebar.supported || usage.sectionsPerDay || usage.writingRows || usage.pageNumbers || usage.footer;
  if (!any) return null;
  return (
    <Section title="Layout options">
      {usage.layouts.map(({ layout, fit }) => (
        <p key={layout.id} className="hint">
          {layout.label}: {fit.ok ? fit.variantLabel : `unavailable — ${fit.reason}`}
        </p>
      ))}
      {usage.datePlacement && <AppliesTo ids={usage.consumers.datePlacement} nav={nav} />}
      {usage.datePlacement && (
        <Segmented
          label="Date placement in calendar cells"
          value={o.datePlacement}
          options={[{ value: "top-left", label: "Top left" }, { value: "top-center", label: "Center" }, { value: "top-right", label: "Top right" }]}
          onChange={(datePlacement) => set({ datePlacement })}
        />
      )}
      {usage.sidebar.supported && (
        <>
          {usage.sidebar.available && <AppliesTo ids={usage.consumers.sidebar} nav={nav} />}
          <label className="check">
            <input type="checkbox" checked={o.showSidebar && usage.sidebar.available} disabled={!usage.sidebar.available} onChange={(e) => set({ showSidebar: e.target.checked })} />
            <span>Sidebar{!usage.sidebar.available ? " (not available at this size)" : ""}</span>
          </label>
          {!usage.sidebar.available && usage.sidebar.reason && <p className="hint">{usage.sidebar.reason}</p>}
          {o.showSidebar && usage.sidebar.available && (
            <>
              <Select label="Sidebar heading" value={o.sidebarContent} options={SIDEBAR_HEADINGS.map((k) => ({ value: k, label: DEFAULT_WORDING[k] }))} onChange={(sidebarContent) => set({ sidebarContent })} />
              {usage.layouts.some((l) => l.layout.id !== "planner-weekly-spread" && l.layout.capability.supportsSidebar) && (
                <NumberField label="Sidebar width" suffix="in" step={0.05} min={0.5} value={o.sidebarWidthIn} onChange={(sidebarWidthIn) => set({ sidebarWidthIn })} />
              )}
            </>
          )}
        </>
      )}
      {usage.sectionsPerDay && <AppliesTo ids={usage.consumers.sectionsPerDay} nav={nav} />}
      {usage.sectionsPerDay && <NumberField label="Sections per day" step={1} min={1} max={6} value={o.sectionsPerDay} onChange={(v) => set({ sectionsPerDay: Math.max(1, Math.round(v)) })} />}
      {usage.writingRows && <NumberField label="Writing rows per day" step={1} min={1} max={8} value={o.writingRowsPerDay} onChange={(v) => set({ writingRowsPerDay: Math.max(1, Math.round(v)) })} />}
      {usage.pageNumbers && <Check label="Page numbers" checked={o.showPageNumbers} onChange={(showPageNumbers) => set({ showPageNumbers })} />}
      {usage.footer && <Check label="Footer (product title)" checked={o.showFooter} onChange={(showFooter) => set({ showFooter })} />}
    </Section>
  );
}

const PATTERN_LABELS: Record<FunctionalPatternKind, string> = {
  ruled: "Ruled",
  "margin-ruled": "Ruled + margin line",
  "dot-grid": "Dot grid",
  "graph-grid": "Graph grid",
  blank: "Blank",
  checklist: "Checklist",
  cornell: "Cornell",
  "split-column": "Split column",
};

export function PatternPanel({ project, update, usage, nav }: PanelProps) {
  const f = project.functionalPattern;
  const set = (patch: Partial<ProductProject["functionalPattern"]>) => update((p) => ({ ...p, functionalPattern: { ...p.functionalPattern, ...patch } }));
  if (!usage.patterns.length && !usage.lineStyle) return null;
  const kind = usage.patterns.includes(f.kind) ? f.kind : usage.patterns[0];
  const isRuled = kind === "ruled" || kind === "margin-ruled";
  const isGrid = kind === "dot-grid" || kind === "graph-grid";
  const drawsLines = isRuled || isGrid || !usage.patterns.length;
  return (
    <Section title={usage.patterns.length ? "Writing surface" : "Line style"}>
      {usage.patterns.length > 0 && <AppliesTo ids={usage.consumers.pattern} nav={nav} />}
      {usage.patterns.length ? (
        <Select label="Pattern" value={kind} options={usage.patterns.map((k) => ({ value: k, label: PATTERN_LABELS[k] }))} onChange={(k) => set({ kind: k })} />
      ) : (
        <p className="hint">This layout uses fixed checklist rows; only the line style applies.</p>
      )}
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
      {kind === "dot-grid" && <NumberField label="Dot size" suffix="pt" step={0.1} min={0.2} value={f.dotSizePt} onChange={(dotSizePt) => set({ dotSizePt })} />}
      {kind === "graph-grid" && <NumberField label="Major line every N cells (0 = off)" step={1} min={0} value={f.majorEvery} onChange={(v) => set({ majorEvery: Math.max(0, Math.round(v)) })} />}
      {kind === "margin-ruled" && <NumberField label="Margin line from inside edge" suffix="in" step={0.05} value={f.marginLineIn} onChange={(marginLineIn) => set({ marginLineIn })} />}
      {drawsLines && usage.lineStyle && (
        <div className="row">
          {kind !== "dot-grid" && <NumberField label="Line weight" suffix="pt" step={0.1} min={0.1} value={f.lineWeightPt} onChange={(lineWeightPt) => set({ lineWeightPt })} />}
          <NumberField label="Opacity" step={0.05} min={0.05} max={1} value={f.opacity} onChange={(opacity) => set({ opacity: Math.min(1, Math.max(0.05, opacity)) })} />
        </div>
      )}
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

const GROUP_LABEL: Record<FontGroup, string> = { cover: "Cover font", headings: "Heading font", subheadings: "Label font", body: "Body font", accent: "Accent font" };

export function TypographyPanel({ project, update, usage }: PanelProps) {
  const fonts = project.typography.fonts;
  const categories = Object.keys(FONT_CATEGORY_LABEL) as FontCategory[];
  const groups = (Object.keys(GROUP_LABEL) as FontGroup[]).filter((g) => usage.fontGroups.includes(g));
  return (
    <Section title="Typography">
      {groups.map((g) => (
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
      <div className="field-label">Sizes (pt)</div>
      <div className="row">
        {usage.textRoles.map((r) => (
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

const TOKEN_LABEL: Record<ColorToken, string> = {
  primary: "Headings",
  secondary: "Secondary",
  accent: "Accent",
  background: "Paper",
  text: "Text",
  mutedText: "Muted text",
  line: "Writing lines",
  border: "Rules & boxes",
  decorativeAccent: "Decoration veins / line art",
  decorBase: "Decoration base",
  decorHighlight: "Decoration highlights",
};
const HEX = /^#[0-9a-f]{6}$/i;

export function ColorPanel({ project, update, usage }: PanelProps) {
  const palette = findPalette(project.colors.paletteId);
  const view = applyVariant(project);
  const effective = { ...palette.colors, ...view.colors.overrides };
  const active = project.variants.find((v) => v.id === project.activeVariantId);
  const groups = [
    { label: "Dove Expressions brand", list: PALETTES.filter((p) => p.brandPalette) },
    { label: "Journal Color Studio palettes", list: PALETTES.filter((p) => p.source) },
    { label: "Variants (pending approval)", list: PALETTES.filter((p) => !p.brandPalette && !p.source) },
  ];
  const editable = usage.colorTokens.filter((t) => HEX.test(effective[t]));
  return (
    <Section title="Colors">
      <Field label="Palette">
        <select value={project.colors.paletteId} onChange={(e) => update((p) => ({ ...p, colors: { paletteId: e.target.value, overrides: {} } }))}>
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.list.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      {palette.note && <p className="hint">{palette.brandPalette ? "" : "⚠ "}{palette.note}</p>}
      {active && <p className="hint">Editing colors of variant “{active.name}”.</p>}
      <div className="row">
        {editable.map((t) => (
          <label key={t} className="field" style={{ flex: "0 0 auto" }}>
            <span>{TOKEN_LABEL[t]}</span>
            <input type="color" value={effective[t]} onChange={(e) => setLook(update, { colors: { [t]: e.target.value } })} />
          </label>
        ))}
      </div>
      {usage.colorTokens.includes("line") && (
        <NumberField label="Writing-line strength" step={0.05} min={0.05} max={1} value={effective.lineOpacity} onChange={(lineOpacity) => setLook(update, { colors: { lineOpacity } })} />
      )}
      {!active && Object.keys(project.colors.overrides).length > 0 && (
        <button className="btn" onClick={() => update((p) => ({ ...p, colors: { ...p.colors, overrides: {} } }))}>Reset to palette</button>
      )}
    </Section>
  );
}

export function WordingPanel({ project, update, usage }: PanelProps) {
  if (!usage.wordingKeys.length) return null;
  return (
    <Section title="Wording">
      <p className="hint">Labels are semantic: renaming one updates every page that uses it.</p>
      {usage.wordingKeys.map((k) => (
        <Field key={k} label={DEFAULT_WORDING[k] || k}>
          <input type="text" value={project.wording[k] ?? DEFAULT_WORDING[k]} onChange={(e) => update((p) => ({ ...p, wording: { ...p.wording, [k]: e.target.value } }))} />
        </Field>
      ))}
    </Section>
  );
}

/** One dropdown entry per REAL design: style + snapshot asset. */
const DESIGN_CHOICES: { value: string; label: string; style: DecorativeTheme["style"]; assetId?: string }[] = [
  { value: "none", label: "None", style: "none" },
  { value: "solid", label: "Solid color", style: "solid" },
  { value: "watercolor", label: "Watercolor wash", style: "watercolor" },
  ...DESIGN_ASSETS.map((a) => ({ value: a.id, label: `${a.type === "marble" ? "Marble" : a.type === "floral" ? "Floral" : "Line art"} — ${a.label}`, style: a.type, assetId: a.id })),
];
const PLACEMENT_LABEL: Record<DecorativePlacement, string> = { "full-page": "Full page", "header-band": "Header band", "border-frame": "Margin frame", corners: "Opposite corners" };
const ROLE_NAMES: Record<string, [string, string, string]> = {
  solid: ["Fill", "", ""],
  marble: ["Stone", "Veins", "Highlights"],
  watercolor: ["Wash", "Wisps", "Blooms"],
  floral: ["Leaves", "Gold", "Soft flowers"],
  accent: ["", "Line color", ""],
};
const DECOR_TOKENS: ColorToken[] = ["decorBase", "decorativeAccent", "decorHighlight", "primary", "accent", "border", "background", "text"];

export function DecorationPanel({ project, update }: PanelProps) {
  const d = normalizeDecoration(applyVariant(project).decorativeTheme);
  const set = (patch: Partial<DecorativeTheme>) => setLook(update, { decorativeTheme: patch });
  const choice = d.style === "marble" || d.style === "floral" || d.style === "accent" ? d.assetId! : d.style;
  const placements = placementsFor(d);
  const asset = findAsset(d.assetId);
  const roles = ROLE_NAMES[d.style] ?? ["", "", ""];
  const hasScale = d.style === "accent" || (d.style === "floral" && asset?.type === "floral" && asset.usage !== "bouquet") || d.style === "marble" || (asset?.type === "floral" && asset.usage === "bouquet");
  const scaleLabel = d.style === "accent" || (asset?.type === "floral" && asset.usage !== "bouquet") ? "Size" : "Zoom";
  return (
    <Section title="Decoration">
      <p className="hint">Designs from Journal Color Studio (snapshot). Decoration is its own layer — it never moves lines, grids or calendars.</p>
      <Select
        label="Design"
        value={choice}
        options={DESIGN_CHOICES.map((c) => ({ value: c.value, label: c.label }))}
        onChange={(v) => {
          const c = DESIGN_CHOICES.find((x) => x.value === v)!;
          set(normalizeDecoration({ ...d, style: c.style, assetId: c.assetId }));
        }}
      />
      {d.style !== "none" && (
        <>
          {placements.length > 1 && <Select label="Placement" value={d.placement} options={placements.map((p) => ({ value: p, label: PLACEMENT_LABEL[p] }))} onChange={(placement) => set({ placement })} />}
          <div className="row">
            {hasScale && <NumberField label={scaleLabel} step={0.1} min={scaleLabel === "Zoom" ? 1 : 0.3} max={3} value={d.scale} onChange={(scale) => set({ scale })} />}
            <NumberField label="Opacity" step={0.05} min={0.05} max={1} value={d.opacity} onChange={(opacity) => set({ opacity: Math.min(1, Math.max(0.05, opacity)) })} />
          </div>
          <div className="row">
            {roles[0] && <Select label={roles[0]} value={d.colorA} options={DECOR_TOKENS.map((c) => ({ value: c, label: TOKEN_LABEL[c] }))} onChange={(colorA) => set({ colorA })} />}
            {roles[1] && <Select label={roles[1]} value={d.colorB} options={DECOR_TOKENS.map((c) => ({ value: c, label: TOKEN_LABEL[c] }))} onChange={(colorB) => set({ colorB })} />}
            {roles[2] && <Select label={roles[2]} value={d.colorC} options={DECOR_TOKENS.map((c) => ({ value: c, label: TOKEN_LABEL[c] }))} onChange={(colorC) => set({ colorC })} />}
          </div>
          {d.placement === "full-page" && <Check label="Extend under writing areas" checked={d.applyToInterior} onChange={(applyToInterior) => set({ applyToInterior })} />}
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
