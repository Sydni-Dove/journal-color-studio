/** Repeat pages in the real editor: pick three kinds of pages, three more times, right after them. */
import { openArea } from "./areas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";
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

describe("Repeat pages", () => {
  for (const phone of [false, true])
    it(`${phone ? "phone" : "desktop"}: three kinds of page, three more times, right after them; saved`, async () => {
      const p = createProject("journal", {
        name: "Repeat QA",
        dimensions: { sizePresetId: "6x9" },
        production: { bindingType: "coil", printProfileId: "coil-generic", duplex: false },
        recipe: { items: [], ordering: "sequential", structure: [
          step("cover-page", { type: "once" }, { title: "Prophetic" }),
          { ...step("custom", { type: "copies", count: 6 }, { layoutId: "guided-page", title: "Receive" }), id: "receive" },
          { ...step("custom", { type: "copies", count: 7 }, { layoutId: "guided-page", title: "Discern" }), id: "discern" },
          { ...step("lined-journal", { type: "copies", count: 7 }), id: "journal" },
          step("back-cover", { type: "once" }),
        ] },
      } as never);
      const page = await (await browser.newContext({ viewport: phone ? { width: 393, height: 852 } : { width: 1440, height: 1000 }, isMobile: phone, hasTouch: phone })).newPage();
      await page.goto(base);
      await page.evaluate((p) => {
        localStorage.setItem(`dove-product-studio:v1:project:${p.id}`, JSON.stringify(p));
        localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: p.id, name: p.name, productType: p.productType, sizePresetId: p.dimensions.sizePresetId, updatedAt: p.updatedAt, variantCount: 0 }]));
      }, p);
      await page.reload();
      await page.locator(".card", { hasText: "Repeat QA" }).first().getByRole("button", { name: "Open", exact: true }).click();
      await page.waitForSelector(".ps-page--editor");
      const total = () => page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>('input[aria-label="Page number"]');
        let el: HTMLElement | null = input;
        while (el && !/of \d+/.test(el.textContent ?? "")) el = el.parentElement;
        return Number(el?.textContent?.match(/of (\d+)/)?.[1] ?? 0);
      });
      const before = await total();
      await openArea(page, "pages");
      const panel = page.locator(".repeat-pages");
      for (const name of ["Receive", "Discern", /Journal|Lined/]) await panel.locator(".repeat-pages__row", { hasText: name }).first().locator("input").check();
      await panel.getByLabel("How many more times").fill("3");
      await expect.poll(() => panel.getByTestId("repeat-summary").innerText()).toMatch(/Adds 60 pages .* starting at page 22/);
      if (process.env.QA_ARTIFACT_DIR && !phone) await panel.screenshot({ path: `${process.env.QA_ARTIFACT_DIR}/repeat-pages.png` });
      await panel.getByRole("button", { name: "Repeat", exact: true }).click();
      await expect.poll(total).toBe(before + 60);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.waitForTimeout(900);
      await page.reload();
      await page.locator(".card", { hasText: "Repeat QA" }).first().getByRole("button", { name: "Open", exact: true }).click();
      await page.waitForSelector(".ps-page--editor");
      expect(await total()).toBe(before + 60);
      await page.context().close();
    }, 60_000);
});
