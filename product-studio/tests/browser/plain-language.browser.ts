/**
 * Plain language in a real browser: with every normal section open, the
 * editor never shows developer terms (gutter, cadence, recto, verso, anchor,
 * offset, pitch, solver, variant, safe area, keep-out, opacity, trim size,
 * geometry, metadata). "Bleed" appears only inside its plain explanation.
 * Technical details stay available, collapsed.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { TEST_PRODUCTS } from "../../src/presets/products/testProducts";
import { createProject } from "../../src/presets/products/projectFactory";
import { dailyPlannerBook } from "../../src/presets/bookRecipes";
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

const JARGON = /\b(gutter|cadence|recto|verso|anchor|offsets?|pitch|solver|variants?|safe area|keep-outs?|opacity|trim size|geometry|metadata|token)\b/i;

const products = (): ProductProject[] => [
  ...TEST_PRODUCTS.map((t) => t.build()),
  createProject("planner", { name: "Daily", calendar: { startDate: "2027-01-01", endDate: "2027-01-31", weekStart: 0, sixRowMonths: true }, recipe: { items: [], ordering: "chronological", structure: dailyPlannerBook() } as never }),
  createProject("devotional", { name: "Dev", dimensions: { sizePresetId: "6x9", orientation: "portrait" }, recipe: { items: [{ id: "page", layoutId: "stationery:devotional-soap.four-band", repeat: { kind: "count", count: 30 } }], ordering: "sequential" } }),
];

describe("editor speaks plain language", () => {
  it("no developer terms in the visible editor; bleed only with its explanation; technical details collapsed", async () => {
    for (const p of products()) {
      const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
      await page.goto(base);
      await page.evaluate((proj) => {
        localStorage.clear();
        localStorage.setItem(`dove-product-studio:v1:project:${proj.id}`, JSON.stringify(proj));
        localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: proj.id, name: proj.name, productType: proj.productType, sizePresetId: proj.dimensions.sizePresetId, updatedAt: proj.updatedAt, variantCount: 0 }]));
      }, p);
      await page.goto(base);
      await page.locator(".card").first().getByRole("button", { name: "Open" }).click();
      await page.waitForSelector(".ps-page--editor");
      // Open every normal section (Developer sections, Advanced and Technical details stay as they are: collapsed).
      await page.evaluate(() =>
        document.querySelectorAll("aside details.section").forEach((d) => {
          if (!/^Developer/.test(d.querySelector(":scope > summary")?.textContent ?? "")) (d as HTMLDetailsElement).open = true;
        }),
      );
      const visible = await page.evaluate(() =>
        [(document.querySelector("aside") as HTMLElement).innerText, (document.querySelector(".preview-caption") as HTMLElement | null)?.innerText ?? "", ...[...document.querySelectorAll("aside select option")].map((o) => o.textContent ?? "")].join("\n"),
      );
      const bad = visible.split("\n").filter((l) => JARGON.test(l));
      expect(bad, p.name).toEqual([]);
      for (const l of visible.split("\n").filter((x) => /\bbleed\b/i.test(x))) expect(l, p.name).toMatch(/Printers call this “bleed”/);
      await expect(page.locator("details.tech-details[open]").count()).resolves.toBe(0);
      await page.context().close();
    }
  }, 120_000);

  it("home page and New product flow speak plain language too", async () => {
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
    await page.goto(base);
    await page.evaluate(() => localStorage.clear());
    await page.goto(base);
    await page.waitForSelector(".home-hero");
    const home = await page.evaluate(() => document.body.innerText);
    expect(home.split("\n").filter((l) => JARGON.test(l))).toEqual([]);
    for (const family of ["Planner", "Devotional", "Worksheet", "Notepad"]) {
      await page.goto(base);
      await page.locator("button.family-card", { hasText: new RegExp(`^${family}`) }).first().click();
      await page.waitForSelector("#wizard-build");
      const text = await page.evaluate(() => [document.body.innerText, ...[...document.querySelectorAll("option")].map((o) => o.textContent ?? "")].join("\n"));
      expect(text.split("\n").filter((l) => JARGON.test(l)), family).toEqual([]);
    }
    await page.context().close();
  }, 120_000);
});
