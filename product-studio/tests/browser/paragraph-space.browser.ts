/**
 * Space between paragraphs (Page layout → Spacing): on by default — a blank line between paragraphs prints as an
 * empty line — and a switch turns it off; the preview follows, and the choice is saved with the product.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { createProject } from "../../src/presets/products/projectFactory";
import { step } from "../../src/presets/bookRecipes";
import type { PromptSet } from "../../src/types/prompts";
import { openArea, openSection } from "./areas";

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

const text = ["First paragraph: morning light finds the kitchen before we do.", "Second paragraph: write what you saw, not what you expected.", "Third paragraph: rest is part of obedience."].join("\n\n");
const product = () =>
  createProject("journal", {
    name: "Paragraph space",
    dimensions: { sizePresetId: "6x9", orientation: "portrait" },
    recipe: { items: [], ordering: "sequential", structure: [step("guided", { type: "copies", count: 1 }, { title: "Day 1", promptSet: { blocks: [{ id: "t1", kind: "heading", textStyle: "body", label: text }] } as PromptSet })] },
  });

describe("Space between paragraphs", () => {
  it("on by default; turning it off removes the empty lines from the page; saved", async () => {
    const p = product();
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
    await page.goto(base);
    await page.evaluate((p) => {
      localStorage.clear();
      localStorage.setItem(`dove-product-studio:v1:project:${p.id}`, JSON.stringify(p));
      localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: p.id, name: p.name, productType: p.productType, sizePresetId: p.dimensions.sizePresetId, updatedAt: p.updatedAt, variantCount: 0 }]));
    }, p);
    await page.goto(base);
    await page.locator(".card").first().getByRole("button", { name: "Open" }).click();
    await page.waitForSelector(".ps-page--editor");
    const emptyLines = () => page.locator(".ps-page--editor .ps-text span").evaluateAll((spans) => spans.filter((s) => s.textContent === " ").length);
    await expect.poll(emptyLines).toBe(2);
    await openArea(page, "layout");
    await openSection(page, /^Spacing/);
    const box = page.getByRole("checkbox", { name: "Space between paragraphs" });
    await expect(box.isChecked()).resolves.toBe(true);
    await box.uncheck();
    await expect.poll(emptyLines).toBe(0);
    await expect(page.locator(".ps-page--editor").first().textContent()).resolves.toMatch(/First paragraph.*Second paragraph.*Third paragraph/);
    await expect.poll(() => page.evaluate((id) => JSON.parse(localStorage.getItem(`dove-product-studio:v1:project:${id}`)!).layoutOptions.paragraphSpace, p.id)).toBe(false);
    await page.reload();
    await page.locator(".card").first().getByRole("button", { name: "Open" }).click();
    await page.waitForSelector(".ps-page--editor");
    await expect.poll(emptyLines).toBe(0);
    await page.context().close();
  });
});
