/**
 * My Prompts in a real browser: a saved coloring book's prompts, rebuilt and downloadable (one book or all); a prompt
 * copied in the book shows up under “Used before”, word for word, and downloads again. SHOTS_DIR saves a screenshot.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { chromium, type Browser } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { mommyAndMe } from "../fixtures/mommyAndMe";

let server: PreviewServer;
let browser: Browser;
beforeAll(async () => {
  server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
  browser = await chromium.launch({ executablePath: (import.meta.env.CHROMIUM_PATH as string | undefined) || undefined });
});
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => server?.httpServer.close(() => r()));
});
const SHOTS = process.env.SHOTS_DIR;

describe("My Prompts", () => {
  it("every saved book's prompts, downloadable; prompts used before, word for word", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"], deviceScaleFactor: SHOTS ? 2 : 1 });
    await ctx.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    const page = await ctx.newPage();
    await page.goto(server.resolvedUrls!.local[0]);
    const book = { ...mommyAndMe(), step: "pages" };
    await page.evaluate((b) => {
      localStorage.clear();
      localStorage.setItem(`dove-product-studio:v1:coloring-book:${b.id}`, JSON.stringify(b));
      localStorage.setItem("dove-product-studio:v1:coloring-book-index", JSON.stringify([{ id: b.id, name: b.name, scenes: b.brief.scenes.length, updatedAt: b.updatedAt }]));
    }, book);
    await page.reload();

    // Use a prompt in the book: copy all Art Prompts.
    await page.locator('[data-create="coloring-book"]').click();
    await page.getByRole("button", { name: "Open" }).first().click();
    await page.getByTestId("quick-prompts").click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    await page.getByRole("button", { name: "‹ Home" }).click();

    // My Prompts: from the books.
    await page.getByTestId("open-my-prompts").click();
    await page.getByTestId("my-prompts").waitFor();
    await expect.poll(() => page.getByTestId("tab-books").textContent()).toBe("From your books (6)");
    const [all] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-all-prompts").click()]);
    const text = readFileSync((await all.path())!, "utf8");
    expect(text).toContain("######## Mommy & Me: Growing With God Together (Coloring book) ########");
    expect(text).toContain("===== Spread 2 · right (Mommy page): Love is patient, love is kind =====");
    await page.getByTestId(`prompt-group-${book.id}`).locator("summary").first().click();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/my-prompts.png`, fullPage: true });

    // Used before: the copied prompts, exactly as copied.
    await page.getByTestId("tab-history").click();
    await expect.poll(() => page.getByTestId("tab-history").textContent()).toBe("Used before (1)");
    const [h] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-history").click()]);
    expect(readFileSync((await h.path())!, "utf8")).toContain(copied);
    await ctx.close();
  }, 120_000);
});
