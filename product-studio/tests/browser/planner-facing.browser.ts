import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { mkdir } from "node:fs/promises";
import { step } from "../../src/presets/bookRecipes";
import { createProject } from "../../src/presets/products/projectFactory";

let server: PreviewServer, browser: Browser, base: string;
const artifacts = process.env.QA_ARTIFACT_DIR;
beforeAll(async () => {
  server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
  base = server.resolvedUrls!.local[0];
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  if (artifacts) await mkdir(artifacts, { recursive: true });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
});

describe("facing Monthly and Notes in the browser", () => {
  for (const [size, orientation, facingPages] of [
    ["8x10", "portrait", "preserve"],
    ["8x10", "landscape", "preserve"],
    ["7x9", "portrait", "preserve"],
    ["8x10", "portrait", "continuous"],
  ] as const) it(`${size} ${orientation} ${facingPages}: preview and PDF use one page model`, async () => {
    const p = createProject("planner", {
      name: `Facing QA ${size} ${orientation} ${facingPages}`,
      dimensions: { sizePresetId: size, orientation },
      production: { bindingType: "coil", printProfileId: "coil-generic", duplex: true },
      calendar: { startDate: "2027-01-04", endDate: "2027-01-05", weekStart: 1, sixRowMonths: true },
      recipe: { items: [], ordering: "sequential", facingPages, structure: [step("cover-page"), step("monthly-calendar", { type: "monthly" }), step("weekly-planner", { type: "weekly" })] },
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(base);
    await page.evaluate((project) => {
      localStorage.setItem(`dove-product-studio:v1:project:${project.id}`, JSON.stringify(project));
      localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: project.id, name: project.name, productType: project.productType, sizePresetId: project.dimensions.sizePresetId, updatedAt: project.updatedAt, variantCount: 0 }]));
    }, p);
    await page.reload();
    await page.locator(".card", { hasText: p.name }).first().getByRole("button", { name: "Open", exact: true }).click();
    await page.getByLabel("Page number", { exact: true }).fill("2");
    await page.getByLabel("Page number", { exact: true }).press("Enter");
    await page.getByLabel("Spread view").check();
    await page.evaluate(() => document.fonts.ready);
    const visible = page.locator(".ps-page--editor");
    expect(await visible.count()).toBe(2);
    if (facingPages === "preserve") {
      const month = await visible.nth(0).locator('[data-node="month-header-rule"]').boundingBox();
      const notes = await visible.nth(1).locator('[data-node="notes-facing-month-header-rule"]').boundingBox();
      expect(month).not.toBeNull();
      expect(notes).not.toBeNull();
      expect(Math.abs(month!.y - notes!.y)).toBeLessThan(1);
      const left = await visible.nth(0).boundingBox();
      const right = await visible.nth(1).boundingBox();
      expect(Math.abs(left!.y - right!.y)).toBeLessThan(1);
      expect(Math.abs(left!.height - right!.height)).toBeLessThan(1);
      if (artifacts) await page.locator(".preview-canvas").screenshot({ path: `${artifacts}/facing-${size}-${orientation}.png` });
    }
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.evaluate(() => { window.print = () => {}; });
    await page.getByRole("button", { name: "Print / Save PDF", exact: true }).click();
    await page.waitForSelector("#print-root .ps-print-sheet", { state: "attached" });
    const pageCount = await page.locator("#print-root .ps-print-sheet").count();
    expect(pageCount).toBe(facingPages === "preserve" ? 5 : 4);
    await page.emulateMedia({ media: "print" });
    if (facingPages === "preserve") {
      const printedRule = page.locator('#print-root .ps-print-sheet').nth(2).locator('[data-node="notes-facing-month-header-rule"]');
      const bounds = await printedRule.boundingBox();
      expect(bounds?.width ?? 0).toBeGreaterThan(300);
      if (artifacts && size === "8x10" && orientation === "portrait") await page.locator('#print-root .ps-print-sheet').nth(2).screenshot({ path: `${artifacts}/printed-notes-dom.png` });
    }
    const pdf = await page.pdf({ path: artifacts ? `${artifacts}/facing-${size}-${orientation}-${facingPages}.pdf` : undefined, preferCSSPageSize: true, printBackground: true });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    await context.close();
  });
});
