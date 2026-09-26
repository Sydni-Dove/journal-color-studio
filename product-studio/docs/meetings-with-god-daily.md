# Meetings With God: weekly capacity and daily planner

## Source and scope

Branch: `codex/meetings-with-god-daily-capacity`, based on Product Studio's current branch `claude/laughing-rubin-rl2li6` at `6794232`.
All committed changes are under `product-studio/`. Journal Color Studio's root application and design assets are unchanged.

## Root issues and structural fixes

The hybrid weekly solver reserved 30% of the planning page for priorities. At Letter size with balanced spacing, college ruling and page numbers, each of seven connected day rows held only two writing lines. The priorities area now reserves two checklist rows and its heading, subject to the existing small-page maximum share and the studio's 1-inch priorities minimum. The connected day grid receives the remaining body height. Letter now has three lines per day; 7x9 and 6x9 increase from one to two. Ruling pitch, padding, safe margins, header/footer and the right-hand Meeting With God page are preserved.

Daily recurrence already existed in the calendar and recipe engines, but the reserved `daily-planner` purpose had no registered layout. `planner-daily` supplies a dated single page with an hourly schedule, priorities checklist, task checklist and ruled/grid/blank notes. Its date comes from the calendar engine; it performs no new date arithmetic. The schedule uses the researched 0.6-inch date header, 0.8-inch time column and minimum hourly row height. Labels also keep the shared label clearance. Unsupported sizes/time ranges report an incompatibility and block export instead of squeezing rows.

A boundary test exposed an existing recipe diagnostic bug: a short final month can contain only days of a week already generated under its previous-month owner. The engine generated the correct pages but erroneously flagged the empty local weekly cadence/group as an error. It now recognises this shared-week case. Ownership, order, spreads, fillers and counts are unchanged; invalid temporal nesting still reports errors.

## Implementation and data flow

Project dates + flat/composite recipe -> existing calendar/recipe expansion -> physical page instances -> existing safe page geometry -> individual layout solvers -> composition -> shared preview/print renderer.

- `layouts/book/weeklyPlanMwgSpread.ts`: changes only the planning body's allocation.
- `layouts/planner/dailyPlanner.ts`: new pure daily solver and fit contract.
- `layouts/registry.ts` and `presets/modules.ts`: register daily layout/purpose/cadence.
- `presets/bookRecipes.ts`: optional daily pages inside each owned weekly cycle; adds "Meetings With God planner + daily pages" without changing the original preset's page recipe.
- `engines/recipe/bookEdit.ts`: flat-to-composite daily purpose mapping.
- `engines/recipe/bookRecipe.ts`: narrow shared-week diagnostic correction.
- `components/editor/DesignPanels.tsx`: daily-only start/end hours and half-hour controls.

Daily pages can be added under Book structure by choosing Daily planner as the page purpose and Every day as the cadence. The new daily preset combines monthly calendar, weekly Plan + Meeting With God spread, journal pages, daily pages and reviews. Saved recipes receive no automatic new daily pages. No schema migration is required.

## Validation

- Build/typecheck and whitespace checks pass.
- 501 unit tests pass, including 15 new tests for capacity, safe bounds, pitch, daily date/cadence, leap day, cross-month week ownership, spread integrity, optional daily pages, standalone daily+journal/Meeting With God combinations, old flat recipes and preview/print parity.
- Complete browser suite: 106 tests pass, including five new daily/weekly checks. After the final shared-week diagnostic change, all eight affected daily and book-structure browser tests pass again.
- The existing numeric test's End-key caret assumption failed identically on unchanged `6794232` on macOS. Only its test helper was corrected to collapse the focus selection using ArrowRight and verify the caret. All seven numeric browser tests pass; numeric production code is unchanged.
- Actual browser interaction verifies selecting daily purpose/cadence, saving, reopening, schedule edits, desktop preview and phone overflow.
- Actual print trees match preview nodes; daily current-page exports contain one sheet with zero validation errors or warnings at Letter and 7x9.
- Exported PDFs each contain one page, with physical media sizes exactly 8.5x11 and 7x9 inches. PDF pages were rasterised and visually inspected for clipping, overlap, spacing and missing/extra pages.
- Daily safe-area/layout validation also covers 6x9 and A5. The default timeline rejects insufficient pages such as 5x7 instead of reducing the researched spacing.

Deployment target: the separate `dove-product-studio` Vercel project, ID `prj_sA1QxUhWAQ1jL6bWRl5DOmTaRPat`, whose configured root is `product-studio` and framework is Vite.
