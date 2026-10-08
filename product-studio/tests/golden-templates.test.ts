/**
 * REFERENCE SNAPSHOTS — what every existing template prints today.
 *
 * Guards the universal document foundation: refactors underneath the page
 * builder, the layouts or the content model must leave these unchanged. Each
 * template is built at three trims and every page is solved; the snapshot
 * records the page plan (layout, side, filler, continuation part) and a
 * fingerprint of each page's solved nodes and diagnostics, in groups of 25
 * pages so a change points at the pages that moved.
 *
 * A deliberate output change updates the snapshot in the same commit
 * (`npx vitest run tests/golden-templates.test.ts -u`) and says why.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resolveDocument, solvePage } from "../src/engines/document/resolve";
import { RECIPE_PRESETS } from "../src/presets/layouts/recipePresets";
import { createProject } from "../src/presets/products/projectFactory";
import { applyDesignPreset, DESIGN_PRESETS } from "../src/presets/designPresets";
import type { ProductProject } from "../src/types/project";

const SIZES = ["8.5x11", "7x9", "5.5x8.5"];
const YEAR = 2027;
const GROUP = 25;

/** Generated ids carry digits (s-1ab2, p…timestamp); fixed ids such as "page" are left as they are. */
const isGenerated = (id: string) => id.length >= 4 && /\d/.test(id);
/** Every generated id in a recipe (book steps and sections, prompt sections…): random on each build. */
function generatedIds(x: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(x)) x.forEach((v) => generatedIds(v, out));
  else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) k === "id" && typeof v === "string" ? isGenerated(v) && out.add(v) : generatedIds(v, out);
  return out;
}
/** Those ids numbered in order of appearance, so the fingerprint depends only on what prints. */
function stableJson(x: unknown, ids: Set<string>): string {
  const json = JSON.stringify(x);
  if (!ids.size) return json;
  const seen = new Map<string, number>();
  const pattern = new RegExp([...ids].sort((a, b) => b.length - a.length).map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  return json.replace(pattern, (id) => `#${seen.get(id) ?? (seen.set(id, seen.size), seen.size - 1)}`);
}
const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12);

function project(presetId: string, size: string): ProductProject {
  const r = RECIPE_PRESETS.find((x) => x.id === presetId)!;
  return createProject(r.productTypes[0], {
    name: `Reference ${presetId}`,
    dimensions: { sizePresetId: size, orientation: "portrait" },
    recipe: r.build({ count: 1, sheets: 1 }),
    calendar: r.needsCalendar ? { startDate: `${YEAR}-01-01`, endDate: `${YEAR}-12-31`, weekStart: 1, sixRowMonths: true } : undefined,
    layoutOptions: r.layoutOptions,
  });
}

/** The page plan and per-group fingerprints of everything the product prints. */
function fingerprint(p: ProductProject) {
  const doc = resolveDocument(p);
  const ids = generatedIds(p.recipe);
  const pages = doc.recipe.pages;
  const plan = pages.map((pg) => [pg.layoutId, pg.side, pg.filler ? "filler" : "", pg.flowPart ?? "", pg.flowCount ?? ""].join("|"));
  const groups: string[] = [];
  for (let start = 0; start < pages.length; start += GROUP) {
    const solved = pages.slice(start, start + GROUP).map((_, k) => {
      const s = solvePage(doc, start + k);
      return { nodes: s.nodes, diagnostics: s.diagnostics, ownArtwork: s.ownArtwork ?? false };
    });
    groups.push(`${start + 1}-${Math.min(pages.length, start + GROUP)}:${hash(stableJson(solved, ids))}`);
  }
  return { pageCount: pages.length, plan: hash(stableJson(plan, ids)), recipeDiagnostics: doc.recipe.diagnostics.map((d) => `${d.severity}:${d.message}`), groups };
}

describe("existing templates print exactly as before", () => {
  for (const r of RECIPE_PRESETS) {
    for (const size of SIZES) {
      it(`${r.id} @ ${size}`, () => {
        expect(fingerprint(project(r.id, size))).toMatchSnapshot();
      });
    }
  }
  // Design presets restyle a whole product (palette, fonts, decoration): one book through each.
  const book = RECIPE_PRESETS.find((r) => r.template)!;
  for (const d of DESIGN_PRESETS) {
    it(`design preset ${d.id} on ${book.id} @ 7x9`, () => {
      expect(fingerprint(applyDesignPreset(project(book.id, "7x9"), d))).toMatchSnapshot();
    });
  }
});
