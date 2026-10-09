import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";
import { preview, type PreviewServer } from "vite";
import { existsSync, readFileSync } from "node:fs";

let server: PreviewServer;
let browser: Browser;
beforeAll(async () => {
  server = await preview({ preview: { port: 0, host: "127.0.0.1" }, logLevel: "silent" });
  browser = await chromium.launch({ executablePath: (import.meta.env.CHROMIUM_PATH as string | undefined) || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
}, 60_000);
afterAll(async () => { await browser?.close(); await new Promise<void>((r) => server?.httpServer.close(() => r())); });

describe("AI document review", () => {
  it("accepts a description, edits the proposed outline, and opens an editable product", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.addInitScript(() => { window.print = () => {}; });
    await page.route("**/functions/v1/generate-document", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ proposal: { title: "Inventory Notebook", kind: "inventory", pages: [{ id: "one", title: "Inventory", copies: 1, components: [{ id: "h", kind: "heading", text: "Stock Items", level: "heading" }, { id: "q", kind: "question", label: "Notes", response: "ruled", space: { mode: "fixed", lines: 4 } }] }] } }) }));
    await page.goto(server.resolvedUrls!.local[0]);
    const fontDir = process.env.TEST_FONT_DIR ?? "/Users/Sydharmony/Library/Fonts";
    const fontFiles = ["Lato-Regular.ttf", "PlayfairDisplay-VariableFont_wght.ttf"].map((name) => `${fontDir}/${name}`);
    const localFonts = fontFiles.every(existsSync);
    if (localFonts) {
      const lato = readFileSync(fontFiles[0]).toString("base64");
      const playfair = readFileSync(fontFiles[1]).toString("base64");
      await page.addStyleTag({ content: `@font-face{font-family:Lato;src:url(data:font/ttf;base64,${lato})}@font-face{font-family:"Playfair Display";src:url(data:font/ttf;base64,${playfair})}` });
    }
    await page.getByRole("button", { name: "Generate with AI" }).click();
    await page.getByLabel("What should this document do?").fill("Make an inventory notebook for my supplies.");
    await page.getByLabel("Your existing wording or notes (optional)").fill("Keep this exact wording.");
    await page.getByRole("button", { name: "Generate outline" }).click();
    await page.getByLabel("Product title").fill("My Inventory Notebook");
    await page.getByLabel("Page 1 title").fill("Stock Ledger");
    await page.getByRole("button", { name: "Create editable product" }).click();
    const saved = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("dove-product-studio:v1:project:")).map((k) => JSON.parse(localStorage.getItem(k)!)));
    expect(saved[0].name).toBe("My Inventory Notebook");
    expect(saved[0].data.collections[0].records[0].values.text).toBe("Keep this exact wording.");
    expect(await page.getByRole("button", { name: "Export" }).count()).toBeGreaterThan(0);
    if (localFonts) {
      await page.getByRole("button", { name: "Export" }).click();
      await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Print / Save PDF" && !b.disabled), undefined, { timeout: 10000 });
      await page.getByRole("button", { name: "Print / Save PDF", exact: true }).click();
      await page.locator("#print-root .ps-print-sheet").waitFor({ state: "attached", timeout: 5000 });
      await page.pdf({ path: "/private/tmp/product-studio-phase8-sample.pdf", preferCSSPageSize: true, printBackground: true });
    }
    await page.close();
  });
});
