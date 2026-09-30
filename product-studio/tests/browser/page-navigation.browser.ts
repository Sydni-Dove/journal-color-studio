/**
 * Page navigation in a real browser, on a large generated book: the page's
 * type beside the page number; the Pages sheet (thumbnails + labels), its
 * page-type filter and "Jump to"; filtered previous / next; phone bottom
 * sheet with no horizontal overflow. Navigation never changes the book.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { dailyPlannerBook, neutralLuxeDividers } from "../../src/presets/bookRecipes";
import { createProject } from "../../src/presets/products/projectFactory";
import type { ProductProject } from "../../src/types/project";

let server: PreviewServer, browser: Browser, base: string;
beforeAll(async () => {
  server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
  base = server.resolvedUrls!.local[0];
  browser = await chromium.launch({ executablePath: (import.meta.env.CHROMIUM_PATH as string | undefined) || undefined });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => server?.httpServer.close(() => r()));
});

const book = (): ProductProject =>
  createProject("planner", {
    name: "Navigation QA", dimensions: { sizePresetId: "7x9", orientation: "portrait" },
    production: { bindingType: "coil", printProfileId: "coil-generic", duplex: true },
    calendar: { startDate: "2027-01-01", endDate: "2027-12-31", weekStart: 0, sixRowMonths: true },
    recipe: { items: [], ordering: "chronological", structure: [...neutralLuxeDividers(), ...dailyPlannerBook()] },
  });

async function open(p: ProductProject, phone = false): Promise<Page> {
  const page = await (await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1400, height: 1000 }, isMobile: phone, hasTouch: phone })).newPage();
  await page.goto(base);
  await page.evaluate((p) => {
    localStorage.clear();
    localStorage.setItem(`dove-product-studio:v1:project:${p.id}`, JSON.stringify(p));
    localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: p.id, name: p.name, productType: p.productType, sizePresetId: p.dimensions.sizePresetId, updatedAt: p.updatedAt, variantCount: 0 }]));
  }, p);
  await page.reload();
  await page.locator(".card", { hasText: p.name }).first().getByRole("button", { name: "Open", exact: true }).click();
  await page.waitForSelector(".ps-page--editor");
  return page;
}
const label = (page: Page) => page.getByTestId("page-label").innerText();
const pageNo = (page: Page) => page.getByLabel("Page number", { exact: true }).inputValue();
const saved = (page: Page, id: string) => page.evaluate((id) => JSON.stringify(JSON.parse(localStorage.getItem(`dove-product-studio:v1:project:${id}`)!).recipe), id);

describe("page navigation", () => {
  it("desktop: label beside the page number; Pages sheet filter, jump to a month, filtered next — the book is unchanged", async () => {
    const p = book(), page = await open(p);
    const recipeBefore = await saved(page, p.id);
    const total = await page.locator(".page-counter").innerText();
    await expect.poll(() => label(page)).toMatch(/^COVER\s*Plan/i);

    // Pages sheet: every page listed with its type; real page thumbnails.
    await page.getByRole("button", { name: "Browse pages", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Browse pages" });
    await expect.poll(() => sheet.locator(".page-row .ps-page").count()).toBeGreaterThan(3);
    expect(await sheet.locator(".page-row").count()).toBeGreaterThan(500);
    await expect(sheet.locator('.page-row[data-page="1"]').innerText()).resolves.toMatch(/Cover — Plan/);

    // Filter: Daily only; pick one.
    await sheet.getByLabel("Show pages").selectOption("daily");
    await expect.poll(() => sheet.locator(".page-row").count()).toBe(365);
    expect(await sheet.locator('.page-row[data-category]:not([data-category="daily"])').count()).toBe(0);
    await sheet.locator(".page-row", { hasText: /Wednesday, March 3(?!\d)/ }).click();
    await expect.poll(() => label(page)).toMatch(/DAILY PLANNER\s*Wednesday, March 3(?!\d)/);
    const march3 = Number(await pageNo(page));

    // Filtered previous / next move among Daily pages only.
    await page.getByRole("button", { name: "Next Daily page" }).click();
    await expect.poll(() => label(page)).toMatch(/Thursday, March 4/);
    expect(Number(await pageNo(page))).toBeGreaterThan(march3);

    // Jump to a month: its first page (the monthly calendar).
    await page.getByRole("button", { name: "Browse pages", exact: true }).click();
    await page.getByRole("dialog", { name: "Browse pages" }).getByLabel("Jump to").selectOption({ label: "June 2027" });
    await expect.poll(() => label(page)).toMatch(/MONTHLY PLANNER\s*June 2027/);

    // Jump to a section (divider).
    await page.getByRole("button", { name: "Browse pages", exact: true }).click();
    await page.getByRole("dialog", { name: "Browse pages" }).getByLabel("Jump to").selectOption({ label: "Wellness" });
    await expect.poll(() => label(page)).toMatch(/DIVIDER\s*Wellness/);

    // Navigation changed nothing: same page count, same saved book.
    expect(await page.locator(".page-counter").innerText()).toBe(total);
    expect(await saved(page, p.id)).toBe(recipeBefore);
    await page.context().close();
  });

  it("phone: label visible, Pages opens a bottom sheet with large rows, tapping a page closes it; no horizontal overflow", async () => {
    const page = await open(book(), true);
    await expect.poll(() => label(page)).toMatch(/COVER/i);
    await page.getByRole("button", { name: "Browse pages", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Browse pages" });
    const box = (await sheet.boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(840); // anchored to the bottom of the screen
    expect(box.width).toBeLessThanOrEqual(390);
    const rows = await sheet.locator(".page-row").evaluateAll((els) => els.slice(0, 20).map((e) => e.getBoundingClientRect().height));
    for (const h of rows) expect(h).toBeGreaterThanOrEqual(44);
    await sheet.getByLabel("Show pages").selectOption("weekly");
    await sheet.locator(".page-row").nth(2).click();
    await expect(sheet.count()).resolves.toBe(0);
    await expect.poll(() => label(page)).toMatch(/WEEKLY PLANNER/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    // The page still scrolls vertically (no scroll trap once the sheet is closed).
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.context().close();
  });
});

describe("stale tab", () => {
  it("shows the build on the home page, and offers a reload when a newer build is deployed", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base);
    await expect(page.getByTestId("build").innerText()).resolves.toMatch(/^Version \S+/);
    expect(await page.locator(".update-banner").count()).toBe(0);
    // The server now serves another build.
    await page.route(/\/\?v=\d+/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: '<script type="module" src="./assets/index-NEWBUILD1.js"></script>' }));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => page.locator(".update-banner").count()).toBe(1);
    await expect(page.locator(".update-banner").innerText()).resolves.toMatch(/Reload/);
    await ctx.close();
  });
});
