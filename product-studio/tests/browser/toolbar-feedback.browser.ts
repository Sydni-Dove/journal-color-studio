/**
 * Toolbar feedback, in a real browser: the Colors list reachable to its last palette (no trapped inner scroll);
 * every color arrangement and per-use palette swatches; Grocery List sections, lines and checkbox shapes;
 * the Checklist layout; yearly calendars, months at the front and dividers by time from the planner builder;
 * reordering a page from Browse pages. Phone width too. Set SHOTS_DIR for screenshots.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { createProject } from "../../src/presets/products/projectFactory";
import { dailyPlannerBook } from "../../src/presets/bookRecipes";
import type { ProductProject } from "../../src/types/project";
import { openArea, openSection } from "./areas";

let server: PreviewServer;
let browser: Browser;
beforeAll(async () => {
  server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
  browser = await chromium.launch({ executablePath: (import.meta.env.CHROMIUM_PATH as string | undefined) || undefined });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => server?.httpServer.close(() => r()));
});
const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

async function open(p: ProductProject, viewport = { width: 1366, height: 768 }, phone = false): Promise<Page> {
  const ctx = await browser.newContext({ viewport, isMobile: phone, hasTouch: phone });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, async (route) => route.fulfill({ response: await route.fetch() }).catch(() => route.abort()));
  await ctx.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  const page = await ctx.newPage();
  await page.goto(server.resolvedUrls!.local[0]);
  await page.evaluate((o) => {
    localStorage.clear();
    localStorage.setItem(`dove-product-studio:v1:project:${o.id}`, JSON.stringify(o));
    localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: o.id, name: o.name, productType: o.productType, sizePresetId: o.dimensions.sizePresetId, updatedAt: o.updatedAt }]));
  }, p);
  await page.reload();
  await page.getByRole("button", { name: "Open", exact: true }).first().click();
  await page.locator(".ps-page--editor").first().waitFor();
  return page;
}
const grocery = () => createProject("notepad", { name: "Grocery", recipe: { items: [{ id: "sheet", layoutId: "notepad-grocery", repeat: { kind: "repeated-sheet", sheets: 50 } }], ordering: "sequential" } } as never);
const pageText = (page: Page) => page.locator(".ps-page--editor").first().textContent();
const saved = (page: Page) => page.evaluate(() => {
  const idx = JSON.parse(localStorage.getItem("dove-product-studio:v1:index") ?? "[]");
  return JSON.parse(localStorage.getItem(`dove-product-studio:v1:project:${idx[0].id}`) ?? "null");
});

describe("Toolbar feedback", () => {
  it("Colors: the whole list is reachable at laptop size, arrangements and per-use colors swap within the palette", async () => {
    const page = await open(grocery());
    await openArea(page, "style");
    const colors = await openSection(page, /^Colors/i);
    await colors.locator(".palette-picker .chip", { hasText: /^All/ }).click();
    const grid = colors.locator(".palette-grid");
    // No scroll box of its own: the panel's scroll reaches the last palette.
    const own = await grid.evaluate((g) => ({ overflow: getComputedStyle(g).overflowY, client: g.clientHeight, scroll: g.scrollHeight }));
    expect(own.overflow).toBe("visible");
    expect(own.scroll).toBeLessThanOrEqual(own.client + 1);
    const last = grid.locator(".palette-card").last();
    await last.scrollIntoViewIfNeeded();
    expect(await last.isVisible()).toBe(true);
    const lastName = (await last.locator(".palette-card__name").textContent())!;
    await last.click();
    await expect.poll(async () => (await page.getByTestId("palette-current").textContent()) ?? "").toContain(lastName);
    // Every arrangement, picked directly.
    await openSection(page, /^Colors/i);
    const cards = page.locator(".arrangement-card");
    if ((await cards.count()) > 1) {
      await cards.nth(1).click();
      await expect.poll(async () => (await saved(page)).colors.arrangement).toBe(1);
    }
    // Each use takes any of this palette's colors.
    await page.getByTestId("palette-roles").locator("summary").click();
    const swatch = page.locator(".palette-role").first().locator(".palette-role__swatch").last();
    await swatch.click();
    await expect.poll(async () => Object.keys((await saved(page)).colors.overrides ?? {}).length).toBeGreaterThan(0);
    await shot(page, "tf-colors");
    await page.context().close();
  }, 60_000);

  it("Grocery List: add, rename, reorder and remove sections; set lines; circle, square or no checkboxes", async () => {
    const page = await open(grocery());
    await openArea(page, "add");
    const panel = page.getByTestId("list-sections");
    await expect(panel.locator("input").count()).resolves.toBe(6);
    await panel.getByRole("button", { name: "Remove section 3" }).click();
    await page.getByRole("button", { name: "Add a section" }).click();
    await panel.getByLabel("Section 6 title").fill("Snacks");
    await panel.getByRole("button", { name: "Move section 6 up" }).click();
    await expect.poll(async () => (await pageText(page)) ?? "").toMatch(/Snacks/i);
    expect(await pageText(page)).not.toMatch(/Meat & Seafood/i);
    await page.getByRole("button", { name: "One line more" }).click();
    await expect.poll(async () => (await saved(page)).layoutOptions.listPage.lines).toBe(4);
    await page.getByRole("button", { name: "One line fewer" }).click();
    await page.getByRole("group", { name: "Checkboxes" }).getByRole("button", { name: "Circle" }).click();
    await expect.poll(async () => (await saved(page)).layoutOptions.listPage).toMatchObject({ lines: 3, marker: "circle" });
    await expect.poll(() => page.locator(".ps-page--editor").first().locator("rect[rx]:not([rx='0'])").count()).toBeGreaterThan(0);
    await shot(page, "tf-grocery");
    await page.getByRole("group", { name: "Checkboxes" }).getByRole("button", { name: "None" }).click();
    await expect.poll(async () => (await saved(page)).layoutOptions.listPage.marker).toBe("none");
    await page.context().close();
  }, 60_000);

  it("Planner builder: yearly calendars, months at the front, dividers by time; Browse pages reorders", async () => {
    const p = createProject("planner", { name: "Planner", calendar: { startDate: "2027-01-01", endDate: "2027-02-28", weekStart: 0, sixRowMonths: true }, recipe: { items: [], ordering: "chronological", structure: dailyPlannerBook() } } as never);
    const page = await open(p);
    await openArea(page, "pages");
    const yearly = page.locator('.builder-cat[data-category="yearly"]');
    await yearly.getByRole("button", { name: "+ Year at a glance (one page)" }).click();
    await yearly.getByRole("button", { name: "+ Year in pixels" }).click();
    const monthly = page.locator('.builder-cat[data-category="monthly"]');
    await monthly.getByRole("button", { name: "+ All months at the front of the book" }).click();
    await expect(monthly.getByRole("button", { name: "+ All months at the front of the book" }).count()).resolves.toBe(0);
    const dividers = page.locator('.builder-cat[data-category="dividers"]');
    await dividers.getByRole("button", { name: "+ Divider before every month" }).click();
    await dividers.getByRole("button", { name: "+ Divider before every week" }).click();
    // The book's order: cover, the two yearly pages, all months together, then the year's pages with month dividers.
    await page.getByRole("button", { name: "Browse pages" }).click();
    const rows = page.locator(".page-row");
    const labels = await rows.evaluateAll((els) => els.map((e) => e.querySelector(".page-row__type")?.textContent?.trim() ?? ""));
    const non = labels.filter((l) => !/^Notes/.test(l));
    expect(non.slice(0, 5).join(" | ")).toMatch(/^Cover.*\| Yearly Calendar.*\| Yearly Calendar.*\| Monthly Planner.*\| Monthly Planner/);
    expect(labels.some((l) => /Divider — January 2027/.test(l))).toBe(true);
    expect(labels.some((l) => /Divider — February 2027/.test(l))).toBe(true);
    await shot(page, "tf-browse");
    // Reorder: move Vision before Mission.
    const vision = page.locator(".page-list > li", { has: page.locator(".page-row__type", { hasText: /— Vision$/ }) }).first();
    const visionNum = await vision.locator(".page-row").getAttribute("data-page");
    await vision.getByRole("button", { name: /earlier/ }).click();
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Browse pages" }).click();
    const after = await page.locator(".page-row__type").allTextContents();
    expect(after.findIndex((t) => /— Vision$/.test(t.trim()))).toBeLessThan(after.findIndex((t) => /— Mission$/.test(t.trim())));
    expect(Number(visionNum)).toBeGreaterThan(0);
    await page.context().close();
  }, 90_000);

  it("on a phone the new controls fit: no sideways scrolling", async () => {
    const page = await open(grocery(), { width: 390, height: 844 }, true);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await openArea(page, "add");
    expect(await overflow()).toBeLessThanOrEqual(1);
    await openArea(page, "style");
    await openSection(page, /^Colors/i);
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.context().close();
  }, 60_000);
});
