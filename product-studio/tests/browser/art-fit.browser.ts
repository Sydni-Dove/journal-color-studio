/**
 * Art brought back from ChatGPT, made to fit (real browser):
 *   Bubble Lettering → Fix the spacing: unevenly spaced letters separated and set with even gaps (a slider); letters
 *   that touch are reported and the words can be redrawn in the measured style instead.
 *   Fit Art to Page: margins (all or each), bleed and guides; the art scaled and centred without stretching; a
 *   cut-off warning; a plain-line border redrawn inside the margins; a 300 DPI page PNG; placed on a COPY of a project.
 * SHOTS_DIR saves screenshots.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { DEFAULT_STYLE, layoutLettering, letteringSvg } from "../../src/engines/lettering/bubble";
import { assembleInterior } from "../../src/engines/coloringBook/assembleBook";
import { mommyAndMe } from "../fixtures/mommyAndMe";

let server: PreviewServer;
let browser: Browser;
beforeAll(async () => {
  server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
  browser = await chromium.launch({ executablePath: (import.meta.env.CHROMIUM_PATH as string | undefined) || undefined });
});
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => server?.httpServer.close(() => r()));
});
const SHOTS = process.env.SHOTS_DIR;
const buf = readFileSync("node_modules/@fontsource/fredoka/files/fredoka-latin-700-normal.woff");
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

/** Draw on a canvas in the page and return a PNG for an upload. */
async function canvasPng(page: Page, name: string, w: number, h: number, draw: string, svgs: { svg: string; x: number; y: number; w: number; h: number }[] = []) {
  const b64 = await page.evaluate(async ({ w, h, draw, svgs }) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const x = c.getContext("2d")!;
    x.fillStyle = "#fff";
    x.fillRect(0, 0, w, h);
    for (const s of svgs) {
      const img = new Image();
      img.src = "data:image/svg+xml;base64," + btoa(s.svg);
      await img.decode();
      x.drawImage(img, s.x, s.y, s.w, s.h);
    }
    new Function("x", "w", "h", draw)(x, w, h);
    return c.toDataURL("image/png").split(",")[1];
  }, { w, h, draw, svgs });
  return { name, mimeType: "image/png", buffer: Buffer.from(b64, "base64") };
}

async function home(page: Page) {
  await page.goto(server.resolvedUrls!.local[0]);
  const finished = { ...assembleInterior(mommyAndMe()), id: "p_finished", name: "Finished journal" };
  await page.evaluate((p) => {
    localStorage.clear();
    localStorage.setItem(`dove-product-studio:v1:project:${p.id}`, JSON.stringify(p));
    localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: p.id, name: p.name, productType: p.productType, sizePresetId: p.dimensions.sizePresetId, updatedAt: p.updatedAt, variantCount: p.variants.length }]));
  }, finished);
  await page.reload();
  return page.evaluate(() => localStorage.getItem("dove-product-studio:v1:project:p_finished"));
}

describe("Fix the spacing of uploaded lettering", () => {
  it("separates the letters, evens the gaps with a slider, and offers to redraw when letters touch", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: SHOTS ? 2 : 1, acceptDownloads: true });
    await ctx.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    const page = await ctx.newPage();
    await home(page);
    await page.locator('[data-create="bubble-lettering"]').click();
    await page.getByTestId("lettering-studio").waitFor();
    // “JOY” with uneven gaps: 30 px, then 260 px.
    const s = { ...DEFAULT_STYLE, capHeightIn: 1, puffIn: 0.05, outlinePt: 3 };
    const letters = ["J", "O", "Y"].map((ch) => { const l = layoutLettering(font, ch, s); return { svg: letteringSvg(l), w: Math.round(l.widthIn * 300), h: Math.round(l.heightIn * 300) }; });
    let x = 60;
    const placed = letters.map((l, i) => { const p = { svg: l.svg, x, y: 60, w: l.w, h: l.h }; x += l.w + (i === 0 ? 30 : 260); return p; });
    const file = await canvasPng(page, "joy-uneven.png", x + 60, 60 + Math.max(...letters.map((l) => l.h)) + 60, "", placed);
    await page.getByTestId("lettering-sample-file").setInputFiles(file);
    await page.getByTestId("lettering-sample-text").fill("JOY");
    await page.getByTestId("lettering-respace-start").click();
    await page.getByTestId("respaced-image").waitFor();
    await expect.poll(() => page.getByTestId("respace-report").textContent()).toContain("Line 1: 3 pieces");
    await page.getByTestId("respace-gap").fill("0.1");
    await expect.poll(async () => Number(await page.getByTestId("respace-gap").inputValue())).toBe(0.1);
    await page.waitForTimeout(400);
    // The result: three letters exactly 0.1 in (30 px) apart.
    const gaps = await page.evaluate(async () => {
      const img = document.querySelector('[data-testid="respaced-image"]') as HTMLImageElement;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const x = c.getContext("2d")!;
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      const cols: boolean[] = [];
      for (let i = 0; i < c.width; i++) {
        let any = false;
        for (let j = 0; j < c.height && !any; j++) any = d[(j * c.width + i) * 4 + 3] > 0 && d[(j * c.width + i) * 4] < 128;
        cols.push(any);
      }
      const runs: number[] = [];
      let gap = -1;
      for (let i = 0; i < cols.length; i++) {
        if (cols[i]) { if (gap > 0) runs.push(gap); gap = 0; } else if (gap >= 0) gap++;
      }
      return runs;
    });
    // Gaps between the letters' outlines (a letter's own inner gaps are narrower than an outline's run here).
    expect(gaps.filter((g) => g > 20).map((g) => Math.abs(g - 30) <= 4)).toEqual([true, true]);
    if (SHOTS) await page.getByTestId("lettering-copy").screenshot({ path: `${SHOTS}/4-respaced.png` });

    // Touching letters: reported, with the redraw offered.
    const touching = layoutLettering(font, "JOY", { ...s, spacingIn: -0.15 });
    await page.getByTestId("lettering-sample-file").setInputFiles(await canvasPng(page, "joy-touching.png", Math.round(touching.widthIn * 300) + 120, Math.round(touching.heightIn * 300) + 120, "", [{ svg: letteringSvg(touching), x: 60, y: 60, w: Math.round(touching.widthIn * 300), h: Math.round(touching.heightIn * 300) }]));
    await page.getByTestId("lettering-respace-start").click();
    await page.getByTestId("respace-joined").waitFor();
    await page.getByTestId("respace-redraw").click();
    await page.getByTestId("lettering-measured").waitFor();
    await expect.poll(() => page.getByTestId("lettering-words").inputValue()).toBe("JOY");
    await ctx.close();
  }, 120_000);
});

describe("Fit Art to Page", () => {
  it("margins, guides, centred without stretching, cut-off warning, border redrawn inside, PNG, placed on a copy", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: SHOTS ? 2 : 1, acceptDownloads: true });
    await ctx.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    const page = await ctx.newPage();
    const before = await home(page);
    await page.locator('[data-create="fit-art"]').click();
    await page.getByTestId("art-fit-studio").waitFor();

    // A coloring picture with lots of white space around it: the art itself (608 × 308 with its outline) is what fits.
    await page.getByTestId("fit-file").setInputFiles(await canvasPng(page, "flowers.png", 1500, 1500, "x.lineWidth=8;x.strokeRect(450,600,600,300);x.beginPath();x.arc(750,750,120,0,7);x.stroke();"));
    await page.getByTestId("fit-art").waitFor();
    await page.getByTestId("fit-margin-all").fill("0.75");
    await expect.poll(() => page.getByTestId("fit-art").getAttribute("data-draw")).toBe("0.750,3.727,7.000,3.546");
    await expect.poll(async () => page.getByTestId("fit-cut-warning").count()).toBe(0);
    // Each margin on its own.
    await page.getByLabel("Same margin on every side").uncheck();
    await page.getByTestId("fit-margin-top").fill("2");
    await expect.poll(() => page.getByTestId("fit-art").getAttribute("data-draw")).toBe("0.750,4.352,7.000,3.546");

    // A page border cut off at the page edge: warned; redrawn whole inside the margins.
    await page.getByTestId("fit-file").setInputFiles(await canvasPng(page, "border.png", 2550, 3300, "x.fillStyle='#000';const f=(o,t)=>{x.fillRect(o,o,w-2*o,t);x.fillRect(o,h-o-t,w-2*o,t);x.fillRect(o,o,t,h-2*o);x.fillRect(w-o-t,o,t,h-2*o);};f(0,24);f(60,9);"));
    await page.getByTestId("fit-cut-warning").waitFor();
    expect(await page.getByTestId("fit-cut-warning").textContent()).toContain("can't bring back the part that was cut away");
    await page.getByLabel(/Redraw the border inside the margins/).check();
    await expect.poll(() => page.getByTestId("fit-frame-line").count()).toBe(2);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/5-fit-border.png`, fullPage: true });

    // The page PNG: 8.5 × 11 in at 300 DPI.
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("fit-download").click()]);
    const png = readFileSync((await dl.path())!);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([2550, 3300]);

    // On a page of a copy; the finished project is unchanged.
    await page.getByTestId("fit-project").selectOption("p_finished");
    await page.getByTestId("fit-place").click();
    await expect.poll(() => page.locator("input").first().inputValue()).toBe("Finished journal (with fitted art)");
    expect(await page.evaluate(() => localStorage.getItem("dove-product-studio:v1:project:p_finished"))).toBe(before);
    await page.waitForTimeout(600);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/6-fit-placed.png` });
    await ctx.close();
  }, 120_000);
});
