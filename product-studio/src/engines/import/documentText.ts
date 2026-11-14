/**
 * DOCUMENT UPLOAD — the text of a document the maker uploads, for "Your own wording" in Generate
 * with AI. Wording is kept exactly as written: nothing is rewritten, shortened or corrected. Only
 * the layout of the file is turned into plain-text structure:
 *
 *   .txt .md .markdown   the file's text as it is
 *   .docx (Word)         each paragraph on its own line; a blank line between paragraphs; list
 *                        items start "- "; table rows as cells joined by " | "; tabs and line breaks kept
 *   .pdf                 each page's text, lines rebuilt from their positions; a blank line between
 *                        pages (a scanned PDF has no text to read: the maker is told so)
 *
 * Anything else (.doc, .pages, .rtf, images) is refused with what to do instead. Runs in the browser
 * and in Node (tests): no DOM is needed; Word files are unzipped with DecompressionStream.
 */

export const UPLOAD_ACCEPT = ".docx,.pdf,.txt,.md,.markdown,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** The most a document may be (bytes): far more than any manuscript, small enough to read in the browser. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export type UploadKind = "text" | "word" | "pdf";
export interface DocumentText {
  name: string;
  kind: UploadKind;
  text: string;
  /** Things the maker should know (pages with no text, list numbering not kept…). */
  notes: string[];
}

export class UploadError extends Error {}

const extOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? "").toLowerCase();

/** The kind of document a file is, or null when it can't be read. */
export function uploadKind(name: string, type = ""): UploadKind | null {
  const ext = extOf(name);
  if (ext === "docx" || type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "word";
  if (ext === "pdf" || type === "application/pdf") return "pdf";
  if (ext === "txt" || ext === "md" || ext === "markdown" || ext === "text" || (!ext && type.startsWith("text/"))) return "text";
  return null;
}

/** What to do with a file that can't be read, in plain words. */
function unsupported(name: string): string {
  const ext = extOf(name);
  if (ext === "doc") return `“${name}” is an older Word file (.doc). Open it in Word or Google Docs and save it as .docx, then upload that.`;
  if (ext === "pages") return `“${name}” is a Pages file. In Pages choose File → Export To → Word, then upload the .docx.`;
  if (ext === "rtf") return `“${name}” is a rich-text file. Save it as .docx or .txt, then upload that.`;
  if (ext === "gdoc") return `“${name}” is a Google Docs shortcut. In Google Docs choose File → Download → Microsoft Word (.docx), then upload that.`;
  return `“${name}” can't be read. Upload a Word document (.docx), a PDF, or a text file (.txt or .md).`;
}

/** The text of an uploaded document. */
export async function extractDocumentText(file: { name: string; type?: string; size?: number; arrayBuffer(): Promise<ArrayBuffer> }): Promise<DocumentText> {
  const kind = uploadKind(file.name, file.type ?? "");
  if (!kind) throw new UploadError(unsupported(file.name));
  if ((file.size ?? 0) > MAX_UPLOAD_BYTES) throw new UploadError(`“${file.name}” is larger than 25 MB. Upload the text part only, or split the document.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const notes: string[] = [];
  let text: string;
  if (kind === "text") text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
  else if (kind === "word") text = await wordText(bytes, file.name, notes);
  else text = await pdfText(bytes, file.name, notes);
  text = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new UploadError(kind === "pdf" ? `“${file.name}” has no text to read. It may be a scanned PDF (pictures of pages). Upload the original Word or text file instead.` : `“${file.name}” is empty.`);
  return { name: file.name, kind, text, notes };
}

// ── Word (.docx) ─────────────────────────────────────────────────────────────────────────────

/** The files inside a zip (only those wanted), unzipped. */
async function unzip(bytes: Uint8Array, want: (name: string) => boolean): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end of the central directory: its signature, searched for from the end (a comment may follow it).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  for (let k = 0; k < count; k++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("bad zip directory");
    const method = view.getUint16(p + 10, true);
    const compressed = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true), extraLen = view.getUint16(p + 30, true), commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + compressed);
    if (method === 0) out.set(name, data);
    else if (method === 8) out.set(name, new Uint8Array(await new Response(new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()));
    else throw new Error(`zip method ${method}`);
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e] ?? m);

/** Paragraph styles that number or bullet their paragraphs (styles.xml), followed through "based on". */
export function wordListStyles(xml: string): Set<string> {
  const numbered = new Set<string>(), basedOn = new Map<string, string>();
  for (const m of xml.matchAll(/<w:style\b[^>]*w:styleId="([^"]*)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
    if (/<w:numPr\b/.test(m[2])) numbered.add(m[1]);
    const base = /<w:basedOn\b[^>]*w:val="([^"]*)"/.exec(m[2])?.[1];
    if (base) basedOn.set(m[1], base);
  }
  for (const id of basedOn.keys()) {
    let b = basedOn.get(id), hops = 0;
    while (b && hops++ < 20) { if (numbered.has(b)) { numbered.add(id); break; } b = basedOn.get(b); }
  }
  return numbered;
}

/**
 * The text of word/document.xml: paragraphs, list items, tables, tabs and breaks. Read with a small
 * tag scanner (no DOM), keeping every character of the wording; deleted tracked changes are skipped.
 */
export function wordXmlText(xml: string, listStyles: ReadonlySet<string> = new Set()): { text: string; lists: number } {
  const blocks: string[] = [];
  let para: string | null = null; // the paragraph being read
  let listItem = false;
  let lists = 0;
  const rows: string[][] = []; // the table rows being read (nested tables flatten into their cell)
  let row: string[] | null = null;
  let cell: string[] | null = null;
  let tableDepth = 0;
  let inText = false;
  let deleted = 0;
  const re = /<(\/?)([\w:]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  const endPara = () => {
    if (para === null) return;
    const line = (listItem ? "- " : "") + para;
    if (cell) cell.push(line);
    else blocks.push(line);
    para = null;
    listItem = false;
  };
  while ((m = re.exec(xml))) {
    const [, close, tag, , selfClose, chars] = m;
    if (chars !== undefined) {
      if (inText && para !== null && !deleted) para += decodeXml(chars);
      continue;
    }
    const open = !close, done = !!close || !!selfClose;
    switch (tag) {
      case "w:p":
        if (open) { endPara(); para = ""; }
        if (done) endPara();
        break;
      case "w:numPr":
        if (open && para !== null) { if (!listItem) lists++; listItem = true; }
        break;
      case "w:pStyle": {
        // A paragraph style that is itself a list (Word's "List Bullet", "List Number"…).
        const id = /w:val="([^"]*)"/.exec(m[3])?.[1];
        if (open && para !== null && id && listStyles.has(id)) { if (!listItem) lists++; listItem = true; }
        break;
      }
      case "w:t":
        inText = open && !selfClose;
        break;
      case "w:del":
        if (open && !selfClose) deleted++;
        else if (close) deleted = Math.max(0, deleted - 1);
        break;
      case "w:tab":
        if (para !== null && !deleted && open) para += "\t";
        break;
      case "w:br":
      case "w:cr":
        if (para !== null && !deleted && open) para += "\n";
        break;
      case "w:noBreakHyphen":
        if (para !== null && !deleted && open) para += "-";
        break;
      case "w:tbl":
        if (open && !selfClose) tableDepth++;
        if (close) {
          tableDepth--;
          if (tableDepth === 0) { blocks.push(rows.map((r) => r.join(" | ")).join("\n")); rows.length = 0; }
        }
        break;
      case "w:tr":
        if (tableDepth === 1) {
          if (open && !selfClose) row = [];
          if (close && row) { rows.push(row); row = null; }
        }
        break;
      case "w:tc":
        if (tableDepth === 1) {
          if (open && !selfClose) cell = [];
          if (close && cell) { endPara(); row?.push(cell.join(" / ")); cell = null; }
        }
        break;
    }
  }
  endPara();
  return { text: blocks.join("\n\n"), lists };
}

async function wordText(bytes: Uint8Array, name: string, notes: string[]): Promise<string> {
  let files: Map<string, Uint8Array>;
  try {
    files = await unzip(bytes, (n) => n === "word/document.xml" || /^word\/(footnotes|styles)\.xml$/.test(n));
  } catch {
    throw new UploadError(`“${name}” isn't a readable Word document. Open it in Word or Google Docs, save it as .docx again, and upload that.`);
  }
  const doc = files.get("word/document.xml");
  if (!doc) throw new UploadError(`“${name}” has no document text inside. Save it again as a Word document (.docx) and upload that.`);
  const styles = files.get("word/styles.xml");
  const { text, lists } = wordXmlText(new TextDecoder("utf-8").decode(doc), styles ? wordListStyles(new TextDecoder("utf-8").decode(styles)) : new Set());
  if (lists) notes.push("List items start with “- ”. Word's own numbers and bullets aren't part of the text, so numbered lists show as “- ” too.");
  if (files.has("word/footnotes.xml")) {
    const foot = wordXmlText(new TextDecoder("utf-8").decode(files.get("word/footnotes.xml")!)).text.trim();
    if (foot) notes.push("Footnotes aren't included. Add any you need to the text yourself.");
  }
  return text;
}

// ── PDF ──────────────────────────────────────────────────────────────────────────────────────

interface PdfItem { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean }

/** A page's text items as lines, top to bottom, left to right (items on the same baseline join). */
export function pdfLines(items: PdfItem[]): string[] {
  const rows: { y: number; h: number; parts: { x: number; w: number; s: string }[] }[] = [];
  for (const it of items) {
    if (!it.str) continue;
    const x = it.transform[4], y = it.transform[5], h = Math.abs(it.height || it.transform[3] || 10);
    let r = rows.find((q) => Math.abs(q.y - y) <= Math.max(2, Math.min(q.h, h) * 0.4));
    if (!r) rows.push((r = { y, h, parts: [] }));
    r.parts.push({ x, w: it.width, s: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  const lines: string[] = [];
  let prev: (typeof rows)[number] | null = null;
  for (const r of rows) {
    r.parts.sort((a, b) => a.x - b.x);
    let line = "";
    let end = -Infinity;
    for (const p of r.parts) {
      // A gap wider than a space's width between pieces is a space the PDF didn't store as text.
      if (line && p.x - end > r.h * 0.2 && !/\s$/.test(line) && !/^\s/.test(p.s)) line += " ";
      line += p.s;
      end = p.x + p.w;
    }
    // A gap of more than about one and a half lines is a new paragraph.
    if (prev && prev.y - r.y > Math.max(prev.h, r.h) * 1.9) lines.push("");
    lines.push(line.trimEnd());
    prev = r;
  }
  return lines;
}

async function pdfText(bytes: Uint8Array, name: string, notes: string[]): Promise<string> {
  const pdfjs = await loadPdfJs();
  let doc: { numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>; destroy(): Promise<void> };
  try {
    doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    throw new UploadError(/password/i.test(msg) ? `“${name}” is password-protected. Remove the password, then upload it again.` : `“${name}” isn't a readable PDF.`);
  }
  const pages: string[] = [];
  let empty = 0;
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      const lines = pdfLines(content.items.filter((x): x is PdfItem => typeof (x as PdfItem).str === "string"));
      if (!lines.join("").trim()) empty++;
      else pages.push(lines.join("\n"));
    }
  } finally {
    await doc.destroy();
  }
  if (empty && pages.length) notes.push(`${empty} page${empty === 1 ? " has" : "s have"} no text to read (pictures or scans). Type that wording in yourself if you need it.`);
  if (pages.length) notes.push("Text from a PDF can break lines where the page did. Check headings and paragraphs before you continue.");
  return pages.join("\n\n");
}

/** PDF.js, loaded only when a PDF is uploaded (it is large). In the browser its worker runs separately. */
async function loadPdfJs(): Promise<{ getDocument(src: object): { promise: Promise<never> } }> {
  if (typeof window === "undefined") {
    // Node (tests): PDF.js's Node build, named at run time so the app bundle never includes it.
    const node = "pdfjs-dist/legacy/build/pdf.mjs";
    return (await import(/* @vite-ignore */ node)) as never;
  }
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  return pdfjs as never;
}
