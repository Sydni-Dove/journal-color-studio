# Page types vs full planners & books

**Page type** (New product → step 4, and the editor's Pages panel) lists single page layouts only: Monthly Calendar, Weekly Vertical Spread, Daily Planner Page, Weekly Plan Spread, Weekly Plan + Meeting With God, journal / notes / worksheet / devotional pages, and so on. It never lists a complete book.

**Full planners & books** (New product, above "Build your own") are complete products. Each card is drawn by the real page renderer (`PrintablePage`, the same one the editor and print use), from a one-month resolve of the template at the chosen size. **View template** shows its pages; **Use this template** creates an ordinary editable project with the book structure in the Book structure panel.

| id (unchanged) | Old label | New name | Explanation |
| --- | --- | --- | --- |
| `book-daily-planner` | Book: Daily planner (month · week + Meeting With God · every day) | Daily Planner + Meetings With God | Includes monthly, weekly, daily and Meetings With God pages. |
| `book-meetings-with-god` | Book: Meetings With God planner (plan + journal) | Meetings With God Planner | Monthly and weekly planning with Meetings With God journal pages. |
| `book-meetings-with-god-daily` | (only in Book structure: "Meetings With God planner + daily pages") | Meetings With God Planner + Daily Pages | Monthly, weekly, Meetings With God and journal pages, plus a page for every day. |
| `book-planner-journal` | Book: Monthly + weekly planner with journal pages | Monthly + Weekly Journal Planner | Monthly planning, weekly planning and a journal page every week. |

The recipes keep their ids, cadence, dates, prompts and spread rules. One deliberate change (requested after review): in the three Meetings With God books each week is now a **Weekly Plan Spread** followed by a **Meeting With God Spread** (previously one hybrid spread: plan left, Meeting With God right). Projects already saved keep the structure they were saved with; the hybrid layout is still available as a page type. A template is a `RecipePreset` with a `template` field (`presets/layouts/recipePresets.ts`); `recipePresetsFor()` leaves those out and `BOOK_TEMPLATES` lists them. `tests/book-templates.test.ts` checks that a template makes the same project, page for page, as the recipe did.

## Planner page composition (open layouts)

- **Weekly Plan Spread** (`layouts/book/weeklyPlanSpread.ts`): the week across two facing pages instead of fitted onto one. Left: the first three weekdays (plus Sunday when the week starts on Sunday), closed by Notes. Right: the last two weekdays and the weekend, closed by Priorities. Every weekday gets the same number of lines on both pages.
- **Meeting With God Spread** (same file): open writing on the left; What did God say? and Response / action steps on the right.

- **Weekly Plan + Meeting With God** (`layouts/book/weeklyPlanMwgSpread.ts`): open rows, no boxes. Each day has a label column (short name over date) and writing lines; its last line is a full-width hairline divider. Rows are whole lines on the page's writing pitch: weekdays always get the same number, and the weekend shares a row in a Monday-start week (or gets shorter rows, with a one-line "Sun 27" label when that is all that fits). Lines left over go to Priorities, an open checkbox list at the foot of the page.
- **Daily planner** (`layouts/planner/dailyConfigurable.ts`): the schedule uses horizontal hour rules and one light label rule (no grid box), and has a slightly larger share of the page. Top Priorities and To Do are open checkbox lists.
- **Weekly Vertical Spread** (`layouts/planner/weeklySpread.ts`): no outer box; the morning, afternoon and evening dividers use the light line color.

Line spacing, type sizes, margins, binding and safe areas are unchanged.
