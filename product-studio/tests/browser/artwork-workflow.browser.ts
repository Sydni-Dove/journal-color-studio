/**
 * The four-step editor and uploaded artwork, in a real browser, on an existing
 * saved project: step title, progress, Back / Next, jumping back, the step
 * kept across a reload; then a full-cover JPEG, a WebP background on selected
 * pages and a transparent PNG corner illustration — uploaded, placed,
 * reopened, and checked in the printed output (same images, same placement
 * and crop as the preview; the PNG still transparent). iPhone widths too.
 */
import { openArea, openStep } from "./areas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { createProject } from "../../src/presets/products/projectFactory";
import { step, withCovers } from "../../src/presets/bookRecipes";
import type { ProductProject } from "../../src/types/project";

let server: PreviewServer | undefined, browser: Browser, base: string;
beforeAll(async () => {
  if (process.env.QA_BASE_URL) base = process.env.QA_BASE_URL;
  else {
    server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
    base = server.resolvedUrls!.local[0];
  }
  browser = await chromium.launch({ executablePath: (import.meta.env.CHROMIUM_PATH as string | undefined) || undefined });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  if (server) await new Promise<void>((r) => server!.httpServer.close(() => r()));
});

/** A product saved earlier (it has been edited since it was made), with a cover, reflection pages and journal pages. */
function saved(): ProductProject {
  const p = createProject("planner", {
    name: "Saved Journal",
    dimensions: { sizePresetId: "8.5x11", orientation: "portrait" },
    production: { bindingType: "coil", printProfileId: "coil-generic", duplex: true, includeBleed: true },
    calendar: { startDate: "2027-01-01", endDate: "2027-01-31", weekStart: 1, sixRowMonths: true },
    recipe: { items: [], ordering: "chronological", structure: withCovers([step("reflection", { type: "copies", count: 3 }, { id: "refl" }), step("lined-journal", { type: "copies", count: 4 }, { id: "lined" })]) },
  });
  return { ...p, createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-11-01T10:00:00.000Z" };
}

async function context(phone = false): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: phone, hasTouch: phone });
  // Some sandboxes stall on font files through their proxy; fetching them through Playwright avoids that (no effect elsewhere).
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, async (route) => route.fulfill({ response: await route.fetch() }).catch(() => route.abort()));
  return ctx;
}

async function openSaved(ctx: BrowserContext, p: ProductProject): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(base);
  await page.evaluate((p) => {
    localStorage.setItem(`dove-product-studio:v1:project:${p.id}`, JSON.stringify(p));
    localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: p.id, name: p.name, productType: p.productType, sizePresetId: p.dimensions.sizePresetId, updatedAt: p.updatedAt, variantCount: 0 }]));
  }, p);
  await page.reload();
  await reopen(page, p.name);
  return page;
}
async function reopen(page: Page, name: string) {
  await page.locator(".card", { hasText: name }).first().getByRole("button", { name: "Open", exact: true }).click();
  await page.waitForSelector(".ps-page--editor");
}
async function go(page: Page, n: number) {
  await page.getByLabel("Page number", { exact: true }).fill(String(n));
  await page.getByLabel("Page number", { exact: true }).press("Enter");
}

/** Real image files drawn by the browser: a JPEG cover, a WebP wash and a PNG dove on a transparent ground. */
async function makeImages(page: Page) {
  const out = await page.evaluate(async () => {
    const draw = async (w: number, h: number, type: string, paint: (c: CanvasRenderingContext2D) => void) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      paint(c.getContext("2d")!);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), type, 0.92));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s);
    };
    return {
      cover: await draw(2625, 3375, "image/jpeg", (c) => {
        const g = c.createLinearGradient(0, 0, 0, 3375);
        g.addColorStop(0, "#630000");
        g.addColorStop(1, "#E6A742");
        c.fillStyle = g;
        c.fillRect(0, 0, 2625, 3375);
      }),
      wash: await draw(1800, 1800, "image/webp", (c) => {
        c.fillStyle = "#F2DFD8";
        c.fillRect(0, 0, 1800, 1800);
        c.fillStyle = "#E6A742";
        c.beginPath();
        c.arc(900, 900, 700, 0, Math.PI * 2);
        c.fill();
      }),
      dove: await draw(900, 600, "image/png", (c) => {
        c.clearRect(0, 0, 900, 600);
        c.fillStyle = "#630000";
        c.beginPath();
        c.ellipse(450, 300, 380, 220, 0, 0, Math.PI * 2);
        c.fill();
      }),
    };
  });
  return {
    cover: { name: "finished-cover.jpg", mimeType: "image/jpeg", buffer: Buffer.from(out.cover, "base64") },
    wash: { name: "watercolor-wash.webp", mimeType: "image/webp", buffer: Buffer.from(out.wash, "base64") },
    dove: { name: "dove-corner.png", mimeType: "image/png", buffer: Buffer.from(out.dove, "base64") },
  };
}

async function upload(page: Page, file: { name: string; mimeType: string; buffer: Buffer }, use: "Cover" | "Page background" | "Page illustration") {
  await page.getByTestId("artwork-upload").setInputFiles(file);
  const row = page.locator(`[data-art-asset="${file.name}"]`);
  await row.waitFor();
  await row.getByRole("group", { name: "Use this image as" }).getByRole("button", { name: use, exact: true }).click();
}

/** Every uploaded image the pages draw: which page, which use, its box and drawn rectangle. */
const artOn = (page: Page, root: string) =>
  page.locator(`${root} [data-art]`).evaluateAll((els) =>
    els.map((g) => {
      const img = g.querySelector("image")!;
      const clip = g.querySelector("clipPath rect")!;
      const n = (e: Element, a: string) => Math.round(Number(e.getAttribute(a)) * 1000) / 1000;
      return { use: g.getAttribute("data-art"), opacity: g.getAttribute("opacity"), box: [n(clip, "x"), n(clip, "y"), n(clip, "width"), n(clip, "height")], draw: [n(img, "x"), n(img, "y"), n(img, "width"), n(img, "height")] };
    }),
  );

describe("four steps and uploaded artwork", () => {
  it("steps: title, progress, Back / Next, jump back, kept on reload", async () => {
    const ctx = await context();
    const page = await openSaved(ctx, saved());
    // A product already being made opens on its pages.
    await expect.poll(() => page.locator(".steps__title").textContent()).toBe("Pages and content");
    expect(await page.locator(".steps__count").textContent()).toBe("Step 2 of 4");
    expect(await page.locator(".area-link").evaluateAll((els) => els.map((e) => e.getAttribute("data-area")))).toEqual(["pages", "data", "layout", "writing", "add"]);
    await page.locator(".steps__nav").getByRole("button", { name: /^Next/ }).click();
    expect(await page.locator(".steps__title").textContent()).toBe("Artwork and style");
    expect(await page.locator(".area-link").evaluateAll((els) => els.map((e) => e.getAttribute("data-area")))).toEqual(["artwork", "style"]);
    await page.locator(".steps__nav").getByRole("button", { name: /^Next/ }).click();
    expect(await page.locator(".steps__title").textContent()).toBe("Preview and export");
    await page.locator('section.area[data-area="print"]').waitFor();
    expect(await page.locator(".steps__nav").getByRole("button", { name: /^Next/ }).count()).toBe(0);
    // Jump back to a completed step, then Back.
    await page.getByRole("button", { name: /^Step 1: Product setup/ }).click();
    expect(await page.locator(".steps__title").textContent()).toBe("Product setup");
    await page.locator('section.area[data-area="setup"]').waitFor();
    expect(await page.locator(".steps__nav").getByRole("button", { name: /^‹ Back/ }).isDisabled()).toBe(true);
    await page.locator(".steps__nav").getByRole("button", { name: /^Next/ }).click();
    await openArea(page, "layout");
    // Reload: the same step, and the existing controls are still there.
    await page.reload();
    await reopen(page, "Saved Journal");
    expect(await page.locator(".steps__title").textContent()).toBe("Pages and content");
    expect(await page.locator(".steps__item--done").count()).toBeGreaterThanOrEqual(1);
    await ctx.close();
  });

  it("full cover, background on selected pages and a transparent corner illustration: reopened and printed", async () => {
    const ctx = await context();
    const p = saved();
    const page = await openSaved(ctx, p);
    const img = await makeImages(page);
    await openArea(page, "artwork");

    // 1 Full cover (finished JPEG), shown with the cover's own title over it in light ink.
    await go(page, 1);
    await upload(page, img.cover, "Cover");
    const coverCard = page.locator('[data-art-placement="cover"]');
    await coverCard.getByRole("button", { name: "Add title over artwork" }).click();
    await coverCard.getByRole("button", { name: "Light", exact: true }).click();
    await expect.poll(() => page.locator('.ps-page--editor [data-art="cover"] image').count(), { timeout: 15000 }).toBe(1);
    expect(await coverCard.locator(".art-ppi").textContent()).toMatch(/prints sharp/);

    // 2 Background on selected pages: the second reflection page only, then every journal page too.
    await go(page, 3);
    await upload(page, img.wash, "Page background");
    const bg = page.locator('[data-art-placement="background"]');
    await bg.getByRole("button", { name: "This page only" }).click();
    await bg.getByRole("checkbox", { name: /Journal Page/ }).check();
    await bg.getByLabel("Opacity").fill("0.5");
    await bg.getByRole("button", { name: "Fill and crop" }).click();
    expect(await bg.locator(".field-label", { hasText: "On which pages" }).textContent()).toMatch(/5 printed pages/);

    // 3 Transparent PNG in the bottom corner of every journal page, mirrored to the outer edge.
    await go(page, 5);
    await upload(page, img.dove, "Page illustration");
    expect(await page.locator('[data-art-asset="dove-corner.png"]').textContent()).toContain("transparent background");
    const ill = page.locator('[data-art-placement="illustration"]');
    await ill.getByLabel("Width (inches)").fill("1.75");
    await ill.getByLabel("Width (inches)").press("Enter");
    await expect.poll(() => page.locator('.ps-page--editor [data-art="illustration"] image').count(), { timeout: 15000 }).toBeGreaterThan(0);
    await page.waitForTimeout(900); // saved

    // Reopen the project: everything is still there.
    await page.reload();
    await reopen(page, "Saved Journal");
    await openArea(page, "artwork");
    expect(await page.locator("[data-art-asset]").count()).toBe(3);
    expect(await page.locator("[data-art-placement]").evaluateAll((els) => els.map((e) => e.getAttribute("data-art-placement")))).toEqual(["cover", "background", "illustration"]);
    await go(page, 1);
    await expect.poll(() => page.locator('.ps-page--editor [data-art="cover"] image').count(), { timeout: 15000 }).toBe(1);
    expect(await page.locator('.ps-page--editor [data-node="cover-title"]').count()).toBe(1);

    // The preview of every page, then the printed output.
    const pages = await page.locator(".ps-page--editor").count();
    expect(pages).toBe(1);
    const previewArt: Record<number, Awaited<ReturnType<typeof artOn>>> = {};
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      await go(page, n);
      await page.waitForTimeout(150);
      previewArt[n] = await artOn(page, ".ps-page--editor");
    }
    expect(previewArt[3].map((a) => a.use)).toEqual(["background"]);
    expect(previewArt[2]).toEqual([]);
    expect(previewArt[5].map((a) => a.use)).toEqual(["background", "illustration"]);
    expect(previewArt[6].map((a) => a.use)).toEqual(["background", "illustration"]);
    expect(previewArt[5][0].opacity).toBe("0.5");

    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Export" });
    await page.evaluate(() => {
      window.print = () => {};
    });
    await dialog.getByRole("button", { name: "Print / Save PDF", exact: true }).click();
    await page.waitForSelector("#print-root .ps-print-sheet", { state: "attached", timeout: 60000 });
    const sheets = page.locator("#print-root .ps-page--print");
    const printedArt: Record<number, Awaited<ReturnType<typeof artOn>>> = {};
    const count = await sheets.count();
    for (let k = 0; k < count; k++) {
      const n = k + 1;
      if (n > 8) break;
      printedArt[n] = await sheets.nth(k).locator("[data-art]").evaluateAll((els) =>
        els.map((g) => {
          const img = g.querySelector("image")!;
          const clip = g.querySelector("clipPath rect")!;
          const v = (e: Element, a: string) => Math.round(Number(e.getAttribute(a)) * 1000) / 1000;
          return { use: g.getAttribute("data-art"), opacity: g.getAttribute("opacity"), box: [v(clip, "x"), v(clip, "y"), v(clip, "width"), v(clip, "height")], draw: [v(img, "x"), v(img, "y"), v(img, "width"), v(img, "height")] };
        }),
      );
    }
    expect(printedArt).toEqual(previewArt);
    // The PNG printed is the uploaded file itself: still RGBA (PNG color type 6), so the page shows around the dove.
    const colorType = await page.evaluate(async () => {
      const hrefs = [...document.querySelectorAll('#print-root [data-art="illustration"] image')].map((i) => i.getAttribute("href")!);
      const b = new Uint8Array(await (await fetch(hrefs[0])).arrayBuffer());
      return b[25];
    });
    expect(colorType).toBe(6);
    // Nothing is still loading when the pages are printed.
    expect(await page.locator('#print-root [data-decor="raster-pending"]').count()).toBe(0);
    await ctx.close();
  }, 120_000);

  it("iPhone 390 and 430: steps, Back / Next and artwork controls fit, with 44px touch targets", async () => {
    for (const width of [390, 430]) {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
      const page = await openSaved(ctx, saved());
      const img = await makeImages(page);
      await openArea(page, "artwork");
      await upload(page, img.dove, "Page illustration");
      await page.locator('[data-art-placement="illustration"]').waitFor();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const small = await page.locator(".steps__dot, .steps__nav .btn, .art-placement .btn, .art-asset .btn").evaluateAll((els) =>
        els.filter((e) => (e as HTMLElement).offsetParent && e.getBoundingClientRect().height < 44).map((e) => e.textContent),
      );
      expect(small).toEqual([]);
      await openStep(page, 1);
      await page.locator('section.area[data-area="setup"]').waitFor();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await ctx.close();
    }
  }, 90_000);
});
