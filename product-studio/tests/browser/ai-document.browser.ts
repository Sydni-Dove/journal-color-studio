/**
 * Phase 8 in a real browser: describe → the AI proposes (the generate-document
 * call is answered with a recorded answer, so this runs without the provider)
 * → review and edit the outline → create → the ordinary editor; saved,
 * reloaded, exported. Live AI calls are tested separately (signed in).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { REQUESTS } from "../fixtures/aiSpecs";

let server: PreviewServer;
let browser: Browser;
beforeAll(async () => {
  server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
  browser = await chromium.launch({ executablePath: (import.meta.env.CHROMIUM_PATH as string | undefined) || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => server?.httpServer.close(() => r()));
});

/** A signed-in session as supabase-js stores it (far-future expiry: no refresh call). Generation needs one. */
const SESSION = { access_token: "test-token", refresh_token: "test-refresh", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user: { id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", email: "maker@example.com", app_metadata: {}, user_metadata: {} } };

/** A fresh studio whose generate-document call answers with `body` (status `status`); signed in unless said. */
async function studio(body: unknown, status = 200, signedIn = true): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.addInitScript(() => { window.print = () => {}; });
  if (signedIn) await page.addInitScript((s) => localStorage.setItem("dove-product-studio:auth", JSON.stringify(s)), SESSION);
  // Online saving would sync with the test account: answer it with an empty list.
  await page.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/functions/v1/generate-document", (route) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }));
  await page.goto(server.resolvedUrls!.local[0]);
  await page.getByRole("button", { name: "Generate with AI" }).click();
  return page;
}
const req = (id: string) => REQUESTS.find((x) => x.id === id)!;
const saved = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("dove-product-studio:v1:project:")).map((k) => JSON.parse(localStorage.getItem(k)!)));

describe("Generate with AI", () => {
  it("a devotional from the maker's own days: their words marked and kept exactly, the outline edited, the product created, saved and reopened", async () => {
    const r = req("devotional");
    const page = await studio({ spec: JSON.stringify(r.spec) });
    await page.getByLabel("Describe your document").fill(r.description);
    await page.getByLabel("Your own wording").fill(r.content!);
    await page.getByRole("button", { name: "Propose an outline" }).click();
    await page.getByRole("heading", { name: "Review the outline" }).waitFor();
    // Whose words: the maker's days and question, and the AI's prayer section.
    await expect(page.locator(".ai-part .badge", { hasText: "Your words" }).count()).resolves.toBe(3);
    await expect(page.locator(".ai-part .badge", { hasText: "Suggested" }).count()).resolves.toBe(1);
    await expect(page.locator(".ai-entries").textContent()).resolves.toMatch(/Days\s*Your words.*3 entries/);
    // Edit: rename the document, remove the AI's prayer part (its only suggestion), add writing space.
    await page.getByLabel("Document title").fill("Three Quiet Mornings Journal");
    const day = page.locator(".ai-section").first();
    await day.locator(".ai-part", { has: page.locator(".badge", { hasText: "Suggested" }) }).first().getByRole("button", { name: "Remove" }).click();
    await expect(day.locator(".ai-part .badge", { hasText: "Suggested" }).count()).resolves.toBe(0);
    await day.getByRole("button", { name: "+ Add writing space" }).click();
    await expect.poll(() => page.getByTestId("ai-pages").textContent(), { timeout: 10_000 }).toMatch(/\d+ pages? · 6 × 9 in upright · bound book/);
    await page.getByRole("button", { name: "Create the document" }).click();
    await page.waitForSelector(".ps-page--editor");
    // An ordinary product, in the ordinary editor.
    const [p] = await saved(page);
    expect(p.name).toBe("Three Quiet Mornings Journal");
    expect(p.data.collections[0].records.map((x: { values: Record<string, unknown> }) => x.values.title)).toEqual(["Morning Light", "Small Faithfulness", "Rest as Obedience"]);
    expect(p.data.collections[0].records[0].values.teaching).toBe("Morning light finds the kitchen before we do. The day begins whether we feel ready or not.");
    const first = await page.locator(".ps-page--editor").first().textContent();
    expect(first).toMatch(/Day 1: Morning Light.*Lamentations 3:22-23.*Morning light finds the kitchen before we do\. The day begins whether we feel ready or not\./);
    expect(first).not.toMatch(/Prayer/);
    // Saved: reload, and it is on the home page to open again.
    await page.reload();
    await page.locator("text=Three Quiet Mornings Journal").first().waitFor();
    await page.context().close();
  });

  it("an intake form: the compliance claim is flagged before creating; the document exports", async () => {
    const r = req("intake");
    const page = await studio({ spec: JSON.stringify(r.spec) });
    await page.getByLabel("Describe your document").fill(r.description);
    await page.getByRole("button", { name: "Propose an outline" }).click();
    await page.getByRole("heading", { name: "Review the outline" }).waitFor();
    await expect(page.locator('[data-flag="compliance"]').textContent()).resolves.toMatch(/not verified.*HIPAA compliant/);
    await page.getByRole("button", { name: "Create the document" }).click();
    await page.waitForSelector(".ps-page--editor");
    await expect(page.locator(".ps-page--editor").first().textContent()).resolves.toMatch(/New Client Intake/);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Print / Save PDF" && !b.disabled), undefined, { timeout: 20_000 });
    await page.getByRole("button", { name: "Print / Save PDF", exact: true }).click();
    await page.locator("#print-root .ps-print-sheet").first().waitFor({ state: "attached", timeout: 10_000 });
    await expect(page.locator("#print-root .ps-print-sheet").count()).resolves.toBeGreaterThan(0);
    await page.context().close();
  }, 60_000);

  it("a malformed AI answer or a server error shows a plain message — nothing is created", async () => {
    for (const [body, status, message] of [
      [{ spec: "Sure! {title: oops" }, 200, /wasn't a document outline/],
      [{ spec: JSON.stringify({ title: "x", summary: "", page: {}, entries: null, sections: [], notes: [] }) }, 200, /no sections/],
      [{ error: "Document generation isn't set up yet (the OpenAI key is missing)." }, 503, /isn't set up yet/],
    ] as const) {
      const page = await studio(body, status);
      await page.getByLabel("Describe your document").fill("A simple weekly cleaning checklist.");
      await page.getByRole("button", { name: "Propose an outline" }).click();
      await expect.poll(() => page.locator('[role="alert"]').textContent()).toMatch(message);
      await expect(page.getByRole("heading", { name: "Review the outline" }).count()).resolves.toBe(0);
      expect(await saved(page)).toEqual([]);
      await page.context().close();
    }
  }, 60_000);

  it("signed out: asked to sign in first — no description box until then, nothing sent", async () => {
    let calls = 0;
    const page = await studio({ spec: "{}" }, 200, false);
    await page.route("**/functions/v1/generate-document", (route) => { calls++; return route.fulfill({ status: 401, body: "{}" }); });
    await page.getByTestId("ai-signin").waitFor();
    await expect(page.getByTestId("ai-signin").textContent()).resolves.toMatch(/Sign in first/);
    await expect(page.getByLabel("Describe your document").count()).resolves.toBe(0);
    await expect(page.getByTestId("ai-signin").getByRole("button").count()).resolves.toBeGreaterThan(0);
    expect(calls).toBe(0);
    await page.context().close();
  });

  it("an outline past 800 pages: a plain message, and nothing can be created until it's smaller", async () => {
    const r = req("intake");
    const spec = { ...r.spec, sections: r.spec.sections.map((x, i) => (i === 0 ? { ...x, repeat: { mode: "copies", count: 500 } } : x)).concat(r.spec.sections.map((x) => ({ ...x, id: `${x.id}-b`, repeat: { mode: "copies", count: 500 } }))) };
    const page = await studio({ spec: JSON.stringify(spec) });
    await page.getByLabel("Describe your document").fill(r.description);
    await page.getByRole("button", { name: "Propose an outline" }).click();
    await page.getByRole("heading", { name: "Review the outline" }).waitFor();
    await expect.poll(() => page.locator(".data-issue", { hasText: "a document can have at most 800" }).count(), { timeout: 10_000 }).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: "Create the document" }).isDisabled()).resolves.toBe(true);
    await page.context().close();
  }, 60_000);

  for (const width of [390, 430])
    it(`iPhone ${width}px: the review never runs past the screen; fields are full-width, 16px (no Safari zoom), 44px targets`, async () => {
      const r = req("devotional");
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      await page.addInitScript((s) => localStorage.setItem("dove-product-studio:auth", JSON.stringify(s)), SESSION);
      await page.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
      const spec = { ...r.spec, sections: r.spec.sections.concat([{ ...r.spec.sections[0], id: "log", title: "Reading Session", repeat: { mode: "copies", count: 30 } }]) };
      await page.route("**/functions/v1/generate-document", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ spec: JSON.stringify(spec) }) }));
      await page.goto(server.resolvedUrls!.local[0]);
      await page.getByRole("button", { name: "Generate with AI" }).click();
      await page.getByLabel("Describe your document").fill(r.description);
      await page.getByRole("button", { name: "Propose an outline" }).click();
      await page.getByRole("heading", { name: "Review the outline" }).waitFor();
      const found = await page.evaluate(() => {
        const W = window.innerWidth, bad: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>(".ai-wizard input, .ai-wizard select, .ai-wizard textarea, .ai-wizard button")) {
          const b = el.getBoundingClientRect(), font = parseFloat(getComputedStyle(el).fontSize), name = el.getAttribute("aria-label") ?? el.textContent ?? el.tagName;
          if (b.left < -0.5 || b.right > W + 0.5) bad.push(`${name} past the edge`);
          if (el.tagName !== "BUTTON" && font < 16) bad.push(`${name} ${font}px text (Safari zooms)`);
          if (b.height < 43.5) bad.push(`${name} ${Math.round(b.height)}px tall`);
        }
        const titles = [...document.querySelectorAll<HTMLElement>("input[aria-label$=' title']")].map((e) => Math.round(e.getBoundingClientRect().width));
        return { bad, titles, scroll: document.documentElement.scrollWidth - W, W };
      });
      expect(found.bad).toEqual([]);
      expect(found.scroll).toBeLessThanOrEqual(0);
      for (const w of found.titles) expect(w, "page titles get the full width").toBeGreaterThan(found.W * 0.75);
      await ctx.close();
    }, 60_000);
});
