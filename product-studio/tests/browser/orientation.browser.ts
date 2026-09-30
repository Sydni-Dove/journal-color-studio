/**
 * Orientation in a real browser: the flow that produced a "9" × 7" page" in a
 * 7 × 9 project — a planner made at 11 × 17 (landscape by nature), then
 * switched to 7 × 9 in the editor — now gives a 7" × 9" portrait page, and
 * the print sheet has the same orientation.
 */
import { openArea } from "./areas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";
import { preview, type PreviewServer } from "vite";

let server: PreviewServer;
let browser: Browser;
let base: string;
beforeAll(async () => {
  server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
  base = server.resolvedUrls!.local[0];
  browser = await chromium.launch({ executablePath: (import.meta.env.CHROMIUM_PATH as string | undefined) || undefined });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => server?.httpServer.close(() => r()));
});

describe("orientation follows the chosen size", () => {
  it("11 × 17 planner switched to 7 × 9 in the editor: caption and print sheet are 7 × 9 portrait", async () => {
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
    await page.goto(base);
    await page.evaluate(() => localStorage.clear());
    await page.goto(base);
    await page.locator("button.family-card", { hasText: /^Planner/ }).first().click();
    await page.waitForSelector("#wizard-build");
    await page.locator("label.field", { hasText: "Page size" }).locator("select").selectOption("11x17");
    await page.getByRole("button", { name: /^(Start planner|Create )/ }).click();
    await page.waitForSelector(".ps-page--editor");
    await expect.poll(() => page.locator(".preview-caption").innerText()).toMatch(/17" × 11" page/);
    await openArea(page, "setup");
    const size = page.locator("details.section", { has: page.locator(":scope > summary", { hasText: /^Size/ }) });
    await size.evaluate((d) => ((d as HTMLDetailsElement).open = true));
    await size.locator("label.field", { hasText: "Page size" }).locator("select").selectOption("7x9");
    await expect.poll(() => page.locator(".preview-caption").innerText()).toMatch(/7" × 9" page/);
    // The saved project says portrait; the print sheet is taller than it is wide.
    const saved = () => page.evaluate(() => {
      const idx = JSON.parse(localStorage.getItem("dove-product-studio:v1:index")!);
      const d = JSON.parse(localStorage.getItem(`dove-product-studio:v1:project:${idx[0].id}`)!).dimensions;
      return `${d.sizePresetId} ${d.orientation}`;
    });
    await expect.poll(saved, { timeout: 5000 }).toBe("7x9 portrait"); // saving is debounced
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Export" });
    await dialog.getByRole("button", { name: "Current page", exact: true }).click();
    await expect(dialog.textContent()).resolves.toMatch(/Output: 1 page\(s\), 7(\.\d+)?" × 9(\.\d+)?"/);
    // Choosing landscape explicitly still gives landscape.
    await dialog.getByRole("button", { name: "Close" }).click();
    await size.getByRole("button", { name: "Landscape (wide)" }).click();
    await expect.poll(() => page.locator(".preview-caption").innerText()).toMatch(/9" × 7" page/);
    await page.context().close();
  }, 60_000);
});
