/**
 * Gracious Kids — Ballet Coloring Book, end to end in a real browser (regression for the banners, typography leaks
 * and drifting characters seen in generated pages):
 *   no characters yet → the cast-design prompt; three ballerinas in the registry with reference images; locked;
 *   ten scenes; every scene prompt reuses the same three girls and asks for a text-free black-and-white illustration;
 *   a reference image is copied to the clipboard as an actual image; scenes are approved in order after the
 *   consistency check; a page-canvas illustration fills the page, another size is fitted into the illustration area;
 *   previews with and without text and with the text-safe space; regenerate keeps the characters; Send to Product
 *   Studio assembles the 8.5 × 11 book with editable titles and Scripture, and its print output carries every
 *   illustration. Phone widths too. Set SHOTS_DIR for screenshots.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
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
/** Open a scene in the review (scene 1 opens by default). */
async function openScene(page: Page, i: number) {
  const card = page.locator(`[data-scene-review="${i}"]`);
  const btn = card.getByRole("button", { name: "Open scene" });
  if (await btn.count()) await btn.click();
  await card.getByRole("button", { name: "Close" }).waitFor();
}

async function context(viewport = { width: 1280, height: 1000 }, phone = false): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport, isMobile: phone, hasTouch: phone, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, async (route) => route.fulfill({ response: await route.fetch() }).catch(() => route.abort()));
  await ctx.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  return ctx;
}

/** A PNG drawn by the browser: line art (black outlines on white) of the given size. */
async function png(page: Page, w: number, h: number, name: string, color = "#000") {
  const b64 = await page.evaluate(
    async ({ w, h, color }) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const x = c.getContext("2d")!;
      x.fillStyle = "#fff";
      x.fillRect(0, 0, w, h);
      x.strokeStyle = color;
      x.lineWidth = Math.max(3, w / 300);
      for (let i = 0; i < 3; i++) {
        x.beginPath();
        x.arc(w * (0.3 + i * 0.2), h * 0.35, w * 0.08, 0, 7);
        x.stroke();
        x.beginPath();
        x.moveTo(w * (0.3 + i * 0.2), h * 0.43);
        x.lineTo(w * (0.22 + i * 0.2), h * 0.75);
        x.lineTo(w * (0.38 + i * 0.2), h * 0.75);
        x.closePath();
        x.stroke();
      }
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
      let s = "";
      for (const v of new Uint8Array(await blob.arrayBuffer())) s += String.fromCharCode(v);
      return btoa(s);
    },
    { w, h, color },
  );
  return { name, mimeType: "image/png", buffer: Buffer.from(b64, "base64") };
}

const GIRLS = [
  { name: "Braids", age: "about 10", face: "heart-shaped face, freckles, almond eyes", hair: "long box braids, top half in a bun", hairAcc: "gold cuffs on several braids", body: "tallest, long arms and legs", clothes: "short-sleeved leotard and tulle tutu", acc: "small hoop earrings" },
  { name: "Curls", age: "about 9", face: "round face, freckles, wide smile", hair: "voluminous loose curls in a high ponytail", hairAcc: "bow headband", body: "medium height, slight build", clothes: "wrap cardigan over a leotard", acc: "none" },
  { name: "Bun", age: "about 9", face: "oval face, rosy cheeks, gentle smile", hair: "dark straight hair in a top bun with side wisps", hairAcc: "none", body: "petite, the smallest", clothes: "short-sleeved dance dress", acc: "none" },
];
const SCENES = [
  "Warm-up at the barre", "Lacing ballet shoes", "Practicing pliés", "Helping a friend up", "Costume fitting",
  "Praying before the recital", "Opening night", "The final bow", "Flowers for the dancers", "Celebration",
];

describe("Gracious Kids — Ballet Coloring Book", () => {
  it("cast, ten consistent scenes, approval in order, previews, and assembly into Product Studio", async () => {
    const ctx = await context();
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(server.resolvedUrls!.local[0]);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "Cover Studio" }).click();
    await page.getByRole("tab", { name: /Children’s Character/ }).click();
    await page.getByLabel("Collection name").fill("Gracious Kids — Ballet Coloring Book");

    // 3 Cast: none yet → design the cast first.
    await toStep(page, 3);
    await page.getByLabel("Who do you need?").fill("Three ballet friends, ages 9 to 11, with clearly different hair.");
    await page.getByRole("button", { name: "Copy cast-design prompt" }).click();
    await expect.poll(() => clipboard(page)).toContain("front, three-quarter, side and back views");
    // The registry: three ballerinas, each with a reference image.
    for (const g of GIRLS) {
      await page.getByRole("button", { name: "Add a character" }).click();
      await page.locator(".cast-card").last().getByLabel("Character name").fill(g.name);
      const set = (label: string, v: string) => page.getByLabel(`${g.name}: ${label}`).fill(v);
      await set("approximate age", g.age);
      await set("facial features", g.face);
      await set("hair texture and hairstyle", g.hair);
      await set("hair accessories", g.hairAcc);
      await set("body proportions", g.body);
      await set("signature clothing", g.clothes);
      await set("distinctive accessories", g.acc);
      await page.getByTestId(`ref-${g.name}`).setInputFiles(await png(page, 600, 900, `${g.name.toLowerCase()}-reference.png`));
      await expect.poll(() => page.locator(`[data-cast="${g.name}"] .cast-thumb img`).count()).toBe(1);
    }
    await page.getByRole("checkbox", { name: "Lock established characters" }).check();
    expect(await page.getByLabel("Braids: facial features").isDisabled()).toBe(true);
    expect(await page.getByRole("button", { name: "Add a character" }).count()).toBe(0);
    expect(await page.getByRole("checkbox", { name: "Use saved character references" }).isChecked()).toBe(true);
    await shot(page, "gk-cast");

    // 4 Scenes: ten, split; scene 1 gets its page title and Scripture reference (typeset by Product Studio).
    await toStep(page, 4);
    await page.getByLabel("Scenes text").fill(SCENES.map((t, i) => `${i + 1}. ${t}\nThe three girls: ${t.toLowerCase()}.`).join("\n\n"));
    await page.getByRole("button", { name: "Split into scenes" }).click();
    expect(await page.locator("[data-scene]").count()).toBe(10);
    await page.locator('[data-scene="1"] summary', { hasText: "Page text" }).click();
    await page.getByLabel("Scene 1 Scripture reference").fill("Proverbs 31:25");
    await page.getByLabel("Audience").fill("girls ages 8–12");

    // 5 Layout: the coloring book page preset; typography only for assembly.
    await toStep(page, 5);
    await page.getByRole("button", { name: /^Coloring book page: 8\.5 × 11 in/ }).click();
    expect(await page.getByRole("checkbox", { name: "Print each picture on its own sheet (blank backs)" }).isChecked()).toBe(true);
    expect(await page.locator(".cover-step").innerText()).toMatch(/10 scenes make 20 pages\. Perfect binding and KDP need at least 24/);
    await page.getByLabel("Binding", { exact: true }).selectOption("Spiral / coil");
    expect(await page.getByLabel("Title font").count()).toBe(1);
    expect(await page.getByRole("group", { name: "Who adds the Scripture" }).getByRole("button", { name: "Product Studio (editable text)" }).getAttribute("aria-pressed")).toBe("true");

    // 6 Review: every scene prompt reuses the same three girls, black and white, no text or containers.
    await toStep(page, 6);
    const prompts: string[] = [];
    for (let i = 1; i <= 10; i++) {
      await page.getByTestId(`copy-scene-${i}`).click();
      await expect.poll(() => clipboard(page)).toContain(`Scene ${i} of 10: ${SCENES[i - 1]}.`);
      prompts.push(await clipboard(page));
    }
    for (const p of prompts) {
      for (const g of GIRLS) for (const f of [`. ${g.name}: Age`, g.face, g.hair, g.clothes]) expect(p).toContain(f);
      expect(p).toContain("Reuse the exact established characters from this collection.");
      expect(p).toContain("Attached reference images (use them as the visual identity anchors): braids-reference.png, curls-reference.png, bun-reference.png.");
      expect(p).toContain("Do not include text, lettering, words, numbers, title banners, scripture boxes, frames, borders, ribbons intended for text, or decorative text containers.");
      expect(p).toContain("Pure white background. Bold, clean black outlines.");
      expect(p).toContain("Audience: girls ages 8–12");
      expect(p).toContain("2550 × 3300");
      expect(p).not.toMatch(/#[0-9A-F]{6}|empty band|title field|No saved characters|Proverbs 31:25/i);
    }

    // Scene 1: references reach the image generator as image files (copied to the clipboard as a PNG).
    const s1 = page.locator('[data-scene-review="1"]');
    await openScene(page, 1);
    await s1.getByTestId("copy-ref-Braids").click();
    await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.read()).flatMap((i) => i.types))).toContain("image/png");
    // Scene 2 waits for scene 1's approval.
    await openScene(page, 2);
    expect(await page.locator('[data-scene-review="2"]').innerText()).toMatch(/Approve scene 1 before this one/);
    await openScene(page, 1);

    // Scene 1's illustration at the page canvas size: fills the page; previews; text-safe space; consistency check.
    await page.getByTestId("illustration-upload-1").setInputFiles(await png(page, 2550, 3300, "scene-01.png"));
    await expect.poll(() => page.getByTestId("illustration-size-1").innerText()).toMatch(/2550 × 3300 px\. The page canvas exactly/);
    const prev = s1.getByTestId("assembled-preview");
    await expect.poll(() => prev.locator('[data-art="background"] image').count(), { timeout: 15000 }).toBe(1);
    expect(await prev.locator(".ps-text", { hasText: "Warm-up at the barre" }).count()).toBe(1);
    expect(await prev.locator(".ps-text", { hasText: "Proverbs 31:25 (NIV)" }).count()).toBe(1);
    expect(await prev.locator(".safe-text").count()).toBeGreaterThanOrEqual(2);
    expect(await prev.locator(".safe-gutter").count()).toBe(1);
    await s1.getByRole("button", { name: "Artwork without text" }).click();
    expect(await prev.locator(".ps-text").first().evaluate((e) => getComputedStyle(e).visibility)).toBe("hidden");
    await s1.getByRole("checkbox", { name: "Show text-safe space" }).uncheck();
    expect(await prev.locator(".safe-text").count()).toBe(0);
    await s1.getByRole("button", { name: "Assembled page with text" }).click();
    await shot(page, "gk-scene1-review");
    const approve = s1.getByRole("button", { name: "Approve scene and continue" });
    expect(await approve.isDisabled()).toBe(true);
    for (const c of await s1.locator(".consistency input[type=checkbox]").all()) await c.check();
    await approve.click();
    await expect.poll(() => s1.innerText()).toMatch(/Approved/);

    // Scene 2: a square image is fitted whole into the illustration area; regenerate keeps the characters.
    const s2 = page.locator('[data-scene-review="2"]');
    await page.getByTestId("illustration-upload-2").setInputFiles(await png(page, 1024, 1024, "scene-02.png"));
    await expect.poll(() => page.getByTestId("illustration-size-2").innerText()).toMatch(/Not the 2550 × 3300 page canvas: it is placed whole and in proportion inside the illustration area/);
    expect(await page.getByTestId("illustration-size-2").innerText()).toMatch(/pixels per inch/);
    await s2.locator("summary", { hasText: "Regenerate this scene" }).click();
    await s2.getByLabel("What was wrong").fill("Curls' bow headband was missing");
    await s2.getByRole("button", { name: "Copy regeneration prompt" }).click();
    await expect.poll(() => clipboard(page)).toContain("REGENERATION (attempt 2): the previous image was not approved because: Curls' bow headband was missing.");
    expect(await clipboard(page)).toContain("Reuse the exact established characters from this collection.");
    expect(await page.getByTestId("illustration-upload-2").count()).toBe(1); // the rejected image was cleared; upload again

    // Scenes 2–10: add the regenerated illustrations and approve each in order.
    for (let i = 2; i <= 10; i++) {
      const card = page.locator(`[data-scene-review="${i}"]`);
      if (!(await card.getByTestId(`illustration-upload-${i}`).count())) await openScene(page, i);
      await page.getByTestId(`illustration-upload-${i}`).setInputFiles(await png(page, 2550, 3300, `scene-${String(i).padStart(2, "0")}.png`));
      await expect.poll(() => card.locator(".consistency input[type=checkbox]").count()).toBe(7);
      for (const c of await card.locator(".consistency input[type=checkbox]").all()) await c.check();
      await card.getByRole("button", { name: "Approve scene and continue" }).click();
      await expect.poll(() => card.locator(".scene-card__head").innerText()).toMatch(/Approved/);
    }
    await page.waitForTimeout(600);

    // Reload: the registry lock, references, approvals and illustrations are all kept.
    await page.reload();
    await page.getByRole("button", { name: "Cover Studio" }).click();
    expect(await page.locator(".steps__title").innerText()).toBe("Review and copy");
    expect(await page.getByTestId("assemble").innerText()).toMatch(/10 of 10 scenes approved/);

    // Send to Product Studio: the assembled book opens in the editor; its print output carries every illustration.
    await page.getByRole("button", { name: "Send to Product Studio" }).click();
    await page.waitForSelector(".ps-page--editor");
    expect(await page.getByLabel("Project name").inputValue()).toBe("Gracious Kids — Ballet Coloring Book");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.evaluate(() => {
      window.print = () => {};
    });
    await page.getByRole("dialog", { name: "Export" }).getByRole("button", { name: "Print / Save PDF", exact: true }).click();
    await page.waitForSelector("#print-root .ps-print-sheet", { state: "attached", timeout: 60000 });
    const sheets = await page.locator("#print-root .ps-page--print").evaluateAll((els) =>
      els.map((e) => ({ w: (e as HTMLElement).style.width, h: (e as HTMLElement).style.height, art: e.querySelectorAll('[data-art="background"] image').length, text: e.textContent })),
    );
    const withArt = sheets.filter((s) => s.art === 1);
    expect(withArt).toHaveLength(10);
    expect(sheets).toHaveLength(20); // each picture on its own sheet: a blank back after every scene
    for (const s of sheets) expect([s.w, s.h]).toEqual(["8.5in", "11in"]);
    SCENES.forEach((t) => expect(withArt.some((s) => s.text?.includes(t))).toBe(true));
    expect(sheets.some((s) => s.text?.includes("Proverbs 31:25 (NIV)"))).toBe(true);
    expect(errors).toEqual([]);
    await ctx.close();
  }, 240_000);

  it("on a phone: cast lock, references, scene review and previews fit with 44px touch targets", async () => {
    const ctx = await context({ width: 390, height: 844 }, true);
    const page = await ctx.newPage();
    await page.goto(server.resolvedUrls!.local[0]);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "Cover Studio" }).click();
    await page.getByRole("tab", { name: /Children’s Character/ }).click();
    await toStep(page, 3);
    await page.getByRole("button", { name: "Add a character" }).click();
    await page.getByTestId("ref-Character 1").setInputFiles(await png(page, 600, 900, "c1.png"));
    await toStep(page, 4);
    await page.getByLabel("Scenes text").fill("1. Warm-up\nAt the barre.\n\n2. Bow\nOn stage.");
    await page.getByRole("button", { name: "Split into scenes" }).click();
    await toStep(page, 6);
    await openScene(page, 1);
    await page.getByTestId("illustration-upload-1").setInputFiles(await png(page, 1275, 1650, "half.png"));
    await page.getByTestId("assembled-preview").waitFor();
    for (const n of [3, 6]) {
      await toStep(page, n);
      if (n === 6) await page.getByTestId("assembled-preview").waitFor();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `step ${n}`).toBeLessThanOrEqual(0);
      const small = await page.locator(".cast-card .btn, .cast-switches input, .scene-review .btn, .scene-review .segmented button, .steps__nav .btn").evaluateAll((els) =>
        els.filter((e) => (e as HTMLElement).offsetParent && e.getBoundingClientRect().height < 44 && (e as HTMLInputElement).type !== "checkbox").map((e) => e.textContent),
      );
      expect(small, `step ${n}`).toEqual([]);
    }
    await ctx.close();
  }, 90_000);
});
