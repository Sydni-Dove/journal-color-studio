# Coloring Book — the finished-product workflow

Home → **What would you like to create?** → **Coloring Book**. One project, five steps, saved as you go (this device):

1. **Book Setup** — title, subtitle, author, age range, audience, theme. *Is this a faith-based book?* →
   *Would you like Bible verses included?* (full verse and reference / reference only / none) and the translation.
   *What appears on each finished page* (title, Bible verse, lesson or reflection, custom text — each optional, any
   combination, per-page overrides). Page size (8.5 × 11 default), print format (KDP paperback, spiral, home print,
   printable PDF), single- or double-sided, front matter.
2. **Characters ("My Characters")** — create with simple questions, import a pasted description (read into fields
   and reviewed before saving), or copy a prompt that asks ChatGPT for exactly those fields. Reference pictures stay
   with each character; characters can be reused from another book (pictures included).
3. **Interior Pages** — coloring-page settings only (difficulty, line thickness, complexity with a sample, background
   detail, coloring-space size, line-art style, age range, consistency, text position and fonts). No watercolor,
   painting or palette choices here. Paste or import an outline (.docx, .txt, .md): the importer finds the book title,
   scene number, title, description, characters, actions, Bible references (and supplied wording), lessons and art
   notes, shows them in a review table, and keeps the original text with the book. Each page opens to its **finished
   page** (drawn by the print renderer) beside its text, Scripture, artwork instructions, upload, consistency check and
   approval.
4. **Cover Design** — inherits title, subtitle, audience and characters; full-color style, palette and lettering live
   here. Generate the cover instructions, upload the artwork, preview it with the title as editable text (or as-is),
   approve. Front-cover pixel size; KDP full-wrap size and spine for the current page count.
5. **Preview and Export** — **What's missing?** (blocking / warnings / suggestions, each with a link to the step and
   page that fixes it), the whole book as it prints (cover + every page), and export: print-ready interior (only when
   nothing blocks), front cover, or a proof copy. Export saves the pages as a product (the same product on every
   re-export) and opens its print step; *Back to the coloring book* returns here.

## How it is built

- `src/engines/coloringBook/` — `book.ts` (model, content presets, print formats), `importText.ts` (outline and
  character parsers, description prompt), `scripture.ts` (reference detection, suggestions, public-domain fetch,
  wording checks, translation licensing), `assembleBook.ts` (the interior and cover products, copyright page, KDP wrap),
  `missing.ts` ("What's missing?").
- The book keeps a Cover Studio brief underneath (`brief`): the cast, scenes, coloring style and print setup are the
  same data Cover Studio's scene prompts and page assembly use. `brief.pageContent` switches page assembly
  (`engines/cover/assemble.ts`) to the book's content choices; Cover Studio briefs (no `pageContent`) assemble as before.
- Preview = export: page previews, the book preview and the print file all come from `assembleInterior(book)` and the
  same `PageThumb` / `PrintablePage` renderer.
- Saved in `localStorage` (`dove-product-studio:v1:coloring-book:*`), images in the artwork store (IndexedDB).
  `normalizeBook` merges older saves onto defaults. A Cover Studio coloring book continues as a book from
  *My coloring books → Continue a coloring book from Cover Studio* (nothing in Cover Studio changes).
- Body text with its own size (`PromptBlock.headingSizePt` on a body block) now sets that text's font and size in layout
  (`layouts/shared/promptPages.ts`, `promptCtx`). Only blocks that set a size are affected; golden templates unchanged.

## Scripture rules

- Product Studio never writes verse wording. KJV and WEB (public domain) are fetched word for word from bible-api.com;
  copyrighted translations (NIV, NIrV, ESV, NLT, NKJV, CSB) are pasted by the customer (a link opens the passage).
- Wording prints only after the customer approves it for that page. Until then the reference stands alone and the page
  is listed as blocking. A page that should show Scripture and has none is blocking — never silently omitted.
- Suggestions are references only, used only when chosen.
- The translation's notice goes on the copyright page. Free-use limits are checked (NIV/NIrV/NLT: 500 verses and under
  25% of the book's words; ESV/NKJV/CSB: 1,000 and under 50%). A coloring book's verses are usually a large share of
  its words, so all-NIV verse books are blocked until the customer confirms written permission, switches to KJV/WEB,
  or prints references only. Check each publisher's current permissions page before selling.

## Known limits

- No images are generated inside Product Studio; artwork comes from ChatGPT (or another tool) and is uploaded.
  Reference pictures can't travel in a ChatGPT link: *Copy image* / *Download references* attach them by hand.
- Character consistency is checked by eye (a checklist), not by image comparison.
- Product Studio prints the front cover; a KDP full wrap (back, spine, front) is finished elsewhere using the size shown.
- Children's Storybook and Workbook are listed as "Coming next".
- Books and images are saved on one device (no online copy yet).
