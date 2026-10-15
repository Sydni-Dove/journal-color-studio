/**
 * MODEL COMPARISON for "Develop original content" — run by hand, never by `npm test`. Nothing is deployed.
 *
 *   OPENAI_API_KEY=… node tests/live/develop-model-eval.mjs [runs-per-variant=1] [only-variant-ids,comma-separated]
 *
 * Calls kept to the fewest that answer the questions: every variant includes at least one next batch, so continuity
 * is always tested — 6 lessons then 6 more; 3 then 3; single lessons 1, 1, 1. A spend guard stops before BUDGET_USD.
 *
 * Uses the live Edge Function's own instructions and answer format, byte for byte: the SYSTEM prompt, the develop
 * rules and the develop schema are taken from supabase/functions/generate-document/index.ts at run time (bundled
 * with esbuild, Deno stubbed), so every model gets identical prompts. For each variant it makes the first request
 * (6 lessons) and one next batch (6 more), and records time, tokens, cost and the measurements below. Results:
 * tests/live/out/develop-model-eval-<time>.json (raw answers included, for reading every lesson).
 */
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error("Set OPENAI_API_KEY (read from the environment; never pasted into chat)."); process.exit(1); }
const RUNS = Number(process.argv[2] ?? 1);
const ONLY = process.argv[3] ? new Set(process.argv[3].split(",")) : null;
// Sydni reported $0.27 already spent from the $1 evaluation allowance. Stop this run at $0.55,
// leaving headroom for the last in-flight call (max 12,000 output tokens) and pricing differences.
const BUDGET_USD = 0.55;
let spent = 0;
const ROOT = path.resolve(import.meta.dirname, "../../..");
const FN = path.join(ROOT, "supabase/functions/generate-document/index.ts");

// The function's own prompt pieces, unchanged.
const src = fs.readFileSync(FN, "utf8").replace(/^import "jsr:.*$/m, "").replace(/^import \{ createClient \}.*$/m, "const createClient = () => { throw new Error('unused'); };");
const out = await build({ stdin: { contents: src + "\nexport { SYSTEM, NO_CONTENT, developRules, developSchema, MAX_DEVELOPED_ENTRIES, DEVELOP_MAX_TOKENS };", resolveDir: path.dirname(FN), loader: "ts" }, bundle: true, format: "esm", write: false, platform: "node", banner: { js: "globalThis.Deno = { env: { get: () => undefined }, serve: () => {} };" } });
const mod = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));

// $ per 1M tokens (input, output) — list prices to verify against OpenAI's pricing page before relying on them.
const PRICES = { "gpt-4.1-mini": [0.4, 1.6], "gpt-4.1": [2, 8], "gpt-4o": [2.5, 10], "gpt-4o-mini": [0.15, 0.6] };
const DESCRIPTION = "A Scripture-based character-building journal for children ages 6 to 9. Each lesson teaches one character trait (such as kindness, honesty, courage, patience) with a short Bible verse, a simple story-style teaching a child can understand, an activity the child can do that day, two reflection questions, and a short prayer. Leave space for the child to draw or write.";
/** Variants: models with the live prompt, plus prompt-only changes on the current model (to separate prompt from model). */
const VARIANTS = [
  { id: "mini-live", model: "gpt-4.1-mini" },
  { id: "4.1-live", model: "gpt-4.1" },
  { id: "4o-live", model: "gpt-4o" },
  // Same model, the length asked for in the request itself (where the per-lesson ask is), not only in the rules.
  { id: "mini-userlen", model: "gpt-4.1-mini", userExtra: "\n\nFor every lesson, the story is 100–180 words: a named child, a real situation, a choice they make, and how it turns out. Count the words." },
  // Same model, 3 lessons per request: is the length a per-answer budget habit?
  { id: "mini-3", model: "gpt-4.1-mini", entryCount: 3 },
  // Same model, one complete lesson per request (three requests: lesson 1, then next batches of 1).
  { id: "mini-1", model: "gpt-4.1-mini", entryCount: 1, requests: 3 },
];

const words = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
async function call(model, system, user, schema) {
  const t0 = Date.now();
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0.5, max_tokens: mod.DEVELOP_MAX_TOKENS, response_format: { type: "json_schema", json_schema: { name: "document_spec", strict: true, schema } }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${model}: ${j?.error?.message ?? r.status}`);
  const [pi, po] = PRICES[model] ?? [0, 0];
  const u = j.usage ?? {};
  const usd = ((u.prompt_tokens ?? 0) * pi + (u.completion_tokens ?? 0) * po) / 1e6;
  spent += usd;
  return { ms: Date.now() - t0, finish: j.choices?.[0]?.finish_reason, usage: u, usd, spec: JSON.parse(j.choices[0].message.content) };
}
function measure(spec) {
  const e = spec.entries ?? { fields: [], records: [] };
  const key = (re) => e.fields.find((f) => re.test(`${f.key} ${f.label}`))?.key;
  const kStory = key(/story|teach/i), kAct = key(/activ/i), kVerse = key(/verse|scripture/i), kQs = e.fields.filter((f) => /quest|reflect/i.test(`${f.key} ${f.label}`)).map((f) => f.key);
  const lessons = e.records.map((r) => Object.fromEntries(r.values.map((v) => [v.key, v.value])));
  const story = lessons.map((l) => words(l[kStory] ?? ""));
  // A named character: a capitalised word that isn't sentence-initial, God/Jesus, or a weekday — rough, read the raw text.
  const nameOf = (t) => (t.match(/(?<=[a-z,;] )[A-Z][a-z]{2,}/g) ?? []).filter((n) => !/^(God|Jesus|Lord|Bible|Holy|Spirit|He|His|Him|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/.test(n))[0];
  const named = lessons.map((l) => nameOf(l[kStory] ?? ""));
  const qsTieToStory = lessons.map((l, i) => kQs.some((k) => named[i] && (l[k] ?? "").includes(named[i])));
  return {
    lessons: lessons.length, titles: lessons.map((l) => l[e.fields[0]?.key]), verses: lessons.map((l) => l[kVerse]),
    storyWords: story, inRange: story.filter((w) => w >= 100 && w <= 180).length, medianStory: story.slice().sort((a, b) => a - b)[Math.floor(story.length / 2)],
    activityWords: lessons.map((l) => words(l[kAct] ?? "")), namedCharacter: named, questionsNameTheCharacter: qsTieToStory.filter(Boolean).length,
  };
}

const results = [];
const outputDir = path.join(import.meta.dirname, "out");
fs.mkdirSync(outputDir, { recursive: true });
const file = path.join(outputDir, `develop-model-eval-${Date.now()}.json`);
const batchUser = (extra, b, n) => `What the maker wants:\n${DESCRIPTION}${extra ?? ""}\n\nTHIS IS A NEXT BATCH. Entries 1–${b.from - 1} of "${b.name}" are already written:\n${b.previous.map((p, i) => `${i + 1}. ${p}`).join("\n")}\nWrite entries ${b.from}–${b.from + n - 1} only: ${n} NEW entries on themes not covered above (any examples in the description above are already used). Never repeat a title or theme from the list — nor a close synonym of one (for example Truthfulness after Honesty, Thankfulness after Gratitude) — and use Scripture references not used in the entries above.`;
for (const v of VARIANTS) {
  if (ONLY && !ONLY.has(v.id)) continue;
  for (let run = 1; run <= RUNS; run++) {
    const n = v.entryCount ?? 6, requests = v.requests ?? 2;
    const row = { variant: v.id, model: v.model, run, calls: [], lessons: 0, repeatedTitles: 0, usd: 0, seconds: 0 };
    results.push(row);
    const calls = row.calls;
    let fields, name, titles = [];
    for (let k = 0; k < requests; k++) {
      if (spent >= BUDGET_USD) { console.log(`budget guard: stopping at $${spent.toFixed(4)}`); break; }
      const b = k === 0 ? null : { name, fields, from: titles.length + 1, count: n, previous: titles };
      // The live function's own system prompt for this request (develop rules with the batch when continuing).
      const system = mod.SYSTEM.replace(mod.NO_CONTENT, mod.developRules(k === 0 ? n : null, b));
      const user = k === 0 ? `What the maker wants:\n${DESCRIPTION}${v.userExtra ?? ""}` : batchUser(v.userExtra, b, n);
      const c = await call(v.model, system, user, mod.developSchema);
      const m = measure(c.spec);
      if (k === 0) { fields = c.spec.entries?.fields ?? []; name = c.spec.entries?.name ?? "Lessons"; }
      titles = [...titles, ...m.titles];
      calls.push({ ms: c.ms, finish: c.finish, usage: c.usage, usd: c.usd, ...m, raw: c.spec });
      row.lessons = calls.flatMap((x) => x.storyWords).length;
      row.repeatedTitles = titles.length - new Set(titles.map(norm)).size;
      row.usd = calls.reduce((a, x) => a + x.usd, 0);
      row.seconds = calls.reduce((a, x) => a + x.ms, 0) / 1000;
      // Keep completed calls even if the next provider request fails or the session disconnects.
      fs.writeFileSync(file, JSON.stringify(results, null, 1));
    }
    const story = calls.flatMap((c) => c.storyWords);
    console.log(`${v.id} #${run}: stories ${calls.map((c) => c.storyWords.join("/")).join(" | ")} · in 100–180: ${story.filter((w) => w >= 100 && w <= 180).length}/${story.length} · repeats ${row.repeatedTitles} · ${row.seconds.toFixed(0)}s · $${row.usd.toFixed(4)} (total $${spent.toFixed(4)})`);
  }
}
fs.writeFileSync(file, JSON.stringify(results, null, 1));
console.log("saved", file, "| total spent $" + spent.toFixed(4));
