/**
 * Studio shell in a real browser (npm run test:mobile builds first):
 *   home    empty / one / several projects, desktop + phone, every card leads somewhere
 *   editor  default panel width, drag + keyboard resizing within limits, the
 *           preview rescales, no page-level horizontal overflow; phone keeps the stacked flow
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { TEST_PRODUCTS } from "../../src/presets/products/testProducts";
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

const DESKTOP = { width: 1400, height: 900 };
const PHONE = { width: 390, height: 844 };

async function home(projects: ProductProject[], viewport: { width: number; height: number }): Promise<Page> {
  const page = await (await browser.newContext({ viewport })).newPage();
  await page.goto(base);
  await page.evaluate((list) => {
    localStorage.clear();
    const idx = list.map((p) => {
      localStorage.setItem(`dove-product-studio:v1:project:${p.id}`, JSON.stringify(p));
      return { id: p.id, name: p.name, productType: p.productType, sizePresetId: p.dimensions.sizePresetId, updatedAt: p.updatedAt, variantCount: 0 };
    });
    localStorage.setItem("dove-product-studio:v1:index", JSON.stringify(idx));
  }, projects);
  await page.goto(base);
  await page.waitForSelector(".home-hero");
  return page;
}
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const products = (n: number) => TEST_PRODUCTS.slice(0, n).map((t, i) => ({ ...t.build(), name: `U${i} ${t.label}` }));

describe("Studio home", () => {
  for (const [name, vp] of [["desktop", DESKTOP], ["phone", PHONE]] as const) {
    it(`${name}: new user — welcome, product families, quick start; no overflow`, async () => {
      const page = await home([], vp);
      await expect(page.locator("h1").textContent()).resolves.toBe("Dove Expressions Product Studio");
      await expect(page.getByText("Your studio is ready").count()).resolves.toBe(1);
      await expect(page.locator("button.family-card").count()).resolves.toBe(6);
      // Families without a foundation are shown, never clickable.
      const next = page.locator(".family-card--next");
      await expect(next.count()).resolves.toBe(3);
      await expect(next.evaluateAll((els) => els.every((e) => e.tagName !== "BUTTON" && !e.querySelector("button, a")))).resolves.toBe(true);
      await expect(page.getByText("Open your latest project").count()).resolves.toBe(0);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.context().close();
    });
    it(`${name}: several projects — continue working with type, size, pages, edited; no overflow`, async () => {
      const list = products(4);
      const page = await home(list, vp);
      const cards = page.locator(".recent-card");
      await expect(cards.count()).resolves.toBe(4);
      await expect(cards.filter({ hasText: "U2" }).textContent()).resolves.toMatch(/Planner · 7 × 9 · \d+ pages/);
      await expect(cards.filter({ hasText: "U1" }).textContent()).resolves.toMatch(/Journal · 6 × 9 · 120 pages/);
      await expect(cards.filter({ hasText: "U0" }).textContent()).resolves.toMatch(/Notepad · 5 × 7 · .*one master sheet/);
      await expect(page.getByText("All projects · 4").count()).resolves.toBe(1);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.context().close();
    });
  }

  it("one project: Open reaches the editor; 'Open your latest project' too", async () => {
    const page = await home(products(1), DESKTOP);
    await page.getByRole("button", { name: /Open your latest project/ }).click();
    await page.waitForSelector(".ps-page--editor");
    await page.context().close();
  });

  it("Planner + Journal starts the wizard on a book structure", async () => {
    const page = await home([], DESKTOP);
    await page.locator("button.family-card", { hasText: "Planner + Journal" }).click();
    await page.waitForSelector("#wizard-build");
    await expect(page.locator('button.choice[aria-pressed="true"]', { hasText: /Meetings With God/ }).count()).resolves.toBe(1);
    await expect(page.locator('button.choice[aria-pressed="true"]', { hasText: /^Planner$/ }).count()).resolves.toBe(1);
    await page.context().close();
  });

  it("starter templates are real: creating one opens the editor", async () => {
    const page = await home([], DESKTOP);
    await page.getByRole("button", { name: /Start from a starter template/ }).click();
    await page.locator("#wizard-templates").waitFor();
    await page.locator("button.card--pick").first().click();
    await page.waitForSelector(".ps-page--editor");
    await page.context().close();
  });
});

describe("Editor panel width", () => {
  async function editor(viewport: { width: number; height: number }) {
    const page = await home(products(3).slice(2), viewport);
    await page.locator(".card", { hasText: "U2" }).first().getByRole("button", { name: "Open" }).click();
    await page.waitForSelector(".ps-page--editor");
    return page;
  }
  const panelW = (page: Page) => page.locator("aside.panel").evaluate((e) => e.getBoundingClientRect().width);
  const pageW = (page: Page) => page.locator(".ps-page--editor").first().evaluate((e) => e.getBoundingClientRect().width);

  it("desktop: 420–480 px by default; drag and keyboard resize within 360–600; the preview rescales; no overflow", async () => {
    const page = await editor(DESKTOP);
    const w0 = await panelW(page);
    expect(w0).toBeGreaterThanOrEqual(420);
    expect(w0).toBeLessThanOrEqual(480);
    // Fit width: the page scale follows the room left for the preview.
    await page.getByRole("button", { name: "Fit width" }).click();
    await page.waitForTimeout(100);
    const p0 = await pageW(page);
    const handle = page.getByRole("separator", { name: "Resize the editor panel" });
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 400, box.y + 200, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => panelW(page)).toBe(600);
    await expect.poll(() => pageW(page)).toBeLessThan(p0); // less room → smaller fitted page
    await handle.focus();
    await page.keyboard.press("Home");
    await expect.poll(() => panelW(page)).toBe(360);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => panelW(page)).toBe(376);
    await expect.poll(() => pageW(page)).toBeGreaterThan(p0 * 0.99);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.context().close();
  });

  it("the chosen width is remembered", async () => {
    const page = await editor(DESKTOP);
    await page.getByRole("separator", { name: "Resize the editor panel" }).focus();
    await page.keyboard.press("End");
    await expect.poll(() => panelW(page)).toBe(600);
    await page.reload();
    await page.locator(".card", { hasText: "U2" }).first().getByRole("button", { name: "Open" }).click();
    await page.waitForSelector(".ps-page--editor");
    await expect.poll(() => panelW(page)).toBe(600);
    await page.context().close();
  });

  it("phone: stacked flow, no divider, no overflow", async () => {
    const page = await editor(PHONE);
    await expect(page.getByRole("separator", { name: "Resize the editor panel" }).isVisible()).resolves.toBe(false);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.context().close();
  });
});
