/**
 * STATIONERY SECTIONS — semantic customization of a catalog recipe:
 * rename, remove optional sections, reorder, and give a section Less / Standard
 * / More space (or make every section equal). No raw measurements: the
 * geometry layer turns these choices into valid dimensions for the trim, and
 * a choice that cannot fit is reported, never squeezed.
 */
import type { ProjectUsage } from "../../engines/document/usage";
import { effectiveZones } from "../../engines/stationery/geometry";
import { getStationeryRecipe } from "../../presets/stationery/catalog";
import { variantStructure } from "../../layouts/stationery/stationeryLayout";
import type { ProductProject } from "../../types/project";
import type { SectionSpace, StationeryCustomization, StationeryRecipe } from "../../types/stationery";
import { Field, Section, Segmented } from "./ui";
import { TechnicalDetails } from "../help/visuals";

type Update = (fn: (p: ProductProject) => ProductProject) => void;

const SPACE: { value: SectionSpace; label: string }[] = [
  { value: "less", label: "Less" },
  { value: "standard", label: "Standard" },
  { value: "more", label: "More" },
];

function RecipeSections({ recipe, custom, set }: { recipe: StationeryRecipe; custom: StationeryCustomization; set: (c: StationeryCustomization) => void }) {
  const can = recipe.customization;
  return (
    <div className="stationery-recipe" data-recipe={recipe.comboId}>
      <p className="hint">
        <strong>{recipe.label}</strong> — {recipe.description} Margins, section sizes and writing lines are worked out for this page size.
      </p>
      {can.adjustSpace && (
        <Segmented
          label="Section space"
          value={custom.balance ?? "recipe"}
          options={[{ value: "recipe", label: "As designed" }, { value: "equal", label: "Equal sections" }]}
          onChange={(balance) => set({ ...custom, balance: balance === "recipe" ? undefined : balance })}
        />
      )}
      {recipe.pages.map((page, pi) => {
        const shown = effectiveZones(page, pi, custom);
        const flow = shown.filter((z) => z.surface !== "fill-in").map((z) => z.key);
        const move = (key: string, d: -1 | 1) => {
          const order = [...flow];
          const i = order.indexOf(key), j = i + d;
          if (j < 0 || j >= order.length) return;
          [order[i], order[j]] = [order[j], order[i]];
          const all = [...(custom.order ?? [])];
          all[pi] = order;
          set({ ...custom, order: all });
        };
        return (
          <div key={pi} className="stationery-page">
            {recipe.pages.length > 1 && <p className="hint">{pi === 0 ? "Left page" : "Right page"}</p>}
            {page.zones.map((z) => {
              const hidden = !!z.optional && (custom.hidden ?? []).includes(z.key);
              const writing = z.surface !== "fill-in";
              const i = flow.indexOf(z.key);
              return (
                <div key={z.key} className="stationery-section" data-section={z.key}>
                  <div className="row">
                    {z.optional ? (
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={!hidden}
                          onChange={(e) => set({ ...custom, hidden: e.target.checked ? (custom.hidden ?? []).filter((k) => k !== z.key) : [...(custom.hidden ?? []), z.key] })}
                        />
                        <span>{custom.rename?.[z.key] ?? (z.label || "Table")}</span>
                      </label>
                    ) : (
                      <strong>{custom.rename?.[z.key] ?? (z.label || "Table")}</strong>
                    )}
                    {can.reorder && writing && !hidden && (
                      <span className="order-buttons">
                        <button type="button" className="btn" aria-label={`Move ${z.label} up`} disabled={i <= 0} onClick={() => move(z.key, -1)}>↑</button>
                        <button type="button" className="btn" aria-label={`Move ${z.label} down`} disabled={i < 0 || i >= flow.length - 1} onClick={() => move(z.key, 1)}>↓</button>
                      </span>
                    )}
                  </div>
                  {!hidden && can.rename && z.label && (
                    <Field label="Heading">
                      <input type="text" value={custom.rename?.[z.key] ?? z.label} onChange={(e) => set({ ...custom, rename: { ...custom.rename, [z.key]: e.target.value } })} />
                    </Field>
                  )}
                  {!hidden && can.editPrompts && z.surface === "prompt-response" && (
                    <Field label="Prompt">
                      <input type="text" value={custom.prompts?.[z.key] ?? z.prompt ?? ""} placeholder="Write the question or instruction" onChange={(e) => set({ ...custom, prompts: { ...custom.prompts, [z.key]: e.target.value } })} />
                    </Field>
                  )}
                  {!hidden && can.adjustSpace && writing && custom.balance !== "equal" && (
                    <Segmented label="Space" value={custom.space?.[z.key] ?? "standard"} options={SPACE} onChange={(v) => set({ ...custom, space: { ...custom.space, [z.key]: v } })} />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function StationeryPanel({ project, update, usage }: { project: ProductProject; update: Update; usage: ProjectUsage }) {
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
                <div className="issue-advice">Choose a larger page size, turn off an optional section, or give a section Less space.</div>
                <TechnicalDetails label="Show details">{fit.reason}</TechnicalDetails>
              </div>
            )}
            {v && (
              <div className="issue issue--info" data-testid="size-variant-notice">
                <strong>Using the {v.label}.</strong> The full {r.label} page is not available at this size: with every section it would not leave enough room to write. The compact version keeps the most important sections and leaves out {left.join(" and ")}.
              </div>
            )}
            <RecipeSections recipe={v ? variantStructure(r, v) : r} custom={all[r.comboId] ?? {}} set={setFor(r.comboId)} />
          </div>
        );
      })}
    </Section>
  );
}
