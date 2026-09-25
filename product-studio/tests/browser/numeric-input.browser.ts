/**
 * Real-keystroke numeric editing (npm run test:mobile builds first).
 * Backspace / Delete behave normally: a field can be emptied while typing and
 * the number is committed on Enter / blur, then validated.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Locator, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { TEST_PRODUCTS } from "../../src/presets/products/testProducts";
import type { ProductProject } from "../../src/types/project";

const journal = (): ProductProject => {
  const p = TEST_PRODUCTS[1].build();
  p.name = "N Journal";
  p.decorativeTheme = { ...p.decorativeTheme, style: "marble", assetId: "jcs-marble-goldleaf", placement: "border-frame" };
  return p;
};
const weekly = (): ProductProject => {
  const p = TEST_PRODUCTS[3].build();
  p.name = "N Weekly";
  return p;
};

let server: PreviewServer;
let browser: Browser;
let base: string;
let page: Page;

beforeAll(async () => {
  server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
  base = server.resolvedUrls!.local[0];
  browser = await chromium.launch({ executablePath: (import.meta.env.CHROMIUM_PATH as string | undefined) || undefined });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => server?.httpServer.close(() => r()));
});

async function open(product: ProductProject) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  page = await ctx.newPage();
  await page.goto(base);
  await page.evaluate((p) => {
    localStorage.setItem(`dove-product-studio:v1:project:${p.id}`, JSON.stringify(p));
    localStorage.setItem("dove-product-studio:v1:index", JSON.stringify([{ id: p.id, name: p.name, productType: p.productType, sizePresetId: p.dimensions.sizePresetId, updatedAt: p.updatedAt, variantCount: 0 }]));
  }, product);
  await page.goto(base);
  await page.locator(".card", { hasText: product.name }).first().getByRole("button", { name: "Open" }).click();
  await page.waitForSelector(".ps-page--editor");
  await page.evaluate(() => document.querySelectorAll("aside details").forEach((d) => ((d as HTMLDetailsElement).open = true)));
}

/** Put the caret at the end of the field's current text (like tapping after the last digit). */
async function caretToEnd(field: Locator) {
  await field.click();
  await field.press("End");
}

/** 33 → Backspace → Backspace → 120, checking every intermediate state. */
async function replace33with120(field: Locator, commit: "Enter" | "Tab") {
  await field.click();
  await field.fill("33");
  await field.press(commit);
  await expect.poll(() => field.inputValue()).toBe("33");
  await caretToEnd(field);
  await field.press("Backspace");
  expect(await field.inputValue()).toBe("3");
  await field.press("Backspace");
  expect(await field.inputValue()).toBe(""); // the last digit deletes
  await field.pressSequentially("120");
  expect(await field.inputValue()).toBe("120");
  await field.press(commit);
}

describe("numeric fields edit naturally (real keystrokes)", () => {
  it("page navigation: 33 → ⌫ ⌫ → 120 goes to page 120", async () => {
    await open(journal());
    const field = page.getByLabel("Page number", { exact: true });
    await replace33with120(field, "Enter");
    await expect.poll(() => field.inputValue()).toBe("120");
    await expect.poll(() => page.locator(".preview-caption").innerText()).toContain("p.120");
    await page.context().close();
  }, 60_000);

  it("page count (Copies): 33 → ⌫ ⌫ → 120 commits 120 pages", async () => {
    await open(journal());
    const field = page.getByLabel("Copies", { exact: true });
    await replace33with120(field, "Tab");
    await expect.poll(() => field.inputValue()).toBe("120");
    await expect.poll(() => page.locator(".page-counter").innerText()).toContain("of 120");
    await page.context().close();
  }, 60_000);

  it("sections per day: 3 → ⌫ → 2 commits and re-solves the spread", async () => {
    await open(weekly());
    await page.getByRole("button", { name: "Next page" }).click();
    const before = await page.locator(".ps-page--editor").first().innerHTML();
    const field = page.getByLabel("Sections per day", { exact: true });
    await caretToEnd(field);
    await field.press("Backspace");
    expect(await field.inputValue()).toBe("");
    await field.pressSequentially("2");
    await field.press("Enter");
    await expect.poll(() => field.inputValue()).toBe("2");
    await expect.poll(() => page.locator(".ps-page--editor").first().innerHTML()).not.toBe(before);
    await page.context().close();
  }, 60_000);

  it("decoration opacity: 1 → ⌫ → '' → '.5' commits 0.5", async () => {
    await open(journal());
    const field = page.locator("details", { has: page.locator("summary", { hasText: /^Decoration$/ }) }).getByLabel("Opacity", { exact: true });
    await caretToEnd(field);
    await field.press("Backspace");
    expect(await field.inputValue()).toBe("");
    await field.pressSequentially(".5");
    expect(await field.inputValue()).toBe(".5"); // partial state kept while typing
    await field.press("Enter");
    await expect.poll(() => field.inputValue()).toBe("0.5");
    await page.context().close();
  }, 60_000);

  it("text offset: '-' is a valid in-between state; '-0.25' commits", async () => {
    await open(weekly());
    const field = page.getByLabel("Offset X (in)").first();
    await caretToEnd(field);
    await field.press("Backspace");
    await field.pressSequentially("-");
    expect(await field.inputValue()).toBe("-");
    await field.pressSequentially("0.25");
    await field.press("Enter");
    await expect.poll(() => field.inputValue()).toBe("-0.25");
    await page.context().close();
  }, 60_000);

  it("margins: blank means studio default (allowed); a value commits on blur", async () => {
    await open(journal());
    const top = page.getByLabel("top", { exact: true });
    await top.click();
    await top.pressSequentially("0.9");
    await top.press("Tab");
    await expect.poll(() => top.inputValue()).toBe("0.9");
    await caretToEnd(top);
    for (let i = 0; i < 3; i++) await top.press("Backspace");
    expect(await top.inputValue()).toBe("");
    await top.press("Tab");
    await expect.poll(() => top.inputValue()).toBe("");
    await page.context().close();
  }, 60_000);

  it("invalid commit (empty required field) is reported and reverts; Escape cancels", async () => {
    await open(journal());
    const field = page.getByLabel("Copies", { exact: true });
    const original = await field.inputValue();
    await caretToEnd(field);
    for (let i = 0; i < original.length; i++) await field.press("Backspace");
    await field.press("Enter");
    await expect.poll(() => page.locator(".field-msg--error").first().innerText()).toMatch(/Enter a number/);
    // Announced as the input's description, and it does not rename the field.
    expect(await field.getAttribute("aria-invalid")).toBe("true");
    const described = await field.getAttribute("aria-describedby");
    expect(await page.locator(`[id="${described}"]`).innerText()).toMatch(/Enter a number/);
    await expect.poll(() => field.inputValue()).toBe(original);
    await caretToEnd(field);
    await field.pressSequentially("9");
    await field.press("Escape");
    await expect.poll(() => field.inputValue()).toBe(original);
    await page.context().close();
  }, 60_000);
});
