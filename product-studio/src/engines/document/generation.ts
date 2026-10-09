import type { DocComponent, DocumentStructure, FieldDef, ValueType } from "../../types/document";
import type { ProductProject } from "../../types/project";
import type { BookStep } from "../../types/recipe";
import { documentToPromptSet } from "./model";
import { createProject, newId } from "../../presets/products/projectFactory";
import { refitPageFilling } from "../recipe/fitRows";

export type ProposalKind = "devotional" | "inventory" | "intake" | "maintenance" | "workbook";
export type ProposedPage = { id: string; title: string; components: DocComponent[]; copies: number };
export type DocumentProposal = { title: string; kind: ProposalKind; pages: ProposedPage[] };
const kinds: ProposalKind[] = ["devotional", "inventory", "intake", "maintenance", "workbook"];
const values: ValueType[] = ["text", "longText", "number", "currency", "date", "time", "quantity", "boolean", "choice", "signature", "reference", "computed"];
const string = (v: unknown, max = 300) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const field = (v: unknown): v is FieldDef => !!v && typeof v === "object" && string((v as FieldDef).key, 80) && string((v as FieldDef).label, 120) && values.includes((v as FieldDef).valueType);

/** The model is untrusted. Accept only drawable components, never page coordinates or assets. */
export function parseProposal(raw: unknown): DocumentProposal {
  if (!raw || typeof raw !== "object") throw new Error("The proposal is not a document.");
  const p = raw as DocumentProposal;
  if (!string(p.title, 160) || !kinds.includes(p.kind) || !Array.isArray(p.pages) || p.pages.length < 1 || p.pages.length > 24) throw new Error("The proposal has an invalid outline.");
  const ids = new Set<string>();
  const pages = p.pages.map((page, pi) => {
    if (!string(page.title, 160) || !Array.isArray(page.components) || page.components.length > 30 || !Number.isInteger(page.copies) || page.copies < 1 || page.copies > 200) throw new Error(`Page ${pi + 1} is invalid.`);
    const components = page.components.map((c, ci) => {
      if (!c || !string(c.id, 80) || ids.has(c.id)) throw new Error(`Page ${pi + 1} has an invalid section ID.`);
      ids.add(c.id);
      const valid = c.kind === "heading" ? string(c.text, 500) && ["title", "heading"].includes(c.level)
        : c.kind === "text" ? string(c.text, 8000)
        : c.kind === "fieldGroup" ? Array.isArray(c.fields) && c.fields.length > 0 && c.fields.length <= 3 && c.fields.every(field)
        : c.kind === "question" ? string(c.label, 180) && ["pattern", "ruled", "blank", "dot-grid", "graph-grid"].includes(c.response) && !!c.space && ["fixed", "fill", "equal"].includes(c.space.mode)
        : c.kind === "checklist" ? string(c.label, 180) && !!c.space && ["fixed", "fill", "equal"].includes(c.space.mode)
        : c.kind === "table" ? string(c.label, 180) && Array.isArray(c.columns) && c.columns.length > 0 && c.columns.length <= 8 && c.columns.every(field) && Number.isInteger(c.rows) && c.rows >= 1 && c.rows <= 50 && !!c.space && ["fixed", "fill", "equal"].includes(c.space.mode)
        : c.kind === "list" ? string(c.label, 180) && Array.isArray(c.items) && c.items.length <= 30 && c.items.every((i) => string(i.text, 500)) && ["bullet", "number", "checkbox"].includes(c.marker)
        : c.kind === "record" ? string(c.label, 180) && Array.isArray(c.fields) && c.fields.length > 0 && c.fields.length <= 12 && c.fields.every(field) && Number.isInteger(c.count) && c.count >= 1 && c.count <= 50
        : c.kind === "divider" || c.kind === "spacer";
      if (!valid) throw new Error(`Page ${pi + 1}, section ${ci + 1} is unsupported.`);
      return c;
    });
    return { id: string(page.id) ? page.id : `page-${pi + 1}`, title: page.title, components, copies: page.copies };
  });
  return { title: p.title, kind: p.kind, pages };
}

/** One proposal pipeline for every product: universal components → existing prompt pages. */
export function projectFromProposal(proposal: DocumentProposal, sourceContent = ""): ProductProject {
  const p = parseProposal(proposal);
  const steps: BookStep[] = p.pages.map((page) => {
    const structure: DocumentStructure = { components: page.components, whenFull: "continue" };
    const { set, notDrawable } = documentToPromptSet({ structure, presentation: {}, page: {} });
    if (notDrawable.length) throw new Error(`Unsupported sections: ${notDrawable.join(", ")}`);
    return { kind: "step", id: newId("ai_page"), module: "custom", layoutId: "guided-page", cadence: { type: "copies", count: page.copies }, title: page.title, promptSet: set };
  });
  const productType = p.kind === "devotional" ? "devotional" : "custom";
  const project = createProject(productType, {
    name: p.title,
    dimensions: { sizePresetId: p.kind === "devotional" ? "6x9" : "8.5x11", orientation: "portrait" },
    production: { bindingType: p.kind === "devotional" ? "perfect-bound" : "none", printProfileId: p.kind === "devotional" ? "kdp" : "generic-commercial", duplex: p.kind === "devotional" },
    recipe: { items: [], ordering: "sequential", structure: steps },
    ...(sourceContent ? { data: { version: 1 as const, collections: [{ id: "source-content", name: "Original supplied content", fields: [{ key: "text", label: "Original supplied content", valueType: "longText" as const }], records: [{ id: "original", values: { text: sourceContent } }] }] } } : {}),
  });
  return refitPageFilling(project);
}
