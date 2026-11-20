/**
 * "She Is Gracious — Ballet Coloring Book", end to end in a real browser: three saved dancers with reference
 * images; two interior scenes, one Thick + Simple and one Thin + Detailed; then the coloring book cover with the
 * Full-Color Storybook direction. The cover prompt must use the same three dancers and name their reference
 * images, and both interior pages must stay black and white. Reloads keep everything.
 * Set SHOTS_DIR to save screenshots of the key screens.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";

let server: PreviewServer;
let browser: Browser;
beforeAll(async () => {
  server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
  browser = await chromium.launch({ executablePath: (import.meta.env.CHROMIUM_PATH as string | undefined) || undefined });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => server?.httpServer.close(() => r()));
});

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const toStep = async (page: Page, n: number) => {
  await page.locator(".steps__dot").nth(n - 1).click();
  await page.locator(".steps__count", { hasText: new RegExp(`^Step ${n} of`) }).waitFor();
};
const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());
const HEX = /#[0-9A-F]{6}/i;

/** A reference image drawn by the browser: a simple dancer figure in one color, as a PNG file. */
async function dancerPng(page: Page, color: string, name: string) {
  const b64 = await page.evaluate(async (color) => {
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 900;
    const x = c.getContext("2d")!;
    x.fillStyle = "#fff";
    x.fillRect(0, 0, 600, 900);
    x.fillStyle = color;
    x.beginPath();
    x.arc(300, 180, 90, 0, 7);
    x.fill();
    x.beginPath();
    x.moveTo(300, 270);
    x.lineTo(140, 640);
    x.lineTo(460, 640);
    x.fill();
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
    let s = "";
    for (const v of new Uint8Array(await blob.arrayBuffer())) s += String.fromCharCode(v);
    return btoa(s);
  }, color);
  return { name, mimeType: "image/png", buffer: Buffer.from(b64, "base64") };
}

const DANCERS = [
  { name: "Amara", color: "#C2185B", description: "a 7-year-old ballerina with dark brown skin, a high bun of tight coils, pink leotard and tutu", traits: "round face, dimples, tight coily hair" },
  { name: "Lucía", color: "#7B1FA2", description: "a 6-year-old dancer with light olive skin, long wavy hair in a low ponytail, lavender leotard", traits: "freckles, wavy hair, small nose" },
  { name: "Grace", color: "#1565C0", description: "an 8-year-old dancer with fair skin, red hair in two braids and round glasses, blue leotard", traits: "glasses, freckles, two braids" },
];

describe("She Is Gracious — Ballet Coloring Book", () => {
  it("three saved dancers, two interior scenes (Thick + Simple, Thin + Detailed), and a Full-Color Storybook cover with the same dancers", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.goto(server.resolvedUrls!.local[0]);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "Cover Studio" }).click();

    // 1 Collection, on the Children's Character Illustrations tab.
    await page.getByRole("tab", { name: /Children’s Character/ }).click();
    await page.getByLabel("Collection name").fill("She Is Gracious — Ballet Coloring Book");
    expect(await page.locator(".steps__count").textContent()).toBe("Step 1 of 6");

    // 2 Art direction: coloring pages default to black outlines on white, Medium, Moderate.
    await toStep(page, 2);
    const style = page.getByTestId("coloring-style");
    expect(await style.getByRole("button", { name: "Black outlines on white" }).getAttribute("aria-pressed")).toBe("true");
    expect(await style.getByRole("group", { name: "Line thickness" }).getByRole("button", { name: "Medium" }).getAttribute("aria-pressed")).toBe("true");
    expect(await style.getByRole("group", { name: "Illustration complexity" }).getByRole("button", { name: "Moderate" }).getAttribute("aria-pressed")).toBe("true");
    expect(await style.locator("[data-sample]").getAttribute("data-sample")).toBe("Medium-Moderate");
    await page.getByRole("button", { name: /^All \(/ }).click();
    await page.locator('[data-palette="jcs-blush-rose"]').click();
    const paletteHexes = (await page.getByTestId("palette-hexes").innerText()).match(/#[0-9A-F]{6}/gi)!;
    expect(paletteHexes.length).toBeGreaterThan(2);

    // 3 Cast & references: three dancers, each with a reference image.
    await toStep(page, 3);
    for (const d of DANCERS) {
      await page.getByRole("button", { name: "Add a character" }).click();
      const card = page.locator(".cast-card").last();
      await card.getByLabel("Character name").fill(d.name);
      await page.getByLabel(`${d.name}: description`).fill(d.description);
      await page.getByLabel(`${d.name}: always keep`).fill(d.traits);
      await page.getByTestId(`ref-${d.name}`).setInputFiles(await dancerPng(page, d.color, `${d.name.toLowerCase().replace("í", "i")}-reference.png`));
      await expect.poll(() => page.locator(`[data-cast="${d.name}"] .cast-thumb img`).count()).toBe(1);
    }
    expect(await page.getByRole("checkbox", { name: "Keep interior characters consistent" }).isChecked()).toBe(true);
    await shot(page, "gracious-cast");

    // 4 Scenes: paste two, split, and set each scene's own line thickness and complexity.
    await toStep(page, 4);
    await page.getByLabel("Scenes text").fill("1. Warm-up at the barre\nAmara, Lucía and Grace stretch side by side at the barre, smiling at each other.\n\n2. Opening night bow\nOn stage under the lights, the three dancers take a bow together, holding hands.");
    await page.getByRole("button", { name: "Split into scenes" }).click();
    expect(await page.locator("[data-scene]").count()).toBe(2);
    await page.getByLabel("Scene 1 line thickness").selectOption("Thick");
    await page.getByLabel("Scene 1 complexity").selectOption("Simple");
    await page.getByLabel("Scene 2 line thickness").selectOption("Thin");
    await page.getByLabel("Scene 2 complexity").selectOption("Detailed");
    expect(await page.locator('[data-scene="1"] [data-sample]').getAttribute("data-sample")).toBe("Thick-Simple");
    expect(await page.locator('[data-scene="2"] [data-sample]').getAttribute("data-sample")).toBe("Thin-Detailed");
    await shot(page, "gracious-scenes");

    // 5 Page layout: a finished coloring page, NIV, room for the verse, and the live space estimate.
    await toStep(page, 5);
    expect(await page.locator('[data-output="coloring-page"]').getAttribute("aria-checked")).toBe("true");
    expect(await page.getByLabel("Bible translation").inputValue()).toBe("NIV");
    expect(await page.getByRole("checkbox", { name: "Verse wording and permission verified" }).isChecked()).toBe(false);
    const before = await page.getByTestId("space-estimate").innerText();
    await page.getByLabel("Illustration coverage").fill("60");
    expect(await page.getByTestId("space-estimate").innerText()).not.toBe(before);
    expect(await page.getByTestId("space-estimate").innerText()).toMatch(/left/);

    // 6 Review: preview and copy each scene, and copy all.
    await toStep(page, 6);
    const prompts: string[] = [];
    for (const n of [1, 2]) {
      await page.getByTestId(`copy-scene-${n}`).click();
      await expect.poll(() => clipboard(page)).toContain(`Scene ${n} of 2:`);
      prompts.push(await clipboard(page));
    }
    await page.locator('[data-scene-review="2"]').getByRole("button", { name: "Open scene" }).click();
    expect(await page.getByTestId("scene-prompt-2").innerText()).toBe(prompts[1]);
    const refs = "amara-reference.png, lucia-reference.png, grace-reference.png";
    for (const p of prompts) {
      for (const d of DANCERS) expect(p).toContain(`. ${d.name}:`);
      for (const d of DANCERS) expect(p).toContain(`Notes: ${d.description}`);
      expect(p).toContain(`Attached reference images (use them as the visual identity anchors): ${refs}.`);
      expect(p).toContain("Pure white background. Bold, clean black outlines.");
      expect(p).not.toMatch(HEX); // black and white: no palette colors in the interior pages
      expect(p).not.toMatch(/empty band|title field/i);
      expect(p).toContain("One scene only. No character sheets, multiple views, or alternate compositions.");
    }
    expect(prompts[0]).toContain("thick, bold lines (about 2 pt)");
    expect(prompts[0]).toContain("Illustration complexity: simple:");
    expect(prompts[1]).toContain("thin, fine lines (about 0.5 pt)");
    expect(prompts[1]).toContain("Illustration complexity: detailed:");
    await page.getByTestId("copy-prompt").click();
    await expect.poll(() => clipboard(page)).toBe(`${prompts[0]}\n\n━━━━━━━━━━━━━━━━━━━━\n\n${prompts[1]}`);
    await page.getByRole("button", { name: "Save collection" }).click();
    await shot(page, "gracious-review-scenes");

    // The coloring book cover: the same dancers, chosen by default, beside their images.
    await page.getByRole("tab", { name: "Coloring Book Cover" }).click();
    await toStep(page, 2);
    const gallery = page.getByTestId("interior-characters");
    for (const d of DANCERS) {
      expect(await gallery.getByRole("checkbox", { name: `Use ${d.name} on the cover` }).isChecked()).toBe(true);
      expect(await gallery.locator(`[data-cast="${d.name}"] .cast-thumb img`).count()).toBe(1);
    }
    // Typed details are kept when a direction card is chosen.
    await page.getByLabel("Title placement", { exact: true }).fill("title in a pink ribbon banner across the top");
    await page.locator('[data-card="storybook"]').click();
    expect(await page.getByLabel("Cover color").inputValue()).toMatch(/full-color storybook/);
    expect(await page.getByLabel("Starter scene").inputValue()).toBe("the characters together at the heart of the story");
    expect(await page.getByLabel("Title placement", { exact: true }).inputValue()).toBe("title in a pink ribbon banner across the top");
    await shot(page, "gracious-cover-design");

    await toStep(page, 3);
    expect(await page.getByRole("group", { name: "What the image generator makes" }).getByRole("button", { name: "Artwork only" }).getAttribute("aria-pressed")).toBe("true");
    await page.getByLabel("Book title").fill("She Is Gracious");
    await page.getByLabel("Subtitle").fill("A Ballet Coloring Book");

    await toStep(page, 4);
    const attach = await page.getByTestId("attach-list").innerText();
    for (const f of refs.split(", ")) expect(attach).toContain(f);
    const cover = await page.getByTestId("cover-prompt").innerText();
    for (const d of DANCERS) expect(cover).toContain(`. ${d.name}:`);
    expect(cover).toContain(`Attach these reference images with this prompt: ${refs}.`);
    expect(cover).toContain("full-color storybook painting");
    for (const h of paletteHexes) expect(cover).toContain(h.toUpperCase());
    expect(cover).toContain("only the cover is in color");
    expect(cover).toContain("Artwork only: draw NO title, words or letters");
    await page.getByTestId("copy-prompt").click();
    await expect.poll(() => clipboard(page)).toBe(cover);

    // Compare the finished cover with the references, and approve it by hand.
    await page.getByTestId("finished-cover").setInputFiles(await dancerPng(page, "#E91E63", "gracious-cover-v1.png"));
    await expect.poll(() => page.getByTestId("approve-panel").locator("figure img").count()).toBe(4);
    await page.getByRole("checkbox", { name: /^Approved/ }).check();
    await shot(page, "gracious-review-cover");

    // Reload: the cast, scenes, cover choices and approval are all still there; the interiors are still black and white.
    await page.waitForTimeout(600);
    await page.reload();
    await page.getByRole("button", { name: "Cover Studio" }).click();
    expect(await page.getByRole("tab", { name: "Coloring Book Cover" }).getAttribute("aria-selected")).toBe("true");
    expect(await page.getByTestId("cover-prompt").innerText()).toBe(cover);
    expect(await page.getByRole("checkbox", { name: /^Approved/ }).isChecked()).toBe(true);
    await page.getByRole("tab", { name: /Children’s Character/ }).click();
    await toStep(page, 6);
    const interiors = await page.getByTestId("cover-prompt").innerText();
    expect(interiors).not.toMatch(HEX);
    expect(interiors).toContain("thick, bold lines");
    expect(interiors).toContain("thin, fine lines");
    expect(errors).toEqual([]);
    await ctx.close();
  }, 120_000);

  it("on a phone the tabs, steps and cast fit with 44px touch targets", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.goto(server.resolvedUrls!.local[0]);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "Cover Studio" }).click();
    await page.getByRole("tab", { name: /Children’s Character/ }).click();
    for (const n of [1, 2, 3, 4, 5, 6]) {
      await toStep(page, n);
      if (n === 3) await page.getByRole("button", { name: "Add a character" }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `step ${n}`).toBeLessThanOrEqual(0);
      const small = await page.locator(".steps__dot, .steps__nav .btn, .cover-tab, .cast-card .btn, .scenes-panel .btn, .output-cards button").evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent && e.getBoundingClientRect().height < 44).map((e) => e.textContent));
      expect(small, `step ${n}`).toEqual([]);
    }
    await ctx.close();
  }, 60_000);
});
