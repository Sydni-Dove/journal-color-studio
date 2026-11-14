/**
 * Card sheets in a real browser: a card sheet page shows its cards; Add to page edits a card's front
 * and back, adds a card (a new page of fronts and backs when it passes four), and Pages → + Card sheet
 * adds one. Desktop and phone (no page overflow).
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

const back = [{ label: "Meaning", text: "Helping others feel brave." }, { label: "Try it", text: "Write a kind note." }];
const cardsProject = (): ProductProject =>
  createProject("worksheet", {
    name: "Gift Cards QA",
    dimensions: { sizePresetId: "8.5x11", orientation: "portrait" },
    production: { bindingType: "none", printProfileId: "custom", includeBleed: false, duplex: true } as never,
    recipe: { items: [], ordering: "sequential", structure: [step("custom", { type: "once" }, { id: "cards", layoutId: "card-sheet", title: "Cards", cards: { cards: ["Encouragement", "Teaching", "Mercy", "Giving"].map((title) => ({ title, back })), artLabel: "Draw it!" } } as never)] },
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
const onPage = (page: Page, text: string) => page.locator(".ps-page--editor .ps-text", { hasText: text }).count();

describe("Card sheet", () => {
  for (const phone of [false, true]) {
    it(`${phone ? "phone" : "desktop"}: the cards print; editing a card and adding a fifth (a new sheet) updates the pages`, async () => {
      const page = await open(cardsProject(), phone);
      await expect.poll(() => onPage(page, "Encouragement")).toBeGreaterThan(0);
      await expect.poll(() => onPage(page, "Draw it!")).toBe(4);
      await openArea(page, "add");
      const ed = page.getByTestId("card-sheet-editor");
      await expect(ed.textContent()).resolves.toMatch(/4 cards · 2 pages/);
      await ed.locator("details[data-card='0'] > summary").click();
      await ed.getByLabel("Card 1 title").fill("Courage");
      await expect.poll(() => onPage(page, "Courage")).toBeGreaterThan(0);
      await ed.getByRole("button", { name: "+ Add a card" }).click();
      await expect.poll(() => ed.textContent()).toMatch(/5 cards · 4 pages/);
      // The new card copies the last card's back labels.
      await expect(ed.getByLabel("Card 5 back part 1 label").inputValue()).resolves.toBe("Meaning");
      // Never wider than the screen.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.context().close();
    }, 60_000);
  }

  it("Pages → + Card sheet adds a card sheet with four starter cards", async () => {
    const page = await open(cardsProject(), false);
    await openArea(page, "pages");
    const add = page.getByRole("button", { name: "+ Card sheet" });
    if (!(await add.isVisible())) await page.getByText("Journal & guided pages", { exact: true }).first().click();
    await add.click();
    const sheets = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("dove-product-studio:v1:project:")).flatMap((k) => (JSON.parse(localStorage.getItem(k)!).recipe.structure as { layoutId?: string; cards?: { cards: unknown[] } }[]).filter((n) => n.layoutId === "card-sheet").map((n) => n.cards!.cards.length)));
    await expect.poll(sheets).toEqual([4, 4]);
    await page.context().close();
  }, 60_000);
});
