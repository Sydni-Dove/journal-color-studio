/**
 * Page Composer in a real browser: a blank Custom Page → + Add a section
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

/** Tap a piece under "Build your page". */
async function add(page: Page, label: string) {
  await page.getByTestId("build-your-page").getByRole("button", { name: label, exact: true }).click();
}

/** The composer's section `i` (1-based), opened. */
async function section(page: Page, i: number) {
  const d = page.getByTestId("prompt-editor").first().locator(".prompt-block").nth(i - 1);
  await d.evaluate((el) => ((el as HTMLDetailsElement).open = true));
  return d;
}

describe("Page Composer", () => {
  it("a new Custom Page opens straight on its building pieces (no menus to find)", async () => {
    const custom = createProject("custom", {
      name: "Blank Custom Page",
      dimensions: { sizePresetId: "8.5x11", orientation: "portrait" },
      recipe: { items: [], ordering: "sequential", structure: [step("custom", { type: "copies", count: 1 }, { title: "Custom Page", promptSet: { blocks: [] } })] },
    });
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    await page.goto(base);
    // Even when another area was open last time.
    await page.evaluate((x) => {
      localStorage.clear();
      localStorage.setItem("dove-product-studio:v1:editor-area", "pages");
      localStorage.setItem(`dove-product-studio:v1:project:${x.id}`, JSON.stringify(x));
      localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: x.id, name: x.name, productType: x.productType, sizePresetId: x.dimensions.sizePresetId, updatedAt: x.updatedAt, variantCount: 0 }]));
    }, custom);
    await page.goto(base);
    await page.locator(".card", { hasText: custom.name }).first().getByRole("button", { name: "Open" }).click();
    await page.waitForSelector(".ps-page--editor");
    await expect.poll(() => page.locator('section.area[data-area="add"]').count()).toBe(1);
    for (const piece of ["Heading / text", "Info row", "Divider line", "Spacer / open space"]) {
      expect(await page.getByRole("button", { name: piece, exact: true }).first().isVisible(), piece).toBe(true);
    }
    expect(await page.getByTestId("save-design").isVisible()).toBe(true);
    // "Build your page" comes first; the secondary choices sit below the pieces, under Page options.
    const order = await page.evaluate(() => {
      const top = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().top;
      return { build: top('[data-testid="build-your-page"]'), options: top('[data-testid="page-options"]') };
    });
    expect(order.build).toBeLessThan(order.options);
    expect(await page.getByTestId("page-options").evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false);
    await page.context().close();
  }, 60_000);

  it("Master Dashboard: a page title, three column labels edited one by one, the table filling the page", async () => {
    const page = await open(blank(), false);
    await openArea(page, "add");
    await add(page, "Heading / text");
    await add(page, "Table");
    const heading = await section(page, 1);
    // The first heading on a page is its title.
    await expect(heading.getByRole("group", { name: "Text style" }).getByRole("button", { name: "Page title" }).getAttribute("aria-pressed")).resolves.toBe("true");
    await heading.getByRole("textbox", { name: "Heading" }).fill("Master Dashboard");
    const table = await section(page, 2);
    await table.getByRole("textbox", { name: "Heading" }).fill("");
    const cols = table.getByTestId("table-columns");
    // Three separate boxes (the piece starts with three columns); each edited on its own.
    await expect(cols.getByRole("textbox").count()).resolves.toBe(3);
    await cols.getByRole("textbox", { name: "Column 1" }).fill("Project / Area");
    await cols.getByRole("textbox", { name: "Column 2" }).fill("Status / Priority");
    await cols.getByRole("textbox", { name: "Column 3" }).fill("Next Step / Notes");
    await expect(cols.getByRole("textbox", { name: "Column 1" }).inputValue()).resolves.toBe("Project / Area");
    // Add and remove a column: the boxes follow.
    await cols.getByRole("button", { name: "+ Add column" }).click();
    await expect(cols.getByRole("textbox").count()).resolves.toBe(4);
    await cols.getByRole("button", { name: "Remove column 4" }).click();
    await expect(cols.getByRole("textbox").count()).resolves.toBe(3);
    await table.getByRole("group", { name: "Table space" }).getByRole("button", { name: "Fill remaining space" }).click();
    const drawn = page.locator(".ps-page--editor").first();
    await expect.poll(() => drawn.textContent()).toMatch(/Next Step \/ Notes/);
    for (const want of ["Master Dashboard", "Project / Area", "Status / Priority"]) expect((await drawn.textContent()) ?? "").toContain(want);
    // The table reaches the bottom of the page's writing area.
    const fill = await page.evaluate(() => {
      const page = document.querySelector(".ps-page--editor svg")!.getBoundingClientRect();
      const rows = [...document.querySelectorAll('.ps-page--editor [data-node*="-surface-r"]')].map((e) => e.getBoundingClientRect().bottom);
      return { last: Math.max(...rows), pageBottom: page.bottom, pageH: page.height, n: rows.length };
    });
    expect(fill.n).toBeGreaterThanOrEqual(6);
    expect((fill.pageBottom - fill.last) / fill.pageH).toBeLessThan(0.12);
    await expect.poll(async () => (await page.locator(".badge").first().textContent()) ?? "").toMatch(/Page OK/);
    await page.context().close();
  }, 60_000);

  it("Revelation to Execution, built by tapping pieces and typing (no custom code for the page)", async () => {
    const page = await open(blank(), false);
    await openArea(page, "add");
    for (const piece of ["Heading / text", "Writing lines", "Writing lines", "Writing lines", "Writing lines", "Info row"]) await add(page, piece);
    const heading = await section(page, 1);
    await heading.getByRole("textbox", { name: "Heading" }).fill("Revelation to Execution");
    const names = ["What I received", "What I believe it concerns", "Scripture + what needs discernment", "Next act of obedience or action"];
    for (const [k, name] of names.entries()) {
      const s = await section(page, k + 2);
      await s.getByRole("textbox", { name: "Heading" }).fill(name);
      // Plain amounts, not inches: the four areas share the page.
      await s.getByRole("group", { name: "Writing space" }).getByRole("button", { name: "Fill remaining space" }).click();
    }
    const info = await section(page, 6);
    await info.getByRole("textbox", { name: "Blank 1 label" }).fill("Status");
    await info.getByRole("textbox", { name: "Blank 2 label" }).fill("Review date");
    await info.getByRole("group", { name: "Blank 2 is" }).getByRole("button", { name: "A box" }).click();
    const drawn = page.locator(".ps-page--editor").first();
    await expect.poll(() => drawn.textContent()).toMatch(/Revelation to Execution/);
    const text = (await drawn.textContent()) ?? "";
    for (const want of [...names, "Status", "Review date"]) expect(text, want).toContain(want);
    expect(await page.locator('.ps-page--editor [data-node$="-surface-f1-box"]').count()).toBeGreaterThan(0);
    await expect.poll(async () => (await page.locator(".badge").first().textContent()) ?? "").toMatch(/Page OK/);
    // Two sections side by side, and a section style.
    const second = await section(page, 3);
    await second.getByRole("checkbox", { name: "Beside the section above (two columns)" }).check();
    await second.getByLabel("Section style").selectOption("panel");
    await expect.poll(() => page.locator('.ps-page--editor [data-node$="-frame"]').count()).toBeGreaterThan(0);
    // The paired columns share one band: the panel's top edge is level with the first column's heading, to its right.
    const band = await page.evaluate(() => {
      const first = [...document.querySelectorAll('.ps-page--editor [data-node$="-title"]')].find((e) => /What I received/.test(e.textContent ?? ""))!.getBoundingClientRect();
      const panel = document.querySelector('.ps-page--editor [data-node$="-frame"]')!.getBoundingClientRect();
      return { firstTop: first.top, firstRight: first.left, panelTop: panel.top, panelLeft: panel.left };
    });
    expect(Math.abs(band.firstTop - band.panelTop)).toBeLessThanOrEqual(1.5);
    expect(band.panelLeft).toBeGreaterThan(band.firstRight);
    await expect.poll(async () => (await page.locator(".badge").first().textContent()) ?? "").toMatch(/Page OK/);
    await page.context().close();
  }, 60_000);

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
