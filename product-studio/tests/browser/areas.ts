/**
 * Editor areas (Pages, Your content, Page layout, Writing, Add to page, Artwork, Style, Page setup, Print & export,
 * Advanced), grouped in the editor's four steps: 1 Product setup, 2 Pages and content, 3 Artwork and style,
 * 4 Preview and export.
 */
import type { Page } from "playwright-core";

export type Area = "pages" | "data" | "layout" | "writing" | "add" | "artwork" | "style" | "setup" | "print" | "advanced";
const STEP_OF: Record<Area, number> = { setup: 1, pages: 2, data: 2, layout: 2, writing: 2, add: 2, artwork: 3, style: 3, print: 4, advanced: 4 };

/** Open one step (1–4) of the editor. */
export async function openStep(page: Page, n: number): Promise<void> {
  await page.locator(".steps__dot").nth(n - 1).click();
  await page.locator(`.steps__item--current .steps__dot`).filter({ hasText: String(n) }).waitFor();
}

/** Open one area of the editor's settings (its step, then the area from the step's list). */
export async function openArea(page: Page, area: Area): Promise<void> {
  const open = page.locator(`section.area[data-area="${area}"]`);
  if (await open.count()) return;
  const step = STEP_OF[area];
  if (!(await page.locator(`.steps__item--current .steps__dot`).filter({ hasText: String(step) }).count())) await openStep(page, step);
  if (await open.count()) return;
  const back = page.locator("section.area .area__back");
  if (await back.count()) await back.click();
  const link = page.locator(`.area-link[data-area="${area}"]`);
  await link.waitFor();
  await link.click();
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
