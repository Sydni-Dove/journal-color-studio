/**
 * Book Structure editor + outline in a real browser (npm run test:mobile builds
 * first): the outline jumps to a module's page, a structure edit changes the
 * generated book, and neither panel overflows a phone screen.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { meetingsWithGodBook } from "../../src/presets/bookRecipes";
import { createProject } from "../../src/presets/products/projectFactory";
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

const bookProject = (): ProductProject => {
  const p = createProject("planner", {
    name: "B Book",
    dimensions: { sizePresetId: "7x9", orientation: "portrait" },
    production: { bindingType: "coil", printProfileId: "coil-generic", duplex: true },
    calendar: { startDate: "2027-01-01", endDate: "2027-03-31", weekStart: 1, sixRowMonths: true },
    recipe: { items: [], ordering: "chronological", structure: meetingsWithGodBook() },
    layoutOptions: { showPageNumbers: true },
  });
  return p;
};

async function open(viewport: { width: number; height: number }): Promise<Page> {
  const p = bookProject();
  const page = await (await browser.newContext({ viewport })).newPage();
  await page.goto(base);
  await page.evaluate((x) => {
    localStorage.setItem(`dove-product-studio:v1:project:${x.id}`, JSON.stringify(x));
    localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: x.id, name: x.name, productType: x.productType, sizePresetId: x.dimensions.sizePresetId, updatedAt: x.updatedAt, variantCount: 0 }]));
  }, p);
  await page.goto(base);
  await page.locator(".card", { hasText: "B Book" }).first().getByRole("button", { name: "Open" }).click();
  await page.waitForSelector(".ps-page--editor");
  return page;
}
const section = (page: Page, re: RegExp) => page.locator("details.section", { has: page.locator(":scope > summary", { hasText: re }) });

describe("Book Structure editor", () => {
  it("outline jumps to the hybrid spread; the spread and its Meeting With God page render with no errors", async () => {
    const page = await open({ width: 1400, height: 1000 });
    const outline = section(page, /^Book outline/);
    await outline.locator(":scope > summary").click();
    await outline.locator("button", { hasText: /Week of Jan 4/ }).click();
    await expect.poll(() => page.locator(".ps-page--editor .ps-text", { hasText: /^Week of Jan 4/ }).count()).toBeGreaterThan(0);
    await expect.poll(async () => (await page.locator(".badge").first().textContent()) ?? "").toMatch(/Page OK|warning/);
    await page.getByRole("button", { name: "Next page" }).click();
    await expect.poll(() => page.locator(".ps-page--editor .ps-text", { hasText: /^Meeting With God$/ }).count()).toBeGreaterThan(0);
    await page.context().close();
  });

  it("editing a step re-expands the book: 1 journal page per week → each next spread gets an intentional notes page", async () => {
    const page = await open({ width: 1400, height: 1000 });
    const outline = section(page, /^Book outline/);
    await outline.locator(":scope > summary").click();
    await expect.poll(() => outline.locator("button", { hasText: /Journal × 2/ }).count()).toBeGreaterThan(10);
    const journal = page.locator("details.book-step", { hasText: /Journal × 2/ });
    await journal.locator(":scope > summary").click();
    const field = journal.getByLabel("Pages each time");
    await field.fill("1");
    await field.press("Enter");
    // Spread (2) + 1 journal = 3 pages a week, so every following spread needs one notes page to open on the left.
    await expect.poll(() => outline.locator("button", { hasText: /Journal × 2/ }).count()).toBe(0);
    await expect.poll(() => outline.locator(".book-outline__filler").count()).toBeGreaterThan(10);
    await expect.poll(async () => (await outline.locator(".book-outline__filler").first().textContent()) ?? "").toMatch(/Keeps the week of .* on one open spread/);
    await page.context().close();
  });

  it("phone: structure + outline panels never widen the page", async () => {
    const page = await open({ width: 393, height: 852 });
    await section(page, /^Book outline/).locator(":scope > summary").click();
    await page.locator("details.book-step").first().locator(":scope > summary").click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.context().close();
  });
});
