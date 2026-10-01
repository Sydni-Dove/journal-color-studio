/** Real-browser checks of module selection, persistence, weekly capacity,
 * desktop/phone preview and the actual print tree. Optional QA_BASE_URL
 * repeats these checks against the deployed build in an isolated context.
 */
import { openArea } from "./areas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { mkdir } from "node:fs/promises";
import { neutralLuxeDividers } from "../../src/presets/bookRecipes";
import { createProject } from "../../src/presets/products/projectFactory";
import type { ProductProject } from "../../src/types/project";

let server: PreviewServer | undefined, browser: Browser, base: string;
const artifacts = process.env.QA_ARTIFACT_DIR;
beforeAll(async () => {
  if (process.env.QA_BASE_URL) base = process.env.QA_BASE_URL;
  else {
    server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
    base = server.resolvedUrls!.local[0];
  }
  browser = await chromium.launch({ executablePath: (import.meta.env.CHROMIUM_PATH as string | undefined) || undefined });
  if (artifacts) await mkdir(artifacts, { recursive: true });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  if (server) await new Promise<void>((r) => server!.httpServer.close(() => r()));
});

function project(size = "8.5x11") {
  return createProject("planner", {
    name: "Cover QA", colors: { paletteId: "neutral-cheetah-luxe" }, typography: { fonts: { cover: "The Nautigal", headings: "Playfair Display", subheadings: "Lato", body: "Lato", accent: "Great Vibes" }, roleOverrides: { coverTitle: { sizePt: 150, transform: "none", weight: 700, trackingEm: 0, color: "text" }, coverSubtitle: { sizePt: 10, trackingEm: 0.22, color: "text" } } }, dimensions: { sizePresetId: size, orientation: "portrait" },
    production: { bindingType: "coil", printProfileId: "coil-generic", duplex: true },
    calendar: { startDate: "2027-01-29", endDate: "2027-02-03", weekStart: 1, sixRowMonths: true },
    recipe: { items: [], ordering: "chronological", structure: size === "filofax-personal" ? neutralLuxeDividers().slice(0, 4) : neutralLuxeDividers() },
    layoutOptions: { showPageNumbers: true },
  });
}
async function open(p: ProductProject, phone = false): Promise<Page> {
  const page = await (await browser.newContext({ viewport: phone ? { width: 393, height: 852 } : { width: 1440, height: 1100 }, isMobile: phone, hasTouch: phone })).newPage();
  await page.goto(base);
  await page.evaluate((p) => {
    localStorage.setItem(`dove-product-studio:v1:project:${p.id}`, JSON.stringify(p));
    localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: p.id, name: p.name, productType: p.productType, sizePresetId: p.dimensions.sizePresetId, updatedAt: p.updatedAt, variantCount: 0 }]));
  }, p);
  await page.reload();
  await page.locator(".card", { hasText: p.name }).first().getByRole("button", { name: "Open", exact: true }).click();
  await page.waitForSelector(".ps-page--editor");
  return page;
}
async function go(page: Page, n: number) {
  await page.getByLabel("Page number", { exact: true }).fill(String(n));
  await page.getByLabel("Page number", { exact: true }).press("Enter");
  await page.evaluate(() => document.fonts.ready);
}
async function shot(page: Page, name: string) {
  if (artifacts) await page.locator(".ps-page--editor").screenshot({ path: `${artifacts}/${name}.png` });
}


describe("Cover and divider browser QA", () => {
  for (const size of ["8.5x11", "7x9", "6x9", "5.5x8.5", "a5", "filofax-personal"]) it(`${size}: cover, divider and print parity`, async () => {
    const page = await open(project(size));
    await go(page, 1); await shot(page, `cover-${size}`);
    await go(page, 2); await shot(page, `divider-${size}`);
    const preview = await page.locator('.ps-page--editor [data-node]').evaluateAll((els) => els.map((e) => ({ tag: e.tagName, text: e.textContent, style: e.getAttribute('style')?.replace(/leopard-[^)]+/g, 'leopard'), x: e.getAttribute('x'), y: e.getAttribute('y') })));
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const errors = await page.getByRole("dialog", { name: "Export" }).locator('.issue--error').allTextContents();
    expect(errors).toEqual([]);
    await page.evaluate(() => { window.print = () => {}; });
    await page.getByRole("button", { name: "Print / Save PDF", exact: true }).click();
    await page.waitForSelector("#print-root .ps-print-sheet", { state: "attached" });
    await page.emulateMedia({ media: 'print' });
    const printed = await page.locator('.ps-page--print').nth(1).locator('[data-node]').evaluateAll((els) => els.map((e) => ({ tag: e.tagName, text: e.textContent, style: e.getAttribute('style')?.replace(/leopard-[^)]+/g, 'leopard'), x: e.getAttribute('x'), y: e.getAttribute('y') })));
    expect(printed).toEqual(preview);
    if (artifacts) await page.pdf({ path: `${artifacts}/cover-divider-${size}.pdf`, preferCSSPageSize: true, printBackground: true });
    await page.context().close();
  });
  it("phone controls persist and do not overflow", async () => {
    const page = await open(project(), true);
    page.setDefaultTimeout(5000);
    // Page layout edits the page being viewed: the cover.
    await openArea(page, "layout");
    const card = page.locator('.this-page');
    await card.getByLabel('Title font').selectOption('Dancing Script');
    await card.getByLabel('Subtitle', { exact: true }).fill('LIVE WITH PURPOSE');
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload();
    await page.locator('.card', { hasText: 'Cover QA' }).first().getByRole('button', { name: 'Open', exact: true }).click();
    await openArea(page, "layout");
    expect(await page.locator('.this-page').getByLabel('Subtitle', { exact: true }).inputValue()).toBe('LIVE WITH PURPOSE');
    expect(await page.locator('.this-page').getByLabel('Title font').inputValue()).toBe('Dancing Script');
    expect(await page.locator('[data-node="cover-title"]').first().evaluate((e) => getComputedStyle(e).fontWeight)).toBe('700');
    await page.context().close();
  });
  it("Journal Color Studio cover surface: picked from pictures, this page only, printed, wording choices persist", async () => {
    const page = await open(project("6x9"));
    await go(page, 1);
    await openArea(page, "layout");
    const card = page.locator(".this-page");
    // Real artwork thumbnails, not a text list.
    await expect.poll(() => card.locator('.cover-picker [data-cover^="surface:"] .thumb[data-ready="true"] img').count(), { timeout: 20000 }).toBe(7);
    await card.locator('[data-cover="surface:jcs-marble-ember"]').click();
    await expect.poll(() => page.locator('.ps-page--editor [data-layer="surface"] image').count(), { timeout: 20000 }).toBeGreaterThan(0);
    expect(await page.locator('.ps-page--editor [data-node="cover-title"]').count()).toBe(1);
    await card.getByRole("button", { name: "No wording", exact: true }).click();
    await expect.poll(() => page.locator('.ps-page--editor [data-node="cover-title"]').count()).toBe(0);
    await card.getByRole("button", { name: "Title only", exact: true }).click();
    await expect.poll(() => page.locator('.ps-page--editor [data-node="cover-title"]').count()).toBe(1);
    expect(await page.locator('.ps-page--editor [data-node="cover-subtitle"]').count()).toBe(0);
    await page.waitForTimeout(900);
    // Saved with the project; the interior never gets the cover's surface.
    await page.reload();
    await page.locator(".card", { hasText: "Cover QA" }).first().getByRole("button", { name: "Open", exact: true }).click();
    await page.waitForSelector(".ps-page--editor");
    await go(page, 1);
    await expect.poll(() => page.locator('.ps-page--editor [data-layer="surface"] image').count(), { timeout: 20000 }).toBeGreaterThan(0);
    const total = Number((await page.locator(".page-nav, body").first().innerText()).match(/of (\d+)/)?.[1] ?? 0);
    expect(total).toBeGreaterThan(3);
    for (const n of [3, total]) {
      await go(page, n);
      await page.waitForTimeout(300);
      expect(await page.locator('.ps-page--editor [data-layer="surface"]').count(), `page ${n}`).toBe(0);
    }
    // The printed cover carries the surface too.
    await go(page, 1);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    expect(await page.getByRole("dialog", { name: "Export" }).locator(".issue--error").allTextContents()).toEqual([]);
    // Reported: the painted cover was missing from the print. Printing waits until no artwork is still being
    // prepared and every image is decoded.
    await page.evaluate(() => {
      window.print = () => {
        const w = window as unknown as { __atPrint: { pending: number; images: number } };
        w.__atPrint = { pending: document.querySelectorAll('#print-root [data-decor="raster-pending"]').length, images: document.querySelectorAll('#print-root [data-layer="surface"] image').length };
      };
    });
    await page.getByRole("button", { name: "Print / Save PDF", exact: true }).click();
    await page.waitForSelector("#print-root .ps-print-sheet", { state: "attached" });
    const atPrint = await page.waitForFunction(() => (window as unknown as { __atPrint?: unknown }).__atPrint, null, { timeout: 30000 }).then((h) => h.jsonValue() as Promise<{ pending: number; images: number }>);
    expect(atPrint.pending).toBe(0);
    expect(atPrint.images).toBeGreaterThan(0);
    expect(await page.locator('.ps-page--print').first().locator('[data-layer="surface"] image').count()).toBeGreaterThan(0);
    expect(await page.locator('.ps-page--print').nth(2).locator('[data-layer="surface"]').count()).toBe(0);
    await page.context().close();
  }, 90_000);
});
