/**
 * Phase 8.1 — Develop Original Content. Structure only stays exactly Phase 8; Develop also writes the content
 * (AI-written entries and passages), which is marked in the editor until the maker reviews it, never printed as a
 * mark, and never replaces the maker's own wording. Recorded answers only: no live AI calls.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { appendBatch, batchRequest, checkSpec, MAX_DEVELOPED_ENTRIES, MAX_DEVELOPED_TEXT, type DocSpec, type SpecEntries } from "../src/engines/generate/spec";
import { projectFromSpec } from "../src/engines/generate/convert";
import { buildFromOutline } from "../src/engines/generate/pipeline";
import { resolveDocument, solvePage } from "../src/engines/document/resolve";
import { duplicateRecord, markReviewed, toReview } from "../src/engines/data/data";
import { migrate } from "../src/persistence/projectStore";
import { REQUESTS } from "./fixtures/aiSpecs";
import { day, DESCRIPTION, developed, MAKER } from "./fixtures/developSpecs";
import type { LayoutNode } from "../src/types/layout";
import type { ProductProject } from "../src/types/project";
import type { BookNode } from "../src/types/recipe";
import type { PromptBlock } from "../src/types/prompts";

const AT = "2026-10-15T12:00:00.000Z";
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const textOf = (n: LayoutNode) => (n.type === "text" ? (n.fit?.lines?.join(" ") ?? n.text) : "");
const printed = (p: ProductProject) => {
  const doc = resolveDocument(p);
  return doc.recipe.pages.map((_, i) => solvePage(doc, i));
};
const allText = (p: ProductProject) => squash(printed(p).flatMap((s) => s.nodes.map(textOf)).join(" "));
function blocksOf(nodes: BookNode[] | undefined): PromptBlock[] {
  return (nodes ?? []).flatMap((n) => (n.kind === "group" ? blocksOf(n.children) : n.promptSet?.blocks ?? []));
}
const blocks = (p: ProductProject) => blocksOf(p.recipe.structure);
const records = (p: ProductProject) => (p.data?.collections ?? []).flatMap((c) => c.records);
const stripOrigins = (p: ProductProject): ProductProject => JSON.parse(JSON.stringify(p, (k, v) => (k === "origin" ? undefined : v)));

const check = (spec: DocSpec, mode?: "structure" | "develop") => checkSpec(JSON.stringify(spec), { description: DESCRIPTION, content: MAKER, ...(mode ? { mode } : {}) });

describe("Structure only stays exactly Phase 8", () => {
  for (const r of REQUESTS) {
    it(`${r.id}: the same product with no mode or "structure"; no page section is marked AI-written`, () => {
      const a = checkSpec(JSON.stringify(r.spec), { description: r.description, content: r.content ?? "" });
      const b = checkSpec(JSON.stringify(r.spec), { description: r.description, content: r.content ?? "", mode: "structure" });
      expect(b).toEqual(a);
      expect(a.mode).toBeUndefined();
      const p = projectFromSpec(a, AT);
      // (Each build gets its own id and timestamps.)
      const same = (x: ProductProject) => JSON.stringify({ ...x, id: "", createdAt: "", updatedAt: "" }).replace(/"(col|rec)_[a-z0-9]+"/g, '"$1"');
      expect(same(projectFromSpec(b, AT))).toBe(same(p));
      expect(blocks(p).filter((x) => x.origin)).toEqual([]);
      // The pages print exactly as without any marks.
      expect(allText(p)).toBe(allText(stripOrigins(p)));
    });
  }
  it("the request is exactly Phase 8's: only description and content are sent", async () => {
    const invoke = vi.fn(async () => ({ data: { spec: "{}" }, error: null }));
    vi.doMock("../src/persistence/cloud", () => ({ supabase: () => ({ functions: { invoke } }) }));
    vi.resetModules();
    const { requestSpec } = await import("../src/engines/generate/pipeline");
    await requestSpec("A garden log for a season", "");
    await requestSpec("A garden log for a season", "", { mode: "structure" });
    await requestSpec("A garden log for a season", "", { mode: "develop", entryCount: 7 });
    expect(invoke.mock.calls.map((c) => (c as unknown[])[1])).toEqual([
      { body: { description: "A garden log for a season", content: "" } },
      { body: { description: "A garden log for a season", content: "" } },
      { body: { description: "A garden log for a season", content: "", mode: "develop", entryCount: 7 } },
    ]);
    vi.doUnmock("../src/persistence/cloud");
  });
});

describe("Develop original content: AI-written content is marked, editable, never printed as a mark", () => {
  const checked = check(developed(), "develop");
  const project = projectFromSpec(checked, AT);
  it("every AI-written entry and passage carries origin; the maker's own wording never does", () => {
    expect(checked.mode).toBe("develop");
    expect(records(project)).toHaveLength(7);
    expect(records(project).every((r) => r.origin?.kind === "ai-suggestion" && r.origin.at === AT)).toBe(true);
    const bs = blocks(project);
    const maker = bs.find((b) => b.prompt?.includes("church's fast"));
    expect(maker, "the maker's opening is placed").toBeTruthy();
    expect(maker!.origin).toBeUndefined();
    expect(bs.filter((b) => b.origin).map((b) => b.label || b.prompt)).toEqual(["How to use this journal", "Each day has a short teaching, a question and a prayer. Take your time."]);
    // Parts printing an entry's field, and blank writing space, aren't marked (the entry itself is).
    expect(bs.filter((b) => b.content?.mode === "field").every((b) => !b.origin)).toBe(true);
  });
  it("the maker's wording prints exactly, once; every AI-written day prints", () => {
    const text = allText(project);
    expect(text.split(squash(MAKER)).length - 1).toBe(1);
    for (let n = 1; n <= 7; n++) expect(text).toContain(`Day ${n}: Drawing Near`);
  });
  it("the marks never print: pages are identical with and without them", () => {
    const strip = stripOrigins(project);
    expect(JSON.stringify(printed(project).map((s) => s.nodes))).toBe(JSON.stringify(printed(strip).map((s) => s.nodes)));
  });
  it("is an ordinary product: saves and reloads with its marks; editing keeps the mark until reviewed", () => {
    const back = migrate(JSON.parse(JSON.stringify(project)))!;
    expect(records(back).filter((r) => r.origin)).toHaveLength(7);
    expect(blocks(back).filter((b) => b.origin)).toHaveLength(2);
    const c = back.data!.collections[0];
    expect(toReview(c)).toBe(7);
    const one = markReviewed(back.data, c.id, c.records[0].id);
    expect(toReview(one.collections[0])).toBe(6);
    expect(one.collections[0].records[0].values).toEqual(c.records[0].values);
    expect(toReview(markReviewed(back.data, c.id).collections[0])).toBe(0);
    // A copy of AI-written wording is still AI-written.
    const dup = duplicateRecord(back.data, c.id, c.records[1].id);
    expect(dup.data.collections[0].records.find((r) => r.id === dup.recordId)?.origin?.kind).toBe("ai-suggestion");
  });
  it("older products (no marks) load and print unchanged", () => {
    const old = stripOrigins(project);
    const back = migrate(JSON.parse(JSON.stringify(old)))!;
    expect(records(back).some((r) => r.origin)).toBe(false);
    expect(allText(back)).toBe(allText(project));
  });
  it("the review keeps develop mode through edits (buildFromOutline)", () => {
    const b = buildFromOutline(checked.spec, MAKER, checked);
    expect(b.checked.mode).toBe("develop");
    expect(records(b.project).every((r) => r.origin)).toBe(true);
  });
});

describe("at most 30 complete entries per request; longer series continue in batches", () => {
  it("35 written → the first 30 kept whole, and said; each kept entry is exactly as written", () => {
    const spec = developed(35);
    const c = check(spec, "develop");
    expect(c.spec.entries!.records).toHaveLength(MAX_DEVELOPED_ENTRIES);
    expect(c.spec.entries!.records).toEqual(spec.entries!.records.slice(0, 30));
    expect(c.problems.map((p) => p.message).join(" ")).toMatch(/first 30 are kept whole.*Write the next batch/);
  });
  it("too much writing for one request → fewer entries, never a cut-off one", () => {
    const long = "Long teaching. ".repeat(Math.ceil(MAX_DEVELOPED_TEXT / 15 / 3));
    const c = check(developed(6, (n) => day(n, { teaching: long })), "develop");
    const kept = c.spec.entries!.records;
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(6);
    for (const r of kept) expect(r.values.find((v) => v.key === "teaching")!.value).toBe(long);
  });
  it("Structure only keeps the maker's long lists as before (no 30 cap)", () => {
    const spec = developed(35);
    spec.entries!.source = "user";
    expect(checkSpec(JSON.stringify(spec), { description: DESCRIPTION, content: "" }).spec.entries!.records.length).toBe(35);
  });
  it("the next batch continues the list: its own fields only, added to the end, marked AI-written", () => {
    const first = check(developed(7), "develop");
    const req = batchRequest(first.spec, 50)!;
    expect(req).toMatchObject({ name: "Days", from: 8, count: MAX_DEVELOPED_ENTRIES });
    expect(req.previous.slice(-1)).toEqual(["Day 7: Drawing Near"]);
    const answer = developed(3, (n) => day(n + 7));
    answer.entries!.records[0].values.push({ key: "stray", value: "not one of the fields" });
    const more = check(answer, "develop");
    const r = appendBatch(first.spec, more);
    expect(r.added).toBe(3);
    expect(r.spec.entries!.records.map((x) => x.values.find((v) => v.key === "title")!.value).slice(-3)).toEqual(["Day 8: Drawing Near", "Day 9: Drawing Near", "Day 10: Drawing Near"]);
    expect(r.spec.entries!.records.flatMap((x) => x.values).some((v) => v.key === "stray")).toBe(false);
    const p = projectFromSpec({ ...first, spec: r.spec }, AT);
    expect(records(p)).toHaveLength(10);
    expect(records(p).every((x) => x.origin)).toBe(true);
    expect(appendBatch(first.spec, { ...more, spec: { ...more.spec, entries: null } }).added).toBe(0);
  });
});

describe("Scripture: references and quotations the AI writes are listed to check", () => {
  const withScripture = (teaching: string) => check(developed(1, (n) => day(n, { teaching })), "develop").flags.filter((f) => f.where === "Entry 1");
  it("a reference alone → a reference to check", () => {
    expect(withScripture("Read James 4:8 slowly.").map((f) => f.kind)).toContain("reference");
  });
  it("a public-domain quotation → a quotation to check (wording and translation)", () => {
    const f = withScripture("“Draw nigh to God, and he will draw nigh to you.” (James 4:8, KJV)").filter((x) => x.kind === "quotation");
    expect(f).toHaveLength(1);
    expect(f[0].text).not.toMatch(/copyrighted/);
  });
  it("a quotation from a copyrighted translation → flagged to use the reference only, or KJV / WEB", () => {
    const f = withScripture("“Come near to God and he will come near to you.” (James 4:8, NIV)").filter((x) => x.kind === "quotation");
    expect(f[0].text).toMatch(/copyrighted translation.*reference only.*KJV, WEB/);
  });
  it("the maker's own Scripture isn't flagged as the AI's", () => {
    const spec = developed(1);
    spec.sections[0].components[0].text = MAKER;
    const c = checkSpec(JSON.stringify(spec), { description: DESCRIPTION, content: MAKER, mode: "develop" });
    expect(c.flags.filter((f) => f.where.includes("part 1"))).toEqual([]);
  });
});

describe("the server: develop mode, limits and cost records (Edge Function v9 — not deployed)", () => {
  const fn = readFileSync("../supabase/functions/generate-document/index.ts", "utf8");
  const sql = readFileSync("../supabase/migrations/20261015120000_ai_generation_costs.sql", "utf8");
  const SYSTEM = /const SYSTEM = `([\s\S]*?)`;/.exec(fn)![1];
  const NO_CONTENT = /const NO_CONTENT = "([^"]+)";/.exec(fn)![1];
  it("Structure only's prompt is unchanged; develop replaces exactly its one no-content line", () => {
    expect(SYSTEM).toContain(NO_CONTENT);
    expect(fn).toMatch(/const system = develop \? SYSTEM\.replace\(NO_CONTENT, developRules\(entryCount, batch\)\) : SYSTEM;/);
    expect(fn).toMatch(/temperature: develop \? 0\.5 : 0\.2/);
    expect(fn).toMatch(/\.\.\.\(develop \? \{ max_tokens: DEVELOP_MAX_TOKENS \} : \{\}\)/);
  });
  it("the same entry limit as the studio; mode, counts and batches checked before any usage is counted", () => {
    expect(fn).toMatch(new RegExp(`const MAX_DEVELOPED_ENTRIES = ${MAX_DEVELOPED_ENTRIES};`));
    const usage = fn.indexOf('edge_usage_logs").insert');
    for (const msg of ["Unknown generation mode.", "entries at a time", "next-batch request couldn't be read"]) {
      expect(fn.indexOf(msg), msg).toBeGreaterThan(0);
      expect(fn.indexOf(msg), msg).toBeLessThan(usage);
    }
  });
  it("develop counts as one proposal, like Structure only (one usage row, units 1)", () => {
    expect(fn.match(/edge_usage_logs"\)\.insert\(/g)).toHaveLength(1);
    expect(fn).toMatch(/function_name: FUNCTION_NAME, units: 1 \}/);
  });
  it("Scripture rules: public-domain quotations only, no invented verses, no outside research", () => {
    expect(fn).toMatch(/Quote verse text only from a public-domain translation \(KJV or WEB\)/);
    expect(fn).toMatch(/Never quote a copyrighted translation/);
    expect(fn).toMatch(/Never invent or paraphrase a verse and present it as a quotation/);
    expect(fn).toMatch(/No outside research/);
  });
  it("a cut-off answer is never handed back half-written", () => {
    expect(fn).toMatch(/finish_reason === "length"/);
  });
  it("real token use and cost are recorded with the service role, separately from the allowance", () => {
    expect(fn).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(fn).toMatch(/from\("ai_generation_costs"\)\.insert/);
    expect(fn).toMatch(/prompt_tokens: input, completion_tokens: output/);
    // RLS on, no policy: users can't read or change it.
    expect(sql).toMatch(/enable row level security/);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).not.toMatch(/edge_usage_logs/.source + "\\s*(add|alter|drop)");
  });
  it("no usage-accounting change: refused or oversized answers are still counted (pending Sydni's decision)", () => {
    expect(fn).not.toMatch(/refund/i);
    expect(fn.indexOf('edge_usage_logs").insert')).toBeLessThan(fn.indexOf("api.openai.com/v1/chat/completions"));
  });
});

describe("entries the maker wrote stay theirs in develop mode", () => {
  it("entries claimed as the maker's must be word for word theirs; otherwise they're AI-written and marked", () => {
    const spec = developed(2);
    (spec.entries as SpecEntries).source = "user";
    const c = check(spec, "develop");
    expect(c.spec.entries!.source).toBe("suggested");
    expect(records(projectFromSpec(c, AT)).every((r) => r.origin)).toBe(true);
  });
});
