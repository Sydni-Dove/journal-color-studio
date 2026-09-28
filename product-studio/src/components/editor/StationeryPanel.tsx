/**
 * PAGE SECTIONS — a catalog recipe's content: its title, optional fixed rows
 * (the date line) and its prompts, edited with the shared prompt editor
 * (PromptEditor: number of prompts, wording, writing lines, answer area).
 * No raw measurements: the layout engine turns these choices into a page that
 * fits the trim, continuing on another page rather than cramping the writing.
 */
import type { ProjectUsage } from "../../engines/document/usage";
import { solvePage, type ResolvedDocument } from "../../engines/document/resolve";
import { getStationeryRecipe, stationeryLayoutId } from "../../presets/stationery/catalog";
import { recipePromptSet, variantStructure } from "../../layouts/stationery/stationeryLayout";
import type { ProductProject } from "../../types/project";
import type { StationeryCustomization, StationeryRecipe } from "../../types/stationery";
import { Field, Section } from "./ui";
import { TechnicalDetails } from "../help/visuals";
import { PromptEditor, type PromptFit } from "./PromptEditor";
import { sectionLineCounts, sectionPages } from "../../layouts/shared/promptPages";

type Update = (fn: (p: ProductProject) => ProductProject) => void;

/** How a recipe's prompts fit in this product: pages each time, and a plain message when they can't. */
function recipeFit(doc: ResolvedDocument | null, comboId: string): PromptFit | undefined {
  if (!doc) return undefined;
  const i = doc.recipe.pages.findIndex((p) => p.layoutId === stationeryLayoutId(comboId));
  if (i < 0) return undefined;
  const pages = doc.recipe.pages[i].flowCount ?? 1;
  const solved = [...Array(pages).keys()].map((k) => solvePage(doc, i + k));
  const problem = solved.flatMap((s) => s.diagnostics).find((d) => d.rule === "prompt-fit")?.message;
  return { pages, problem, lines: sectionLineCounts(solved, "st"), pageOf: sectionPages(solved, "st") };
}

function RecipeSections({ recipe, custom, set, fit }: { recipe: StationeryRecipe; custom: StationeryCustomization; set: (c: StationeryCustomization) => void; fit?: PromptFit }) {
  const can = recipe.customization;
  const hidden = new Set(custom.hidden ?? []);
  return (
    <div className="stationery-recipe" data-recipe={recipe.comboId}>
      <p className="hint">
        <strong>{recipe.label}</strong> — {recipe.description} Margins, section sizes and writing lines are worked out for this page size.
      </p>
      {can.rename && recipe.pages[0].title && (
        <Field label="Page title">
          <input type="text" value={custom.title ?? custom.rename?.page0 ?? recipe.pages[0].title} onChange={(e) => set({ ...custom, title: e.target.value })} />
        </Field>
      )}
      {recipe.pages.map((page, pi) => {
        const fixedOptional = page.zones.filter((z) => z.surface === "fill-in" && z.optional);
        const writing = page.zones.some((z) => z.surface !== "fill-in" && z.surface !== "table");
        const promptSet = recipePromptSet(recipe, pi, custom);
        return (
          <div key={pi} className="stationery-page" data-page={pi}>
            {recipe.pages.length > 1 && <p className="field-label">{pi === 0 ? "Left page" : "Right page"}</p>}
            {fixedOptional.map((z) => (
              <label key={z.key} className="check" data-section={z.key}>
                <input type="checkbox" checked={!hidden.has(z.key)} onChange={(e) => set({ ...custom, hidden: e.target.checked ? (custom.hidden ?? []).filter((k) => k !== z.key) : [...(custom.hidden ?? []), z.key] })} />
                <span>{z.fields?.length ? `${z.fields.join(" / ")} line` : z.label}</span>
              </label>
            ))}
            {page.zones.some((z) => z.surface === "table") && <p className="hint">The table's columns come from its design and fit the page automatically.</p>}
            {writing && (
              <PromptEditor
                set={promptSet}
                onChange={(next) => {
                  const pages = [...(custom.promptPages ?? [])];
                  pages[pi] = next;
                  set({ ...custom, promptPages: pages });
                }}
                allowInstructions={recipe.family === "worksheet" && pi === 0}
                fit={recipe.pages.length === 1 ? fit : undefined}
              />
            )}
            {custom.promptPages?.[pi] && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  const pages = [...(custom.promptPages ?? [])];
                  pages[pi] = undefined;
                  set({ ...custom, promptPages: pages });
                }}
              >
                Go back to the original prompts
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function StationeryPanel({ project, update, usage, doc }: { project: ProductProject; update: Update; usage: ProjectUsage; doc: ResolvedDocument | null }) {
  const recipes = usage.layouts.map((l) => (l.layout.id.startsWith("stationery:") ? getStationeryRecipe(l.layout.id.slice("stationery:".length)) : undefined)).filter((r): r is StationeryRecipe => !!r);
  if (!recipes.length) return null;
  const all = project.layoutOptions.stationery ?? {};
  const setFor = (comboId: string) => (c: StationeryCustomization) =>
    update((p) => ({ ...p, layoutOptions: { ...p.layoutOptions, stationery: { ...(p.layoutOptions.stationery ?? {}), [comboId]: c } } }));
  const fits = new Map(usage.layouts.map((l) => [l.layout.id, l.fit]));
  return (
    <Section title="Page sections" open>
      {recipes.map((r) => {
        const fit = fits.get(`stationery:${r.comboId}`);
        // Size-aware version in use (e.g. Compact Daily Reflection on small trims): say so, and show its sections only.
        const v = fit?.ok ? r.sizeVariants?.find((x) => x.id === fit.variant) : undefined;
        const left = v ? v.omit.map((k) => r.pages.flatMap((p) => p.zones).find((z) => z.key === k)?.label ?? k) : [];
        return (
          <div key={r.comboId}>
            {fit && !fit.ok && (
              <div className="issue issue--error">
                <div className="issue-title">This page doesn't have enough room at this size.</div>
                <div className="issue-advice">Choose a larger page size, use fewer prompts, or use fewer writing lines.</div>
                <TechnicalDetails label="Show details">{fit.reason}</TechnicalDetails>
              </div>
            )}
            {v && (
              <div className="issue issue--info" data-testid="size-variant-notice">
                <strong>Using the {v.label}.</strong> The full {r.label} page is not available at this size: with every section it would not leave enough room to write. The compact version keeps the most important sections and leaves out {left.join(" and ")}.
              </div>
            )}
            <RecipeSections recipe={v ? variantStructure(r, v) : r} custom={all[r.comboId] ?? {}} set={setFor(r.comboId)} fit={recipeFit(doc, r.comboId)} />
          </div>
        );
      })}
    </Section>
  );
}
