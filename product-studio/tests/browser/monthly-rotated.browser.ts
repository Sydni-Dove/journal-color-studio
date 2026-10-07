/**
 * The sideways (rotated) monthly calendar in a real browser. Reported: "when I press rotate, the calendar
 * disappears" — the page was drawn turned one way while its trim, margins and binding were turned the other,
 * so every part of the month landed off the sheet. Now the whole month is drawn on the page, turned.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { createProject } from "../../src/presets/products/projectFactory";
import { addMonthly, addWeekly } from "../../src/engines/recipe/pageBuilder";

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

const planner = (size: string, monthlyArrangement: "classic" | "rotated") =>
  createProject("planner", {
    name: `Monthly ${monthlyArrangement} ${size}`,
    dimensions: { sizePresetId: size, orientation: "portrait" },
    production: { bindingType: "coil", printProfileId: "coil-generic", duplex: true } as never,
    calendar: { startDate: "2027-01-01", endDate: "2027-02-28", weekStart: 0, sixRowMonths: true },
    recipe: { items: [], ordering: "chronological", structure: addWeekly(addMonthly([])) },
    layoutOptions: { monthlyArrangement } as never,
  });

describe("rotated monthly calendar is drawn on the page", () => {
  for (const size of ["7x9", "8.5x11"])
    it(`${size}: title, weekdays and every day cell are inside the portrait page, read sideways`, async () => {
      const p = planner(size, "rotated");
      const page = await (await browser.newContext({ viewport: { width: 1500, height: 1300 } })).newPage();
      await page.goto(base);
      await page.evaluate((p) => {
        localStorage.clear();
        localStorage.setItem(`dove-product-studio:v1:project:${p.id}`, JSON.stringify(p));
        localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: p.id, name: p.name, productType: p.productType, sizePresetId: p.dimensions.sizePresetId, updatedAt: p.updatedAt, variantCount: 0 }]));
      }, p);
      await page.goto(base);
      await page.locator(".card").first().getByRole("button", { name: "Open" }).click();
      const sheet = page.locator(".ps-page--editor").first();
      await sheet.waitFor();
      const r = await sheet.evaluate((pg) => {
        const box = (e: Element) => e.getBoundingClientRect();
        const P = box(pg);
        const inside = (e: Element) => { const b = box(e); return b.width > 0 && b.left >= P.left - 1 && b.right <= P.right + 1 && b.top >= P.top - 1 && b.bottom <= P.bottom + 1; };
        const title = pg.querySelector("[data-node='month-header']") ?? [...pg.querySelectorAll(".ps-text")].find((t) => /January 2027/.test(t.textContent ?? ""));
        const texts = [...pg.querySelectorAll(".ps-text")];
        const t = title ? box(title) : null;
        return {
          rotated: !!pg.querySelector("[data-rotated-content]"),
          portrait: P.height > P.width,
          title: title?.textContent,
          titleInside: !!title && inside(title),
          titleSideways: !!t && t.height > t.width,
          texts: texts.length,
          textsOutside: texts.filter((e) => !inside(e)).map((e) => e.textContent),
        };
      });
      expect(r.rotated).toBe(true);
      expect(r.portrait).toBe(true);
      expect(r.title).toMatch(/January 2027/);
      expect(r.titleInside).toBe(true);
      expect(r.titleSideways).toBe(true);
      expect(r.texts).toBeGreaterThan(35); // title + 7 weekdays + 31 days
      expect(r.textsOutside).toEqual([]);
      await page.context().close();
    });
});
