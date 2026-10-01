/** Page header on every page of a page that continues: chosen in the Page header panel, previewed, printed, saved. */
import { openArea } from "./areas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { createProject } from "../../src/presets/products/projectFactory";
import { step } from "../../src/presets/bookRecipes";

let server: PreviewServer | undefined, browser: Browser, base: string;
beforeAll(async () => {
  server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
  base = server.resolvedUrls!.local[0];
  browser = await chromium.launch({ executablePath: (import.meta.env.CHROMIUM_PATH as string | undefined) || undefined });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  if (server) await new Promise<void>((r) => server!.httpServer.close(() => r()));
});

const project = () =>
  createProject("custom", {
    name: "Respond QA",
    dimensions: { sizePresetId: "8.5x11", orientation: "portrait" },
    recipe: { items: [], ordering: "sequential", structure: [step("custom", { type: "copies", count: 1 }, { layoutId: "guided-page", title: "Custom Page", promptSet: {
      header: { eyebrow: "STEP THREE", number: "03", overline: "PROPHETIC WORD", title: "RESPOND", subtitle: "THE WORD", meta: ["Date", "Time", "Received through", "Type"], rule: true },
      blocks: [
        { id: "response", label: "My response", prompt: "What obedience, action, or posture does this word call for?", space: "fixed", lineCount: 15 },
        { id: "do", label: "What I will do", prompt: "List the specific steps, decisions, or changes you will make.", space: "fixed", lineCount: 15 },
        { id: "prayer", label: "Prayer", prompt: "Write a prayer of response.", space: "fixed", lineCount: 15 },
      ],
    } })] },
  } as never);

async function openProject(page: Page) {
  await page.locator(".card", { hasText: "Respond QA" }).first().getByRole("button", { name: "Open", exact: true }).click();
  await page.waitForSelector(".ps-page--editor");
}
const total = (page: Page) => page.evaluate(() => {
  let el: HTMLElement | null = document.querySelector<HTMLInputElement>('input[aria-label="Page number"]');
  while (el && !/of \d+/.test(el.textContent ?? "")) el = el.parentElement;
  return Number(el?.textContent?.match(/of (\d+)/)?.[1] ?? 0);
});
async function go(page: Page, n: number) {
  await page.getByLabel("Page number", { exact: true }).fill(String(n));
  await page.getByLabel("Page number", { exact: true }).press("Enter");
  await page.waitForTimeout(250);
}
const headerOnPage = (page: Page) => page.locator('.ps-page--editor [data-node$="-intro-title"]').count();

describe("Page header on continuation pages", () => {
  it("First page only by default; Every page puts it on all 3 pages; print matches; saved", async () => {
    const p = project();
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await page.goto(base);
    await page.evaluate((p) => {
      localStorage.setItem(`dove-product-studio:v1:project:${p.id}`, JSON.stringify(p));
      localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: p.id, name: p.name, productType: p.productType, sizePresetId: p.dimensions.sizePresetId, updatedAt: p.updatedAt, variantCount: 0 }]));
    }, p);
    await page.reload();
    await openProject(page);
    const n0 = await total(page);
    // Default: header on the custom page's first page only.
    const pagesWithHeader = async (n: number) => { const out: number[] = []; for (let k = 1; k <= n; k++) { await go(page, k); if (await headerOnPage(page)) out.push(k); } return out; };
    const before = await pagesWithHeader(n0);
    expect(before).toHaveLength(1);
    await go(page, before[0]);
    await openArea(page, "add");
    const panel = page.getByTestId("page-header");
    if ((await panel.getAttribute("open")) === null) await panel.locator("summary").click();
    await expect.poll(() => panel.getByRole("button", { name: "First page only" }).getAttribute("aria-pressed")).toBe("true");
    await panel.getByRole("button", { name: "Every page", exact: true }).click();
    await expect.poll(() => total(page)).toBe(n0 + 1);
    const n1 = await total(page);
    const after = await pagesWithHeader(n1);
    expect(after).toEqual([before[0], before[0] + 1, before[0] + 2]);
    // Preview and print match: the printed pages carry the header on the same pages.
    await page.getByRole("button", { name: "Export", exact: true }).click();
    expect(await page.getByRole("dialog", { name: "Export" }).locator(".issue--error").allTextContents()).toEqual([]);
    await page.evaluate(() => { window.print = () => {}; });
    await page.getByRole("button", { name: "Print / Save PDF", exact: true }).click();
    await page.waitForSelector("#print-root .ps-print-sheet", { state: "attached" });
    const printed = await page.locator(".ps-page--print").evaluateAll((els) => els.map((e, i) => (e.querySelector('[data-node$="-intro-title"]') ? i + 1 : 0)).filter(Boolean));
    expect(printed).toEqual(after);
    await page.reload();
    await openProject(page);
    expect(await total(page)).toBe(n1);
    expect(await pagesWithHeader(n1)).toEqual(after);
    await page.context().close();
  }, 120_000);
});
