import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const DAILY_REQUEST_CAP = 30;
const FUNCTION_NAME = "generate-document";

const system = `You design editable printable documents for Product Studio. Return ONLY JSON with this shape:
{"title":"string","kind":"devotional|inventory|intake|maintenance|workbook","pages":[{"id":"unique-id","title":"string","copies":1,"components":[{"id":"unique-id","kind":"heading","text":"string","level":"heading"}]}]}.
Use only these existing universal components: heading {text,level:title|heading}, text {text}, fieldGroup {fields:[{key,label,valueType}]}, question {label,prompt?,response:ruled|blank|dot-grid|graph-grid|pattern,space:{mode:fixed,lines:3}}, checklist {label,space:{mode:fixed,lines:6}}, table {label,columns:[{key,label,valueType}],rows:8,space:{mode:fixed,lines:8}}, list {label,items:[{text}],marker:bullet|number|checkbox}, record {label,fields:[{key,label,valueType}],count:3}, divider {id}, spacer {id,size:small|medium|large}. All components need unique IDs. Value types: text,longText,number,currency,date,time,quantity,boolean,choice,signature,reference. Use no images, page coordinates, legal compliance claims, or invented quotations. Design a coherent outline with useful fields and writing space. The user reviews the proposal before it becomes a product. Do not copy user-provided source wording into the proposal; the client appends that text verbatim as a separate editable page.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const header = req.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return reply({ error: "Sign in to generate a document." }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return reply({ error: "Supabase authentication is not configured." }, 500);
  const client = createClient(url, anon, { global: { headers: { Authorization: header } } });
  const { data: { user }, error: authError } = await client.auth.getUser(header.slice(7));
  if (authError || !user) return reply({ error: "Sign in to generate a document." }, 401);
  let body: { description?: unknown; sourceContent?: unknown };
  try { body = await req.json(); } catch { return reply({ error: "Invalid request." }, 400); }
  if (typeof body.description !== "string" || body.description.trim().length < 10 || body.description.length > 6000 || (body.sourceContent !== undefined && (typeof body.sourceContent !== "string" || body.sourceContent.length > 30000))) return reply({ error: "Describe the document in 10–6000 characters; supplied content must be under 30000 characters." }, 400);
  const day = new Date(); day.setUTCHours(0, 0, 0, 0);
  const { count, error: countError } = await client.from("edge_usage_logs").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("function_name", FUNCTION_NAME).gte("created_at", day.toISOString());
  if (countError) return reply({ error: "Usage limit check failed." }, 500);
  if ((count ?? 0) >= DAILY_REQUEST_CAP) return reply({ error: "Daily document generation limit reached." }, 429);
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return reply({ error: "OPENAI_API_KEY is not configured for document generation." }, 503);
  // Reserve a daily unit before the provider call. A provider error or timeout
  // can still be billable, so counting only successful responses permits costly retries.
  const { error: logError } = await client.from("edge_usage_logs").insert({ user_id: user.id, function_name: FUNCTION_NAME, units: 1 });
  if (logError) return reply({ error: "Usage logging failed; no AI request was sent." }, 500);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(60_000), body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.3, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: `Description:\n${body.description}\n\nSupplied content for context only; do not copy it into the proposal:\n${body.sourceContent ?? ""}` }] }) });
    if (!response.ok) return reply({ error: `AI provider returned ${response.status}.` }, 502);
    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return reply({ error: "AI provider returned no proposal." }, 502);
    const proposal = JSON.parse(content);
    if (!proposal || !Array.isArray(proposal.pages)) return reply({ error: "AI provider returned an invalid proposal." }, 502);
    return reply({ proposal });
  } catch { return reply({ error: "Document generation failed. Please try again." }, 502); }
});
