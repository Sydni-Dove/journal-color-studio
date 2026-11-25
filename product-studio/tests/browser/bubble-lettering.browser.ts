/**
 * Bubble Lettering in a real browser: draw lettering with known settings, upload it as a sample, measure it, and get
 * the same settings back; type new words drawn the same way; export SVG and a 300 DPI PNG; save the style; put the
 * lettering on a page of a COPY of a project (the original unchanged). SHOTS_DIR saves screenshots.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { DEFAULT_STYLE, layoutLettering, letteringSvg, type LetteringStyle } from "../../src/engines/lettering/bubble";
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

/** Draw lettering with a known style and return it as a 300 DPI PNG (white background), drawn by the browser. */
async function samplePng(page: Page, text: string, s: LetteringStyle) {
  const l = layoutLettering(font, text, s);
  const svg = letteringSvg(l, { background: "white" });
  const W = Math.round(l.widthIn * 300), H = Math.round(l.heightIn * 300);
  const b64 = await page.evaluate(async ({ svg, W, H }) => {
    const img = new Image();
    img.src = "data:image/svg+xml;base64," + btoa(svg);
    await img.decode();
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    c.getContext("2d")!.drawImage(img, 0, 0, W, H);
    return c.toDataURL("image/png").split(",")[1];
  }, { svg, W, H });
  return { file: { name: "jesus-loves-me.png", mimeType: "image/png", buffer: Buffer.from(b64, "base64") }, W, H };
}

describe("Bubble Lettering", () => {
  it("copy a sample's style, draw new words the same way, export, save the style and place it on a copy", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: SHOTS ? 2 : 1, acceptDownloads: true });
    await ctx.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    const page = await ctx.newPage();
    await page.goto(server.resolvedUrls!.local[0]);
    // A finished project to place the lettering on (it must never change).
    const finished = { ...assembleInterior(mommyAndMe()), id: "p_finished", name: "Finished journal" };
    await page.evaluate((p) => {
      localStorage.clear();
      localStorage.setItem(`dove-product-studio:v1:project:${p.id}`, JSON.stringify(p));
      localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: p.id, name: p.name, productType: p.productType, sizePresetId: p.dimensions.sizePresetId, updatedAt: p.updatedAt, variantCount: p.variants.length }]));
    }, finished);
    await page.reload();
    const before = await page.evaluate(() => localStorage.getItem("dove-product-studio:v1:project:p_finished"));

    await page.locator('[data-create="bubble-lettering"]').click();
    await page.getByTestId("lettering-studio").waitFor();
    await page.getByTestId("lettering-preview").locator("svg").waitFor();

    // The sample: known settings.
    const known: LetteringStyle = { ...DEFAULT_STYLE, capHeightIn: 1, outlinePt: 3, puffIn: 0.06, spacingIn: -0.05, lineGapIn: 0.15 };
    const s = await samplePng(page, "Jesus\nLoves Me", known);
    await page.getByTestId("lettering-sample-file").setInputFiles(s.file);
    await page.getByTestId("lettering-sample-text").fill("Jesus\nLoves Me");
    await page.getByTestId("lettering-measure").click();
    await page.getByTestId("lettering-measured").waitFor();
    const val = async (id: string) => Number(await page.getByTestId(id).inputValue());
    expect(Math.abs((await val("set-height")) - 1)).toBeLessThan(0.04);
    expect(Math.abs((await val("set-outline")) - 3)).toBeLessThan(0.25);
    expect(Math.abs((await val("set-round")) - 0.06 * 72)).toBeLessThan(0.8);
    expect(Math.abs((await val("set-spacing")) + 0.05)).toBeLessThan(0.02);
    expect(Math.abs((await val("set-linegap")) - 0.15)).toBeLessThan(0.03);
    const table = await page.getByTestId("lettering-measured").textContent();
    for (const t of ["Overall size", "Letter height", "Letter width", "Outline thickness", "Spacing between letters", "Line spacing", "Roundness"]) expect(table).toContain(t);
    // Drawing the sample's own words again gives the sample's size.
    expect(await page.getByTestId("lettering-preview").getAttribute("data-size")).toBe(`${(s.W / 300).toFixed(2)}x${(s.H / 300).toFixed(2)}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-measured.png`, fullPage: true });

    // New words, the same style.
    await page.getByTestId("lettering-words").fill("God Made Me\nWonderful");
    await expect.poll(async () => (await page.getByTestId("lettering-preview").locator("path").count())).toBe(2);
    // Adjust a setting: thicker outline.
    await page.getByTestId("set-outline").fill("4");
    // Save as a style; it's offered after a reload.
    page.once("dialog", (d) => void d.accept("Jesus Loves Me style"));
    await page.getByTestId("lettering-save-style").click();
    await expect.poll(() => page.getByTestId("lettering-style").locator("option").allTextContents()).toContain("Jesus Loves Me style");

    // Exports: SVG (vector paths) and a 300 DPI PNG.
    const [svgDl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("lettering-svg").click()]);
    const svgText = readFileSync((await svgDl.path())!, "utf8");
    expect(svgText).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    // The outline (4 pt) is the black layer's reach past the white one, each side.
    const widths = [...svgText.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(widths[0] - widths[1]).toBeCloseTo(8, 1);
    const [pngDl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("lettering-png").click()]);
    const png = readFileSync((await pngDl.path())!);
    const [pw, ph] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    const size = (await page.getByTestId("lettering-preview").getAttribute("data-size"))!.split("x").map(Number);
    // 300 DPI (the size shown is rounded to 0.01 in, so allow a couple of pixels).
    expect(Math.abs(pw - size[0] * 300)).toBeLessThanOrEqual(2);
    expect(Math.abs(ph - size[1] * 300)).toBeLessThanOrEqual(2);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-new-words.png`, fullPage: true });

    // Put it on a page: a copy is made and opened; the finished project is unchanged.
    await page.getByTestId("lettering-project").selectOption("p_finished");
    await page.getByTestId("lettering-place-button").click();
    // The copy opens in the editor (its name in the name box).
    await expect.poll(() => page.locator("input").first().inputValue()).toBe("Finished journal (with lettering)");
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => localStorage.getItem("dove-product-studio:v1:project:p_finished"))).toBe(before);
    const index = await page.evaluate(() => JSON.parse(localStorage.getItem("dove-product-studio:v1:index") ?? "[]").map((x: { name: string }) => x.name));
    expect(index).toEqual(expect.arrayContaining(["Finished journal", "Finished journal (with lettering)"]));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/3-placed.png` });

    // The saved style is still there after a reload.
    await page.reload();
    await page.locator('[data-create="bubble-lettering"]').click();
    await expect.poll(() => page.getByTestId("lettering-style").locator("option").allTextContents()).toContain("Jesus Loves Me style");
    await ctx.close();
  }, 120_000);
});
