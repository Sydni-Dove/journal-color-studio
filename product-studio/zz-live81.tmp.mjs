// LIVE 8.1 check — temporary, not committed. Branch build + real Supabase + generate-document v9, test account.
import { chromium } from "playwright-core";
import { preview } from "vite";
import fs from "node:fs";
const OUT = "/tmp/claude-0/-home-user-dove-expressions-journal-app/5aa5d40a-f138-5a6c-a062-278b6a23fecd/scratchpad/live81";
const U = "https://jnlvvlkwskidloripvtp.supabase.co", K = "sb_publishable_lopqr1HC3kjSio_vVFN_tg_VdBoTi4R";
const log = (...a) => { const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "); console.log(s); fs.appendFileSync(OUT + "/log.txt", s + "\n"); };
const session = await (await fetch(U + "/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: K, "Content-Type": "application/json" }, body: JSON.stringify({ email: "ps-livecheck81-20261015@example.com", password: fs.readFileSync(OUT + "/pw", "utf8").trim() }) })).json();
if (!session.access_token) throw new Error("sign-in failed " + JSON.stringify(session));
fs.writeFileSync(OUT + "/token", session.access_token);
const server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, async (r) => { try { await r.fulfill({ response: await r.fetch() }); } catch { await r.abort(); } });
// The sandbox browser can't reach Supabase through the proxy tunnel: its calls are made by the test process instead (same requests).
await ctx.route(/jnlvvlkwskidloripvtp\.supabase\.co/, async (r) => { try { await r.fulfill({ response: await r.fetch({ timeout: 170_000 }) }); } catch (e) { console.log("route fail", r.request().url(), String(e).slice(0, 120)); await r.abort(); } });
await ctx.addInitScript((s) => { if (!localStorage.getItem("dove-product-studio:auth")) localStorage.setItem("dove-product-studio:auth", JSON.stringify(s)); }, session);
const page = await ctx.newPage();
let n = 0;
page.on("response", async (r) => {
  if (!r.url().includes("/functions/v1/generate-document") || r.request().method() !== "POST") return;
  const i = ++n; const t = Date.now();
  const body = await r.text().catch(() => "");
  fs.writeFileSync(OUT + "/resp" + i + ".json", body);
  fs.writeFileSync(OUT + "/req" + i + ".json", r.request().postData() ?? "");
  log("RESPONSE", i, r.status(), body.slice(0, 160).replace(/\n/g, " "));
});
const home = async () => { await page.goto(server.resolvedUrls.local[0], { waitUntil: "load" }); };
const startAi = async () => { await home(); await page.getByRole("button", { name: "Generate with AI" }).click(); await page.getByLabel("Describe your document").waitFor(); };
const review = () => page.getByRole("heading", { name: "Review the outline" }).waitFor({ timeout: 160_000 });
const saved = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("dove-product-studio:v1:project:")).map((k) => JSON.parse(localStorage.getItem(k))));
const step = process.argv[2];
try {
  if (step === "structure") {
    await startAi();
    await page.getByLabel("Describe your document").fill("A weekly homeschool reading log for kids: book title, pages read, a favourite part, and a parent check-off.");
    const t = Date.now(); await page.getByRole("button", { name: "Propose an outline" }).click(); await review();
    log("structure review after", Date.now() - t, "ms; pages:", await page.getByTestId("ai-pages").textContent({ timeout: 15000 }).catch(() => "?"));
    log("badges", await page.locator(".ai-part .badge").allTextContents());
    await page.getByRole("button", { name: "Create the document" }).click(); await page.waitForSelector(".ps-page--editor");
    const p = (await saved()).find((x) => x.name);
    log("structure created:", p.name, "origins:", JSON.stringify(p).split('"origin":{"kind":"ai-suggestion"').length - 1);
  }
  if (step === "precheck") {
    await startAi();
    await page.getByLabel("Describe your document").fill("A daily log, 900 copies. One page per day with the date and notes.");
    await page.getByRole("button", { name: "Propose an outline" }).click();
    await page.getByTestId("ai-page-limit").waitFor();
    log("precheck card:", await page.getByTestId("ai-page-limit").textContent(), "requests sent:", n);
  }
  if (step === "develop") {
    await startAi();
    await page.getByLabel("Describe your document").fill("A Scripture-based character-building journal for children ages 6 to 9. Each lesson teaches one character trait (such as kindness, honesty, courage, patience) with a short Bible verse, a simple story-style teaching a child can understand, an activity the child can do that day, two reflection questions, and a short prayer. Leave space for the child to draw or write.");
    await page.getByRole("radio", { name: /Develop original content/ }).check();
    await page.getByLabel("How many entries").fill("6");
    let t = Date.now(); await page.getByRole("button", { name: "Propose and write the content" }).click(); await review();
    log("develop review after", Date.now() - t, "ms; entries:", await page.locator(".ai-entry").count());
    for (const count of [6, 6]) {
      const before = await page.locator(".ai-entry").count();
      await page.getByLabel("How many more entries").fill(String(count));
      t = Date.now(); await page.getByRole("button", { name: "Write the next batch" }).click();
      await page.waitForFunction((b) => document.querySelectorAll(".ai-entry").length > b || /couldn't|more than one request|declined|failed|didn't/i.test(document.querySelector(".ai-batch [role=status]")?.textContent ?? ""), before, { timeout: 160_000 });
      log("batch after", Date.now() - t, "ms; entries:", await page.locator(".ai-entry").count(), "status:", await page.locator(".ai-batch [role=status]").textContent().catch(() => ""));
    }
    log("entry names:", await page.locator(".ai-entry > summary").allTextContents());
    await page.screenshot({ path: OUT + "/develop-review.png", fullPage: true });
    await page.waitForFunction(() => /\d+ pages?/.test(document.querySelector("[data-testid=ai-pages]")?.textContent ?? ""), null, { timeout: 30000 });
    await page.getByRole("button", { name: "Create the document" }).click(); await page.waitForSelector(".ps-page--editor");
    const p = (await saved()).find((x) => x.data?.collections?.length);
    fs.writeFileSync(OUT + "/project.json", JSON.stringify(p, null, 1));
    log("created:", p.name, "records:", p.data.collections[0].records.length, "with origin:", p.data.collections[0].records.filter((r) => r.origin).length);
    await page.screenshot({ path: OUT + "/develop-editor.png" });
    // Wait for online saving, then reopen in a fresh page.
    await page.waitForTimeout(8000);
    await home();
    await page.locator("text=" + p.name).first().click();
    await page.waitForSelector(".ps-page--editor");
    await page.locator('.area-link[data-area="data"]').click();
    await page.getByTestId("ai-review-entries").waitFor();
    log("after reopen: AI-written badges in Your content:", await page.locator(".data-record [data-testid=ai-written]").count(), "| review line:", await page.getByTestId("ai-review-entries").textContent());
    await page.screenshot({ path: OUT + "/reopened-your-content.png", fullPage: true });
    const printed = (await page.locator(".ps-page--editor").allTextContents()).join(" ");
    log("printed pages contain 'AI-written':", /AI-written/.test(printed));
  }
  if (step === "overlimit") {
    await startAi();
    await page.getByLabel("Describe your document").fill("A one-page-per-day food journal covering every single day of the next three years, with meals, water and how I felt.");
    const t = Date.now(); await page.getByRole("button", { name: "Propose an outline" }).click(); await review();
    await page.waitForTimeout(2000);
    log("overlimit review after", Date.now() - t, "ms; copies inputs:", await page.locator('input[aria-label$="copies"]').evaluateAll((xs) => xs.map((x) => x.value)));
    log("choices:", await page.getByTestId("ai-limit-choices").textContent({ timeout: 5000 }).catch(() => "(none shown)"), "| build:", await page.locator(".ai-fit").textContent());
    await page.screenshot({ path: OUT + "/overlimit-review.png", fullPage: true });
  }
  if (step === "cap") {
    await startAi();
    await page.getByLabel("Describe your document").fill("A one-page monthly budget sheet with income, bills and savings.");
    await page.getByRole("button", { name: "Propose an outline" }).click();
    await page.locator(".data-issue[role=alert]").waitFor({ timeout: 60000 });
    log("cap message:", await page.locator(".data-issue[role=alert]").textContent());
  }
} catch (e) { log("ERROR", step, String(e).slice(0, 500)); await page.screenshot({ path: OUT + "/error-" + step + ".png", fullPage: true }); }
await browser.close(); server.httpServer.close();
