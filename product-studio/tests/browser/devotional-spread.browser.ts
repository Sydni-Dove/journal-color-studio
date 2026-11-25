/**
 * Devotional Spread in a real browser: start “Mommy & Me: Growing With God Together” (KJV), fill in a spread, see
 * the two facing pages side by side, write each page's Art Prompt, upload art (and get the 2550 × 3300 warning),
 * check the answers, and see the whole book as facing pages with both PDF exports. SHOTS_DIR saves screenshots.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";

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
const shot = async (page: Page, name: string, full = true) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full });
};
const PSALM = "I will praise thee; for I am fearfully and wonderfully made: marvellous are thy works; and that my soul knoweth right well.";

/** Simple black line art on white: a girl-ish figure and flowers (daughter), or a botanical arch on the inner side (Mommy). */
async function png(page: Page, w: number, h: number, name: string, kind: "daughter" | "mommy") {
  const b64 = await page.evaluate(
    async ({ w, h, kind }) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const x = c.getContext("2d")!;
      x.fillStyle = "#fff";
      x.fillRect(0, 0, w, h);
      x.strokeStyle = "#000";
      x.lineWidth = Math.max(3, w / 200);
      const flower = (cx: number, cy: number, r: number) => {
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          x.beginPath();
          x.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * 0.7, r * 0.4, a, 0, 7);
          x.stroke();
        }
        x.beginPath();
        x.arc(cx, cy, r * 0.45, 0, 7);
        x.stroke();
      };
      if (kind === "daughter") {
        // Words go across the top quarter: the art stays below it.
        x.beginPath(); x.arc(w * 0.4, h * 0.42, w * 0.07, 0, 7); x.stroke();
        x.beginPath(); x.moveTo(w * 0.4, h * 0.47); x.lineTo(w * 0.3, h * 0.7); x.lineTo(w * 0.5, h * 0.7); x.closePath(); x.stroke();
        x.beginPath(); x.arc(w * 0.64, h * 0.38, w * 0.08, 0, 7); x.stroke();
        x.strokeRect(w * 0.56, h * 0.45, w * 0.16, h * 0.3);
        for (let k = 0; k < 6; k++) flower(w * (0.12 + k * 0.15), h * 0.86, w * 0.03);
      } else {
        // All art in the inner 65% (left); the outer 35% left blank for the activity column.
        x.beginPath(); x.arc(w * 0.33, h * 0.42, w * 0.24, Math.PI, 0); x.stroke();
        x.beginPath(); x.moveTo(w * 0.09, h * 0.42); x.lineTo(w * 0.09, h * 0.9); x.moveTo(w * 0.57, h * 0.42); x.lineTo(w * 0.57, h * 0.9); x.stroke();
        for (let k = 0; k < 7; k++) flower(w * (0.1 + (k % 4) * 0.155), h * (0.3 + Math.floor(k / 4) * 0.55 + (k % 2) * 0.08), w * 0.035);
      }
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
      let s = "";
      for (const v of new Uint8Array(await blob.arrayBuffer())) s += String.fromCharCode(v);
      return btoa(s);
    },
    { w, h, kind },
  );
  return { name, mimeType: "image/png", buffer: Buffer.from(b64, "base64") };
}

describe("Devotional Spread: Mommy & Me", () => {
  it("start the book, fill a spread, see both pages facing, Art Prompts, art, answer check, preview and exports", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: SHOTS ? 2 : 1, permissions: ["clipboard-read", "clipboard-write"] });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, async (route) => route.fulfill({ response: await route.fetch() }).catch(() => route.abort()));
    await ctx.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    // The public-domain Bible text service, answered here (word for word KJV).
    await ctx.route(/bible-api\.com/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reference: "Psalm 139:14", text: `${PSALM}\n` }) }));
    const page = await ctx.newPage();
    await page.goto(server.resolvedUrls!.local[0]);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('[data-create="coloring-book"]').click();
    await page.getByTestId("new-mommy-me").click();
    await page.locator(".steps__count", { hasText: /^Step 3 of 5/ }).waitFor();
    await expect(page.locator(".book-name").textContent()).resolves.toContain("Mommy & Me: Growing With God Together");

    // Open the spread: both pages, side by side, in print order.
    await page.getByRole("button", { name: /Open spread 1/ }).click();
    const pair = page.locator('[data-testid^="spread-pair-"]').first();
    await pair.waitFor();
    const left = Number(await pair.getAttribute("data-left")), right = Number(await pair.getAttribute("data-right"));
    expect(left % 2).toBe(0);
    expect(right).toBe(left + 1);
    const [lb, rb] = await pair.locator(".page-thumb").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().x));
    expect(lb).toBeLessThan(rb);

    // Daughter page: title, verse (KJV, fetched word for word, approved), theme, scene, Girl 1.
    const d = page.getByTestId("daughter-page");
    await d.getByTestId("page-title").fill("I Am Wonderfully Made");
    await d.getByTestId("verse-ref").fill("Psalm 139:14");
    await d.getByTestId("verse-ref").press("Enter");
    await d.getByTestId("fetch-verse").click();
    await expect.poll(() => d.getByTestId("verse-text").inputValue()).toBe(PSALM);
    await d.getByTestId("approve-verse").click();
    await d.getByRole("button", { name: "Short excerpt" }).click();
    await d.getByTestId("verse-excerpt").fill("I am fearfully and wonderfully made");
    await d.getByLabel("Theme").fill("God made me wonderfully");
    await d.getByTestId("scene-description").fill("The girl twirls in a meadow of wildflowers while Jesus kneels beside her, arms open.");
    await d.getByLabel("Character in this page's art").selectOption({ label: "Girl 1" });

    // Daughter Art Prompt.
    await d.getByTestId("art-prompt-button-daughter").click();
    const dp = await d.getByTestId("art-prompt-text-daughter").textContent();
    expect(dp).toContain("A joyful Black girl about 6 years old with long braids gathered into a high ponytail tied with a large bow.");
    expect(dp).toContain("Leave the top quarter of the page completely blank");
    expect(dp!.trim().endsWith("Spell every word exactly as written.")).toBe(true);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(dp);

    // Mommy page: declaration, activities.
    const m = page.getByTestId("mommy-page");
    await m.getByTestId("mommy-title").fill("She is fearfully and wonderfully made");
    await m.getByLabel("Reserve a QR code box (labelled; you add the code later)").check();
    await m.getByLabel("Read the Word 1 reference").fill("Psalm 139:14");
    await m.getByRole("button", { name: "Fill in the KJV wording" }).first().click();
    await expect.poll(() => m.getByLabel("Read the Word 1", { exact: true }).inputValue()).toBe(PSALM);
    await m.getByLabel("Read the Word 2 reference").fill("Psalm 139:13");
    await m.getByLabel("This line is").nth(1).selectOption("paraphrase");
    await m.getByLabel("Read the Word 2", { exact: true }).fill("God knit you together, carefully, before you were ever born.");
    const blanks = [["I am fearfully and ___ made.", "wonderfully", "Psalm 139:14"], ["God's works are ___.", "marvellous", "Psalm 139:14"], ["God made me with ___ care.", "loving", "Psalm 139:13"]];
    for (const [k, [t, a, r]] of blanks.entries()) {
      await m.getByLabel(`Blank ${k + 1} statement`).fill(t);
      await m.getByLabel(`Blank ${k + 1} answer`).fill(a);
      await m.getByLabel(`Blank ${k + 1} reference`).fill(r);
    }
    await expect.poll(() => m.getByTestId("answer-check-1").textContent()).toContain("is in this page's excerpts");
    // “loving” isn't printed in the excerpts: flagged.
    await expect.poll(() => m.getByTestId("answer-check-3").textContent()).toContain("“loving” isn't in this page's printed excerpts");
    await m.getByTestId("reflect-question").fill("Where did you see God's beautiful work in your daughter this week?");
    await m.getByTestId("heart-question").fill("Ask her: What is one thing God made special about you?");
    await m.getByTestId("mommy-scene").fill("A tall garden arch of roses and climbing vines with butterflies.");
    await m.getByTestId("art-prompt-button-mommy").click();
    const mp = await m.getByTestId("art-prompt-text-mommy").textContent();
    expect(mp).toContain("inner 65% of the page width");
    expect(mp).toContain("The outer 35% (the right side) stays completely blank");

    // Art: a small one first (warned), then full size.
    await page.getByTestId("daughter-art-input").setInputFiles(await png(page, 1024, 1536, "daughter-small.png", "daughter"));
    await expect.poll(() => page.getByTestId("daughter-art-size").textContent()).toContain("Below 2550 × 3300");
    await page.getByTestId("daughter-art-input").setInputFiles(await png(page, 2550, 3300, "daughter.png", "daughter"));
    await expect.poll(() => page.getByTestId("daughter-art-size").textContent()).toContain("prints sharp");
    await page.getByTestId("mommy-art-input").setInputFiles(await png(page, 2550, 3300, "mommy.png", "mommy"));
    await expect.poll(() => page.getByTestId("mommy-art-size").textContent()).toContain("prints sharp");
    await page.waitForTimeout(600);

    // The Mommy page as drawn: the four sections and the QR placeholder; never the answers.
    const mommyThumb = pair.locator(".page-thumb").nth(1);
    for (const h of ["READ THE WORD", "FILL IN THE BLANK", "LISTEN & REFLECT", "HEART TO HEART", "QR code here", "Psalm 139:13 · paraphrase"]) await expect.poll(() => mommyThumb.textContent()).toContain(h);
    await expect.poll(() => mommyThumb.textContent()).not.toContain("wonderfully made.");
    await pair.scrollIntoViewIfNeeded();
    await shot(page, "1-spread-editor", false);
    if (SHOTS) await pair.screenshot({ path: `${SHOTS}/2-spread-pair.png` });
    if (SHOTS) await page.getByTestId("daughter-page").screenshot({ path: `${SHOTS}/3-daughter-fields.png` });
    if (SHOTS) await page.getByTestId("mommy-page").screenshot({ path: `${SHOTS}/4-mommy-fields.png` });

    // Preview and Export: facing pages, both PDFs.
    await page.locator(".steps__dot").nth(4).click();
    await page.getByTestId("facing-view").waitFor();
    const spreadRow = page.locator(`[data-spread="${left}-${right}"]`);
    await expect.poll(() => spreadRow.count()).toBe(1);
    await page.getByTestId("export-interior").waitFor();
    await page.getByTestId("export-digital").waitFor();
    // KJV: no permission block.
    await expect.poll(() => page.locator('[data-issue="license"]').count()).toBe(0);
    await expect.poll(() => page.locator('[data-issue^="answer-"]').count()).toBe(1);
    await shot(page, "5-preview-facing");

    // NIV: export blocked until permission is recorded.
    await page.locator(".steps__dot").nth(0).click();
    await page.getByLabel("Translation").selectOption("NIV");
    const permission = page.getByLabel("I have the publisher's written permission to quote NIV in this book");
    await permission.waitFor();
    await page.locator(".steps__dot").nth(4).click();
    await expect.poll(() => page.locator('[data-issue="license"]').count()).toBe(1);
    await page.locator(".steps__dot").nth(0).click();
    await permission.check();
    await page.locator(".steps__dot").nth(4).click();
    await expect.poll(() => page.locator('[data-issue="license"]').count()).toBe(0);
    await ctx.close();
  }, 120_000);
});
