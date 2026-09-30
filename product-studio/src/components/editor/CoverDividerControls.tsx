import type { BookStep, CoverDividerSettings, CoverPanel } from "../../types/recipe";
import { PANEL_DEFAULTS, wordingColor } from "../../layouts/book/coverDivider";
import { Field, NumberField, Segmented, Select } from "./ui";
import { LUXE_TITLE_FONT } from "../../presets/coverLuxe";
import type { ColorToken, ColorTokens } from "../../types/tokens";
import { COVER_SURFACES, coverSurfaceColors, findCoverSurface, ownPaletteId } from "../../design-library/coverSurfaces";
import { DesignThumb } from "./DesignThumb";
import { NEUTRAL_LUXE_ID, resolveColors } from "../../presets/themes/palettes";

type CoverChoice = "neutral-cheetah-luxe" | "solid" | "plain" | `surface:${string}`;
const choiceOf = (o: CoverDividerSettings): CoverChoice => (o.preset === "surface" && findCoverSurface(o.surfaceId) ? `surface:${o.surfaceId}` : o.preset === "surface" ? "solid" : o.preset ?? "neutral-cheetah-luxe");
const LUXE_MINI = <svg viewBox="0 0 180 100" preserveAspectRatio="xMidYMid slice" className="thumb-fill" aria-hidden><rect width="180" height="100" fill="#ffffff"/><circle cx="38" cy="12" r="34" fill="#5b0610"/><circle cx="118" cy="38" r="24" fill="#f2d8cd"/><circle cx="160" cy="24" r="17" fill="#d6a47c"/><circle cx="182" cy="56" r="21" fill="#c5674a"/><circle cx="18" cy="76" r="14" fill="#e9d3c0"/><circle cx="40" cy="100" r="26" fill="#718496"/><circle cx="60" cy="6" r="50" fill="none" stroke="#cf9e58"/><text x="90" y="64" textAnchor="middle" fontFamily="'The Nautigal', cursive" fontSize="34">Plan</text></svg>;

/**
 * Cover design as pictures, not a list: the Luxe design, a solid palette color,
 * and the Journal Color Studio marbles / watercolor from the design library —
 * each shown in its real artwork. Every choice affects this page only.
 */
function CoverPicker({ value, colors, solidColor, onPick }: { value: CoverChoice; colors: ColorTokens; solidColor: ColorToken; onPick: (c: CoverChoice) => void }) {
  const card = (v: CoverChoice, label: string, hint: string, thumb: React.ReactNode) => (
    <button key={v} type="button" className="design-card" aria-pressed={v === value} title={hint} onClick={() => onPick(v)} data-cover={v}>
      {thumb}
      <span className="design-card-label">{label}</span>
      <span className="design-card-hint">{hint}</span>
    </button>
  );
  return (
    <div className="design-picker cover-picker" role="group" aria-label="Cover design">
      <span className="field-label">Cover design</span>
      <div className="design-grid">
        {card("neutral-cheetah-luxe", "Neutral Cheetah Luxe", "Circles, gold rings + script title", <span className="thumb" data-ready="true">{LUXE_MINI}</span>)}
        {card("solid", "Solid color", "One color from your palette", <span className="thumb" data-ready="true"><span className="thumb-fill" style={{ background: String(colors[solidColor]) }} /></span>)}
        {COVER_SURFACES.map((c) =>
          card(`surface:${c.assetId}`, c.label, c.hint, <DesignThumb design={{ value: c.assetId, label: c.label, hint: c.hint, style: c.assetId.includes("watercolor") ? "watercolor" : "marble", assetId: c.assetId }} colors={coverSurfaceColors(c.assetId, true, colors)} roles={{ colorA: "decorBase", colorB: "decorativeAccent", colorC: "decorHighlight" }} />),
        )}
        {card("plain", "Plain", "The product's own background", <span className="thumb" data-ready="true"><span className="thumb-fill" style={{ background: String(colors.background) }} /></span>)}
      </div>
    </div>
  );
}

const TITLE_FONTS = [
  { value: LUXE_TITLE_FONT, label: "Brush calligraphy (the cover design's)" },
  { value: "The Nautigal", label: "Dramatic bold script" },
  { value: "Dancing Script", label: "Bold handwritten script" },
  { value: "Great Vibes", label: "Elegant flowing script" },
  { value: "Pinyon Script", label: "Formal calligraphy" },
];
export function CoverDividerControls({ step, set, applyPreset, titleFont, onTitleFont, colors: productColors }: { step: BookStep; set: (p: Partial<BookStep>) => void; applyPreset: () => void; titleFont: string; onTitleFont: (font: string) => void; colors?: ColorTokens }) {
  const o = step.cover ?? {};
  const colors = productColors ?? resolveColors(NEUTRAL_LUXE_ID);
  const change = (p: Partial<CoverDividerSettings>) => set({ cover: { ...o, ...p } });
  const t = o.tab ?? { show: false };
  const tab = (p: Partial<typeof t>) => change({ tab: { ...t, ...p } });
  const preset = o.preset ?? "neutral-cheetah-luxe";
  const luxe = preset === "neutral-cheetah-luxe";
  const solid = preset === "solid" || (preset === "surface" && !findCoverSurface(o.surfaceId));
  const surface = preset === "surface" ? findCoverSurface(o.surfaceId) : undefined;
  const back = step.module === "back-cover";
  const page = back ? "end cover" : step.module === "divider-page" ? "divider" : "cover";
  const showText = o.showText !== false;
  const panel = { ...PANEL_DEFAULTS, ...(o.panel ?? {}) } as Required<CoverPanel>;
  const setPanel = (p: Partial<CoverPanel>) => change({ panel: { ...(o.panel ?? {}), ...p } });
  const wording = !showText ? "none" : o.titleOnly && !back ? "title" : "full";
  const colorOptions: { value: ColorToken; label: string }[] = [
    { value: "primary", label: "Primary" },
    { value: "secondary", label: "Secondary" },
    { value: "accent", label: "Accent" },
    { value: "decorativeAccent", label: "Decorative accent" },
    { value: "decorHighlight", label: "Highlight" },
    { value: "background", label: "Paper / background" },
    { value: "text", label: "Text / charcoal" },
  ];
  return <div>
    <CoverPicker value={choiceOf(o)} colors={colors} solidColor={o.solidColor ?? "primary"} onPick={(c) => change(c.startsWith("surface:") ? { preset: "surface", surfaceId: c.slice(8) } : { preset: c as CoverDividerSettings["preset"] })} />
    <p className="hint">This design is for this {page} only — your journal's inside pages keep their own background.</p>
    {luxe && <>
      <button className="btn" onClick={applyPreset}>Use matching palette & script title</button>
      <p className="hint">Edit colors and fonts in Style. The cover shapes follow the matching palette.</p>
    </>}
    {surface && <>
      <Segmented label="Artwork colors" value={o.surfaceColors === "palette" ? "palette" : "own"} options={[{ value: "own", label: ownPaletteId(o.surfaceId) ? "Its own colors" : "As designed" }, { value: "palette", label: "My palette" }]} onChange={(v) => change({ surfaceColors: v })} />
      <p className="hint">{o.surfaceColors === "palette" ? "The artwork is recolored with this product's palette (Style)." : `Shown as designed in Journal Color Studio (“${surface.palette}”).`}</p>
    </>}
    {(solid || surface) && <>
      {solid && <Select label="Cover color" value={o.solidColor ?? "primary"} options={colorOptions} onChange={(solidColor) => change({ solidColor })}/>}
      {showText && <Select label="Wording color" value={wordingColor(o)} options={colorOptions} onChange={(solidTextColor) => change({ solidTextColor })}/>}
      {surface && showText && <label style={{ display: "block", minHeight: 44 }}><input type="checkbox" checked={!!o.textPanel} onChange={(e) => change({ textPanel: e.target.checked })}/> Panel behind the wording (easier to read on busy art)</label>}
      {surface && showText && o.textPanel && <div className="cover-panel-controls">
        <Segmented label="Panel shape" value={panel.shape} options={[{ value: "rectangle", label: "Rectangle" }, { value: "rounded", label: "Rounded" }, { value: "oval", label: "Oval" }, { value: "circle", label: "Circle" }]} onChange={(shape) => setPanel({ shape })} />
        <div className="row">
          <Select label="Panel color" value={panel.fill} options={colorOptions} onChange={(fill) => setPanel({ fill })}/>
          <NumberField label="Panel opacity (0.1 see-through – 1 solid)" min={0.1} max={1} step={0.05} value={panel.opacity} onChange={(opacity) => setPanel({ opacity: Math.max(0.1, Math.min(1, opacity)) })}/>
        </div>
        <div className="row">
          <Select label="Outline" value={panel.outline} options={[{ value: "none", label: "No outline" }, ...colorOptions]} onChange={(outline) => setPanel({ outline })}/>
          {panel.outline !== "none" && <NumberField label="Outline thickness (pt)" min={0.5} max={6} step={0.5} value={panel.outlinePt} onChange={(outlinePt) => setPanel({ outlinePt: Math.max(0.5, Math.min(6, outlinePt)) })}/>}
        </div>
        <label style={{ display: "block", minHeight: 44 }}><input type="checkbox" checked={panel.trim} onChange={(e) => setPanel({ trim: e.target.checked })}/> Thin inner line (gold trim)</label>
      </div>}
      <p className="hint">Wording colors come from the current palette, so changing the palette can recolor them without rebuilding the cover.</p>
    </>}
    <Segmented label="Wording" value={wording} options={back ? [{ value: "full", label: "Line of text" }, { value: "none", label: "No wording" }] : [{ value: "full", label: "Title + subtitle" }, { value: "title", label: "Title only" }, { value: "none", label: "No wording" }]} onChange={(w) => change(w === "none" ? { showText: false } : { showText: true, titleOnly: w === "title" })} />
    {!showText && <p className="hint">Only the artwork prints. The page keeps its name{step.title ? ` (“${step.title}”)` : ""} for Pages and tabs.</p>}
    {showText && <>
      {step.module !== "back-cover" && <Field label={step.module === "cover-page" ? "Cover title" : "Divider title"}><input value={step.title ?? (step.module === "cover-page" ? "Plan" : "")} onChange={(e) => set({ title: e.target.value })}/></Field>}
      <Select label="Title font" value={titleFont} options={[...TITLE_FONTS, ...(TITLE_FONTS.some((f) => f.value === titleFont) ? [] : [{ value: titleFont, label: `Current: ${titleFont}` }])]} onChange={onTitleFont}/>
      <p className="hint">Applies to cover and divider titles throughout this book.</p>
      {wording !== "title" && <Field label={step.module === "back-cover" ? "Line of text (optional)" : "Subtitle"}><input value={o.subtitle ?? (step.module === "cover-page" && luxe ? "WITH PURPOSE" : "")} onChange={(e) => change({ subtitle: e.target.value })}/></Field>}
      <Field label="Optional scripture or quote"><textarea value={o.quote ?? ""} onChange={(e) => change({ quote: e.target.value })}/></Field>
      <label><input type="checkbox" checked={o.smallLine !== false} onChange={(e) => change({ smallLine: e.target.checked })}/> Show small line</label>
      <Select label="Title alignment" value={o.alignment ?? "center"} options={[{ value: "center", label: "Centered" }, { value: "left", label: "Left" }]} onChange={(alignment) => change({ alignment })}/>
      <Select label="Title position" value={o.position ?? "middle"} options={[{ value: "upper", label: "Higher" }, { value: "middle", label: "Middle" }, { value: "lower", label: "Lower" }]} onChange={(position) => change({ position })}/>
    </>}
    {luxe && <details><summary>Decorative elements</summary>{(["circles", "outlines", "leopard"] as const).map((key) => <label key={key} style={{ display: "block", minHeight: 44 }}><input type="checkbox" checked={o[key] !== false} onChange={(e) => change({ [key]: e.target.checked })}/>{key === "circles" ? "Filled circles" : key === "outlines" ? "Thin gold rings" : "Cheetah circles"}</label>)}</details>}
    {luxe && step.module !== "back-cover" && showText && <>
      <label style={{ display: "block", minHeight: 44 }}><input type="checkbox" checked={o.autoFit !== false} onChange={(e) => change({ autoFit: e.target.checked })}/> Fit design to page size</label>
      <p className="hint">{o.autoFit !== false ? "Title, subtitle and shapes adapt to the page size you choose; the text always wins over the shapes." : "The Letter layout scaled to this page; smaller pages may need shorter wording."}</p>
      {o.autoFit !== false && <details><summary>Fine-tune (optional)</summary>
        <p className="hint">Adjusts the fitted design. Nudges are % of the page, so they carry over when you change size.</p>
        <NumberField label="Title size (%)" min={60} max={130} step={5} value={o.titleScale ?? 100} onChange={(titleScale) => change({ titleScale })}/>
        {([["titleOffset", "Title"], ["subtitleOffset", "Subtitle"], ["decorOffset", "Shapes"]] as const).map(([key, label]) => {
          const v = o[key] ?? { x: 0, y: 0 };
          const pct = (n: number) => Math.round(n * 1000) / 10;
          return <div key={key} className="row">
            <NumberField label={`${label} ← →  (%)`} min={-20} max={20} step={0.5} value={pct(v.x)} onChange={(x) => change({ [key]: { ...v, x: x / 100 } })}/>
            <NumberField label={`${label} ↑ ↓  (%)`} min={-20} max={20} step={0.5} value={pct(v.y)} onChange={(y) => change({ [key]: { ...v, y: y / 100 } })}/>
          </div>;
        })}
        <button className="btn" onClick={() => change({ titleScale: undefined, titleOffset: undefined, subtitleOffset: undefined, decorOffset: undefined })}>Reset fine-tuning</button>
      </details>}
    </>}
    {step.module === "divider-page" && <>
      <label style={{ display: "block", minHeight: 44 }}><input type="checkbox" checked={t.show} onChange={(e) => tab({ show: e.target.checked })}/> Show tab</label>
      {t.show && <>
        <Field label="Tab label"><input value={t.label ?? step.title ?? ""} onChange={(e) => tab({ label: e.target.value })}/></Field>
        <svg viewBox="0 0 180 65" width="180" height="65" aria-label="Tab styles: tall staggered and short rounded"><rect x="10" y="5" width="25" height="55" fill="#e9d3c0"/><rect x="95" y="22" width="70" height="25" rx="8" fill="#718496"/></svg>
        <Select label="Tab style" value={t.style ?? "rounded"} options={[{ value: "rounded", label: "Short rounded" }, { value: "staggered", label: "Tall staggered" }]} onChange={(style) => tab({ style })}/>
        <NumberField label="Tab number" min={1} step={1} value={t.order ?? 1} onChange={(order) => tab({ order })}/>
        <NumberField label="Number of tabs" min={1} max={24} step={1} value={t.count ?? 9} onChange={(count) => tab({ count })}/>
        <Select label="Tab color" value={t.color ?? "secondary"} options={[{ value: "primary", label: "Burgundy" }, { value: "secondary", label: "Tan" }, { value: "decorativeAccent", label: "Slate blue" }, { value: "accent", label: "Terracotta" }, { value: "decorHighlight", label: "Blush" }]} onChange={(color) => tab({ color })}/>
        <label><input type="checkbox" checked={t.leopard ?? false} onChange={(e) => tab({ leopard: e.target.checked })}/> Cheetah design</label>
        <p className="hint">Tabs print inside the page. They do not protrude or create a cutting template. Fewer tabs give long labels more room.</p>
      </>}
    </>}
  </div>;
}
