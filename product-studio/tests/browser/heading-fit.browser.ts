/**
 * Weekly sidebar headings with REAL fonts and canvas glyph metrics (the live
 * editor's validator), on desktop and phone widths: the rendered heading fits
 * inside its slot with the heading inset on both sides, and the page check
 * reports no error — or, for wording that cannot fit, a specific heading-fit
 * error (npm run test:mobile builds first).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { createProject } from "../../src/presets/products/projectFactory";
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

const cal = { startDate: "2027-01-01", endDate: "2027-12-31", weekStart: 1 as const, sixRowMonths: true };
const weeklyRecipe = { items: [{ id: "w", layoutId: "planner-weekly-spread", repeat: { kind: "every-week" as const } }], ordering: "chronological" as const };
const SIZES: Record<string, () => ProductProject> = {
  "7 × 9": () => TEST_PRODUCTS[3].build(),
  "Half Letter": () => createProject("planner", { dimensions: { sizePresetId: "5.5x8.5", orientation: "portrait" }, production: { bindingType: "discbound", printProfileId: "disc-generic", duplex: true }, calendar: cal, recipe: weeklyRecipe }),
  "Franklin Compact": () => createProject("insert", { dimensions: { sizePresetId: "franklin-compact", orientation: "portrait" }, production: { bindingType: "ring-6", printProfileId: "ring-insert", duplex: true }, calendar: cal, recipe: weeklyRecipe, layoutOptions: { showSidebar: true } }),
};
const weekly = (heading: string, size = "7 × 9"): ProductProject => {
  const p = SIZES[size]();
  p.name = `H ${size} ${heading}`;
  p.id = `${p.id}-${size.replace(/\W/g, "")}-${heading.replace(/\W/g, "")}`;
  p.layoutOptions.showSidebar = true;
  p.layoutOptions.sidebarContent = "prayer";
  p.wording = { ...p.wording, prayer: heading };
  return p;
};

async function open(product: ProductProject, viewport: { width: number; height: number }): Promise<Page> {
  const page = await (await browser.newContext({ viewport })).newPage();
  await page.goto(base);
  await page.evaluate((p) => {
    localStorage.setItem(`dove-product-studio:v1:project:${p.id}`, JSON.stringify(p));
    localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: p.id, name: p.name, productType: p.productType, sizePresetId: p.dimensions.sizePresetId, updatedAt: p.updatedAt, variantCount: 0 }]));
  }, product);
  await page.goto(base);
  await page.locator(".card", { hasText: product.name }).first().getByRole("button", { name: "Open" }).click();
  await page.waitForSelector(".ps-page--editor");
  // Go to the spread that carries the sidebar.
  for (let i = 0; i < 4 && !(await page.locator('.ps-page--editor [data-node^="wk0-sidebar-"].ps-text').count()); i++) await page.getByRole("button", { name: "Next page" }).click();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return page;
}

/** Real rendered geometry: heading ink (a range over its text) vs the sidebar slot, in CSS px. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector('.ps-page--editor .ps-text[data-node^="wk0-sidebar-"]') as HTMLElement;
    const range = document.createRange();
    range.selectNodeContents(el);
    const ink = range.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const pageEl = el.closest(".ps-page--editor") as HTMLElement;
    const pxPerIn = pageEl.getBoundingClientRect().width / (pageEl.offsetWidth / 96);
    return { ink: { l: ink.left, r: ink.right, t: ink.top }, box: { l: box.left, r: box.right, t: box.top }, pxPerIn, overflow: el.scrollWidth - el.clientWidth, fit: el.dataset.fit ?? null };
  });
}

const VIEWPORTS = { desktop: { width: 1400, height: 1000 }, phone: { width: 393, height: 852 } };

describe("weekly sidebar heading fits with real fonts", () => {
  for (const [vp, size] of Object.entries(VIEWPORTS)) {
    for (const heading of ["Notes", "Prayer Requests", "Kingdom Assignments", "Important Things This Week"]) {
      it(`${vp}: "${heading}" fits inside its slot and the page check shows no error`, async () => {
        const page = await open(weekly(heading), size);
        const m = await measure(page);
        const tol = 0.5; // sub-pixel rounding
        expect(m.overflow, "text wider than its solved box").toBeLessThanOrEqual(0);
        expect(m.ink.l).toBeGreaterThanOrEqual(m.box.l - tol);
        expect(m.ink.r).toBeLessThanOrEqual(m.box.r + tol);
        await expect.poll(async () => (await page.locator(".badge").first().textContent()) ?? "").not.toMatch(/error/);
        await page.context().close();
      });
    }
  }
  for (const size of ["Half Letter", "Franklin Compact"]) {
    for (const [vp, dims] of Object.entries(VIEWPORTS)) {
      it(`${size} ${vp}: "Prayer Requests" and "Kingdom Assignments" fit with no error`, async () => {
        for (const heading of ["Prayer Requests", "Kingdom Assignments"]) {
          const page = await open(weekly(heading, size), dims);
          const m = await measure(page);
          expect(m.overflow, `${heading}: text wider than its solved box`).toBeLessThanOrEqual(0);
          expect(m.ink.l).toBeGreaterThanOrEqual(m.box.l - 0.5);
          expect(m.ink.r).toBeLessThanOrEqual(m.box.r + 0.5);
          await expect.poll(async () => (await page.locator(".badge").first().textContent()) ?? "").not.toMatch(/error/);
          await page.context().close();
        }
      });
    }
  }
  it("wording that cannot fit reports the specific heading-fit error (not a generic collision)", async () => {
    const page = await open(weekly("Important Things To Remember Before Sunday Service"), VIEWPORTS.desktop);
    await expect.poll(async () => (await page.locator(".badge").first().textContent()) ?? "").toMatch(/1 errors?/);
    await page.evaluate(() => document.querySelectorAll("aside details").forEach((d) => ((d as HTMLDetailsElement).open = true)));
    await expect(page.locator(".issue--error", { hasText: /Sidebar heading "IMPORTANT THINGS TO REMEMBER BEFORE SUNDAY SERVICE" exceeds the available heading width by \d\.\d\d"/ }).count()).resolves.toBeGreaterThan(0);
    await expect(page.locator(".issue", { hasText: /overlaps/ }).count()).resolves.toBe(0);
    // Reported, and meanwhile kept inside its own box (never drawn across the slot border).
    const clip = await page.evaluate(() => {
      const el = document.querySelector('.ps-page--editor .ps-text[data-node="wk0-sidebar-name"]') as HTMLElement;
      const box = el.getBoundingClientRect();
      return [...el.querySelectorAll("span")].map((s) => ({ hidden: getComputedStyle(s).overflow === "hidden", right: s.getBoundingClientRect().right - box.right }));
    });
    expect(clip.length).toBe(2);
    for (const c of clip) expect(c.hidden && c.right <= 0.5).toBe(true);
    await page.context().close();
  });
});
