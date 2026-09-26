/**
 * Design controls. Every control here is gated by ProjectUsage: it appears
 * only when the current product consumes it, so none is a placebo.
 */
import { ROLE_LABEL, rolesFor } from "../../design-library/placement";
import { findAsset } from "../../design-library/library";
import { applyVariant } from "../../engines/document/resolve";
import type { ProjectUsage } from "../../engines/document/usage";
import { GRID_PRESETS, RULING_PRESETS } from "../../engines/patterns/patterns";
import { addVariantFromCurrent } from "../../persistence/projectStore";
import { SPACING_LABELS } from "../../presets/spacing/spacingPresets";
import { PALETTES, findPalette } from "../../presets/themes/palettes";
import { DEFAULT_ROLES, FONT_CATALOG, FONT_CATEGORY_LABEL, ROLE_LABELS } from "../../presets/typography/typography";
import { DEFAULT_WORDING } from "../../presets/wording";
import { DESIGN_ASSETS, JCS_SNAPSHOT } from "../../design-library/library";
import { COMPOSITION_ANCHORS, type AlignX, type AlignY, type CompositionAnchor, type DecorationPlacementOverrides } from "../../types/composition";
import type { ElementPosition, SemanticTextKey, TextAnchor } from "../../types/layout";
import { defaultCorners, edgesFor, isObjectPlacement, normalizeDecoration, opacityCap, placementsFor, titlePositionsFor, type PieceReport } from "../../themes/decorationPlan";
import type { ProductProject } from "../../types/project";
import type { CornerSet, DecorativePlacement, DecorativeTheme, EdgeTreatment, FunctionalPatternKind, TitleAccentPosition } from "../../types/theme";
import type { ColorToken, ColorTokens, FontCategory, FontGroup, SpacingDensity, WordingKey } from "../../types/tokens";
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
const PLACEMENT_LABEL: Record<DecorativePlacement, string> = {
  "full-page": "Full background (behind content, soft)",
  "header-band": "Header band",
  "footer-band": "Footer band",
  "edge-strip": "Edge strip (outer edge)",
  "border-frame": "Margin frame (around content)",
  corners: "Corner flourish",
  "title-accent": "Title & rule ornament",
  "top-bottom": "Top + bottom edge flourish",
  "behind-title": "Behind the title (subtle)",
  "edge-accent": "Edge flourish (enters from the side)",
  "header-flourish": "Header flourish (on the title rule)",
  "footer-flourish": "Footer flourish",
};
const CORNER_LABEL: Record<CornerSet, string> = {
  "opposite-tl-br": "Upper-left + lower-right",
  "opposite-tr-bl": "Upper-right + lower-left",
  all: "All four corners",
  top: "Upper corners",
  bottom: "Lower corners",
  tl: "Upper-left only",
  tr: "Upper-right only",
  bl: "Lower-left only",
  br: "Lower-right only",
};
const EDGE_LABEL: Record<EdgeTreatment, string> = {
  contained: "Contained — whole artwork visible (default)",
  bleed: "Bleed off the edge — intentional crop",
};
const TITLE_POSITION_LABEL: Record<TitleAccentPosition, string> = {
  "title-left": "Left of title",
  "title-right": "Right of title",
  "title-above": "Above title",
  "title-above-center": "Centered above title",
  "title-below": "Below title",
  "title-below-center": "Centered below title",
  "rule-left": "Left end of title rule",
  "rule-center": "Center of title rule",
  "rule-right": "Right end of title rule",
  "rule-both": "Both ends of title rule",
};
const ROLE_NAMES: Record<string, [string, string, string]> = {
  solid: ["Fill", "", ""],
  marble: ["Stone", "Veins", "Highlights"],
  watercolor: ["Wash", "Wisps", "Blooms"],
  floral: ["Leaves", "Gold", "Soft flowers"],
  accent: ["", "Line color", ""],
};
const DECOR_TOKENS: ColorToken[] = ["decorBase", "decorativeAccent", "decorHighlight", "primary", "accent", "border", "background", "text"];
const ALIGN_LABEL = { start: "Start", center: "Center", end: "End" } as const;
/** Behind-content backgrounds above this strength compete with writing (JCS soft interiors use 0.16). */
const BEHIND_CONTENT_HINT = 0.3;

/** What the Size control scales, per design (null = the design has no size). */
function sizeControl(d: DecorativeTheme): { label: string; min: number; max: number } | null {
  if (d.style === "marble") return { label: "Zoom", min: 1, max: 3 };
  if (d.style === "floral") return { label: "Size", min: 0.3, max: 2 };
  if (d.style === "accent" && d.placement !== "behind-title") return { label: d.placement === "header-band" || d.placement === "border-frame" ? "Pattern size" : "Size", min: 0.3, max: 3 };
  return null;
}

/** Human names for plan pieces. */
function pieceName(r: PieceReport): string {
  const corner: Record<string, string> = { topLeftAccent: "Top-left corner", topRightAccent: "Top-right corner", bottomLeftAccent: "Bottom-left corner", bottomRightAccent: "Bottom-right corner" };
  if (r.id.startsWith("corner")) return corner[r.anchor] ?? "Corner";
  const title: Record<string, string> = { "title-left": "Left of the title", "title-right": "Right of the title", "title-above": "Above the title", "title-below": "Below the title", "rule-left": "Left end of the title rule", "rule-center": "Center of the title rule", "rule-right": "Right end of the title rule" };
  return (
    title[r.id] ??
    ({ top: "Top edge", bottom: "Bottom edge", behind: "Behind the title", field: "Background", band: "Band", "header-flourish": "Header flourish", "footer-flourish": "Footer flourish", "edge-accent": "Edge accent" } as Record<string, string>)[r.id] ??
    r.id
  );
}

type DecorStatus = { reports: PieceReport[]; colors: ColorTokens; pageNumber: number } | null;

export function DecorationPanel({ project, update, usage, decor }: PanelProps & { decor?: DecorStatus }) {
  const d = normalizeDecoration(applyVariant(project).decorativeTheme);
  const set = (patch: Partial<DecorativeTheme>) => setLook(update, { decorativeTheme: patch });
  const setLayout = (patch: Partial<DecorationPlacementOverrides>) => set({ layout: { ...(d.layout ?? {}), ...patch } });
  const choice = d.style === "marble" || d.style === "floral" || d.style === "accent" ? d.assetId! : d.style;
  const placements = placementsFor(d);
  const designRoles = d.style === "solid" || d.style === "watercolor" ? rolesFor(["header-band", "footer-band", "edge-strip", "margin-frame", "background"]) : d.style === "none" ? [] : rolesFor(findAsset(d.assetId)?.capabilities ?? []);
  const roles = ROLE_NAMES[d.style] ?? ["", "", ""];
  const size = sizeControl(d);
  const cap = opacityCap(d);
  const object = isObjectPlacement(d);
  const o = d.layout ?? {};
  const edges = edgesFor(d.assetId);
  const titlePositions = titlePositionsFor(d.assetId);
  // Show each token's actual colour: tokens that share a colour in this palette look identical on the page.
  const tokenOptions = DECOR_TOKENS.map((c) => ({ value: c, label: decor?.colors[c] ? `${TOKEN_LABEL[c]} · ${decor.colors[c]}` : TOKEN_LABEL[c] }));
  return (
    <Section title="Decoration">
      <p className="hint">
        Designs from Journal Color Studio (snapshot {JCS_SNAPSHOT.commit}). Decoration is composed around the page's content — it never moves lines, grids or calendars, and keeps
        a clearance from them unless you allow overlap.
      </p>
      <Select
        label="Design"
        value={choice}
        options={DESIGN_CHOICES.map((c) => ({ value: c.value, label: c.label }))}
        onChange={(v) => {
          const c = DESIGN_CHOICES.find((x) => x.value === v)!;
          // A new design starts from its strongest composition (its first role-appropriate placement), not the old one.
          const placement = placementsFor({ style: c.style, assetId: c.assetId })[0] ?? d.placement;
          set(normalizeDecoration({ ...d, style: c.style, assetId: c.assetId, placement, corners: undefined, edge: undefined, titlePosition: undefined, layout: undefined }));
        }}
      />
      {designRoles.length > 0 && <p className="hint decor-roles">Designed for: {designRoles.map((r) => ROLE_LABEL[r]).join(" · ")}</p>}
      {d.style !== "none" && (
        <>
          {placements.length > 1 && <Select label="Placement" value={d.placement} options={placements.map((p) => ({ value: p, label: PLACEMENT_LABEL[p] }))} onChange={(placement) => set(normalizeDecoration({ ...d, placement, layout: undefined }))} />}
          {d.placement === "corners" && (
            <Select
              label="Corners"
              value={d.corners ?? "__auto"}
              options={[
                ...(d.style === "floral" ? [{ value: "__auto", label: "Automatic — the pair with the most room" }] : [{ value: "__auto", label: `Default — ${CORNER_LABEL[defaultCorners(d.assetId)]}` }]),
                ...(Object.keys(CORNER_LABEL) as CornerSet[]).map((c) => ({ value: c, label: CORNER_LABEL[c] })),
              ]}
              onChange={(v) => set({ corners: v === "__auto" ? undefined : (v as CornerSet) })}
            />
          )}
          {d.placement === "corners" && edges.length > 1 && (
            <Select label="Edge" value={d.edge ?? "contained"} options={edges.map((e) => ({ value: e, label: EDGE_LABEL[e] }))} onChange={(v) => set({ edge: v === "contained" ? undefined : (v as EdgeTreatment), layout: undefined })} />
          )}
          {d.placement === "title-accent" && (
            <Select
              label="Position"
              value={d.titlePosition ?? "__auto"}
              options={[{ value: "__auto", label: "Automatic — balances the title" }, ...titlePositions.map((t) => ({ value: t, label: TITLE_POSITION_LABEL[t] }))]}
              onChange={(v) => set({ titlePosition: v === "__auto" ? undefined : (v as TitleAccentPosition), layout: undefined })}
            />
          )}
          {decor && decor.reports.some((r) => r.anchor !== "field") && (
            <ul className="decor-status" aria-label="Placement on this page">
              {decor.reports.map((r) => (
                <li key={r.id} className={r.rect ? "" : "decor-status--off"}>
                  <strong>{pieceName(r)}</strong> (page {decor.pageNumber}):{" "}
                  {r.rect ? `${r.scale < 0.999 ? `placed at ${Math.round(r.scale * 100)}% of its size to stay ${r.mode === "contained" ? "fully visible and " : ""}clear of content` : "placed at full size"}${r.mode === "bleed" && r.intentionalClip && r.clippedShare > 0 ? " — bleeds off the edge on purpose" : ""}` : `not placed — ${r.reason}`}
                </li>
              ))}
            </ul>
          )}
          <div className="row">
            {size && <NumberField label={size.label} step={0.1} min={size.min} max={size.max} value={d.scale} onChange={(scale) => set({ scale })} />}
            <NumberField label={cap < 1 ? `Opacity (max ${cap})` : "Opacity"} step={0.05} min={0.05} max={cap} value={d.opacity} onChange={(opacity) => set({ opacity })} />
          </div>
          {object && (
            <div className="row">
              <NumberField label="Offset X" suffix="in" step={0.05} min={-3} max={3} value={o.offsetXIn ?? 0} onChange={(offsetXIn) => setLayout({ offsetXIn })} />
              <NumberField label="Offset Y" suffix="in" step={0.05} min={-3} max={3} value={o.offsetYIn ?? 0} onChange={(offsetYIn) => setLayout({ offsetYIn })} />
            </div>
          )}
          {d.placement === "full-page" && d.opacity > BEHIND_CONTENT_HINT && <p className="hint">Behind writing, keep opacity ≤ {BEHIND_CONTENT_HINT} for legibility (Journal Color Studio interiors use 0.16).</p>}
          <div className="row">
            {roles[0] && <Select label={roles[0]} value={d.colorA} options={tokenOptions} onChange={(colorA) => set({ colorA })} />}
            {roles[1] && <Select label={roles[1]} value={d.colorB} options={tokenOptions} onChange={(colorB) => set({ colorB })} />}
            {roles[2] && <Select label={roles[2]} value={d.colorC} options={tokenOptions} onChange={(colorC) => set({ colorC })} />}
          </div>
          {object && (
            <details className="subsection">
              <summary>Advanced placement</summary>
              <p className="hint">
                The system places the artwork against its target (title, rule, corner, edge) with the spacing tokens, and shrinks it — never crops it — to stay clear of content unless
                bleed is chosen. These settings are fine adjustments; the page rules still apply.
              </p>
              <Select
                label="Anchor"
                value={o.anchor ?? "__default"}
                options={[{ value: "__default", label: "Default for this placement" }, ...COMPOSITION_ANCHORS.filter((a) => usage.compositionAnchors.includes(a.value))]}
                onChange={(v) => setLayout({ anchor: v === "__default" ? undefined : (v as CompositionAnchor) })}
              />
              <div className="row">
                <Select label="Align X" value={o.alignX ?? "__default"} options={[{ value: "__default", label: "Default" }, ...(["start", "center", "end"] as const).map((v) => ({ value: v, label: ALIGN_LABEL[v] }))]} onChange={(v) => setLayout({ alignX: v === "__default" ? undefined : (v as AlignX) })} />
                <Select label="Align Y" value={o.alignY ?? "__default"} options={[{ value: "__default", label: "Default" }, ...(["start", "center", "end"] as const).map((v) => ({ value: v, label: ALIGN_LABEL[v] }))]} onChange={(v) => setLayout({ alignY: v === "__default" ? undefined : (v as AlignY) })} />
              </div>
              <div className="row">
                <NumberField label="Max width" suffix="in" step={0.1} min={0} max={20} value={o.maxWidthIn ?? 0} onChange={(v) => setLayout({ maxWidthIn: v > 0 ? v : undefined })} />
                <NumberField label="Max height" suffix="in" step={0.1} min={0} max={20} value={o.maxHeightIn ?? 0} onChange={(v) => setLayout({ maxHeightIn: v > 0 ? v : undefined })} />
              </div>
              <p className="hint">0 = no limit.</p>
              <Check label="Allow overlap with content" checked={o.allowContentOverlap ?? d.placement === "behind-title"} onChange={(allowContentOverlap) => setLayout({ allowContentOverlap })} />
              {d.placement !== "corners" && (
                <>
                  <Check label="Allow bleed past the trim" checked={o.allowBleed ?? (d.placement === "top-bottom" || d.placement === "edge-accent")} onChange={(allowBleed) => setLayout({ allowBleed })} />
                  <Check label="Allow cropping at the page edge" checked={o.allowClipping ?? false} onChange={(allowClipping) => setLayout({ allowClipping })} />
                </>
              )}
              <button type="button" className="btn" onClick={() => set({ layout: undefined })}>
                Reset placement
              </button>
            </details>
          )}
        </>
      )}
    </Section>
  );
}

const TEXT_LABEL: Record<SemanticTextKey, string> = {
  pageTitle: "Page title",
  monthYear: "Month / year title",
  weekOf: "Week of",
  productTitle: "Product title",
  dateLabel: "Date label",
  footer: "Footer",
  sectionHeading: "Section headings (Notes, Priorities…)",
};
const ANCHOR_LABEL: Record<TextAnchor, string> = {
  "header-left": "Header — left",
  "header-center": "Header — center",
  "header-right": "Header — right",
  "above-content-left": "Above content — left",
  "above-content-center": "Above content — center",
  "above-content-right": "Above content — right",
  "footer-left": "Footer — left",
  "footer-center": "Footer — center",
  "footer-right": "Footer — right",
};
const SECTION_ANCHOR_LABEL: Partial<Record<TextAnchor, string>> = { "above-content-left": "Left", "above-content-center": "Center", "above-content-right": "Right" };

/** Controlled placement of semantic text: logical anchors + print-safe fine offsets. */
export function TextPlacementPanel({ project, update, usage, nav }: PanelProps) {
  if (!usage.semanticText.length) return null;
  const positions = project.layoutOptions.textPositions ?? {};
  const setPos = (key: SemanticTextKey, pos: ElementPosition | undefined) =>
    update((p) => {
      const next = { ...(p.layoutOptions.textPositions ?? {}) };
      if (pos) next[key] = pos;
      else delete next[key];
      return { ...p, layoutOptions: { ...p.layoutOptions, textPositions: next } };
    });
  return (
    <Section title="Text placement">
      <p className="hint">Move titles and headings between the positions each layout supports. Offsets are fine nudges; text always stays inside the print-safe area.</p>
      {usage.semanticText.map(({ key, example, anchors, layoutIds, anchor, defaultAnchor }) => {
        const cur = positions[key];
        const anchorLabel = key === "sectionHeading" ? SECTION_ANCHOR_LABEL : ANCHOR_LABEL;
        return (
          <div key={key} className="field-group">
            <AppliesTo ids={layoutIds} nav={nav} />
            <Select
              label={`${TEXT_LABEL[key]} — “${example.length > 24 ? example.slice(0, 23) + "…" : example}”`}
              value={anchor}
              options={anchors.map((a) => ({ value: a, label: `${anchorLabel[a] ?? a}${a === defaultAnchor ? " (layout default)" : ""}` }))}
              onChange={(v) => setPos(key, v === defaultAnchor && !cur?.offsetXIn && !cur?.offsetYIn ? undefined : { anchor: v as TextAnchor, offsetXIn: cur?.offsetXIn ?? 0, offsetYIn: cur?.offsetYIn ?? 0 })}
            />
            <div className="row">
              <NumberField label="Offset X" suffix="in" step={0.05} min={-5} max={5} value={cur?.offsetXIn ?? 0} onChange={(offsetXIn) => setPos(key, { anchor, offsetYIn: cur?.offsetYIn ?? 0, offsetXIn })} />
              <NumberField label="Offset Y" suffix="in" step={0.05} min={-5} max={5} value={cur?.offsetYIn ?? 0} onChange={(offsetYIn) => setPos(key, { anchor, offsetXIn: cur?.offsetXIn ?? 0, offsetYIn })} />
            </div>
          </div>
        );
      })}
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
