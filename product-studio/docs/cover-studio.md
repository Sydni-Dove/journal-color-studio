# Cover Studio

Plan the covers of a collection (journal, planner, bookmark, scripture cards…): a brief, an exact production
specification, five design directions and one finished-cover prompt, a coordinated set, and a saved library.
Ported from the standalone *Dove Expressions Stationery Cover Generator* (2026-11-13). Product Studio makes no
images: the prompt is handed to ChatGPT, two ways side by side (below), and the screen says so.

Open it from the home screen: **Cover Studio**. Code: `src/engines/cover/` (data and logic), `src/components/cover/`
(screen), `src/persistence/coverStore.ts` (saving).

## Categories and screens (2026-11-14, branch `claude/coloring-book-studio`)

Five category **tabs** sit at the top; right under them come the step title, the progress bar and **Back / Next**
(shared with the product editor: `components/editor/Steps.tsx`). There is no step dropdown. Switching tabs or going
back never clears anything: one brief holds every category's fields, and the draft (with the screen in view) is kept
across reloads.

| Tab | Screens |
| --- | --- |
| Cover Artwork | Collection · Art direction (suggested directions: Botanical Journal, Bold Editorial, Minimal Scripture, Marble Luxe, Soft Watercolor Type) · Artwork details · Review and copy |
| Coloring Book Cover | Collection · Cover design (Interior characters gallery, suggested directions: Full-Color Storybook, Soft Watercolor, Bright Cartoon, Hybrid) · Production · Review and copy (attach list, compare and approve) |
| Interior Page Design | Collection · Art direction · Artwork details · Review and copy |
| Children's Character Illustrations | Collection · Art direction (coloring style) · Cast & references · Scenes · Page layout · Review and copy |
| Coordinated Collection Design | Collection · Art direction · Artwork details · Review and copy |

**Cast & references** (`brief.cast`): name, description, always-kept traits, a reference image per character (kept on
this device like product artwork, `engines/artwork/store.ts`) or one approved group image, and per-image changes
(pose, expression, outfit, hairstyle). An image already uploaded to a product's Artwork can be picked as a reference.
"Keep interior characters consistent" is on by default. The coloring book cover uses the same cast: every character
is chosen by default, only the ticked ones go in the prompt, and their reference images are named to attach.

**Scenes** (`brief.sceneSource`, `brief.scenes`): paste, or import .docx / .txt / .md (Product Studio's document
reader), edit the text, then **Split into scenes** at numbered headings ("1.", "Scene 2:", "## 3") or, without them, at
blank lines. Each scene: title, text, which characters, and its own line thickness, complexity and page type.
Review previews or copies one scene's prompt, or copies all.

**Coloring style**: interior pages are **black outlines on white** by default; *Hybrid · colored accents only* is an
explicit choice (palette on borders and accents; the shapes children color stay white). Line Thickness (Thin / Medium
/ Thick) and Illustration Complexity (Simple / Moderate / Detailed) default to Medium and Moderate, with a small sample.
Defaults are saved with the collection, can be saved per style ("Save as defaults for …", this browser), and any
scene can override them. Interior prompts never carry the palette's colors (unless Hybrid); the cover can be full color.

**Page outputs**: finished coloring page (title + Scripture room), text-free illustration, Bible lesson worksheet
(empty text areas), drawing page, character reference sheet. Only the reference sheet asks for several views; every
other prompt says one image, no views. Text placement and illustration coverage show a live estimate of the room
left. Finished coloring pages default to **NIV** and always leave room for the verse with no verse words drawn; until
"Verse wording and permission verified" is ticked the prompt says so.

**Production**: *Artwork only* (no words; title and Scripture are editable text in Product Studio, which assembles the
final PDF) or *Complete cover concept*. A paperback wrap shows no final canvas until the printer's spine width is
entered, and can't be handed off without it.

**Compare and approve**: on the coloring cover's review, add the finished cover image; it is shown beside the
interior references, and the maker ticks Approved (dated, saved).

**Direction cards respect what was typed**: a card fills a field only while it is empty or still holds a card's own
wording.

## Coloring pages: clean prompts, consistent characters, assembly in Product Studio (2026-11-14)

Fixes after the Gracious Kids pages came back with banners, frames, a printed pixel size, color and drifting
characters.

**Image generator vs Product Studio.** The image generator makes only the black-and-white illustration (characters,
composition, background, clean coloring shapes). Product Studio adds every editable text (page title, Scripture
reference and — once verified — the verse wording, lesson text), fonts, placement, margins, the binding gutter, page
numbers and the PDF (`engines/cover/assemble.ts`: one Custom Page per scene; "Send to Product Studio").

**Scene prompt** (`engines/cover/coloring.ts` `scenePrompt`), always in this order: COLLECTION, CHARACTERS, SCENE,
COLORING STYLE, COMPOSITION, RESTRICTIONS, PRODUCTION, OUTPUT. Never in it: typography, cover style guides
("watercolor typography", "title field", "display lettering"), "empty band", "finished page with Scripture",
"No saved characters", the palette (outline pages), drawable measurements. The white space is given in pixels of
the 2550 × 3300 canvas, measured from the assembled page itself (`artRegion`), with no visible outline.

**Character registry** (`brief.cast`): name, age, face, hair, hair accessories, proportions, signature clothing,
accessories, always-keep traits, notes, reference image. Every scene repeats it with the reuse instruction. No cast →
scenes wait; a cast-design prompt (reference sheet) comes first. Lock established characters; use saved references
(on by default).

**References reach the generator as files**: "Copy image" puts the actual PNG on the clipboard (paste into ChatGPT's
message box); "Download references" saves the files to attach. A ChatGPT link can carry text only, so images can't
be sent automatically from the browser.

**Per scene** (Review): open, copy, regenerate keeping the characters (with why it was rejected), add the generated
illustration (size checked: 2550 × 3300 fills the page; any other size is fitted whole into the illustration area,
never stretched or cropped; print resolution shown), preview the artwork without text / the assembled page with text,
show the text-safe space and gutter, the character consistency checklist (no automatic image comparison), approve in
order. Send to Product Studio when every scene is approved.

**Scripture coloring pages**: "Who adds the Scripture" — Product Studio (editable text, default) or "Drawn into the
artwork" (hollow outline letters to color, no banner or box), per collection or per scene; only with the exact
wording entered and verified, and the checklist adds "verse spelled exactly".

**Page setup**: coloring book preset 8.5 × 11 in, 300 DPI (2550 × 3300 px), 0.25 in margins, 0.5 in gutter, white;
each picture on its own right-hand page with a blank back (default). Ten scenes make 20 pages: perfect binding and
KDP need 24, so add front matter in Product Studio or choose spiral binding.

**Covers**: a generated cover had printed its own pixel size; every cover prompt now says measurements are never
drawn (the one change to the original generator's wording). Artwork-only covers ask for an open title area with no
plaque, banner or box; "Complete cover concept" letters the title.

## What comes from Product Studio's own systems

| Need | Source |
| --- | --- |
| Trim | size presets + `resolveTrim` / `validateDimensions` (custom sizes 1–48 in) |
| Bleed | the printer profile's own bleed is the minimum for any bleed asked for; **0 = a no-bleed build** (with a warning when the printer normally needs it) |
| Safe zone | `computePageGeometry`: printer live margins, and the binding keep-out for bindings that go through the cover (coil, wire-o, disc, rings, glued pads). The interior gutter of a perfect-bound / case-bound / saddle-stitched book does not apply to its cover |
| Printer rules | IngramSpark case wrap: 0.625 in bleed and 0.5 in hinge each side of the spine; page-count and binding support warnings |
| Spine | **never invented.** A full wrap needs the printer-confirmed width. KDP's published per-page formula is *offered* (white 0.002252 in, cream 0.0025 in per page) and applied only when the maker clicks it |
| Palettes | `PalettePicker` (given `COVER_PALETTES`) with named swatches; the prompt lists the exact hex values |
| Start from a product | `briefFromProject`: its trim, binding, printer, page count and palette |

## Handing the prompt to ChatGPT

* **Generate in ChatGPT** opens a new tab at `https://chatgpt.com/?prompt=…` (`engines/cover/launch.ts`): the whole prompt is in the message box and
  **nothing is sent** — the maker reads it and presses send. The prompt is also copied each time, as a backup.
* **Copy prompt** and **Open ChatGPT** (the plain page) are the copy-and-paste way. They work on their own and always work.
* ChatGPT's other address parameter, `?q=`, fills **and sends** at once, so it is deliberately not used (checked in a real browser, 2026-11-13).
  `?prompt=` is ChatGPT's own, not a documented API: it can change, which is why the copy-and-paste way stays next to it.
* A prompt whose address would pass 8,000 characters (the longest the studio builds is about 5,200) is not launched half-filled: ChatGPT's plain page opens and the
  prompt is to be pasted. A browser that blocks the new tab gets a message saying so.
* The same guards as before: no title, no launch; a full wrap without the printer's spine width, no launch.

## Guards

* No prompt is copied, downloaded or sent without a cover title; a placeholder title is never used.
* A full wrap without a printer-confirmed spine width cannot be handed to an image generator, and its draft prompt says it is **not** a final print-ready wrap.
* Only bound books can be a full wrap; a bookmark or card stays front only.
* The prohibitions that came from rejected covers are kept word for word in the prompt (sunrise / mountain scenes, stacked books, faux antique parchment and ornate filler, "Untitled").

## Saving

Collections live in this browser (`dove-product-studio:v1:cover:<id>` + `cover-index`), apart from projects: they are never
in the project list, exports, autosave or online saving. The work in progress is kept in `cover-draft`. **Export collection
JSON** is the backup; the import also reads the standalone generator's `dove-stationery-v1` backups (palette ids are mapped).
Online saving of collections would need its own table: not built.

## Palettes

`PALETTES` (every product's picker) gains only *Violet + Peach Cloud*. The 18 Prayer Journal / Prayer Warrior / Warring Woman
palettes are `COVER_PALETTES`-only (`design-library/palettes.ts`, `JCS_COVER_ONLY`), because their roles are tied to those
journals' artwork (see `design-library/SNAPSHOT.md`). Product Studio's own drafts (sage, purple, blue) keep their "draft" label.

## Tests

`tests/cover-studio.test.tsx` (prompt parity with the generator's own code on 9 golden briefs, dimensions, guards, palettes,
storage, the screens), `tests/coloring-book.test.tsx` (Gracious Kids ten-scene regression, assembly at 8.5 × 11 with margins and gutter, no
cast, references, regeneration, Scripture in the artwork, scene splitting, line art, the cover's cast, saving),
`tests/browser/gracious-kids.browser.ts` (the whole scene workflow to Send to Product Studio and its print output), `tests/browser/cover-studio.browser.ts` (the whole flow in
Chrome), `tests/browser/coloring-book.browser.ts` (*She Is Gracious — Ballet Coloring Book*: three dancers, two scenes,
Full-Color Storybook cover).
