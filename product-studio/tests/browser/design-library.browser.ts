/**
 * Design library in a real browser (npm run test:mobile builds first):
 *   editor   Background and Decorative elements are separate sections with curated groups and
 *            palette-recolored thumbnails; picking a kintsugi marble renders the real artwork
 *   pixels   the kintsugi marble in its As-designed palette shows its own pink stone + gold seams
 *   compat   a project saved before the split opens with its marble unchanged
 *   phone    no page-level horizontal overflow
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { TEST_PRODUCTS } from "../../src/presets/products/testProducts";
import { createProject } from "../../src/presets/products/projectFactory";
import { step } from "../../src/presets/bookRecipes";
import type { ProductProject } from "../../src/types/project";

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

async function open(p: ProductProject, viewport = { width: 1400, height: 1000 }): Promise<Page> {
  const page = await (await browser.newContext({ viewport })).newPage();
  await page.goto(base);
  await page.evaluate((proj) => {
    localStorage.clear();
    localStorage.setItem(`dove-product-studio:v1:project:${proj.id}`, JSON.stringify(proj));
    localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: proj.id, name: proj.name, productType: proj.productType, sizePresetId: proj.dimensions.sizePresetId, updatedAt: proj.updatedAt, variantCount: 0 }]));
  }, p);
  await page.goto(base);
  await page.locator(".card", { hasText: p.name }).first().getByRole("button", { name: "Open" }).click();
  await page.waitForSelector(".ps-page--editor");
  return page;
}
const section = (page: Page, title: string) => page.locator("details.section", { has: page.locator(":scope > summary", { hasText: new RegExp(`^${title}$`) }) }).first();
const settled = (page: Page) => page.waitForFunction(() => !document.querySelector('.ps-page--editor [data-decor="raster-pending"]'), null, { timeout: 30_000 });

/** Average color of the page's background-layer raster, sampled in the browser. */
const bgColor = (page: Page) =>
  page.evaluate(async () => {
    const img = document.querySelector('.ps-page--editor [data-layer="background"] image') as SVGImageElement | null;
    if (!img) return null;
    const el = new Image();
    el.src = img.getAttribute("href")!;
    await el.decode();
    const c = document.createElement("canvas");
    c.width = 40;
    c.height = 40;
    const x = c.getContext("2d")!;
    x.drawImage(el, 0, 0, 40, 40);
    const d = x.getImageData(0, 0, 40, 40).data;
    let r = 0, g = 0, b = 0, gold = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
      if (d[i] > 180 && d[i + 1] > 90 && d[i + 1] < 190 && d[i + 2] < 90) gold++;
    }
    const n = d.length / 4;
    return { r: r / n, g: g / n, b: b / n, gold };
  });

describe("Background vs Decorative elements", () => {
  it("separate sections, curated groups, thumbnails in the current palette; picking a kintsugi marble renders it", async () => {
    const p = { ...TEST_PRODUCTS[2].build(), name: "DL monthly" };
    p.colors = { paletteId: "jcs-rose-marble", overrides: {} };
    const page = await open(p);
    const bg = section(page, "Background"), el = section(page, "Decorative elements");
    await bg.locator(":scope > summary").click();
    await el.locator(":scope > summary").click();
    await expect(bg.getByRole("tab").allTextContents()).resolves.toEqual(["None", "Marble", "Watercolor", "Stripes", "Solid"]);
    await expect(el.getByRole("tab").allTextContents()).resolves.toEqual(["None", "Floral", "Line art"]);
    await bg.getByRole("tab", { name: "Marble" }).click();
    await bg.locator('.design-card:has([data-thumb="jcs-marble-rose"])').click();
    await settled(page);
    await expect(page.locator('.ps-page--editor [data-layer="background"] [data-asset="jcs-marble-rose"]').count()).resolves.toBeGreaterThan(0);
    // Thumbnails are real recolored rasters, not placeholders (only on-screen ones are recolored).
    await bg.locator(".design-grid").scrollIntoViewIfNeeded();
    await page.waitForFunction(
      () => document.querySelectorAll('.design-grid [data-thumb^="jcs-marble"][data-ready="true"] img').length >= 4,
      null,
      { timeout: 20_000 },
    );
    // The marble's own colors: pink stone with gold seams (the real artwork, recolored onto its As-designed palette).
    const c = (await bgColor(page))!;
    expect(c.r).toBeGreaterThan(200);
    expect(c.r - c.b).toBeGreaterThan(15);
    // Elements stay independent of the background.
    await el.getByRole("tab", { name: "Floral" }).click();
    await el.locator('.design-card:has([data-thumb="jcs-floral-sprig"])').click();
    await settled(page);
    await expect(page.locator('.ps-page--editor [data-layer="elements"] [data-asset="jcs-floral-sprig"]').count()).resolves.toBeGreaterThan(0);
    await expect(page.locator('.ps-page--editor [data-layer="background"] [data-asset="jcs-marble-rose"]').count()).resolves.toBeGreaterThan(0);
    await page.context().close();
  });

  it("a palette switch recolors the marble (same artwork, new colors)", async () => {
    const p = { ...TEST_PRODUCTS[2].build(), name: "DL recolor" };
    p.colors = { paletteId: "jcs-rose-marble", overrides: {} };
    p.backgroundTheme = { style: "marble", assetId: "jcs-marble-rose", placement: "header-band", scale: 1, opacity: 1, colorA: "decorBase", colorB: "decorativeAccent", colorC: "decorHighlight" };
    const page = await open(p);
    await settled(page);
    const rose = (await bgColor(page))!;
    const th = section(page, "Theme & palette");
    await th.locator(":scope > summary").click();
    await th.locator("select").first().selectOption("jcs-emerald-gold");
    await settled(page);
    await page.waitForTimeout(100);
    const emerald = (await bgColor(page))!;
    expect(emerald.r).toBeLessThan(rose.r - 60); // dark green stone
    await page.context().close();
  });

  it("a project saved before the split opens with its marble on the background layer", async () => {
    const p = { ...TEST_PRODUCTS[2].build(), name: "DL legacy" } as ProductProject;
    delete p.backgroundTheme;
    p.decorativeTheme = { style: "marble", assetId: "jcs-marble-goldleaf", placement: "header-band", scale: 1, opacity: 1, colorA: "decorBase", colorB: "decorativeAccent", colorC: "decorHighlight" };
    const page = await open(p);
    await settled(page);
    await expect(page.locator('.ps-page--editor [data-layer="background"] [data-asset="jcs-marble-goldleaf"]').count()).resolves.toBeGreaterThan(0);
    await section(page, "Background").locator(":scope > summary").click();
    await expect(section(page, "Background").locator('.design-card[aria-pressed="true"]').textContent()).resolves.toMatch(/Gold leaf/);
    await page.context().close();
  });

  it("daily pages: tapping Watercolor applies the JCS Abstract watercolor; the Luxury daily page takes a title sprig", async () => {
    const daily = (name: string, size: string, layoutId?: string) =>
      createProject("planner", {
        name,
        dimensions: { sizePresetId: size, orientation: "portrait" },
        calendar: { startDate: "2027-01-01", endDate: "2027-01-02", weekStart: 0, sixRowMonths: true },
        recipe: { items: [], ordering: "chronological", structure: [{ ...step("daily-planner"), ...(layoutId ? { layoutId } : {}) }] },
        colors: { paletteId: "jcs-abstract-watercolor", overrides: {} },
      });
    let page = await open(daily("DL daily", "7x9"));
    const bg = section(page, "Background");
    await bg.locator(":scope > summary").click();
    // One design in the group: the tab itself applies it (it used to only open the group).
    await bg.getByRole("tab", { name: "Watercolor" }).click();
    await settled(page);
    await expect(page.locator('.ps-page--editor [data-layer="background"] [data-asset="jcs-watercolor-abstract"]').count()).resolves.toBeGreaterThan(0);
    await bg.locator("select").first().selectOption("full-page");
    await settled(page);
    // Its own colors: warm paper with burgundy / blush / gold paint (never the old grey-blue bloom wash).
    const c = (await bgColor(page))!;
    expect(c.r - c.b).toBeGreaterThan(20);
    await page.context().close();

    page = await open(daily("DL luxury", "8.5x11", "daily-luxury-execution"));
    const el = section(page, "Decorative elements");
    await el.locator(":scope > summary").click();
    await el.getByRole("tab", { name: "Floral" }).click();
    await el.locator('.design-card:has([data-thumb="jcs-floral-sprig"])').click();
    await settled(page);
    await expect(page.locator('.ps-page--editor [data-layer="elements"] [data-asset="jcs-floral-sprig"]').count()).resolves.toBeGreaterThan(0);
    await expect(el.locator(".decor-status").innerText()).resolves.toMatch(/placed/);
    await page.context().close();
  });

  it("phone: both pickers fit, no page-level horizontal overflow", async () => {
    const page = await open({ ...TEST_PRODUCTS[0].build(), name: "DL phone" }, { width: 390, height: 844 });
    for (const t of ["Background", "Decorative elements"]) {
      await section(page, t).locator(":scope > summary").click();
      await section(page, t).getByRole("tab").nth(1).click();
    }
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.context().close();
  });
});
