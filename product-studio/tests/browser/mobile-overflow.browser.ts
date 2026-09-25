/**
 * Real-browser mobile regression (npm run test:mobile).
 *
 * Builds nothing itself: `test:mobile` runs `vite build` first, then this
 * suite serves dist/ with `vite preview` and drives Chromium at phone and
 * tablet widths with touch emulation.
 *
 * Two overflow criteria are checked:
 *   1. What Blink reports: documentElement / body / editor / toolbar /
 *      preview viewport scrollWidth ≤ clientWidth.
 *   2. What iOS WebKit also counts: an element's UNTRANSFORMED layout box.
 *      `transform: scale()` shrinks the page visually but not its layout box,
 *      and WebKit includes that box in scroll overflow. So every element whose
 *      layout box extends past the viewport must sit inside an ancestor that
 *      clips (overflow hidden/clip) within the viewport.
 * Criterion 2 fails on the pre-fix build even though Blink reports 0.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { createProject } from "../../src/presets/products/projectFactory";
import { TEST_PRODUCTS } from "../../src/presets/products/testProducts";
import type { ProductProject } from "../../src/types/project";

const WIDTHS: [number, number][] = [[375, 812], [393, 852], [430, 932], [820, 1180]];
const TOUCH_MIN_PX = 44;

const cal = { startDate: "2027-01-01", endDate: "2027-12-31", weekStart: 0 as const, sixRowMonths: true };
const weekly = { items: [{ id: "w", layoutId: "planner-weekly-spread", repeat: { kind: "every-week" as const } }], ordering: "chronological" as const };
function named(p: ProductProject, name: string) {
  p.name = name;
  return p;
}
const PRODUCTS: ProductProject[] = [
  named(TEST_PRODUCTS[3].build(), "M 7x9 Weekly"),
  named(createProject("planner", { dimensions: { sizePresetId: "5.5x8.5", orientation: "portrait" }, production: { bindingType: "discbound", printProfileId: "disc-generic", duplex: true }, calendar: cal, recipe: weekly, layoutOptions: { showSidebar: true } }), "M Half Letter Weekly"),
  named(createProject("insert", { dimensions: { sizePresetId: "franklin-compact", orientation: "portrait" }, production: { bindingType: "ring-6", printProfileId: "ring-insert", duplex: true }, calendar: cal, recipe: weekly, layoutOptions: { showSidebar: true } }), "M Franklin Compact Weekly"),
  named(TEST_PRODUCTS[2].build(), "M 7x9 Monthly"),
];

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

async function seed(page: Page) {
  await page.goto(base);
  await page.evaluate((list) => {
    const idx = list.map((p) => ({ id: p.id, name: p.name, productType: p.productType, sizePresetId: p.dimensions.sizePresetId, updatedAt: p.updatedAt, variantCount: 0 }));
    for (const p of list) localStorage.setItem(`dove-product-studio:v1:project:${p.id}`, JSON.stringify(p));
    localStorage.setItem("dove-product-studio:v1:index", JSON.stringify(idx));
  }, PRODUCTS);
}

type Measure = {
  vw: number;
  doc: number;
  containers: Record<string, number | null>;
  pan: string | null;
  unclipped: string[];
  smallTargets: string[];
  weekly: { pages: number; borders: number; cards: number } | null;
};

function measure(page: Page): Promise<Measure> {
  return page.evaluate((touchMin) => {
    const de = document.documentElement;
    const vw = de.clientWidth;
    const over = (sel: string) => {
      const e = document.querySelector(sel);
      return e ? e.scrollWidth - e.clientWidth : null;
    };
    // Untransformed layout right edge (offset chain ignores transforms).
    const layoutRight = (e: HTMLElement) => {
      let x = 0;
      let n: HTMLElement | null = e;
      while (n) {
        x += n.offsetLeft || 0;
        n = n.offsetParent as HTMLElement | null;
      }
      return x + e.offsetWidth;
    };
    const clippedInside = (e: HTMLElement) => {
      for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
        const o = getComputedStyle(a).overflowX;
        if ((o === "hidden" || o === "clip") && a.getBoundingClientRect().right <= vw + 0.5) return true;
      }
      return false;
    };
    const unclipped: string[] = [];
    for (const e of document.querySelectorAll<HTMLElement>("body *")) {
      if (!e.offsetWidth) continue;
      const lr = layoutRight(e);
      const vr = e.getBoundingClientRect().right;
      if ((lr > vw + 0.5 || vr > vw + 0.5) && !clippedInside(e)) unclipped.push(`${e.tagName.toLowerCase()}.${[...e.classList].join(".")} layoutRight=${Math.round(lr)} visualRight=${Math.round(vr)}`);
    }
    const smallTargets: string[] = [];
    for (const e of document.querySelectorAll<HTMLElement>(".preview-toolbar button, .preview-toolbar input:not([type=checkbox]), .preview-toolbar label.check")) {
      const b = e.getBoundingClientRect();
      if (b.width && (b.height < touchMin - 0.5 || b.width < touchMin - 0.5)) smallTargets.push(`${e.getAttribute("aria-label") || e.textContent?.trim()} ${Math.round(b.width)}×${Math.round(b.height)}`);
    }
    const pages = [...document.querySelectorAll(".ps-page--editor")];
    const isWeekly = !!document.querySelector('[data-node$="-grid-border"][data-node^="wk"]');
    const weekly = isWeekly
      ? {
          pages: pages.length,
          borders: document.querySelectorAll('.ps-page--editor rect[data-node^="wk"][data-node$="-grid-border"]').length,
          cards: document.querySelectorAll('.ps-page--editor rect[data-node^="wk"][data-node$="-box"]').length,
        }
      : null;
    return {
      vw,
      doc: de.scrollWidth - vw,
      containers: { body: over("body"), editor: over(".editor"), toolbar: over(".preview-toolbar"), viewport: over(".preview-viewport") },
      pan: document.querySelector(".preview-viewport")?.getAttribute("data-pan") ?? null,
      unclipped,
      smallTargets,
      weekly,
    };
  }, TOUCH_MIN_PX);
}

for (const [w, h] of WIDTHS) {
  describe(`${w}px`, () => {
    for (const product of PRODUCTS) {
      for (const view of ["single", "spread"] as const) {
        for (const fit of ["Fit page", "Fit width"] as const) {
          it(`${product.name} · ${view} · ${fit}: zero horizontal overflow`, async () => {
            const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 800, hasTouch: true, deviceScaleFactor: 2 });
            const page = await ctx.newPage();
            try {
              await seed(page);
              await page.goto(base);
              await page.locator(".card", { hasText: product.name }).first().getByRole("button", { name: "Open" }).click();
              await page.waitForSelector(".ps-page--editor");
              if (view === "spread") {
                await page.getByLabel("Spread view").check();
                // Step onto a real two-page spread (a monthly opens on a lone recto).
                await page.getByRole("button", { name: "Next page" }).click();
              }
              await page.getByRole("button", { name: fit }).click();
              await page.waitForTimeout(150);
              const m = await measure(page);
              // Containment contract on computed styles of the rendered preview.
              const cs = await page.evaluate(() => {
                const get = (sel: string) => getComputedStyle(document.querySelector(sel)!);
                return { viewport: get(".preview-viewport").overflowX, canvas: get(".preview-canvas").overflowX, origin: get(".preview-scaler").transformOrigin };
              });
              expect(cs.viewport, "preview viewport must not scroll sideways in fit modes").toMatch(/^(hidden|clip)$/);
              expect(cs.canvas, "canvas must clip the unscaled page layout box").toMatch(/^(hidden|clip)$/);
              expect(cs.origin).toBe("0px 0px");
              expect(m.doc, "document scrollWidth − clientWidth").toBe(0);
              for (const [k, v] of Object.entries(m.containers)) expect(v, `${k} horizontal overflow`).toBeLessThanOrEqual(0);
              expect(m.pan).toBe("false");
              expect(m.unclipped, "layout boxes past the viewport with no clipping ancestor").toEqual([]);
              expect(m.smallTargets, "toolbar touch targets < 44px").toEqual([]);
              if (m.weekly) {
                expect(m.weekly.borders, "one connected grid border per weekly page").toBe(m.weekly.pages);
                expect(m.weekly.cards, "no per-day / per-section card rects").toBe(0);
              }
              expect(await page.locator(".ps-page--editor").count()).toBe(view === "spread" ? 2 : 1);
            } finally {
              await ctx.close();
            }
          }, 30_000);
        }
      }
    }

    it("manual zoom at 100% pans inside the preview; the page itself never scrolls sideways", async () => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 800, hasTouch: true });
      const page = await ctx.newPage();
      try {
        await seed(page);
        await page.goto(base);
        await page.locator(".card", { hasText: PRODUCTS[0].name }).first().getByRole("button", { name: "Open" }).click();
        await page.waitForSelector(".ps-page--editor");
        await page.getByLabel("Spread view").check();
        await page.getByRole("group", { name: "Fit" }).getByRole("button").nth(2).click({ timeout: 5000 });
        await page.locator(".preview-toolbar > button.btn:not(.btn--icon)").click({ timeout: 5000 });
        await page.waitForTimeout(150);
        const m = await measure(page);
        expect(m.doc).toBe(0);
        expect(m.containers.body).toBeLessThanOrEqual(0);
        expect(m.pan).toBe("true");
        expect(m.smallTargets).toEqual([]);
      } finally {
        await ctx.close();
      }
    }, 30_000);
  });
}
