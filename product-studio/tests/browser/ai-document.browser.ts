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

/** A fresh studio whose generate-document call answers with `body` (status `status`). */
async function studio(body: unknown, status = 200): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.addInitScript(() => { window.print = () => {}; });
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
});
