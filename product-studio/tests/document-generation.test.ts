import { describe, expect, it } from "vitest";
import { parseProposal, projectFromProposal, type DocumentProposal, type ProposalKind } from "../src/engines/document/generation";
import { resolveDocument, solvePage } from "../src/engines/document/resolve";

const sample = (kind: ProposalKind): DocumentProposal => ({ title: `${kind} product`, kind, pages: [{ id: "page-1", title: "First page", copies: 2, components: [
  { id: "heading-1", kind: "heading", text: "My Heading", level: "heading" },
  { id: "field-1", kind: "fieldGroup", fields: [{ key: "date", label: "Date", valueType: "date" }] },
  { id: "question-1", kind: "question", label: "My Notes", response: "ruled", space: { mode: "fixed", lines: 4 } },
] }] });

describe("AI document proposal", () => {
  it.each<ProposalKind>(["devotional", "inventory", "intake", "maintenance", "workbook"])("builds editable %s pages through the shared renderer", (kind) => {
    const source = "User's exact words: do not alter this sentence.";
    const project = projectFromProposal(sample(kind), source);
    expect(project.data?.collections[0].records[0].values.text).toBe(source);
    const step = project.recipe.structure?.[0];
    expect(step?.kind).toBe("step");
    if (step?.kind === "step") expect(step.promptSet?.blocks.map((b) => b.label)).toEqual(["My Heading", "", "My Notes"]);
    const doc = resolveDocument(project);
    expect(doc.recipe.pages.length).toBeGreaterThanOrEqual(2);
    expect(solvePage(doc, 0).nodes.length).toBeGreaterThan(0);
  });

  it("rejects unsupported or duplicate components instead of losing them", () => {
    const p = sample("workbook");
    p.pages[0].components.push({ id: "question-1", kind: "divider" });
    expect(() => parseProposal(p)).toThrow(/ID/);
    p.pages[0].components.pop();
    p.pages[0].components.push({ id: "image-1", kind: "image", assetRef: "remote", alt: "unexpected" });
    expect(() => parseProposal(p)).toThrow(/unsupported/);
  });
});
