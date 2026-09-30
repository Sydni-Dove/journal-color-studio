import type { BookStep, CoverDividerSettings } from "../../types/recipe";
import { Field, NumberField, Select } from "./ui";
import { LUXE_TITLE_FONT } from "../../presets/coverLuxe";

const TITLE_FONTS = [
  { value: LUXE_TITLE_FONT, label: "Brush calligraphy (the cover design's)" },
  { value: "The Nautigal", label: "Dramatic bold script" },
  { value: "Dancing Script", label: "Bold handwritten script" },
  { value: "Great Vibes", label: "Elegant flowing script" },
  { value: "Pinyon Script", label: "Formal calligraphy" },
];
export function CoverDividerControls({ step, set, applyPreset, titleFont, onTitleFont }: { step: BookStep; set: (p: Partial<BookStep>) => void; applyPreset: () => void; titleFont: string; onTitleFont: (font: string) => void }) {
  const o = step.cover ?? {};
  const change = (p: Partial<CoverDividerSettings>) => set({ cover: { ...o, ...p } });
  const t = o.tab ?? { show: false };
  const tab = (p: Partial<typeof t>) => change({ tab: { ...t, ...p } });
  return <div>
    <Field label="Design preset"><select value={o.preset ?? "neutral-cheetah-luxe"} onChange={(e) => change({ preset: e.target.value as CoverDividerSettings["preset"] })}><option value="neutral-cheetah-luxe">Neutral Cheetah Luxe</option><option value="plain">Plain</option></select></Field>
    <svg viewBox="0 0 180 100" width="180" height="100" aria-label="Neutral Cheetah Luxe preview"><rect width="180" height="100" fill="#ffffff" stroke="#e5e0da"/><circle cx="38" cy="12" r="34" fill="#5b0610"/><circle cx="118" cy="38" r="24" fill="#f2d8cd"/><circle cx="160" cy="24" r="17" fill="#d6a47c"/><circle cx="182" cy="56" r="21" fill="#c5674a"/><circle cx="18" cy="76" r="14" fill="#e9d3c0"/><circle cx="40" cy="100" r="26" fill="#718496"/><circle cx="60" cy="6" r="50" fill="none" stroke="#cf9e58"/><text x="90" y="64" textAnchor="middle" fontFamily="'The Nautigal', cursive" fontSize="34">Plan</text></svg>
    <button className="btn" onClick={applyPreset}>Use matching palette & script title</button>
    <p className="hint">Edit colors, fonts and paper in Theme, Palette and Background. Shapes below use those same colors.</p>
    <Select label="Title font" value={titleFont} options={[...TITLE_FONTS, ...(TITLE_FONTS.some((f) => f.value === titleFont) ? [] : [{ value: titleFont, label: `Current: ${titleFont}` }])]} onChange={onTitleFont}/>
    <p className="hint">Applies to cover and divider titles throughout this book.</p>
    <Field label={step.module === "back-cover" ? "Line of text (optional)" : "Subtitle"}><input value={o.subtitle ?? (step.module === "cover-page" ? "WITH PURPOSE" : "")} onChange={(e) => change({ subtitle: e.target.value })}/></Field>
    <Field label="Optional scripture or quote"><textarea value={o.quote ?? ""} onChange={(e) => change({ quote: e.target.value })}/></Field>
    <label><input type="checkbox" checked={o.smallLine !== false} onChange={(e) => change({ smallLine: e.target.checked })}/> Show small line</label>
    <Select label="Title alignment" value={o.alignment ?? "center"} options={[{ value: "center", label: "Centered" }, { value: "left", label: "Left" }]} onChange={(alignment) => change({ alignment })}/>
    <Select label="Title position" value={o.position ?? "middle"} options={[{ value: "upper", label: "Higher" }, { value: "middle", label: "Middle" }, { value: "lower", label: "Lower" }]} onChange={(position) => change({ position })}/>
    <details><summary>Decorative elements</summary>{(["circles", "outlines", "leopard"] as const).map((key) => <label key={key} style={{ display: "block", minHeight: 44 }}><input type="checkbox" checked={o[key] !== false} onChange={(e) => change({ [key]: e.target.checked })}/>{key === "circles" ? "Filled circles" : key === "outlines" ? "Thin gold rings" : "Cheetah circles"}</label>)}</details>
    {step.module !== "back-cover" && <>
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
