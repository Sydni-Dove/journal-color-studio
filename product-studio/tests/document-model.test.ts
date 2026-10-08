/**
 * Universal document model (types/document.ts, engines/document/model.ts):
 * today's pages convert to it and back without changing a single printed
 * node; fingerprints ignore styling; requirement standings are reported one by
 * one, never as a blanket claim.
 */
import { describe, expect, it } from "vitest";
import { resolveDocument, solvePage } from "../src/engines/document/resolve";
import { createProject } from "../src/presets/products/projectFactory";
import { step } from "../src/presets/bookRecipes";
import { RECIPE_PRESETS } from "../src/presets/layouts/recipePresets";
import { PROMPT_STARTERS, promptSetFromList, type PromptSet } from "../src/types/prompts";
import { PAGE_MODULES } from "../src/presets/modules";
import { STATIONERY_RECIPES, stationeryLayoutId } from "../src/presets/stationery/catalog";
import { recipePromptSet } from "../src/layouts/stationery/stationeryLayout";
import type { StationeryRecipe } from "../src/types/stationery";
import { documentToPromptSet, promptSetToDocument, requirementStandings, semanticFingerprint, componentToBlock } from "../src/engines/document/model";
import type { DocComponent, Requirement, RequirementLink } from "../src/types/document";

/** Every PromptSet the app ships: the starters and every one inside a template. */
function shippedPromptSets(): { name: string; set: PromptSet }[] {
  const out: { name: string; set: PromptSet }[] = PROMPT_STARTERS.map((s) => ({ name: `starter ${s.id}`, set: s.set() }));
  const walk = (x: unknown, name: string) => {
    if (Array.isArray(x)) x.forEach((v) => walk(v, name));
    else if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (o.promptSet && typeof o.promptSet === "object") out.push({ name: `${name} ${String(o.title ?? o.module ?? "")}`.trim(), set: o.promptSet as PromptSet });
      Object.values(o).forEach((v) => walk(v, name));
    }
  };
  for (const r of RECIPE_PRESETS) walk(r.build({ count: 1, sheets: 1 }), r.id);
  // Guided modules (Meeting With God, vision, goals, reviews…) build theirs from their prompt lists.
  for (const m of PAGE_MODULES) for (const [period, prompts] of Object.entries(m.prompts)) if (prompts?.length) out.push({ name: `module ${m.type} (${period})`, set: promptSetFromList(prompts) });
  return out;
}

/** Every devotional / worksheet / journal catalog page's prompt set, as the editor starts from it. */
const catalogPages = (): { recipe: StationeryRecipe; page: number; set: PromptSet }[] =>
  STATIONERY_RECIPES.flatMap((recipe) => recipe.pages.map((_, page) => ({ recipe, page, set: recipePromptSet(recipe, page, {}) })));

/** What a catalog page prints with this prompt set as the creator's own (its own layout, not a guided page). */
function printedCatalog(recipe: StationeryRecipe, page: number, set: PromptSet, size: string): string {
  const promptPages: (PromptSet | undefined)[] = [];
  promptPages[page] = set;
  const p = createProject(recipe.family === "devotional" ? "devotional" : recipe.family === "worksheet" ? "worksheet" : recipe.family === "planner" ? "planner" : "journal", {
    name: "Catalog check",
    dimensions: { sizePresetId: size, orientation: "portrait" },
    recipe: { items: [{ id: "page", layoutId: stationeryLayoutId(recipe.comboId), repeat: { kind: "count", count: 1 } }], ordering: "sequential" },
    layoutOptions: { stationery: { [recipe.comboId]: { promptPages } } },
  });
  const doc = resolveDocument(p);
  return JSON.stringify(doc.recipe.pages.map((_, i) => { const s = solvePage(doc, i); return { nodes: s.nodes, diagnostics: s.diagnostics }; }));
}

/** One page using every section kind and every option the PromptSet offers. */
const KITCHEN_SINK: PromptSet = {
  spacing: "roomy",
  frame: "outline",
  instructions: "Answer each question in your own words.",
  header: { eyebrow: "STEP TWO", number: "02", subtitle: "The Word", reference: "Habakkuk 2:2", rule: true },
  whenFull: "continue",
  blocks: [
    { id: "h1", kind: "heading", label: "Supplier Information", textStyle: "title", prompt: "Who supplied this item?", headingAlign: "center", headingRule: true },
    { id: "h2", kind: "heading", label: "A line of body text.", textStyle: "body" },
    { id: "i1", kind: "info", label: "", fields: ["Date", "Time", "Location"], fieldStyles: ["line", "box", "line"] },
    { id: "q1", label: "What did God say?", prompt: "Write it exactly.", space: "fixed", lineCount: 5, minLines: 3, frame: "panel", badge: "1", headingFont: "Lora", headingSizePt: 14, content: { mode: "field", key: "revelation" } },
    { id: "q2", label: "Scripture", responseStyle: "dot-grid", space: "equal", beside: true },
    { id: "c1", label: "Action steps", responseStyle: "checkboxes", lineCount: 4, taskMarker: "circle", taskMarkerPosition: "right", taskLines: false },
    { id: "t1", label: "Inventory", responseStyle: "table", table: { columns: ["Item", "Supplier", "Qty"], rows: 6, showHeader: true, borders: "horizontal", rowSpace: "spacious" }, space: "fill", weight: 2 },
    { id: "d1", kind: "divider", label: "" },
    { id: "s1", kind: "spacer", label: "", spacer: "small" },
    { id: "s2", kind: "spacer", label: "" },
    { id: "q3", label: "Notes", responseStyle: "blank" },
    { id: "l1", kind: "list", label: "Packing", listMarker: "number", items: [{ text: "Clothes" }, { text: "Shoes", level: 1 }, { text: "Socks", level: 1 }, { text: "Bible" }] },
    { id: "r1", kind: "record", label: "Journal entries", recordFields: ["Date", "Signer", "ID type"], recordCount: 2, numbering: { prefix: "Entry", start: 5 } },
  ],
};

/** What a guided page with this PromptSet prints: every node and diagnostic of every page. */
function printed(set: PromptSet, size: string): string {
  const p = createProject("journal", {
    name: "Model check",
    dimensions: { sizePresetId: size, orientation: "portrait" },
    recipe: { items: [], ordering: "sequential", structure: [step("guided", { type: "copies", count: 1 }, { id: "s-fixed", title: "Check", promptSet: set })] },
  });
  const doc = resolveDocument(p);
  return JSON.stringify(doc.recipe.pages.map((_, i) => { const s = solvePage(doc, i); return { nodes: s.nodes, diagnostics: s.diagnostics }; }));
}

describe("today's pages through the universal model", () => {
  const sets = [...shippedPromptSets(), { name: "kitchen sink", set: KITCHEN_SINK }];
  it("covers every shipped prompt set (and the page using every option)", () => {
    expect(sets.length).toBeGreaterThan(PROMPT_STARTERS.length);
  });
  for (const { name, set } of sets) {
    it(`${name}: converting to the model and back prints exactly the same pages`, () => {
      const back = documentToPromptSet(promptSetToDocument(set));
      expect(back.notDrawable).toEqual([]);
      for (const size of ["7x9", "5.5x8.5"]) expect(printed(back.set, size), size).toBe(printed(set, size));
    });
    it(`${name}: converting again changes nothing`, () => {
      const once = promptSetToDocument(set);
      const twice = promptSetToDocument(documentToPromptSet(once).set);
      expect(twice).toEqual(once);
    });
  }
  for (const { recipe, page, set } of catalogPages()) {
    it(`catalog ${recipe.comboId} page ${page + 1}: converting to the model and back prints exactly the same pages`, () => {
      const back = documentToPromptSet(promptSetToDocument(set));
      expect(back.notDrawable).toEqual([]);
      for (const size of ["7x9", "5.5x8.5"]) expect(printedCatalog(recipe, page, back.set, size), size).toBe(printedCatalog(recipe, page, set, size));
      // (and the page really prints the set it is given: a changed heading shows)
      if (set.blocks.length) {
        const changed = { ...set, blocks: set.blocks.map((b, i) => (i === 0 ? { ...b, label: "Changed heading" } : b)) };
        expect(printedCatalog(recipe, page, changed, "7x9")).not.toBe(printedCatalog(recipe, page, set, "7x9"));
      }
    });
  }
  it("styling is kept apart from what the page asks for", () => {
    const v = promptSetToDocument(KITCHEN_SINK);
    const q1 = v.structure.components.find((c) => c.id === "q1")!;
    expect(JSON.stringify(q1)).not.toMatch(/Lora|panel|headingSizePt|badge/);
    expect(v.presentation.q1).toEqual({ frame: "panel", badge: "1", headingFont: "Lora", headingSizePt: 14 });
    expect(v.presentation.t1).toEqual({ tableBorders: "horizontal" });
    expect(v.page).toMatchObject({ spacing: "roomy", frame: "outline" });
    const t1 = v.structure.components.find((c) => c.id === "t1")!;
    expect(t1.kind === "table" && t1.columns.map((c) => [c.label, c.valueType])).toEqual([["Item", "text"], ["Supplier", "text"], ["Qty", "text"]]);
  });
  it("components today's pages can't draw yet are reported, never dropped silently", () => {
    const v = promptSetToDocument(KITCHEN_SINK);
    const image: DocComponent = { id: "img1", kind: "image", assetRef: "library:dove", alt: "Dove" };
    const out = documentToPromptSet({ ...v, structure: { ...v.structure, components: [...v.structure.components, image] } });
    expect(out.notDrawable).toEqual(["img1"]);
    expect(componentToBlock(image)).toBeNull();
  });
});

describe("semantic fingerprint", () => {
  const v = promptSetToDocument(KITCHEN_SINK);
  const t1 = v.structure.components.find((c) => c.id === "t1")!;
  it("is the same for the same content and ignores styling (styling isn't part of a component)", () => {
    expect(semanticFingerprint(t1)).toBe(semanticFingerprint(JSON.parse(JSON.stringify(t1))));
    // A restyle changes only the presentation hints: the component, and so the fingerprint, is untouched.
    const restyled = promptSetToDocument({ ...KITCHEN_SINK, blocks: KITCHEN_SINK.blocks.map((b) => (b.id === "t1" ? { ...b, frame: "rounded" as const, badge: "9", table: { ...b.table!, borders: "grid" as const } } : b)) });
    expect(semanticFingerprint(restyled.structure.components.find((c) => c.id === "t1")!)).toBe(semanticFingerprint(t1));
  });
  it("changes when what is asked for changes: a column renamed, removed, or retyped", () => {
    if (t1.kind !== "table") throw new Error("table");
    const renamed = { ...t1, columns: t1.columns.map((c, i) => (i === 1 ? { ...c, label: "Supplier Information" } : c)) };
    const removed = { ...t1, columns: t1.columns.slice(0, 2) };
    const retyped = { ...t1, columns: t1.columns.map((c, i) => (i === 2 ? { ...c, valueType: "quantity" as const } : c)) };
    for (const changed of [renamed, removed, retyped]) expect(semanticFingerprint(changed)).not.toBe(semanticFingerprint(t1));
  });
});

describe("requirement standings (reserved): reported one by one, never a blanket claim", () => {
  const signer: DocComponent = { id: "signer", kind: "fieldGroup", fields: [{ key: "signer", label: "Signer name", valueType: "text" }, { key: "id", label: "ID type", valueType: "choice", options: ["Driver's license", "Passport"] }] };
  const notes: DocComponent = { id: "notes", kind: "question", label: "Notes", response: "ruled", space: { mode: "fill" } };
  const req = (id: string, extra: Partial<Requirement> = {}): Requirement => ({
    id, statement: `Requirement ${id}`, strength: "mandatory", satisfiedBy: "document",
    source: { kind: "regulation", title: "Official handbook", quote: "The journal shall record…", retrievedAt: "2026-10-01" },
    verification: { status: "verified", by: "Sydni", at: "2026-10-02" }, ...extra,
  });
  const link = (requirementId: string, c: DocComponent): RequirementLink => ({ requirementId, componentId: c.id, approvedFingerprint: semanticFingerprint(c) });

  it("met · missing · unverified · operational", () => {
    const reports = requirementStandings(
      [req("a"), req("b"), req("c", { verification: { status: "unverified" } }), req("d", { satisfiedBy: "operational" }), req("e", { source: { kind: "ai-suggestion", suggestedAt: "2026-10-02" }, verification: { status: "unverified" } })],
      [link("a", signer), link("c", notes), link("e", notes)],
      [signer, notes],
    );
    expect(reports.map((r) => [r.requirementId, r.standing])).toEqual([["a", "met"], ["b", "missing"], ["c", "unverified"], ["d", "operational"], ["e", "unverified"]]);
  });
  it("a removed or materially changed linked field is named; a restyle (presentation only) is not a change", () => {
    const l = link("a", signer);
    const relabeled: DocComponent = { ...signer, fields: signer.kind === "fieldGroup" ? signer.fields.map((f) => (f.key === "id" ? { ...f, label: "Identification" } : f)) : [] };
    expect(requirementStandings([req("a")], [l], [relabeled])[0]).toMatchObject({ standing: "changed", changedComponents: ["signer"] });
    expect(requirementStandings([req("a")], [l], [notes])[0]).toMatchObject({ standing: "changed", missingComponents: ["signer"] });
    // Styling lives in PresentationHints, outside the component: nothing to compare, so it stays met.
    expect(requirementStandings([req("a")], [l], [signer])[0].standing).toBe("met");
  });
  it("a field inside a section is found, and changing it changes the section too", () => {
    const section: DocComponent = { id: "sec", kind: "section", label: "Entry", children: [signer] };
    expect(requirementStandings([req("a")], [link("a", signer)], [section])[0].standing).toBe("met");
    const edited: DocComponent = { ...section, children: [{ ...signer, fields: [] } as DocComponent] };
    expect(semanticFingerprint(edited)).not.toBe(semanticFingerprint(section));
  });
});
