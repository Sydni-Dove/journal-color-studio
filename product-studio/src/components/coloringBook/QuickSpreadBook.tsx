/**
 * MAKE THE WHOLE BOOK FROM AN IDEA (Devotional Spread books) — a few buttons instead of page-by-page work:
 *   1  type the idea → “Write my lessons with ChatGPT” (opens ChatGPT with the prompt; also copied)
 *   2  paste the answer → “Make my book”: one Devotional Spread per lesson, the KJV/WEB verses filled in word for word
 *   3  “Approve all verses”, “Copy all Art Prompts”, “Upload all pictures” (each to its page, in print order)
 * Page-by-page editing stays available below for anything to change.
 */
import { useRef, useState, type ChangeEvent } from "react";
import { artCharactersOf } from "../../engines/coloringBook/book";
import { briefFor } from "../../engines/coloringBook/assembleBook";
import { allArtPrompts, assignPictures, isSpread, mommyOf, picturePages } from "../../engines/coloringBook/spread";
import { fillScripture, lessonsPrompt, parseLessons, spreadsFromLessons, type FillReport } from "../../engines/coloringBook/spreadImport";
import { translationOf } from "../../engines/coloringBook/scripture";
import { importArtwork } from "../../engines/artwork/store";
import { launchChatGpt } from "../../engines/cover/launch";
import { newId } from "../../presets/products/projectFactory";
import { download } from "../../engines/lettering/browser";
import type { StepProps } from "./shared";

export function QuickSpreadBook({ book, update, say, copy }: StepProps) {
  const b = book.brief;
  const spreads = b.scenes.filter(isSpread);
  const t = translationOf(b.translation);
  const [idea, setIdea] = useState("");
  const [count, setCount] = useState(12);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<(FillReport & { lessons: number }) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const unapproved = spreads.filter((s) => s.scriptureRef && s.verseText && !s.verseApproved).length;
  const pages = picturePages(b);
  const withArt = pages.filter((p) => { const s = b.scenes.find((x) => x.id === p.sceneId)!; return p.side === "daughter" ? !!s.illustrationId : !!s.mommy?.illustrationId; }).length;

  const write = () => {
    const prompt = lessonsPrompt(idea || b.theme || "growing close to God together", count, { title: b.title, translation: t.id, ages: b.ageGroup });
    navigator.clipboard.writeText(prompt).catch(() => {});
    const r = launchChatGpt(prompt, (url, target) => window.open(url, target));
    say(r === "launched" ? "ChatGPT opened with the prompt (also copied). When it's written the lessons, copy its whole answer and paste it below." : r === "too-long" ? "The prompt is copied and ChatGPT is open: paste it into the message box." : "Your browser blocked the new tab. The prompt is copied: open ChatGPT and paste it.");
  };

  const make = async (replace: boolean) => {
    const lessons = parseLessons(answer);
    if (!lessons.length) return say("No lessons found. Each one should start with “LESSON 1:”, “LESSON 2:”… as in the prompt.");
    setBusy(`Filling in ${t.publicDomain ? `the ${t.id} verses word for word` : "the lessons"}…`);
    try {
      const made = spreadsFromLessons(lessons, () => newId("s"), artCharactersOf(book)[0]?.id);
      const { scenes, report: r } = await fillScripture(made, b.translation);
      update({
        brief: { ...b, scenes: replace ? scenes : [...b.scenes, ...scenes] },
        faithBased: true,
        content: { ...book.content, title: true, scripture: book.content.scripture === "none" ? "full" : book.content.scripture },
        ...(book.artCharacters?.length ? {} : { artCharacters: artCharactersOf(book) }),
        importSource: [book.importSource, answer].filter((x) => x.trim()).join("\n\n— — —\n\n"),
      });
      setReport({ ...r, lessons: lessons.length });
      setAnswer("");
      say(`${lessons.length} spread${lessons.length === 1 ? "" : "s"} made.`);
    } finally {
      setBusy(null);
    }
  };

  const unapprovedArt = spreads.reduce((n, s) => n + (s.illustrationId && !s.approvedAt ? 1 : 0) + (s.mommy?.illustrationId && !s.mommy.approvedAt ? 1 : 0), 0);
  const approveArt = () => {
    const at = new Date().toISOString();
    update({ brief: { ...b, scenes: b.scenes.map((s) => (isSpread(s) ? { ...s, ...(s.illustrationId && !s.approvedAt ? { approvedAt: at } : {}), ...(s.mommy?.illustrationId && !s.mommy.approvedAt ? { mommy: { ...s.mommy, approvedAt: at } } : {}) } : s)) } });
    say(`${unapprovedArt} picture${unapprovedArt === 1 ? "" : "s"} approved.`);
  };
  const approveAll = () => {
    const at = new Date().toISOString();
    update({ brief: { ...b, scenes: b.scenes.map((s) => (isSpread(s) && s.scriptureRef && s.verseText && !s.verseApproved ? { ...s, verseApproved: at } : s)) } });
    say(`${unapproved} verse${unapproved === 1 ? "" : "s"} approved.`);
  };

  const prompts = () => allArtPrompts(book, briefFor(book));

  const uploadAll = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    setBusy(`Adding ${files.length} picture${files.length === 1 ? "" : "s"}…`);
    try {
      const plan = assignPictures(files.map((f) => f.name), b);
      const scenes = b.scenes.map((s) => ({ ...s, ...(s.mommy ? { mommy: { ...s.mommy } } : {}) }));
      let added = 0;
      const errors: string[] = [];
      for (const p of plan) {
        const r = await importArtwork(files[p.file]);
        if (!r.ok) { errors.push(`${files[p.file].name}: ${r.error}`); continue; }
        const s = scenes.find((x) => x.id === p.sceneId)!;
        const art = { illustrationId: r.asset.id, illustrationName: r.asset.name, illustrationW: r.asset.widthPx, illustrationH: r.asset.heightPx, approvedAt: undefined };
        if (p.side === "daughter") Object.assign(s, art, { checks: undefined });
        else s.mommy = { ...mommyOf(s), ...art };
        added++;
      }
      update({ brief: { ...b, scenes } });
      const left = files.length - plan.length;
      say(`${added} picture${added === 1 ? "" : "s"} added to their pages${left > 0 ? `; ${left} more than there were empty pages` : ""}${errors.length ? `. Not added: ${errors.join("; ")}` : ""}.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="cover-panel quick-book" data-testid="quick-book">
      <h2 className="book-h">Make the whole book from your idea</h2>
      <p className="hint">Three steps. Everything stays editable page by page below.</p>

      <div className="quick-step">
        <h3>1 · Your idea</h3>
        <textarea rows={2} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Who God says I am: identity, love and courage for little girls and their moms" aria-label="Your idea" data-testid="quick-idea" />
        <div className="row">
          <label className="field quick-count">
            <span>Lessons</span>
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Number of lessons">{[4, 6, 8, 10, 12, 15, 20, 26, 30].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          <button type="button" className="btn btn--primary" onClick={write} data-testid="quick-write">Write my lessons with ChatGPT ↗</button>
          <button type="button" className="btn btn--ghost" onClick={() => copy(lessonsPrompt(idea || b.theme || "growing close to God together", count, { title: b.title, translation: t.id, ages: b.ageGroup }))}>Copy the prompt</button>
        </div>
      </div>

      <div className="quick-step">
        <h3>2 · Paste ChatGPT's answer</h3>
        <textarea rows={6} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={"LESSON 1: I Am Wonderfully Made\nTheme: …\nDaughter scene: …\nVerse: Psalm 139:14\n…"} aria-label="ChatGPT's answer" data-testid="quick-answer" />
        <div className="row">
          <button type="button" className="btn btn--primary" disabled={!answer.trim() || !!busy} onClick={() => void make(spreads.length > 0 && window.confirm(`Replace your ${spreads.length} spread${spreads.length === 1 ? "" : "s"} with these? (Cancel adds them after.)`))} data-testid="quick-make">Make my book</button>
          {busy && <span className="hint" role="status">{busy}</span>}
        </div>
        <p className="hint">{t.publicDomain ? `Scripture is never taken from ChatGPT: every verse and exact quote is filled in from the ${t.id} word for word. A short excerpt is kept only when it's the verse's own words.` : `${t.id} is copyrighted, so its wording can't be filled in for you: check every quote against your Bible. (Choose KJV or WEB under Book Setup to have it filled in.)`}</p>
        {report && (
          <p className="hint" data-testid="quick-report">
            {report.lessons} spreads made · {report.filled} verse{report.filled === 1 ? "" : "s"} filled in from the {t.id}
            {report.replaced.length ? ` · ${report.replaced.length} excerpt${report.replaced.length === 1 ? " wasn't" : "s weren't"} the verse's own words, so the full verse is used (${report.replaced.join("; ")})` : ""}
            {report.failed.length ? ` · not found: ${report.failed.join("; ")} (check the reference)` : ""}
          </p>
        )}
      </div>

      <div className="quick-step">
        <h3>3 · Finish</h3>
        <div className="row">
          <button type="button" className="btn btn--primary" disabled={!unapproved} onClick={approveAll} data-testid="quick-approve">{unapproved ? `I read them: approve all ${unapproved} verses` : "All verses approved"}</button>
          <button type="button" className="btn btn--primary" disabled={!spreads.length} onClick={() => copy(prompts())} data-testid="quick-prompts">Copy all {spreads.length * 2} Art Prompts</button>
          <button type="button" className="btn" disabled={!spreads.length} onClick={() => download(new Blob([prompts()], { type: "text/plain" }), `${(b.title || "book").replace(/[^A-Za-z0-9]+/g, "-")}-art-prompts.txt`)}>Download Art Prompts (.txt)</button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => void uploadAll(e)} data-testid="quick-upload" />
          <button type="button" className="btn btn--primary" disabled={!spreads.length || !!busy} onClick={() => fileRef.current?.click()}>Upload all pictures ({withArt} of {pages.length} done)</button>
          {withArt > 0 && <button type="button" className="btn btn--primary" disabled={!unapprovedArt} onClick={approveArt} data-testid="quick-approve-art">{unapprovedArt ? `I looked at them: approve all ${unapprovedArt} pictures` : "All pictures approved"}</button>}
        </div>
        <p className="hint">Pictures go on the pages in print order (spread 1 left, spread 1 right, spread 2 left…), skipping pages that already have one. A file named like “3-mommy.png” or “spread 3 left.png” goes straight to that page.</p>
      </div>
    </section>
  );
}
