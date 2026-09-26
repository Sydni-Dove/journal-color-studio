/** Real-browser checks of module selection, persistence, weekly capacity,
 * desktop/phone preview and the actual print tree. Optional QA_BASE_URL
 * repeats these checks against the deployed build in an isolated context.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { mkdir } from "node:fs/promises";
import { resolveDocument } from "../../src/engines/document/resolve";
import { meetingsWithGodBook, step } from "../../src/presets/bookRecipes";
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
    name: "Daily QA", dimensions: { sizePresetId: size, orientation: "portrait" },
    production: { bindingType: "coil", printProfileId: "coil-generic", duplex: true },
    calendar: { startDate: "2027-01-29", endDate: "2027-02-03", weekStart: 1, sixRowMonths: true },
    recipe: { items: [], ordering: "chronological", structure: meetingsWithGodBook(true) },
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

describe("Daily planner browser QA", () => {
  it("Letter: three writing lines per day, connected week and adjoining Meeting With God", async () => {
    const p = project(), doc = resolveDocument(p), page = await open(p);
    const i = doc.recipe.pages.findIndex((p) => p.layoutId === "weekly-plan-mwg-spread");
    await go(page, i + 1);
    await expect.poll(() => page.locator('.ps-page--editor path[data-node^="mw0-days-d"]').count()).toBe(7);
    const paths = await page.locator('.ps-page--editor path[data-node^="mw0-days-d"]').evaluateAll((els) => els.map((e) => e.getAttribute("d")!.match(/M/g)!.length));
    expect(paths).toEqual(Array(7).fill(3));
    await expect.poll(() => page.locator(".badge").first().textContent()).toMatch(/Page OK/);
    await shot(page, "weekly-letter");
    await page.getByRole("button", { name: "Next page" }).click();
    await expect.poll(() => page.locator('.ps-page--editor [data-node="mw1-header-title"]').textContent()).toBe("Meeting With God");
    await shot(page, "meeting-with-god");
    await page.context().close();
  });
  it("select daily page purpose and cadence, save, reopen, edit schedule hours", async () => {
    const p = project();
    p.recipe.structure = [step("notes", { type: "copies", count: 1 }, { id: "edit-daily" })];
    const page = await open(p);
    const card = page.locator('[data-step="edit-daily"]');
    await card.locator(":scope > summary").click();
    await card.getByLabel("Page purpose").selectOption("daily-planner");
    await card.getByLabel("How often").selectOption("daily");
    await card.getByRole("button", { name: "Show pages" }).click();
    await expect.poll(() => page.locator('.ps-page--editor [data-node="daily-date"]').textContent()).toBe("Friday, January 29, 2027");
    await expect.poll(() => page.locator(".badge").first().textContent()).toMatch(/Page OK/);
    await expect.poll(() => page.evaluate((id) => JSON.parse(localStorage.getItem(`dove-product-studio:v1:project:${id}`)!).recipe.structure[0].layoutId, p.id)).toBe("planner-daily");
    await page.reload();
    await page.locator(".card", { hasText: p.name }).first().getByRole("button", { name: "Open", exact: true }).click();
    await expect.poll(() => page.locator('.ps-page--editor [data-node="daily-date"]').textContent()).toBe("Friday, January 29, 2027");
    const panel = page.locator("details.section", { has: page.locator(":scope > summary", { hasText: /^Layout options/ }) });
    if (!(await panel.getAttribute("open"))) await panel.locator(":scope > summary").click();
    const start = panel.getByLabel("Daily schedule starts (24-hour)", { exact: true });
    await start.fill("8"); await start.press("Enter");
    await expect.poll(() => page.locator('.ps-page--editor [data-node="daily-hour-0"]').textContent()).toBe("8:00 AM");
    await expect.poll(() => page.locator(".badge").first().textContent()).toMatch(/Page OK/);
    await page.context().close();
  });
  for (const size of ["8.5x11", "7x9"]) {
    it(`${size}: daily preview and print render the same nodes; PDF output has one sheet`, async () => {
      const p = project(size);
      if (size === "7x9") p.calendar!.weekStart = 0; // final month shares a week owned by January
      const doc = resolveDocument(p), page = await open(p);
      const i = doc.recipe.pages.findIndex((p) => p.layoutId === "planner-daily");
      await go(page, i + 1);
      await expect.poll(() => page.locator('.ps-page--editor [data-node="daily-hour-0"]').textContent()).toBe("6:00 AM");
      await expect.poll(() => page.locator(".badge").first().textContent()).toMatch(/Page OK/);
      await shot(page, `daily-${size}`);
      const content = await page.locator('.ps-page--editor [data-node]').evaluateAll((els) => els.map((e) => [e.getAttribute("data-node"), e.getAttribute("d"), e.textContent]));
      await page.getByRole("button", { name: "Export", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Export" });
      await dialog.getByRole("button", { name: "Current page", exact: true }).click();
      await expect.poll(() => dialog.locator(".badge").first().textContent()).toBe("0 errors");
      expect(await dialog.locator(".issue--warning").count()).toBe(0);
      await page.evaluate(() => { window.print = () => {}; });
      await dialog.getByRole("button", { name: "Print / Save PDF", exact: true }).click();
      await page.waitForSelector("#print-root .ps-print-sheet", { state: "attached" });
      expect(await page.locator("#print-root .ps-print-sheet").count()).toBe(1);
      const print = await page.locator('#print-root [data-node]').evaluateAll((els) => els.map((e) => [e.getAttribute("data-node"), e.getAttribute("d"), e.textContent]));
      expect(print).toEqual(content);
      if (artifacts) {
        await page.emulateMedia({ media: "print" });
        await page.locator("#print-root .ps-page--print").screenshot({ path: `${artifacts}/daily-print-${size}.png` });
        await page.pdf({ path: `${artifacts}/daily-${size}.pdf`, preferCSSPageSize: true, printBackground: true });
      }
      await page.context().close();
    });
  }
  it("phone: daily pages, recipe controls and schedule fields have no horizontal overflow", async () => {
    const p = project(), doc = resolveDocument(p), page = await open(p, true);
    await go(page, doc.recipe.pages.findIndex((p) => p.layoutId === "planner-daily") + 1);
    await expect.poll(() => page.locator('.ps-page--editor [data-node="daily-date"]').textContent()).toBe("Friday, January 29, 2027");
    await page.evaluate(() => document.querySelectorAll("aside details").forEach((d) => (d as HTMLDetailsElement).open = true));
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    if (artifacts) await page.screenshot({ path: `${artifacts}/daily-phone.png`, fullPage: true });
    await page.context().close();
  });
});
