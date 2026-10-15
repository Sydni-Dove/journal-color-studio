/**
 * Phase 8.1 — Develop Original Content. Structure only stays exactly Phase 8; Develop also writes the content
 * (AI-written entries and passages), which is marked in the editor until the maker reviews it, never printed as a
 * mark, and never replaces the maker's own wording. Recorded answers only: no live AI calls.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { appendBatch, batchRequest, checkSpec, MAX_DEVELOPED_ENTRIES, MAX_DEVELOPED_TEXT, MAX_DOCUMENT_PAGES, minimumPages, PageLimitError, quantityChoices, reduceToFit, requestedOverLimit, splitToFit, type DocSpec, type SpecEntries } from "../src/engines/generate/spec";
import { projectFromSpec } from "../src/engines/generate/convert";
import { buildFromOutline } from "../src/engines/generate/pipeline";
import { resolveDocument, solvePage } from "../src/engines/document/resolve";
import { duplicateRecord, markReviewed, toReview } from "../src/engines/data/data";
import { migrate } from "../src/persistence/projectStore";
import { REQUESTS, part, section } from "./fixtures/aiSpecs";
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
  it("written entries with no page printing them: a page per entry is added (nothing written is lost), and said", () => {
    const spec = developed(3);
    spec.sections = [spec.sections[0]];
    const c = check(spec, "develop");
    const each = c.spec.sections.find((s) => s.repeat.mode === "per-entry")!;
    expect(each.title).toBe("{title}");
    expect(each.components.map((x) => x.fromEntryField)).toEqual(["scripture", "teaching", "question", "prayer", null]);
    expect(c.problems.map((p) => p.message).join(" ")).toMatch(/no page to print them, so a page for each one was added/);
    const text = allText(projectFromSpec(c, AT));
    for (let n = 1; n <= 3; n++) expect(text).toContain(`Day ${n}: Drawing Near`);
    expect(text).toContain("Where have you kept God at a distance?");
    // Structure only doesn't add pages it wasn't asked for.
    expect(check(spec).spec.sections.some((s) => s.repeat.mode === "per-entry")).toBe(false);
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
  it("a batch that repeats entries already written: the repeats are left out and said (live: batch 1 repeated lessons 1–6)", () => {
    const first = check(developed(6), "develop");
    const again = check(developed(6, (n) => day(n <= 4 ? n : n + 6)), "develop");
    const r = appendBatch(first.spec, again);
    expect(r.added).toBe(2);
    expect(r.spec.entries!.records.map((x) => x.values[0].value).slice(-2)).toEqual(["Day 11: Drawing Near", "Day 12: Drawing Near"]);
    expect(r.message).toMatch(/Added 2 entries \(now 8\)\. 4 repeated entries already written, so they were left out/);
    const all = appendBatch(first.spec, first);
    expect(all.added).toBe(0);
    expect(all.message).toMatch(/repeated entries already written, so nothing was added/);
  });
});

describe("live answer (2026-10-15, children's character journal): every word written is printed", () => {
  const live = JSON.parse(readFileSync("tests/fixtures/live/develop-children-2026-10-15.json", "utf8"));
  const req = JSON.parse(readFileSync("tests/fixtures/live/develop-children-2026-10-15.request.json", "utf8"));
  const c = checkSpec(live.spec, { description: req.description, content: req.content, mode: "develop" });
  const p = projectFromSpec(c, AT);
  const text = allText(p);
  it("six real lessons — trait, verse, story, activity, two questions, prayer — all AI-written", () => {
    expect(c.spec.entries!.records).toHaveLength(6);
    expect(records(p).every((r) => r.origin)).toBe(true);
  });
  it("the two reflection questions the AI wrote but left off its page are added and print, and that's said", () => {
    expect(c.problems.map((x) => x.message).join(" ")).toMatch(/wrote “Reflection Question 1”, “Reflection Question 2” for each entry but didn't print them/);
    for (const v of c.spec.entries!.records.flatMap((r) => r.values)) expect(text, v.key).toContain(squash(v.value).slice(0, 40));
  });
  it("Structure only leaves the AI's page as it is (nothing added it wasn't asked for)", () => {
    expect(checkSpec(live.spec, { description: req.description, content: req.content }).problems.some((x) => /didn't print/.test(x.message))).toBe(false);
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
  it("a developed answer without the content (no entries, nothing printing them, headings only) gets one retry within the same proposal, then a clear message", () => {
    expect(fn).toMatch(/function developGap\(raw: string, wanted: number, previous: string\[\] = \[\]\)/);
    expect(fn).not.toMatch(/so the entries would never print/);
    expect(fn).toMatch(/if \(gap && !retry\.length && Date\.now\(\) - started < 45_000\)/);
    expect(fn).toMatch(/await cost\("incomplete-retried"\)/);
    // Still incomplete after the retry: handed back with what's missing — a paid answer is never thrown away.
    expect(fn).toMatch(/return reply\(\{ spec: message\.content, model, version: VERSION, incomplete: gap \}\)/);
    expect(fn).toMatch(/Each lesson \/ day \/ session is ONE record in entries\.records/);
    // Next batches: every name already written goes in the request itself, and repeats trigger the retry.
    expect(fn).toMatch(/THIS IS A NEXT BATCH\. Entries 1–\$\{batch\.from - 1\}/);
    expect(fn).toMatch(/repeat ones already written/);
    expect(fn).toMatch(/developGap\(message\.content, wanted, batch\?\.previous \?\? \[\]\)/);
    expect(fn.match(/edge_usage_logs"\)\.insert\(/g)).toHaveLength(1);
  });
  it("develop answers use the same format with the list of entries required (never null); Structure only keeps the shared schema", () => {
    expect(fn).toMatch(/entries: \(schema\.properties\.entries as \{ anyOf: unknown\[\] \}\)\.anyOf\[0\]/);
    expect(fn).toMatch(/schema: develop \? developSchema : schema/);
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

describe("the 800-page limit: explained, never silently reduced — the maker chooses", () => {
  const fn = readFileSync("../supabase/functions/generate-document/index.ts", "utf8");
  it("a quantity clearly past the limit is found before anything is sent (free)", () => {
    expect(requestedOverLimit("A daily log, 900 copies. One page per day.")).toMatchObject({ n: 900, unit: "copies" });
    expect(requestedOverLimit("A 1,000-day gratitude journal")).toMatchObject({ n: 1000, unit: "day" });
    expect(requestedOverLimit("A 365-day devotional and 52 weeks of goals")).toBeNull();
    expect(requestedOverLimit("An 800 page notebook")).toBeNull();
    expect(requestedOverLimit("A 2000-word essay page")).toBeNull();
  });
  it("the choices rewrite only the quantity, and only when chosen", () => {
    const d = "A daily log, 900 copies. One page per day.";
    const c = quantityChoices(d, requestedOverLimit(d)!);
    expect(c.reduce).toEqual({ label: "Reduce to 790 copies", description: "A daily log, 790 copies. One page per day." });
    expect(c.split).toEqual({ label: "Split into 2 documents of 450 copies", description: "A daily log, 450 copies. One page per day.", parts: 2 });
  });
  const log = (copies: number, entries = 0): DocSpec => ({
    title: "Log", summary: "", page: { size: "8.5x11", orientation: "portrait", binding: "loose", why: "" }, notes: [],
    entries: entries ? { name: "Days", fields: [{ key: "title", label: "Title", valueType: "text" }], records: Array.from({ length: entries }, (_, i) => ({ values: [{ key: "title", value: `Day ${i + 1}` }] })), source: "suggested" } : null,
    sections: [
      section("intro", "Introduction", [part("text", { text: "How to use this log." })]),
      section("log", "Daily Log", [part("fields", { fields: [{ label: "Date", valueType: "date" }] })], { repeat: { mode: "copies", count: copies } }),
      ...(entries ? [section("day", "{title}", [part("text", { fromEntryField: "title" })], { repeat: { mode: "per-entry", count: 1 } })] : []),
    ],
  });
  it("a built outline past the limit stops with its page count (the review then offers the choices)", () => {
    let err: unknown;
    try { buildFromOutline(log(900), "", { problems: [], flags: [] }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(PageLimitError);
    expect((err as PageLimitError).pages).toBe(901);
  });
  it("Reduce to fit: every change spelled out; the result fits", () => {
    const r = reduceToFit(log(900, 300));
    expect(minimumPages(r.spec)).toBeLessThanOrEqual(MAX_DOCUMENT_PAGES);
    expect(r.changes.join(" | ")).toMatch(/“Daily Log”: 900 → \d+ copies \| Days: the first \d+ of 300 entries kept/);
    expect(buildFromOutline(r.spec, "", { problems: [], flags: [] }).project).toBeTruthy();
  });
  it("Split: parts within the limit, copies shared out, entries in order, the introduction in each", () => {
    const parts = splitToFit(log(900, 300));
    expect(parts.length).toBe(2);
    for (const p of parts) expect(minimumPages(p)).toBeLessThanOrEqual(MAX_DOCUMENT_PAGES);
    expect(parts.map((p) => p.sections[1].repeat.count)).toEqual([450, 450]);
    expect(parts.flatMap((p) => p.entries!.records.map((r) => r.values[0].value))).toEqual(Array.from({ length: 300 }, (_, i) => `Day ${i + 1}`));
    expect(parts.every((p) => p.sections[0].title === "Introduction")).toBe(true);
    expect(parts.map((p) => p.title)).toEqual(["Log — Part 1 of 2", "Log — Part 2 of 2"]);
  });
  it("the server: the same free pre-check before counting; the AI is told the limit and not to lower quantities; an over-limit proposal comes back with the limit, not discarded", () => {
    expect(fn.indexOf("const tooMany = requestedOverLimit(description);")).toBeGreaterThan(0);
    expect(fn.indexOf("const tooMany = requestedOverLimit(description);")).toBeLessThan(fn.indexOf('edge_usage_logs").insert'));
    expect(fn).toMatch(/code: "page-limit"/);
    expect(/const SYSTEM = `([\s\S]*?)`;/.exec(fn)![1]).toMatch(/at most 800 pages in all\. That is the studio's to handle, not yours: always build every section the maker asked for at the full quantity they asked for/);
    expect(fn).toMatch(/pageLimit: \{ pages, max: MAX_DOCUMENT_PAGES \}/);
  });
});
