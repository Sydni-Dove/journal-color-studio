/** Journal / notes page title controls, "Customize this page", section heading position and line color, in the editor. */
import { openArea, openSection } from "./areas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { createProject } from "../../src/presets/products/projectFactory";
import { step } from "../../src/presets/bookRecipes";

let server: PreviewServer | undefined, browser: Browser, base: string;
beforeAll(async () => {
  server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
  base = server.resolvedUrls!.local[0];
  browser = await chromium.launch({ executablePath: (import.meta.env.CHROMIUM_PATH as string | undefined) || undefined });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  if (server) await new Promise<void>((r) => server!.httpServer.close(() => r()));
});

describe("Moving headings", () => {
  it("Notes title: center + line; line color; Customize this page gives the full builder with a movable heading", async () => {
    const p = createProject("journal", { name: "Heading QA", dimensions: { sizePresetId: "8.5x11" }, recipe: { items: [], ordering: "sequential", structure: [step("notes", { type: "copies", count: 1 })] } } as never);
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await page.goto(base);
    await page.evaluate((p) => {
      localStorage.setItem(`dove-product-studio:v1:project:${p.id}`, JSON.stringify(p));
      localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: p.id, name: p.name, productType: p.productType, sizePresetId: p.dimensions.sizePresetId, updatedAt: p.updatedAt, variantCount: 0 }]));
    }, p);
    await page.reload();
    await page.locator(".card", { hasText: "Heading QA" }).first().getByRole("button", { name: "Open", exact: true }).click();
    await page.waitForSelector(".ps-page--editor");
    const heading = page.locator('.ps-page--editor [data-node="journal-heading"]');
    expect(await heading.evaluate((e) => getComputedStyle(e).textAlign)).toBe("left");
    await openArea(page, "layout");
    const panel = await openSection(page, /^Page title$/);
    await panel.getByRole("button", { name: "Center", exact: true }).click();
    await panel.getByRole("checkbox", { name: "Line under the title" }).check();
    await expect.poll(() => heading.evaluate((e) => getComputedStyle(e).textAlign)).toBe("center");
    await expect.poll(() => page.locator('.ps-page--editor [data-node="journal-heading-rule"]').count()).toBe(1);
    // Writing line color.
    await openArea(page, "writing");
    const lines = await openSection(page, /^Writing lines/);
    await lines.getByLabel("Writing line color").fill("#3366aa");
    await expect.poll(() => page.locator(".ps-page--editor").evaluate((e) => getComputedStyle(e).getPropertyValue("--c-line").trim().toLowerCase())).toBe("#3366aa");
    // Customize this page: the full builder, the heading kept centered with its line.
    await openArea(page, "layout");
    await page.getByRole("button", { name: "Customize this page", exact: true }).click();
    await openArea(page, "add");
    await expect.poll(() => page.locator('.ps-page--editor [data-node$="-title"]').count()).toBeGreaterThan(0);
    const section = page.locator(".prompt-block").first();
    if ((await section.getAttribute("open")) === null) await section.locator("summary").first().click();
    await expect.poll(() => section.getByRole("button", { name: "Center", exact: true }).getAttribute("aria-pressed")).toBe("true");
    await section.getByRole("button", { name: "Right", exact: true }).click();
    await expect.poll(() => page.locator('.ps-page--editor [data-node$="-title"]').first().evaluate((e) => getComputedStyle(e).textAlign)).toBe("right");
    expect(await page.locator('.ps-page--editor [data-node$="-heading-rule"]').count()).toBe(1);
    await page.context().close();
  }, 90_000);
});
