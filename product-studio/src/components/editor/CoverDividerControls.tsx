import type { BookStep, CoverDividerSettings } from "../../types/recipe";
import { Field, NumberField, Select } from "./ui";
export function CoverDividerControls({ step, set, applyPreset }: { step: BookStep; set: (p: Partial<BookStep>) => void; applyPreset: () => void }) {
  const o = step.cover ?? {};
  const change = (p: Partial<CoverDividerSettings>) => set({ cover: { ...o, ...p } });
  const t = o.tab ?? { show: false };
  const tab = (p: Partial<typeof t>) => change({ tab: { ...t, ...p } });
  return <div>
    <Field label="Design preset"><select value={o.preset ?? "neutral-cheetah-luxe"} onChange={(e) => change({ preset: e.target.value as CoverDividerSettings["preset"] })}><option value="neutral-cheetah-luxe">Neutral Cheetah Luxe</option><option value="plain">Plain</option></select></Field>
    <svg viewBox="0 0 180 100" width="180" height="100" aria-label="Neutral Cheetah Luxe preview"><rect width="180" height="100" fill="#f5efe5"/><circle cx="35" cy="15" r="28" fill="#482c20"/><circle cx="155" cy="30" r="25" fill="#d4bca2"/><circle cx="15" cy="95" r="24" fill="#84939c"/><circle cx="175" cy="95" r="25" fill="#a7694e"/><circle cx="20" cy="10" r="55" fill="none" stroke="black"/><text x="90" y="60" textAnchor="middle" fontFamily="cursive" fontSize="28">Plan</text></svg>
    <button className="btn" onClick={applyPreset}>Use matching palette & script title</button>
    <p className="hint">Edit colors, fonts and paper in Theme, Palette and Background. Shapes below use those same colors.</p>
    <Field label="Subtitle"><input value={o.subtitle ?? (step.module === "cover-page" ? "WITH PURPOSE" : "")} onChange={(e) => change({ subtitle: e.target.value })}/></Field>
    <Field label="Optional scripture or quote"><textarea value={o.quote ?? ""} onChange={(e) => change({ quote: e.target.value })}/></Field>
    <label><input type="checkbox" checked={o.smallLine !== false} onChange={(e) => change({ smallLine: e.target.checked })}/> Show small line</label>
    <Select label="Title alignment" value={o.alignment ?? "center"} options={[{ value: "center", label: "Centered" }, { value: "left", label: "Left" }]} onChange={(alignment) => change({ alignment })}/>
    <Select label="Title position" value={o.position ?? "middle"} options={[{ value: "upper", label: "Higher" }, { value: "middle", label: "Middle" }, { value: "lower", label: "Lower" }]} onChange={(position) => change({ position })}/>
    <details><summary>Decorative elements</summary>{(["circles", "outlines", "leopard"] as const).map((key) => <label key={key} style={{ display: "block", minHeight: 44 }}><input type="checkbox" checked={o[key] !== false} onChange={(e) => change({ [key]: e.target.checked })}/>{key === "circles" ? "Filled circles" : key === "outlines" ? "Thin circle outlines" : "Cheetah circle"}</label>)}</details>
    {step.module === "divider-page" && <>
      <label style={{ display: "block", minHeight: 44 }}><input type="checkbox" checked={t.show} onChange={(e) => tab({ show: e.target.checked })}/> Show tab</label>
      {t.show && <>
        <Field label="Tab label"><input value={t.label ?? step.title ?? ""} onChange={(e) => tab({ label: e.target.value })}/></Field>
        <svg viewBox="0 0 180 65" width="180" height="65" aria-label="Tab styles: tall staggered and short rounded"><rect x="10" y="5" width="25" height="55" fill="#d4bca2"/><rect x="95" y="22" width="70" height="25" rx="8" fill="#84939c"/></svg>
        <Select label="Tab style" value={t.style ?? "rounded"} options={[{ value: "rounded", label: "Short rounded" }, { value: "staggered", label: "Tall staggered" }]} onChange={(style) => tab({ style })}/>
        <NumberField label="Tab number" min={1} step={1} value={t.order ?? 1} onChange={(order) => tab({ order })}/>
        <NumberField label="Number of tabs" min={1} max={24} step={1} value={t.count ?? 9} onChange={(count) => tab({ count })}/>
        <Select label="Tab color" value={t.color ?? "secondary"} options={[{ value: "primary", label: "Chocolate" }, { value: "secondary", label: "Taupe" }, { value: "decorativeAccent", label: "Blue gray" }, { value: "accent", label: "Terracotta" }, { value: "decorHighlight", label: "Cream" }]} onChange={(color) => tab({ color })}/>
        <label><input type="checkbox" checked={t.leopard ?? false} onChange={(e) => tab({ leopard: e.target.checked })}/> Cheetah design</label>
        <p className="hint">Tabs print inside the page. They do not protrude or create a cutting template. Fewer tabs give long labels more room.</p>
      </>}
    </>}
  </div>;
}
