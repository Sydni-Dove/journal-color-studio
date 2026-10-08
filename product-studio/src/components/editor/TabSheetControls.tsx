import { useState } from "react";
import type { BookStep, TabSheetSettings, TabPiece } from "../../types/recipe";
import { Field, NumberField, Select } from "./ui";
import { DEFAULT_TAB_PIECES } from "../../layouts/book/tabSheet";
export function TabSheetControls({ step, entries, set, saveLetter }: { step: BookStep; entries?: TabPiece[]; set: (patch: Partial<BookStep>) => void; saveLetter: () => void }) {
  const [saved, setSaved] = useState(false);
  const o = step.tabSheet ?? {}, list = entries ?? o.entries ?? DEFAULT_TAB_PIECES;
  const change = (patch: Partial<TabSheetSettings>) => { setSaved(false); set({ tabSheet: { ...o, ...patch } }); };
  return <div>
    <p className="hint">Separate pieces for cutting, folding and attaching beyond a divider edge. Print single-sided at 100% on adhesive paper, or use thin cardstock with double-sided tape.</p>
    <label style={{ display: "block", minHeight: 44 }}><input type="checkbox" checked={o.fromDividers !== false} onChange={(e) => change({ fromDividers: e.target.checked, entries: list })}/> Match this book's dividers</label>
    {o.fromDividers !== false ? <p className="hint">{list.map((t) => t.label).join(" · ")}</p> : <>
      <Field label="Tab labels (one per line)"><textarea rows={Math.min(10, Math.max(3, list.length))} value={list.map((t) => t.label).join("\n")} onChange={(e) => change({ entries: e.target.value.split("\n").map((label, i) => ({ ...list[i], label })) })}/></Field>
      <details><summary>Tab colors & designs</summary>{list.map((t, i) => <div key={i}>
        <Select label={`${t.label || `Tab ${i + 1}`} color`} value={t.color ?? "secondary"} options={[{ value: "secondary", label: "Taupe" }, { value: "primary", label: "Chocolate" }, { value: "accent", label: "Terracotta" }, { value: "decorativeAccent", label: "Blue gray" }, { value: "decorHighlight", label: "Cream" }, { value: "text", label: "Black" }]} onChange={(color) => change({ entries: list.map((entry, j) => j === i ? { ...entry, color } : entry) })}/>
        <label><input type="checkbox" checked={t.leopard ?? false} onChange={(e) => change({ entries: list.map((entry, j) => j === i ? { ...entry, leopard: e.target.checked } : entry) })}/> Cheetah design</label>
      </div>)}</details>
    </>}
    <NumberField label="Folded tab width (inches)" min={0.65} max={2} step={0.05} value={o.widthIn ?? 1.05} onChange={(widthIn) => change({ widthIn })}/>
    <NumberField label="Tab height (inches)" min={0.4} max={1.5} step={0.05} value={o.heightIn ?? 0.6} onChange={(heightIn) => change({ heightIn })}/>
    <NumberField label="Attach to page (inches)" min={0.2} step={0.05} value={o.attachIn ?? 0.35} onChange={(attachIn) => change({ attachIn })}/>
    <NumberField label="Divider height (inches)" min={3} step={0.25} value={o.dividerHeightIn ?? 9} onChange={(dividerHeightIn) => change({ dividerHeightIn })}/>
    <label style={{ display: "block", minHeight: 44 }}><input type="checkbox" checked={o.rounded !== false} onChange={(e) => change({ rounded: e.target.checked })}/> Rounded cut pieces</label>
    <label style={{ display: "block", minHeight: 44 }}><input type="checkbox" checked={o.guides !== false} onChange={(e) => change({ guides: e.target.checked })}/> Show fold and attachment guides</label>
    <p className="hint">To print only this sheet, use Show pages, then Export → Current page. For Letter paper, save a separate tab product below and open it from Projects. Test one piece before cutting the full set.</p>
    <button className="btn" onClick={() => { saveLetter(); setSaved(true); }}>Save as separate Letter tab product</button>
    {saved && <p role="status">Saved to Projects as a separate tab product.</p>}
  </div>;
}
