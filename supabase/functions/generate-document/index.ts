/**
 * generate-document — Product Studio's AI document proposal (Phase 8).
 *
 * Signed-in users only (Supabase auth), with a daily limit (edge_usage_logs). The OpenAI key is a
 * server secret (OPENAI_API_KEY) and never leaves this function. The model must answer with the
 * studio's document specification (schema.json, the same file as
 * product-studio/src/engines/generate/docSpecSchema.json) through structured outputs; the studio
 * checks it again before anything is built. No coordinates, no rendering: structure and wording only.
 *
 * { check: true } answers whether the key is configured and accepted, without generating anything.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import schema from "./schema.json" with { type: "json" };

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const DAILY_REQUEST_CAP = 30;
const FUNCTION_NAME = "generate-document";
const MODELS = ["gpt-4.1-mini", "gpt-4o-mini"];
const VERSION = "generate-document-2026-10-09-spec-v1";

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

Sections are the document's kinds of pages, in order. repeat.mode: "once"; "copies" with count (how many copies of that page); or "per-entry": the page repeats once for each entry of the entries list (devotional days, lessons, clients, items, sessions…) and its components print an entry's field with fromEntryField (the field key). A per-entry section's title may contain {fieldKey} (and {#} for the entry's number), e.g. "Day {day}: {title}". Set startOnRightPage only when each repetition must open on a right-hand page.

The maker's wording is theirs:
- When they give their own content (wording, questions, instructions, lists, days, entries), use it EXACTLY as written — never rewrite, shorten, correct, translate or paraphrase it — unless they explicitly ask you to rewrite it. Put wording that repeats (days, lessons, items…) in entries (source "user") with a per-entry section that prints it; put one-off wording in components with source "user". Split their content only at their own line breaks, never inside a sentence.
- Everything you write yourself (titles, labels, prompts, suggestions) has source "suggested".
- Do not invent content entries (days, lessons, readings) unless they ask you to write content; prefer labelled blanks and writing space they will fill in.

Accuracy and safety:
- Never claim the document is legally, regulatorily or professionally compliant or approved, and never say it satisfies any law or standard.
- Never invent citations, Scripture references, statistics, laws, regulations or quotations. If a record must meet legal or regulatory requirements, provide the labelled blanks they asked for and add a note that the requirements must be verified for their jurisdiction.

Page: choose page.size, orientation and binding for how it will be used (a wide table suits landscape; a bound book suits a journal; loose pages suit forms) and explain the choice in page.why.
notes: list your assumptions, and any conflicting instructions and how you resolved them.
Give every section and component a short unique id. Fill every property: use null, [] or false when a property doesn't apply.`;

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
  let body: { description?: unknown; content?: unknown; check?: unknown };
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
  if (!key) return reply({ error: "Document generation isn't set up yet (the OpenAI key is missing)." }, 503);

  const day = new Date(); day.setUTCHours(0, 0, 0, 0);
  const { count, error: countError } = await auth.client.from("edge_usage_logs").select("id", { count: "exact", head: true }).eq("user_id", auth.user.id).eq("function_name", FUNCTION_NAME).gte("created_at", day.toISOString());
  if (countError) return reply({ error: "Usage limit check failed." }, 500);
  if ((count ?? 0) >= DAILY_REQUEST_CAP) return reply({ error: `The daily limit of ${DAILY_REQUEST_CAP} document proposals is reached. Try again tomorrow.` }, 429);
  // Counted before the provider call: a failed or timed-out call can still be billed.
  const { error: logError } = await auth.client.from("edge_usage_logs").insert({ user_id: auth.user.id, function_name: FUNCTION_NAME, units: 1 });
  if (logError) return reply({ error: "Usage logging failed; no AI request was sent." }, 500);

  const user = `What the maker wants:\n${description.trim()}${content.trim() ? `\n\nThe maker's own content — use it exactly as written, placed where it belongs:\n<<<\n${content}\n>>>` : ""}`;
  let lastError = "";
  for (const model of MODELS) {
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(90_000),
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: "json_schema", json_schema: { name: "document_spec", strict: true, schema } },
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
        }),
      });
      const result = await r.json().catch(() => null);
      if (!r.ok) { lastError = result?.error?.message ?? `HTTP ${r.status}`; continue; }
      const message = result?.choices?.[0]?.message;
      if (message?.refusal) return reply({ error: `The AI declined: ${message.refusal}` }, 422);
      if (typeof message?.content !== "string") { lastError = "no content"; continue; }
      return reply({ spec: message.content, model, version: VERSION });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return reply({ error: "Document generation failed. Please try again.", detail: lastError.slice(0, 200), version: VERSION }, 502);
});
