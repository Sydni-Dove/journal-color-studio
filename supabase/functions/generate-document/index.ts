/**
 * generate-document — Product Studio's AI document proposal (Phase 8).
 *
 * Signed-in users only (Supabase auth), with a daily limit per plan (edge_usage_logs): free accounts 5 a day;
 * paid accounts (app_metadata.plan === "paid", set only by the server / dashboard, never by the user) get
 * PAID_DAILY_CAP (env, default 50) — the paid tier itself isn't built yet. The OpenAI key is a
 * server secret (OPENAI_API_KEY) and never leaves this function. The model must answer with the
 * studio's document specification (schema.json, the same file as
 * product-studio/src/engines/generate/docSpecSchema.json) through structured outputs; the studio
 * checks it again before anything is built. No coordinates, no rendering: structure and wording only.
 *
 * Two modes (Phase 8.1). "structure" (default; a request without `mode` is exactly Phase 8's): pages, blanks and the
 * maker's own wording, no written content. "develop": the AI also writes original content (at most
 * MAX_DEVELOPED_ENTRIES entries a request; a longer series continues in batches), with the same rule that the maker's
 * wording is used exactly. Both count as one of the day's proposals.
 *
 * Every model call's real token use and estimated cost is recorded in ai_generation_costs (written with the service
 * role only; users can't read or change it) so pricing can be judged later. It never blocks a request.
 *
 * { check: true } answers whether the key is configured and accepted, without generating anything.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import schema from "./schema.json" with { type: "json" };

/**
 * Develop mode's answer format: the same schema, except the list of entries is required (not nullable) — live
 * testing found the model answering "develop" with entries: null and a note claiming the lessons were written.
 */
const developSchema = { ...schema, properties: { ...schema.properties, entries: (schema.properties.entries as { anyOf: unknown[] }).anyOf[0] } };

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
/** The most pages a proposal may make (same number as MAX_DOCUMENT_PAGES in product-studio/src/engines/generate/spec.ts). */
const MAX_DOCUMENT_PAGES = 800;
/** The fewest pages a proposal makes: every section prints at least one page per repetition. */
function minimumPages(spec: { sections?: { repeat?: { mode?: string; count?: number } }[]; entries?: { records?: unknown[] } | null }): number {
  const perEntry = Math.max(1, spec.entries?.records?.length ?? 0);
  return (spec.sections ?? []).reduce((n, s) => n + (s.repeat?.mode === "per-entry" ? perEntry : s.repeat?.mode === "copies" ? Math.max(1, Math.round(Number(s.repeat?.count) || 1)) : 1), 0);
}
/** A quantity the description asks for that alone passes the page limit (same rule as requestedOverLimit in spec.ts). */
const QUANTITY = /\b(\d{1,3}(?:,\d{3})+|\d+)\s*(?:-\s*)?(copies|copy|pages|page|days|day|entries|entry|sheets|sheet|lessons|lesson|sessions|session|worksheets|worksheet|weeks|week|logs|log|forms|form)\b/gi;
function requestedOverLimit(description: string): { n: number; text: string } | null {
  let best: { n: number; text: string } | null = null;
  for (const m of description.matchAll(QUANTITY)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (n > MAX_DOCUMENT_PAGES && (!best || n > best.n)) best = { n, text: m[0] };
  }
  return best;
}
const FREE_DAILY_CAP = 5;
const PAID_DAILY_CAP = Number(Deno.env.get("PAID_DAILY_CAP")) || 50;
/** The plan comes from app_metadata, which only the server can write (user_metadata is user-editable: never trust it here). */
const isPaid = (user: { app_metadata?: Record<string, unknown> }) => user.app_metadata?.plan === "paid";
const FUNCTION_NAME = "generate-document";
const MODELS = ["gpt-4.1-mini", "gpt-4o-mini"];
const VERSION = "generate-document-2026-10-15-spec-v8-develop-keep";
/** The most entries one "develop" request writes (same as MAX_DEVELOPED_ENTRIES in product-studio/src/engines/generate/spec.ts). */
const MAX_DEVELOPED_ENTRIES = 30;
/**
 * Output ceiling for a develop request (tokens): about 8,000 words — never an open-ended bill, and short enough to
 * finish inside the Edge Function's ~150 s limit. Structure only is unchanged.
 */
const DEVELOP_MAX_TOKENS = 12_000;
/** Time one develop call may take (structure: 90 s as before), and how long a failed first call may have taken for the backup model to still be tried. */
const DEVELOP_TIMEOUT_MS = 135_000;
const RETRY_WITHIN_MS = 30_000;
/** Estimated USD per 1M tokens (input, output) — for the cost record only; tokens are the source of truth. Prices as of 2026-10. */
const PRICES: Record<string, [number, number]> = { "gpt-4.1-mini": [0.4, 1.6], "gpt-4o-mini": [0.15, 0.6] };

const SYSTEM = `You design printable documents for Product Studio, a studio for print-ready journals, workbooks, logs, forms, planners and similar products. You return a document specification (the JSON schema given); the studio lays out, paginates and prints it with its own engines. Never think in coordinates or pixels.

What you can use (components):
- heading: a heading (text). text: body text that may run for pages (text; label = an optional heading above it).
- fields: a row of labelled blanks to fill in, like Date / Name / Location (fields, at most 3 per row; more become more rows).
- writing: writing space under an optional heading (label) and prompt (text); lines = how many writing lines, or null to fill the space left on the page.
- checklist: rows with check boxes (items = printed items; empty = blank rows to fill in; lines = how many rows).
- table: columns (fields: label + valueType saying what each column holds), rows = number of rows; numbered = number the rows across the whole document; fillPage = rows fill each page.
- list: a printed list (items, marker bullet / number / checkbox).
- records: repeating blank record cards (fields = the blanks on each card; rows = cards per page; numbered; fillPage = as many as fit on each page).
- divider, spacer (size).
Anything else (images, charts, formulas, QR codes, signatures pads, colors, fonts) is not available: describe the need in notes instead.

Sections are the document's kinds of pages, in order. repeat.mode: "once"; "copies" with count (how many copies of that page); or "per-entry": the page repeats once for each entry of the entries list (devotional days, lessons, clients, items, sessions…) and its components print an entry's field with fromEntryField (the field key). A per-entry section's title may contain {fieldKey} (and {#} for the entry's number), e.g. "Day {day}: {title}". Set startOnRightPage only when each repetition must open on a right-hand page. repeat.count is the number of copies for "copies" and 1 otherwise.
- Use "per-entry" only when there are entries to repeat over (the maker's, or ones they asked you to write). A log, record book or journal they will fill in by hand (one page per plant, client, visit, day…) is a section with "copies" and labelled blanks, not per-entry with an empty list; set entries to null.

Build the document itself, not only its instructions: every chart, table, log, checklist, form or worksheet the maker asks for must be in the sections as real parts (a chore chart is a table with a column per day and a row per chore or child; a tracker is a table or records). An introduction or instructions page is optional and never replaces the pages they asked for. If they say how many (weeks, days, pages, people), honour it with copies, rows or columns; if they don't, choose a sensible number for how it will be used (for example 30 plant pages for a season's garden journal, 52 for a year of weeks) and say so in notes.

The maker's wording is theirs:
- When they give their own content (wording, questions, instructions, lists, days, entries), use it EXACTLY as written — never rewrite, shorten, correct, translate or paraphrase it — unless they explicitly ask you to rewrite it. Put wording that repeats (days, lessons, items…) in entries (source "user") with a per-entry section that prints it; put one-off wording in components with source "user". Split their content only at their own line breaks, never inside a sentence.
- A section holding their wording prints once: never repeat it with "copies" (that would print their words again on every copy). When they give some days, lessons or items of a longer series, put the ones they gave in entries with a per-entry section, and say in notes that they can add the rest in Your content.
- Blanks they typed (___) are places to write: keep their wording, underscores included; the studio turns each into writing lines.
- Everything you write yourself (titles, labels, prompts, suggestions) has source "suggested".
- Do not invent content entries (days, lessons, readings) unless they ask you to write content; prefer labelled blanks and writing space they will fill in.

Accuracy and safety:
- Never claim the document is legally, regulatorily or professionally compliant or approved, and never say it satisfies any law or standard.
- Never invent citations, Scripture references, statistics, laws, regulations or quotations. If a record must meet legal or regulatory requirements, provide the labelled blanks they asked for and add a note that the requirements must be verified for their jurisdiction.

Page limit: a document can have at most 800 pages in all. Never lower a quantity the maker asked for (copies, days, entries, pages) to stay under it: build what they asked. If it would pass the limit, say so in notes — the studio explains the limit and lets the maker choose to reduce the quantity or split the document.

Page: choose page.size, orientation and binding for how it will be used (a wide table suits landscape; a bound book suits a journal; loose pages suit forms) and explain the choice in page.why.
notes: list your assumptions, and any conflicting instructions and how you resolved them.
Give every section and component a short unique id. Fill every property: use null, [] or false when a property doesn't apply.`;

/** "Develop original content": replaces the one line that says not to write content, and adds how to write it. */
const NO_CONTENT = "- Do not invent content entries (days, lessons, readings) unless they ask you to write content; prefer labelled blanks and writing space they will fill in.";
function developRules(entryCount: number | null, batch: Batch | null): string {
  const asked = batch ? batch.count : entryCount;
  return `- The maker asked you to DEVELOP ORIGINAL CONTENT: write the content itself, not only the structure. Put the series (days, lessons, sessions, exercises, activities) in entries with source "suggested" — one entry each, with a field for each part (for example title, scripture, teaching, reflection question, activity, prayer) — and a per-entry section that prints the fields with fromEntryField. A one-off passage you write (an introduction, instructions) is a text component with source "suggested". In this mode "entries" is never null: it holds every entry you write, and each value is the finished wording itself (whole sentences a reader will read), not a heading or a description of what should go there. Notes describe what you wrote; they never replace writing it.
- Write at most ${MAX_DEVELOPED_ENTRIES} entries in this answer${asked ? `; the maker asked for ${asked}` : ""}. If the request needs more (for example a 40-day study), write the first ones, and say in notes how many remain and that they can be written as the next batch. Never shorten or cut off an entry to fit more: fewer complete entries are better than more partial ones.
- Keep each part complete but proportionate: a teaching passage of about 120–250 words; questions, prompts and prayers of one to three sentences — unless the maker asks otherwise. Keep the whole answer under about 7,000 words: if the entries asked for wouldn't fit complete, write fewer and say in notes how many remain for the next batch.
- Everything you write is original. Do not reproduce existing devotionals, curricula, books, sermons or song lyrics.
- The maker's own wording still comes first: use it exactly (source "user"), never rewrite, merge into or "improve" it, and build your content around it.
- Scripture: connect content to Scripture by reference (Book chapter:verse) only when you are confident the reference exists and fits; if unsure, give the theme without a reference. Quote verse text only from a public-domain translation (KJV or WEB), keep quotations short, and name the translation after the quotation, e.g. "In the beginning God created the heaven and the earth." (Genesis 1:1, KJV). Never quote a copyrighted translation (NIV, ESV, NLT, NKJV, NASB, CSB, AMP, MSG, TPT and others): give the reference only. Never invent or paraphrase a verse and present it as a quotation.
- No outside research: no statistics, historical or scientific claims, quotations of people, or citations of books, articles or websites. Write from Scripture and general knowledge only, and never claim alignment with any curriculum, standard or denomination.${batch ? `

THIS REQUEST CONTINUES A LIST ALREADY WRITTEN: "${batch.name}". Write entries ${batch.from} to ${batch.from + batch.count - 1} (${batch.count} entries) of that list, in entries, with exactly these fields (same keys): ${batch.fields.map((f) => `${f.key} (${f.label})`).join(", ")}. Continue the series in order; do not repeat what is already written${batch.previous.length ? ` (recent entries: ${batch.previous.map((p) => `"${p}"`).join("; ")})` : ""}. Keep the same sections as a per-entry page that prints these fields.` : ""}`;
}

/**
 * A developed answer that didn't develop anything: no entries, too few, or entries too thin to be real content
 * (headings only). Returns what's missing, to ask the AI once more; null when it's complete. (Entries with no page
 * printing them are kept: the studio adds that page itself — the content isn't thrown away.)
 */
function developGap(raw: string, wanted: number): string | null {
  let spec: { entries?: { records?: { values?: { value?: string }[] }[] } | null; sections?: { repeat?: { mode?: string }; components?: { fromEntryField?: string | null }[] }[] };
  try { spec = JSON.parse(raw); } catch { return null; }
  const records = spec.entries?.records ?? [];
  if (!records.length) return `"entries" is ${spec.entries ? "empty" : "null"}: none of the ${wanted} entries were written. Write every entry in full in "entries".`;
  const need = Math.min(wanted, 3);
  if (records.length < need) return `only ${records.length} of the ${wanted} entries were written. Write at least ${need}, each complete.`;
  const thin = records.filter((r) => (r.values ?? []).reduce((n, v) => n + (v.value ?? "").trim().length, 0) < 250).length;
  if (thin > records.length / 2) return `${thin} of the ${records.length} entries are only headings or a few words. Write each entry's parts in full (the teaching, activity, questions and prayer as real sentences).`;
  return null;
}

type Batch = { name: string; fields: { key: string; label: string; valueType: string }[]; from: number; count: number; previous: string[] };
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f"`<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
/** A batch request, checked: only short, plain names and keys reach the prompt. null = not a valid batch. */
function readBatch(v: unknown): Batch | null {
  if (!v || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  const from = Number(b.from), count = Number(b.count);
  if (!Number.isInteger(from) || from < 1 || from > 1000 || !Number.isInteger(count) || count < 1 || count > MAX_DEVELOPED_ENTRIES) return null;
  const fields = (Array.isArray(b.fields) ? b.fields : []).slice(0, 12).flatMap((f) => {
    const x = (f ?? {}) as Record<string, unknown>;
    const key = typeof x.key === "string" && /^[a-z0-9_]{1,40}$/.test(x.key) ? x.key : "";
    const label = clean(x.label, 60);
    return key && label ? [{ key, label, valueType: clean(x.valueType, 20) || "text" }] : [];
  });
  const name = clean(b.name, 80);
  if (!fields.length || !name) return null;
  return { name, fields, from, count, previous: (Array.isArray(b.previous) ? b.previous : []).slice(-40).map((p) => clean(p, 100)).filter(Boolean) };
}

/** Records a model call's real usage and estimated cost (service role; best effort — never blocks or fails a request). */
async function recordCost(row: { user_id: string; mode: string; model: string; usage: { prompt_tokens?: number; completion_tokens?: number } | undefined; outcome: string }) {
  const url = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service || !row.usage) return;
  const input = row.usage.prompt_tokens ?? 0, output = row.usage.completion_tokens ?? 0;
  const [pi, po] = PRICES[row.model] ?? [0, 0];
  const { error } = await createClient(url, service).from("ai_generation_costs").insert({
    user_id: row.user_id, function_name: FUNCTION_NAME, mode: row.mode, model: row.model,
    prompt_tokens: input, completion_tokens: output, estimated_cost_usd: Number(((input * pi + output * po) / 1e6).toFixed(6)), outcome: row.outcome,
  });
  if (error) console.error("cost record failed", error.message);
}

async function authenticate(req: Request) {
  const header = req.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return null;
  const client = createClient(url, anon, { global: { headers: { Authorization: header } } });
  const { data: { user }, error } = await client.auth.getUser(header.slice(7));
  return error || !user ? null : { client, user };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const auth = await authenticate(req);
  if (!auth) return reply({ error: "Sign in to generate a document." }, 401);
  let body: { description?: unknown; content?: unknown; check?: unknown; mode?: unknown; entryCount?: unknown; batch?: unknown };
  try { body = await req.json(); } catch { return reply({ error: "Invalid request." }, 400); }
  const raw = Deno.env.get("OPENAI_API_KEY");
  // A pasted secret can carry spaces, quotes or a line break: never part of a real key.
  const key = raw?.trim().replace(/^["']|["']$/g, "");

  // Configuration check: is the key there, and does OpenAI accept it? (Lists models — no generation, no usage counted.)
  // Reports only facts that reveal nothing of the key itself.
  if (body.check === true) {
    if (!key) return reply({ configured: false, accepted: false, version: VERSION });
    const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    const detail = r && !r.ok ? ((await r.json().catch(() => null))?.error?.code ?? null) : null;
    return reply({ configured: true, accepted: !!r?.ok, status: r?.status ?? null, providerCode: detail, trimmed: key !== raw, startsLikeOpenAIKey: key.startsWith("sk-"), version: VERSION });
  }

  const description = typeof body.description === "string" ? body.description : "";
  const content = typeof body.content === "string" ? body.content : "";
  if (description.trim().length < 10 || description.length > 6000 || content.length > 60000)
    return reply({ error: "Describe the document in 10–6,000 characters; your own content must be under 60,000 characters." }, 400);
  // A quantity that clearly can't fit one document: answered before anything is counted or sent (free), so the
  // maker can choose to reduce it or split the document.
  const tooMany = requestedOverLimit(description);
  if (tooMany)
    return reply({ error: `“${tooMany.text}” is more than one document can hold: a document can have at most ${MAX_DOCUMENT_PAGES} pages. Reduce the quantity, or split it into more than one document. None of today's proposals was used.`, code: "page-limit", requested: tooMany.n, max: MAX_DOCUMENT_PAGES, version: VERSION }, 422);
  // Mode: absent = Structure only (Phase 8's request). Anything else is checked before any usage is counted.
  if (body.mode !== undefined && body.mode !== "structure" && body.mode !== "develop") return reply({ error: "Unknown generation mode." }, 400);
  const develop = body.mode === "develop";
  const entryCount = body.entryCount === undefined || body.entryCount === null ? null : Number(body.entryCount);
  if (entryCount !== null && (!develop || !Number.isInteger(entryCount) || entryCount < 1 || entryCount > MAX_DEVELOPED_ENTRIES))
    return reply({ error: `Ask for 1–${MAX_DEVELOPED_ENTRIES} entries at a time; longer series are written in batches.` }, 400);
  const batch = body.batch === undefined ? null : readBatch(body.batch);
  if (body.batch !== undefined && (!develop || !batch)) return reply({ error: "That next-batch request couldn't be read." }, 400);
  if (!key) return reply({ error: "Document generation isn't set up yet (the OpenAI key is missing)." }, 503);

  const day = new Date(); day.setUTCHours(0, 0, 0, 0);
  const { count, error: countError } = await auth.client.from("edge_usage_logs").select("id", { count: "exact", head: true }).eq("user_id", auth.user.id).eq("function_name", FUNCTION_NAME).gte("created_at", day.toISOString());
  if (countError) return reply({ error: "Usage limit check failed." }, 500);
  const paid = isPaid(auth.user), cap = paid ? PAID_DAILY_CAP : FREE_DAILY_CAP;
  if ((count ?? 0) >= cap)
    return reply({ error: paid ? `You've used today's ${cap} document proposals. Try again tomorrow.` : `Free accounts can make ${cap} document proposals a day, and today's are used. Try again tomorrow.` }, 429);
  // Counted before the provider call: a failed or timed-out call can still be billed.
  const { error: logError } = await auth.client.from("edge_usage_logs").insert({ user_id: auth.user.id, function_name: FUNCTION_NAME, units: 1 });
  if (logError) return reply({ error: "Usage logging failed; no AI request was sent." }, 500);

  const system = develop ? SYSTEM.replace(NO_CONTENT, developRules(entryCount, batch)) : SYSTEM;
  const mode = develop ? "develop" : "structure";
  const user = `What the maker wants:\n${description.trim()}${content.trim() ? `\n\nThe maker's own content — use it exactly as written, placed where it belongs:\n<<<\n${content}\n>>>` : ""}`;
  let lastError = "";
  const started = Date.now();
  // Develop: one more attempt when the answer didn't actually write the content (same proposal; counted once).
  let retry: { role: "assistant" | "user"; content: string }[] = [];
  const wanted = batch?.count ?? entryCount ?? 6;
  for (let i = 0, models = [...MODELS]; i < models.length; i++) {
    const model = models[i];
    // A slow failure leaves no time for a second full call before the function's own limit: report it instead.
    if (i > 0 && !retry.length && Date.now() - started > RETRY_WITHIN_MS) break;
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        // A develop call (or its retry) gets only the time left before the function's own ~150 s limit.
        signal: AbortSignal.timeout(develop ? Math.max(10_000, Math.min(DEVELOP_TIMEOUT_MS, 140_000 - (Date.now() - started))) : 90_000),
        body: JSON.stringify({
          model,
          // Develop writes prose: a little more varied wording, and a fixed output ceiling.
          temperature: develop ? 0.5 : 0.2,
          ...(develop ? { max_tokens: DEVELOP_MAX_TOKENS } : {}),
          response_format: { type: "json_schema", json_schema: { name: "document_spec", strict: true, schema: develop ? developSchema : schema } },
          messages: [{ role: "system", content: system }, { role: "user", content: user }, ...retry],
        }),
      });
      const result = await r.json().catch(() => null);
      if (!r.ok) { lastError = result?.error?.message ?? `HTTP ${r.status}`; continue; }
      const message = result?.choices?.[0]?.message;
      const cost = (outcome: string) => recordCost({ user_id: auth.user.id, mode, model, usage: result?.usage, outcome });
      if (message?.refusal) { await cost("refused"); return reply({ error: `The AI declined: ${message.refusal}` }, 422); }
      // Cut off at the output ceiling: the outline isn't complete, so it isn't handed back half-written.
      if (result?.choices?.[0]?.finish_reason === "length") {
        await cost("too-long");
        return reply({ error: `That was more than one request can write. Ask for fewer entries (for example 10), then write the rest with “Write the next batch”.`, version: VERSION }, 422);
      }
      if (typeof message?.content !== "string") { lastError = "no content"; continue; }
      const gap = develop ? developGap(message.content, wanted) : null;
      // An incomplete answer comes back fast (it wrote little): retried only while there's time for a full one.
      if (gap && !retry.length && Date.now() - started < 45_000) {
        await cost("incomplete-retried");
        retry = [{ role: "assistant", content: message.content }, { role: "user", content: `Your answer is incomplete: ${gap} Return the complete document specification again.` }];
        models.splice(i + 1, 0, model);
        continue;
      }
      if (gap) {
        await cost("incomplete");
        return reply({ error: "The AI didn't write the content this time (it returned an outline without the lessons). Please try again — or ask for fewer entries.", detail: gap, version: VERSION }, 422);
      }
      // Counted here, not only in the studio, so a proposal past the limit is recorded and comes back marked.
      let pages = 0;
      try { pages = minimumPages(JSON.parse(message.content)); } catch { /* not JSON: the studio reports it */ }
      await cost(pages > MAX_DOCUMENT_PAGES ? "too-many-pages" : "ok");
      // Past the limit after the AI answered (the proposal was paid for and counted): handed back with the limit, so
      // the studio can offer the maker's choices (reduce or split) instead of losing it. The studio never builds an
      // outline past the limit (buildFromOutline checks before laying anything out).
      if (pages > MAX_DOCUMENT_PAGES) return reply({ spec: message.content, model, version: VERSION, pageLimit: { pages, max: MAX_DOCUMENT_PAGES } });
      return reply({ spec: message.content, model, version: VERSION });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return reply({ error: "Document generation failed. Please try again.", detail: lastError.slice(0, 200), version: VERSION }, 502);
});
