/**
 * Hardcover assembly in a real browser: turned on in Page setup (live measurements follow the chipboard),
 * then Export prints the cover sheets with only the chosen marks, the guide and the template; "Journal
 * pages" is the ordinary export, unchanged.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { createProject } from "../../src/presets/products/projectFactory";
import { addEndCover, addFrontCover } from "../../src/engines/recipe/pageBuilder";
import { openArea } from "./areas";

let server: PreviewServer;
let browser: Browser;
beforeAll(async () => {
  server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
  browser = await chromium.launch({ executablePath: (import.meta.env.CHROMIUM_PATH as string | undefined) || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => server?.httpServer.close(() => r()));
});

function product() {
  const base = createProject("notebook", { name: "Notary hardcover", dimensions: { sizePresetId: "8.5x11", orientation: "landscape" }, production: { bindingType: "wire-o", printProfileId: "coil-generic", duplex: true, includeBleed: false } });
  return { ...base, recipe: { ...base.recipe, structure: addEndCover(addFrontCover(base.recipe.structure ?? [])) } };
}

async function open(): Promise<Page> {
  const p = product();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.addInitScript(() => { window.print = () => { (window as unknown as { __printed: number }).__printed = ((window as unknown as { __printed?: number }).__printed ?? 0) + 1; }; });
  await page.goto(server.resolvedUrls!.local[0]);
  await page.evaluate((p) => {
    localStorage.setItem(`dove-product-studio:v1:project:${p.id}`, JSON.stringify(p));
    localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: p.id, name: p.name, productType: p.productType, sizePresetId: p.dimensions.sizePresetId, updatedAt: p.updatedAt, variantCount: 0 }]));
  }, p);
  await page.reload();
  await page.locator(".card", { hasText: p.name }).first().getByRole("button", { name: "Open", exact: true }).click();
  await page.waitForSelector(".ps-page--editor");
  return page;
}

async function exportWith(page: Page, output: string) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  await dialog.getByRole("button", { name: output, exact: true }).click();
  return dialog;
}

/** What the browser does when its print dialog closes (the fake print above doesn't). */
const printDone = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

async function print(page: Page) {
  const before = await page.evaluate(() => (window as unknown as { __printed?: number }).__printed ?? 0);
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Print / Save PDF" && !b.disabled), undefined, { timeout: 20_000 }).catch(async (e) => {
    throw new Error(`${e.message} — dialog says: ${(await page.getByRole("dialog", { name: "Export" }).textContent())?.slice(0, 600)}`);
  });
  await page.getByRole("button", { name: "Print / Save PDF", exact: true }).click();
  await page.waitForFunction((n) => ((window as unknown as { __printed?: number }).__printed ?? 0) > n, before, { timeout: 30_000 });
}

describe("Hardcover assembly", () => {
  it("Page setup: off by default; on, the measurements show and follow the chipboard thickness", async () => {
    const page = await open();
    await openArea(page, "setup");
    const controls = page.getByTestId("hardcover-controls");
    await expect(page.getByTestId("hardcover-summary").count()).resolves.toBe(0);
    await controls.getByText("Hardcover with chipboard").click();
    await expect.poll(() => page.getByTestId("hardcover-summary").textContent()).toMatch(/Printed cover \(each\)12\.785"/);
    await controls.getByLabel("Chipboard thickness").selectOption("0.12");
    // 0.12" board: wrap 0.87" → sheet 11.125 + 1.74 = 12.865".
    await expect.poll(() => page.getByTestId("hardcover-summary").textContent()).toMatch(/12\.865"/);
    await page.context().close();
  }, 60_000);

  it("Export: cover sheets with only the chosen marks; the guide; the template; Journal pages is the ordinary export", async () => {
    const page = await open();
    await openArea(page, "setup");
    await page.getByTestId("hardcover-controls").getByText("Hardcover with chipboard").click();
    await page.getByTestId("hardcover-summary").waitFor();

    const dialog = await exportWith(page, "Hardcover sheets");
    await dialog.getByText("Laminate alignment marks").click();
    await expect(dialog.getByTestId("export-output").textContent()).resolves.toMatch(/2 sheet\(s\), 13\.785" × 11\.41"/);
    await print(page);
    await expect(page.locator("#print-root .ps-cover-sheet").count()).resolves.toBe(2);
    const kinds = await page.locator('#print-root [data-mark]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-mark")))]);
    expect(kinds).toEqual(["laminate"]);
    await printDone(page);

    await dialog.getByRole("button", { name: "Assembly guide", exact: true }).click();
    await print(page);
    await expect(page.locator("#print-root .ps-assembly-guide").count()).resolves.toBe(2);
    await expect(page.locator("#print-root").textContent()).resolves.toMatch(/Chipboard \(cut 2\).*11 1\/8"/);
    await printDone(page);

    await dialog.getByRole("button", { name: "Alignment template", exact: true }).click();
    await print(page);
    await expect(page.locator("#print-root .ps-assembly-template").count()).resolves.toBe(8);
    await printDone(page);

    await dialog.getByRole("button", { name: "Journal pages", exact: true }).click();
    await expect(dialog.getByTestId("export-output").textContent()).resolves.toMatch(/2 page\(s\), 11" × 8\.5"/);
    await page.context().close();
  }, 120_000);

  it("a product without hardcover: the Export dialog has no hardcover choice", async () => {
    const page = await open();
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Export" }).getByRole("button", { name: "Hardcover sheets" }).count()).resolves.toBe(0);
    await page.context().close();
  }, 60_000);
});
