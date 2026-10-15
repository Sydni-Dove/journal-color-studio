/**
 * Phase 8.1 in a real browser: choose "Develop original content" → the AI writes the days (a recorded answer; no
 * live AI) → read and edit them, write the next batch → create → the AI-written entries and passages are marked in
 * the editor until reviewed, and the marks never print. Structure only stays the default. iPhone widths fit.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { day, DESCRIPTION, developed, MAKER } from "../fixtures/developSpecs";
import { openArea } from "./areas";

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

const SESSION = { access_token: "test-token", refresh_token: "test-refresh", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user: { id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", email: "maker@example.com", app_metadata: {}, user_metadata: {} } };
type Body = { description: string; content: string; mode?: string; entryCount?: number; batch?: { from: number; count: number; fields: unknown[]; previous: string[] } };

/** A signed-in studio whose generate-document calls are answered in turn by `answers`; the request bodies are kept. */
async function studio(answers: unknown[], viewport = { width: 1280, height: 900 }, mobile = false): Promise<{ page: Page; bodies: Body[] }> {
  const ctx = await browser.newContext({ viewport, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}) });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.print = () => {}; });
  await page.addInitScript((s) => localStorage.setItem("dove-product-studio:auth", JSON.stringify(s)), SESSION);
  await page.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  const bodies: Body[] = [];
  await page.route("**/functions/v1/generate-document", (route) => {
    bodies.push(route.request().postDataJSON());
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answers[Math.min(bodies.length - 1, answers.length - 1)]) });
  });
  await page.goto(server.resolvedUrls!.local[0]);
  await page.getByRole("button", { name: "Generate with AI" }).click();
  return { page, bodies };
}
const saved = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("dove-product-studio:v1:project:")).map((k) => JSON.parse(localStorage.getItem(k)!)));
/** No horizontal scroll and nothing past the right edge (the iPhone check from Phase 8). */
const overflow = (page: Page) => page.evaluate(() => {
  const w = document.documentElement.clientWidth;
  const out = [...document.querySelectorAll<HTMLElement>(".ai-wizard *")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > w + 1 || r.left < -1); }).map((el) => el.className || el.tagName);
  return { scroll: document.documentElement.scrollWidth > w + 1, out: out.slice(0, 5) };
});

describe("Develop original content", () => {
  it("Structure only is the default: the request is exactly Phase 8's", async () => {
    const { page, bodies } = await studio([{ spec: JSON.stringify(developed(3)) }]);
    await expect(page.getByRole("radio", { name: /Structure only/ }).isChecked()).resolves.toBe(true);
    await page.getByLabel("Describe your document").fill(DESCRIPTION);
    await page.getByRole("button", { name: "Propose an outline" }).click();
    await page.getByRole("heading", { name: "Review the outline" }).waitFor();
    expect(bodies[0]).toEqual({ description: DESCRIPTION, content: "" });
    // Structure only shows suggestions as before (no "AI-written" labels on its parts).
    await expect(page.locator(".ai-part .badge", { hasText: "AI-written" }).count()).resolves.toBe(0);
    await page.context().close();
  });

  it("writes the days; the maker reads and edits them, writes the next batch, creates; marks stay until reviewed and never print", async () => {
    const { page, bodies } = await studio([{ spec: JSON.stringify(developed(3)) }, { spec: JSON.stringify(developed(2, (n) => day(n + 3))) }]);
    await page.getByLabel("Describe your document").fill(DESCRIPTION);
    await page.getByLabel("Your own wording").fill(MAKER);
    await page.getByRole("radio", { name: /Develop original content/ }).check();
    await page.getByLabel("How many entries").fill("3");
    await page.getByRole("button", { name: "Propose and write the content" }).click();
    await page.getByRole("heading", { name: "Review the outline" }).waitFor();
    expect(bodies[0]).toEqual({ description: DESCRIPTION, content: MAKER, mode: "develop", entryCount: 3 });
    // The maker's opening is theirs; the AI's introduction and days are AI-written.
    await expect(page.locator(".ai-part", { hasText: "Text" }).locator(".badge", { hasText: "Your words" }).count()).resolves.toBe(1);
    await expect(page.locator(".ai-part .badge", { hasText: "AI-written" }).count()).resolves.toBe(1);
    await expect(page.locator(".ai-entry").count()).resolves.toBe(3);
    // Read and edit a day before creating.
    await page.locator('.ai-entry[data-entry="1"] > summary').click();
    await page.getByLabel("Entry 1 Title").fill("Day 1: Come Close");
    // The next batch continues the list.
    await page.getByLabel("How many more entries").fill("2");
    await page.getByRole("button", { name: "Write the next batch" }).click();
    await expect.poll(() => page.locator(".ai-entry").count()).toBe(5);
    expect(bodies[1]).toMatchObject({ mode: "develop", batch: { from: 4, count: 2, previous: ["Day 1: Come Close", "Day 2: Drawing Near", "Day 3: Drawing Near"] } });
    await expect(page.getByRole("status").first().textContent()).resolves.toMatch(/Added 2 entries \(now 5\)/);
    await expect.poll(() => page.getByTestId("ai-pages").textContent(), { timeout: 10_000 }).toMatch(/\d+ pages?/);
    await page.getByRole("button", { name: "Create the document" }).click();
    await page.waitForSelector(".ps-page--editor");

    // Created: five AI-written days (with the maker's edit), marked; the maker's opening unmarked.
    const [p] = await saved(page);
    const recs = p.data.collections[0].records;
    expect(recs.map((r: { values: { title: string } }) => r.values.title)).toEqual(["Day 1: Come Close", "Day 2: Drawing Near", "Day 3: Drawing Near", "Day 4: Drawing Near", "Day 5: Drawing Near"]);
    expect(recs.every((r: { origin?: { kind: string } }) => r.origin?.kind === "ai-suggestion")).toBe(true);
    // The marks never print.
    const pagesText = (await page.locator(".ps-page--editor").allTextContents()).join(" ");
    // (Printed lines run together in the page's text: compared without spaces.)
    expect(pagesText.replace(/\s+/g, "")).toContain(MAKER.replace(/\s+/g, ""));
    expect(pagesText).not.toMatch(/AI-written|review/i);

    // The AI-written introduction on the first page is labelled in its page sections, and can be reviewed.
    await openArea(page, "add");
    await page.getByTestId("ai-review-sections").waitFor();
    await expect(page.locator(".prompt-block [data-testid=ai-written]").count()).resolves.toBe(2);
    await page.getByTestId("ai-review-sections").getByRole("button", { name: "Mark all reviewed" }).click();
    await expect(page.locator(".prompt-block [data-testid=ai-written]").count()).resolves.toBe(0);

    // Your content: every AI-written entry is labelled; review one, then the rest.
    await openArea(page, "data" as never);
    await page.getByTestId("ai-review-entries").waitFor();
    await expect(page.locator(".data-record [data-testid=ai-written]").count()).resolves.toBe(5);
    await page.locator(".data-record").first().locator("summary").click();
    await page.getByRole("button", { name: "Mark as reviewed" }).first().click();
    await expect(page.locator(".data-record [data-testid=ai-written]").count()).resolves.toBe(4);
    await page.getByRole("button", { name: "Mark all reviewed" }).click();
    await expect(page.getByTestId("ai-review-entries").count()).resolves.toBe(0);
    await expect.poll(async () => (await saved(page))[0].data.collections[0].records.filter((r: { origin?: unknown }) => r.origin).length).toBe(0);
    // Undo brings the marks back (an ordinary edit; quick edits in a row undo together).
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await saved(page))[0].data.collections[0].records.filter((r: { origin?: unknown }) => r.origin).length).toBeGreaterThanOrEqual(4);
    await page.context().close();
  });

  it("900 copies: explained before anything is sent; the maker's choice rewrites the quantity; split creates both parts", async () => {
    const half = { title: "Daily Log", summary: "", page: { size: "8.5x11", orientation: "portrait", binding: "loose", why: "" }, entries: null, notes: [],
      sections: [{ id: "log", title: "Daily Log", purpose: "", repeat: { mode: "copies", count: 450 }, startOnRightPage: false, components: [{ id: "d", kind: "fields", label: null, text: null, source: "suggested", fromEntryField: null, fields: [{ label: "Date", valueType: "date" }], rows: null, numbered: false, fillPage: false, lines: null, items: [], marker: null, size: null }] }] };
    const { page, bodies } = await studio([{ spec: JSON.stringify(half) }]);
    await page.getByLabel("Describe your document").fill("A daily log, 900 copies. One page per day with the date.");
    await page.getByRole("button", { name: "Propose an outline" }).click();
    await page.getByTestId("ai-page-limit").waitFor();
    expect(bodies).toHaveLength(0);
    await expect(page.getByTestId("ai-page-limit").textContent()).resolves.toMatch(/at most 800 pages.*none of today's proposals was used/);
    // Nothing changes until a choice is made.
    await expect(page.getByLabel("Describe your document").inputValue()).resolves.toMatch(/900 copies/);
    await page.getByRole("button", { name: "Split into 2 documents of 450 copies" }).click();
    await expect(page.getByLabel("Describe your document").inputValue()).resolves.toMatch(/450 copies/);
    await page.getByRole("button", { name: "Propose an outline" }).click();
    await page.getByRole("heading", { name: "Review the outline" }).waitFor();
    expect(bodies).toHaveLength(1);
    await expect(page.getByTestId("ai-parts").textContent()).resolves.toMatch(/Creates 2 documents/);
    await page.getByRole("button", { name: "Create 2 documents" }).click();
    await page.waitForSelector(".ps-page--editor");
    const names = (await saved(page)).map((p: { name: string }) => p.name).sort();
    expect(names).toEqual(["Daily Log — Part 1 of 2", "Daily Log — Part 2 of 2"]);
    await page.context().close();
  });

  it("a proposal that comes back past the limit: the maker chooses to reduce or split; nothing changes until then", async () => {
    const big = { title: "Garden Log", summary: "", page: { size: "8.5x11", orientation: "portrait", binding: "loose", why: "" }, entries: null, notes: [],
      sections: [{ id: "log", title: "Plant Page", purpose: "", repeat: { mode: "copies", count: 500 }, startOnRightPage: false, components: [{ id: "d", kind: "fields", label: null, text: null, source: "suggested", fromEntryField: null, fields: [{ label: "Plant", valueType: "text" }], rows: null, numbered: false, fillPage: false, lines: null, items: [], marker: null, size: null }] },
        { id: "log2", title: "Harvest Page", purpose: "", repeat: { mode: "copies", count: 500 }, startOnRightPage: false, components: [{ id: "e", kind: "fields", label: null, text: null, source: "suggested", fromEntryField: null, fields: [{ label: "Harvest", valueType: "text" }], rows: null, numbered: false, fillPage: false, lines: null, items: [], marker: null, size: null }] }] };
    const { page } = await studio([{ spec: JSON.stringify(big), pageLimit: { pages: 1000, max: 800 } }]);
    await page.getByLabel("Describe your document").fill("A garden log with a plant page and a harvest page for each plant.");
    await page.getByRole("button", { name: "Propose an outline" }).click();
    await page.getByTestId("ai-limit-choices").waitFor({ timeout: 10_000 });
    await expect(page.getByLabel("Page 1 copies").inputValue()).resolves.toBe("500");
    await expect(page.getByTestId("ai-limit-choices").textContent()).resolves.toMatch(/“Plant Page”: 500 → \d+ copies.*Split into 2 documents/);
    await page.getByRole("button", { name: "Reduce to fit one document" }).click();
    await expect.poll(() => page.getByLabel("Page 1 copies").inputValue()).toBe("395");
    await expect.poll(() => page.getByTestId("ai-pages").textContent(), { timeout: 10_000 }).toMatch(/790 pages/);
    await page.context().close();
  });

  for (const width of [390, 430]) {
    it(`iPhone ${width}px: the choice of mode and the AI-written days fit, nothing cut off`, async () => {
      const { page } = await studio([{ spec: JSON.stringify(developed(3)) }], { width, height: 844 }, true);
      await page.getByLabel("Describe your document").fill(DESCRIPTION);
      await page.getByRole("radio", { name: /Develop original content/ }).check();
      expect(await overflow(page)).toEqual({ scroll: false, out: [] });
      const radio = await page.locator(".ai-mode-option").first().boundingBox();
      expect(radio!.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: `test-results/develop-describe-${width}.png`, fullPage: true });
      await page.getByRole("button", { name: "Propose and write the content" }).click();
      await page.getByRole("heading", { name: "Review the outline" }).waitFor();
      await page.locator('.ai-entry[data-entry="1"] > summary').click();
      expect(await overflow(page)).toEqual({ scroll: false, out: [] });
      const summary = await page.locator('.ai-entry[data-entry="1"] > summary').boundingBox();
      expect(summary!.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: `test-results/develop-review-${width}.png`, fullPage: true });
      await page.context().close();
    });
  }
});
