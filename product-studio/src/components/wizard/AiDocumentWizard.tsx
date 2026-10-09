import { useRef, useState } from "react";
import { supabase } from "../../persistence/cloud";
import { parseProposal, projectFromProposal, type DocumentProposal } from "../../engines/document/generation";
import type { ProductProject } from "../../types/project";
import type { DocComponent } from "../../types/document";

const labelOf = (c: DocComponent): string => c.kind === "heading" || c.kind === "text" ? c.text : "label" in c ? c.label ?? "" : c.kind;
const editLabel = (c: DocComponent, text: string): DocComponent => c.kind === "heading" || c.kind === "text" ? { ...c, text } : "label" in c ? { ...c, label: text } : c;

export function AiDocumentWizard({ onCreate, onCancel }: { onCreate: (p: ProductProject) => void; onCancel: () => void }) {
  const [description, setDescription] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [proposal, setProposal] = useState<DocumentProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const change = (update: (p: DocumentProposal) => DocumentProposal) => setProposal((p) => p && update(p));
  const updateComponent = (pi: number, ci: number, update: (c: DocComponent) => DocComponent) => change((p) => ({ ...p, pages: p.pages.map((page, i) => i === pi ? { ...page, components: page.components.map((c, j) => j === ci ? update(c) : c) } : page) }));
  const movePage = (pi: number, direction: -1 | 1) => change((p) => {
    const pages = [...p.pages]; const target = pi + direction;
    if (target >= 0 && target < pages.length) [pages[pi], pages[target]] = [pages[target], pages[pi]];
    return { ...p, pages };
  });
  const generate = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(""); setBusy(true);
    try {
      const { data, error: invokeError } = await supabase().functions.invoke("generate-document", { body: { description, sourceContent } });
      if (invokeError) {
        const response = "context" in invokeError ? invokeError.context : null;
        if (response instanceof Response) {
          const detail = await response.clone().json().catch(() => null);
          if (typeof detail?.error === "string") throw new Error(detail.error);
        }
        throw invokeError;
      }
      if (data?.error) throw new Error(data.error);
      setProposal(parseProposal(data?.proposal));
    } catch (e) { setError(e instanceof Error ? e.message : "Document generation failed."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const create = () => {
    if (!proposal) return;
    try { setError(""); onCreate(projectFromProposal(proposal, sourceContent)); }
    catch (e) { setError(e instanceof Error ? e.message : "The proposal could not be created."); }
  };
  return <div className="page-shell">
    <div className="row"><h1 style={{ flex: 1 }}>Generate a document</h1><button className="btn" onClick={onCancel}>Cancel</button></div>
    <p className="lede">Describe the product you want. Review its editable page outline before creating it.</p>
    {!proposal ? <section className="panel" style={{ display: "grid", gap: 16 }}>
      <label>What should this document do?<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} placeholder="For example: an inventory notebook with item details, stock counts and reorder logs" style={{ width: "100%" }} /></label>
      <label>Your existing wording or notes (optional)<textarea value={sourceContent} onChange={(e) => setSourceContent(e.target.value)} rows={6} placeholder="Paste wording to keep exactly. It will appear on a separate editable Provided Content page." style={{ width: "100%" }} /></label>
      <button className="btn btn--primary" onClick={() => void generate()} disabled={busy || description.trim().length < 10}>{busy ? "Generating…" : "Generate outline"}</button>
    </section> : <section className="panel" style={{ display: "grid", gap: 16 }}>
      <p className="hint">Review every page and section. You can keep editing the product in the studio after creation.</p>
      <label>Product title<input value={proposal.title} onChange={(e) => change((p) => ({ ...p, title: e.target.value }))} /></label>
      {proposal.pages.map((page, pi) => <div key={page.id} className="panel" style={{ display: "grid", gap: 10 }}>
        <label>Page {pi + 1} title<input value={page.title} onChange={(e) => change((p) => ({ ...p, pages: p.pages.map((x, i) => i === pi ? { ...x, title: e.target.value } : x) }))} /></label>
        <label>Copies<input type="number" min={1} max={200} value={page.copies} onChange={(e) => change((p) => ({ ...p, pages: p.pages.map((x, i) => i === pi ? { ...x, copies: Number(e.target.value) } : x) }))} /></label>
        {page.components.map((component, ci) => <div key={component.id} style={{ display: "grid", gap: 6 }}>
          <label>{component.kind} {ci + 1}<input value={labelOf(component)} onChange={(e) => updateComponent(pi, ci, (c) => editLabel(c, e.target.value))} /></label>
          {"prompt" in component && <label>Instruction<input value={component.prompt ?? ""} onChange={(e) => updateComponent(pi, ci, (c) => "prompt" in c ? { ...c, prompt: e.target.value } : c)} /></label>}
          {(component.kind === "fieldGroup" || component.kind === "table" || component.kind === "record") && <label>Fields or columns (one per line)<textarea rows={Math.max(2, component.kind === "table" ? component.columns.length : component.fields.length)} value={(component.kind === "table" ? component.columns : component.fields).map((f) => f.label).join("\n")} onChange={(e) => updateComponent(pi, ci, (c) => {
            const labels = e.target.value.split("\n");
            if (c.kind === "table") return { ...c, columns: labels.map((label, i) => ({ ...(c.columns[i] ?? { key: `${c.id}.c${i}`, valueType: "text" as const }), label })) };
            if (c.kind === "fieldGroup" || c.kind === "record") return { ...c, fields: labels.map((label, i) => ({ ...(c.fields[i] ?? { key: `${c.id}.f${i}`, valueType: "text" as const }), label })) };
            return c;
          })} /></label>}
          <div className="row"><button className="btn" disabled={ci === 0} onClick={() => change((p) => ({ ...p, pages: p.pages.map((x, i) => i === pi ? { ...x, components: x.components.map((c, j, all) => j === ci - 1 ? all[ci] : j === ci ? all[ci - 1] : c) } : x) }))}>Move up</button><button className="btn" disabled={ci === page.components.length - 1} onClick={() => change((p) => ({ ...p, pages: p.pages.map((x, i) => i === pi ? { ...x, components: x.components.map((c, j, all) => j === ci ? all[ci + 1] : j === ci + 1 ? all[ci] : c) } : x) }))}>Move down</button><button className="btn" onClick={() => change((p) => ({ ...p, pages: p.pages.map((x, i) => i === pi ? { ...x, components: x.components.filter((_, j) => j !== ci) } : x) }))}>Remove section</button></div>
        </div>)}
        <button className="btn" onClick={() => change((p) => ({ ...p, pages: p.pages.map((x, i) => i === pi ? { ...x, components: [...x.components, { id: `added-${crypto.randomUUID()}`, kind: "question", label: "New section", response: "ruled", space: { mode: "fixed", lines: 4 } }] } : x) }))}>Add writing section</button>
        <div className="row"><button className="btn" disabled={pi === 0} onClick={() => movePage(pi, -1)}>Move page up</button><button className="btn" disabled={pi === proposal.pages.length - 1} onClick={() => movePage(pi, 1)}>Move page down</button></div>
        <button className="btn" onClick={() => change((p) => ({ ...p, pages: p.pages.filter((_, i) => i !== pi) }))} disabled={proposal.pages.length <= 1}>Remove page</button>
      </div>)}
      <button className="btn" onClick={() => change((p) => ({ ...p, pages: [...p.pages, { id: `added-${crypto.randomUUID()}`, title: "New page", copies: 1, components: [{ id: `added-${crypto.randomUUID()}`, kind: "question", label: "New section", response: "ruled", space: { mode: "fixed", lines: 4 } }] }] }))}>Add page</button>
      <div className="row"><button className="btn" onClick={() => setProposal(null)}>Revise description</button><button className="btn btn--primary" onClick={create}>Create editable product</button></div>
    </section>}
    {error && <p role="alert" className="hint">{error}</p>}
  </div>;
}
