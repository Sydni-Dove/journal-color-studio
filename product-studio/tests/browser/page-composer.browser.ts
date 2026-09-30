/**
 * Page Composer in a real browser: a blank Custom Page → + Add something
 * (heading, info row, divider, spacer, table) → the page draws each piece →
 * save it as a page design → Pages adds three pages made from it. Desktop and
 * phone (no page overflow).
 */
import { openArea } from "./areas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { step } from "../../src/presets/bookRecipes";
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
  await new Promise<void>((r) => server.httpServer.close(() => r()));
});

const blank = (): ProductProject =>
  createProject("journal", {
    name: "Composer QA",
    dimensions: { sizePresetId: "7x9", orientation: "portrait" },
    // Coil: no minimum page count, so the check is about the composed page itself.
    production: { bindingType: "coil", printProfileId: "coil-generic", duplex: true } as never,
    recipe: { items: [], ordering: "sequential", structure: [step("custom", { type: "copies", count: 1 }, { id: "dash", layoutId: "guided-page", title: "Master Dashboard", promptSet: { blocks: [] } })] },
  });

async function open(p: ProductProject, phone: boolean): Promise<Page> {
  const page = await (await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1400, height: 1000 }, isMobile: phone, hasTouch: phone })).newPage();
  await page.goto(base);
  await page.evaluate((x) => {
    localStorage.clear();
    localStorage.setItem(`dove-product-studio:v1:project:${x.id}`, JSON.stringify(x));
    localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: x.id, name: x.name, productType: x.productType, sizePresetId: x.dimensions.sizePresetId, updatedAt: x.updatedAt, variantCount: 0 }]));
  }, p);
  await page.goto(base);
  await page.locator(".card", { hasText: p.name }).first().getByRole("button", { name: "Open" }).click();
  await page.waitForSelector(".ps-page--editor");
  return page;
}

async function add(page: Page, label: string) {
  const menu = page.locator("details.add-section-menu").first();
  if (!(await menu.evaluate((d) => (d as HTMLDetailsElement).open))) await menu.locator(":scope > summary").click();
  await menu.getByRole("button", { name: label, exact: true }).click();
}

describe("Page Composer", () => {
  for (const phone of [false, true]) {
    it(`${phone ? "phone" : "desktop"}: compose a page from structured pieces, save it as a design, add it × 3 from Pages`, async () => {
      const page = await open(blank(), phone);
      await openArea(page, "add");
      for (const piece of ["Heading / text", "Info row", "Divider line", "Spacer / open space", "Table", "Task list", "Writing lines"]) await add(page, piece);
      const editor = page.getByTestId("prompt-editor").first();
      await expect.poll(() => editor.locator(".prompt-block").count()).toBe(7);
      // Each piece is drawn on the page.
      const drawn = (re: string) => page.locator(`.ps-page--editor [data-node$="${re}"]`).count();
      await expect.poll(() => drawn("-surface-rule")).toBeGreaterThan(0); // divider
      await expect.poll(() => page.locator('.ps-page--editor [data-node*="-surface-f1-label"]').count()).toBeGreaterThan(0); // info row
      await expect.poll(async () => (await page.locator(".badge").first().textContent()) ?? "").toMatch(/Page OK|to check/);
      // Rename the heading.
      const first = editor.locator(".prompt-block").first();
      await first.evaluate((d) => ((d as HTMLDetailsElement).open = true));
      await first.getByRole("textbox", { name: "Heading" }).fill("Project Snapshot");
      await expect.poll(() => page.locator(".ps-page--editor").first().textContent()).toMatch(/Project Snapshot/);
      // Save as a page design, then add three pages made from it.
      const save = page.getByTestId("save-design");
      await save.getByRole("textbox", { name: "Design name" }).fill("Project Snapshot");
      await save.getByRole("button", { name: "Save page design" }).click();
      await expect(save.getByRole("status").textContent()).resolves.toMatch(/Saved “Project Snapshot”/);
      const before = Number((await page.locator(".page-counter").innerText()).match(/of (\d+)/)![1]);
      await openArea(page, "pages");
      const row = page.locator('.builder-cat[data-category="designs"] .builder-row').first();
      await row.getByRole("spinbutton", { name: "Copies of Project Snapshot" }).fill("3");
      await row.getByRole("button", { name: "Add Project Snapshot" }).click();
      await expect.poll(async () => Number((await page.locator(".page-counter").innerText()).match(/of (\d+)/)![1])).toBeGreaterThanOrEqual(before + 3);
      if (phone) {
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      }
      await page.context().close();
    }, 60_000);
  }
});
