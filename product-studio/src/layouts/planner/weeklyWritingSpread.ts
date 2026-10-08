/** A full writing week: four connected days on the verso, three on the
 * recto plus priorities. Geometry and ruling come from the shared engines. */
import { lineSpacingIn, RULING_PRESETS } from "../../engines/patterns/patterns";
import { formatWeekRange } from "../../engines/calendar/calendar";
import { STUDIO_PLANNER, STUDIO_WEEKLY_VARIANTS } from "../../presets/studioDefaults";
import { dayRows } from "../book/weeklyPlanMwgSpread";
import { headerTitle, pageFrame, section } from "../shared/components";
import { lineBoxIn } from "../shared/nodes";
import type { FitContext, FitResult, LayoutDefinition } from "../shared/types";
import { weeklyPlanMwgSpread } from "../book/weeklyPlanMwgSpread";

function fitWritingWeek(ctx: FitContext): FitResult {
  const s = ctx.spacing;
  const footer = ctx.options.showFooter || ctx.options.showPageNumbers ? lineBoxIn(ctx.typography, "footer") + s.footerGap : 0;
  const bodyH = ctx.page.usableHeightIn - 2 * s.page - STUDIO_PLANNER.weeklyTitle.valueIn - s.headerGap - footer;
  // Reserve four wide-ruled lines, so every supported ruling retains capacity.
  const requiredRowH = 4 * RULING_PRESETS.find((p) => p.id === "wide")!.valueIn + 2 * s.boxPadding;
  const writingW = ctx.page.usableWidthIn - 2 * s.page - STUDIO_WEEKLY_VARIANTS.horizontal.dayLabelW.valueIn - 2 * s.boxPadding;
  return bodyH / 4 + 1e-6 >= requiredRowH && writingW >= 2
    ? { ok: true, variant: "writing-week", variantLabel: "Four days / three days + priorities", sidebarAvailable: false }
    : { ok: false, reason: "This weekly writing spread needs room for at least four full-width writing lines per day. Choose a larger page or smaller margins; ruling is never compressed." };
}

export const weeklyWritingSpread: LayoutDefinition = {
  ...weeklyPlanMwgSpread,
  id: "planner-weekly-writing-spread",
  label: "Weekly Writing Spread (4+ lines per day)",
  description: "A complete two-page writing week: four days on the left, three days and priorities on the right. Add Meeting With God as the next module.",
  capability: { ...weeklyPlanMwgSpread.capability, wordingKeys: ["weekOf", "priorities"] },
  fit: fitWritingWeek,
  solve(ctx) {
    if (ctx.period.kind !== "week" || !ctx.calendar) throw new Error("Weekly writing spread needs a calendar week.");
    const key = ctx.period.key;
    const week = ctx.calendar.weeks.find((w) => w.key === key);
    if (!week) throw new Error(`Week ${key} not in calendar.`);
    return [0, 1].map((p) => {
      const frame = pageFrame(ctx, p, { headerH: STUDIO_PLANNER.weeklyTitle.valueIn });
      const fit = fitWritingWeek({ ...ctx, page: ctx.pages[p] });
      const capacity = (frame.body.h / 4 - 2 * ctx.spacing.boxPadding) / lineSpacingIn(ctx.pattern);
      if (!fit.ok || (ctx.pattern.kind === "ruled" && capacity + 1e-6 < 4)) return {
        nodes: [], metrics: [], diagnostics: [{ severity: "error" as const, rule: "layout-incompatible", componentId: "planner-weekly-writing-spread", message: !fit.ok ? fit.reason : "The selected ruling leaves fewer than four lines per day. Choose a larger page or closer ruling." }],
      };
      const title = headerTitle(`ww${p}-header`, ctx, frame.zones, "weekOf", `${ctx.wording.weekOf} ${formatWeekRange(week)}`, "weekTitle", "header-left");
      const showPriorities = ctx.options.weeklyPriorities !== false;
      const rowH = frame.body.h / (p === 1 && !showPriorities ? 3 : 4);
      const first = p === 0 ? 0 : 4, count = p === 0 ? 4 : 3;
      const days = { ...frame.body, h: rowH * count };
      const pri = p === 1 && showPriorities ? section("ww1-priorities", { ...frame.body, y: frame.body.y + 3 * rowH, h: rowH }, ctx.wording.priorities, ctx, "checklist", { padded: true, titleRole: "sectionHeading" }) : { nodes: [], diagnostics: [] };
      return {
        nodes: [...frame.nodes, ...title.nodes, ...dayRows(`ww${p}-days`, days, ctx, ctx.calendar!.weekdayShortNames.slice(first, first + count), week.days.slice(first, first + count).map((d) => d.day)), ...pri.nodes],
        diagnostics: [...frame.diagnostics, ...title.diagnostics, ...pri.diagnostics],
        metrics: [{ label: "Day row height (four equal slots per page)", value: rowH, unit: "in" as const, provenance: { geometryClass: "user-design" as const, basis: "Shared page body / 4; unchanged writing pitch" } }],
        regions: { mainContent: frame.body, calendar: days },
      };
    });
  },
};
