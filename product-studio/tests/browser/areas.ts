/** Editor areas (Pages, Page layout, Writing, Add to page, Style, Page setup, Print & export, Advanced). */
import type { Page } from "playwright-core";

export type Area = "pages" | "layout" | "writing" | "add" | "style" | "setup" | "print" | "advanced";

/** Open one area of the editor's settings (from the list, or from another open area). */
export async function openArea(page: Page, area: Area): Promise<void> {
  const open = page.locator(`section.area[data-area="${area}"]`);
  if (await open.count()) return;
  const back = page.getByRole("button", { name: "‹ All settings" });
  if (await back.count()) await back.click();
  await page.locator(`.area-link[data-area="${area}"]`).click();
  await open.waitFor();
}

/** A settings section (details.section) by its title, opened. */
export async function openSection(page: Page, title: RegExp) {
  const s = page.locator("details.section", { has: page.locator(":scope > summary", { hasText: title }) }).first();
  if ((await s.getAttribute("open")) === null) await s.locator(":scope > summary").click();
  return s;
}

/** Pages → Order & repeats: the detailed page order, opened. */
export async function openOrder(page: Page) {
  await openArea(page, "pages");
  return openSection(page, /^Order & repeats/);
}

/** Advanced → Book outline: the generated pages as text rows, opened. */
export async function openOutline(page: Page) {
  await openArea(page, "advanced");
  return openSection(page, /^Book outline/);
}
