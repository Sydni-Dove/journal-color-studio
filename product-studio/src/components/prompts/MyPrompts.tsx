/**
 * MY PROMPTS — every ChatGPT prompt Product Studio has made, to read, copy or download again (engines/prompts):
 *   From your books   rebuilt from every saved coloring book and Cover Studio collection; download one book's or all
 *   Used before       each prompt as it was when sent to ChatGPT or copied, newest first (kept on this device)
 */
import { useEffect, useMemo, useState } from "react";
import { clearPromptHistory, historyText, promptHistory, promptsText, savedPromptGroups, type PromptGroup } from "../../engines/prompts/library";
import { download } from "../../engines/lettering/browser";
import type { ColoringBook } from "../../engines/coloringBook/book";
import type { CoverCollection } from "../../engines/cover/brief";
import { relativeTime } from "../projects/ProjectList";

type Props = { onBack: () => void; books: ColoringBook[]; collections: CoverCollection[] };

const fileName = (name: string) => `${name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "prompts"}-prompts.txt`;
const txt = (text: string) => new Blob([text], { type: "text/plain;charset=utf-8" });

export function MyPrompts({ onBack, books, collections }: Props) {
  const groups = useMemo(() => savedPromptGroups(books, collections), [books, collections]);
  const [history, setHistory] = useState(() => promptHistory());
  const [tab, setTab] = useState<"books" | "history">("books");
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const on = () => setHistory(promptHistory());
    window.addEventListener("dove-prompts-changed", on);
    return () => window.removeEventListener("dove-prompts-changed", on);
  }, []);
  const say = (m: string) => {
    setMessage(m);
    window.setTimeout(() => setMessage((x) => (x === m ? null : x)), 4000);
  };
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => say("Copied to clipboard"), () => say("Copy isn't available in this browser"));
  const total = groups.reduce((n, g) => n + g.prompts.length, 0);

  return (
    <div className="cover-studio my-prompts" data-testid="my-prompts">
      <header className="topbar">
        <button className="btn" onClick={onBack}>‹ Home</button>
        <div className="brand"><span className="brand-mark">D</span><span>My Prompts</span></div>
        <span className="spacer" />
      </header>
      {message && <div className="update-banner" role="status"><span>{message}</span></div>}
      <div className="page-shell">
        <section className="home-hero">
          <h1>My Prompts</h1>
          <p className="lede">Every ChatGPT prompt Product Studio has made for you. Read it, copy it, or download it again.</p>
        </section>
        <div className="segmented" role="tablist" aria-label="Which prompts">
          <button type="button" role="tab" aria-selected={tab === "books"} aria-pressed={tab === "books"} onClick={() => setTab("books")} data-testid="tab-books">From your books ({total})</button>
          <button type="button" role="tab" aria-selected={tab === "history"} aria-pressed={tab === "history"} onClick={() => setTab("history")} data-testid="tab-history">Used before ({history.length})</button>
        </div>

        {tab === "books" ? (
          <section className="cover-panel" data-testid="prompts-books">
            <div className="row">
              <button type="button" className="btn btn--primary" disabled={!total} onClick={() => download(txt(promptsText(groups)), "all-my-prompts.txt")} data-testid="download-all-prompts">Download all {total} prompts (.txt)</button>
            </div>
            <p className="hint">Made fresh from each saved coloring book and Cover Studio collection, so they always match the book as it is now. To get a prompt exactly as it was when you used it, see “Used before”.</p>
            {!groups.length && <p className="hint">No saved books with prompts yet.</p>}
            {groups.map((g) => <Group key={`${g.kind}-${g.id}`} g={g} copy={copy} />)}
          </section>
        ) : (
          <section className="cover-panel" data-testid="prompts-history">
            <div className="row">
              <button type="button" className="btn btn--primary" disabled={!history.length} onClick={() => download(txt(historyText(history)), "prompts-used-before.txt")} data-testid="download-history">Download all {history.length} (.txt)</button>
              <button type="button" className="btn btn--ghost" disabled={!history.length} onClick={() => { if (window.confirm("Clear the list of prompts used before? (Your books keep their prompts.)")) { clearPromptHistory(); setHistory([]); } }}>Clear this list</button>
            </div>
            <p className="hint">Each prompt exactly as it was sent to ChatGPT or copied, newest first. Kept on this device (the last {500}). Prompts used before this list existed are under “From your books”.</p>
            {!history.length && <p className="hint">Nothing yet: prompts you send to ChatGPT or copy from now on appear here.</p>}
            <ul className="prompt-list">
              {history.map((p) => (
                <li key={p.id} className="prompt-item">
                  <details>
                    <summary><strong>{p.title}</strong> <span className="hint">{p.source ? `${p.source} · ` : ""}{relativeTime(p.at)}</span></summary>
                    <pre className="cover-prompt">{p.text}</pre>
                  </details>
                  <div className="row">
                    <button type="button" className="btn" onClick={() => copy(p.text)}>Copy</button>
                    <button type="button" className="btn btn--ghost" onClick={() => download(txt(p.text), fileName(p.title))}>Download</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Group({ g, copy }: { g: PromptGroup; copy: (t: string) => void }) {
  return (
    <details className="prompt-group" data-testid={`prompt-group-${g.id}`}>
      <summary>
        <strong>{g.name}</strong> <span className="hint">{g.kind} · {g.prompts.length} prompt{g.prompts.length === 1 ? "" : "s"} · edited {relativeTime(g.updatedAt)}</span>
      </summary>
      <div className="row">
        <button type="button" className="btn btn--primary" onClick={() => download(txt(promptsText([g])), fileName(g.name))}>Download this book's prompts (.txt)</button>
        <button type="button" className="btn" onClick={() => copy(promptsText([g]))}>Copy them all</button>
      </div>
      <ul className="prompt-list">
        {g.prompts.map((p, i) => (
          <li key={i} className="prompt-item">
            <details>
              <summary>{p.title}</summary>
              <pre className="cover-prompt">{p.text}</pre>
            </details>
            <button type="button" className="btn" onClick={() => copy(p.text)}>Copy</button>
          </li>
        ))}
      </ul>
    </details>
  );
}
