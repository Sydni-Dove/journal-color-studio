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
    const sourceStep = project.recipe.structure?.at(-1);
    if (sourceStep?.kind === "step") {
      expect(sourceStep.title).toBe("Provided Content");
      expect(sourceStep.promptSet?.blocks.filter((b) => b.textStyle === "body").map((b) => b.label).join("")).toBe(source);
    }
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

  it("retains long supplied wording across continuation pages", () => {
    const source = Array.from({ length: 800 }, (_, i) => `Exact-${i}`).join(" ");
    const project = projectFromProposal(sample("workbook"), source);
    const sourceStep = project.recipe.structure?.at(-1);
    if (sourceStep?.kind !== "step") throw new Error("Source page missing");
    expect(sourceStep.promptSet?.blocks.filter((b) => b.textStyle === "body").map((b) => b.label).join("")).toBe(source);
    const doc = resolveDocument(project);
    expect(doc.recipe.pages.length).toBeGreaterThan(2);
    const printed = doc.recipe.pages.flatMap((_, i) => solvePage(doc, i).nodes.filter((n) => n.type === "text" && n.id.includes("provided-content-")).map((n) => n.type === "text" ? n.text : ""));
    expect(printed.filter((text) => text.startsWith("Exact-")).join(" ").split(/\s+/)).toEqual(source.split(" "));
  });
});
