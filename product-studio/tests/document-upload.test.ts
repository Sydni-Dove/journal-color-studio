// Document upload (Generate with AI → Your own wording): wording is kept exactly; only file layout
// becomes plain-text structure.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { extractDocumentText, pdfLines, uploadKind, UploadError, wordXmlText } from "../src/engines/import/documentText";

const fixture = (name: string, type = "") => {
  const buf = readFileSync(new URL(`./fixtures/uploads/${name}`, import.meta.url));
  return { name, type, size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
};
const textFile = (name: string, text: string) => {
  const buf = new TextEncoder().encode(text);
  return { name, type: "text/plain", size: buf.length, arrayBuffer: async () => buf.buffer };
};

describe("document upload", () => {
  it("knows which files it can read", () => {
    expect(uploadKind("Manuscript.DOCX")).toBe("word");
    expect(uploadKind("lesson.pdf")).toBe("pdf");
    expect(uploadKind("notes.md")).toBe("text");
    expect(uploadKind("notes.txt")).toBe("text");
    expect(uploadKind("old.doc")).toBeNull();
    expect(uploadKind("cover.png")).toBeNull();
  });

  it("refuses other files with what to do instead", async () => {
    await expect(extractDocumentText(textFile("old.doc", "x"))).rejects.toThrow(/save it as \.docx/);
    await expect(extractDocumentText(textFile("book.pages", "x"))).rejects.toThrow(/Export To → Word/);
    await expect(extractDocumentText(textFile("art.png", "x"))).rejects.toBeInstanceOf(UploadError);
  });

  it("text and Markdown: exactly as written (only a byte-order mark and Windows line ends go)", async () => {
    const md = "﻿# Lesson 1: Love — Caring for Others\r\n\r\n“Love” is patient.\r\nName: ________\r\n";
    const got = await extractDocumentText(textFile("lesson.md", md));
    expect(got.text).toBe("# Lesson 1: Love — Caring for Others\n\n“Love” is patient.\nName: ________");
    expect(got.kind).toBe("text");
  });

  it("Word: every word kept, paragraphs, list items, tabs, line breaks and tables", async () => {
    const got = await extractDocumentText(fixture("lesson.docx"));
    expect(got.kind).toBe("word");
    expect(got.text).toBe(
      [
        "Growing Good Fruit",
        "Lesson 1: Love — Caring for Others",
        "Read Galatians 5:22–23. “Love” is the first fruit & it’s listed first.",
        "- Learn It",
        "- See It",
        "- Draw a picture of someone you love.",
        "Name:\t________\nDate: ________",
        "Fruit | Scripture\nJoy | Nehemiah 8:10",
        "Prayer: Dear God, help me love like You.",
      ].join("\n\n"),
    );
    expect(got.notes.join(" ")).toMatch(/List items start with/);
  });

  it("Word XML: deleted tracked changes are left out; entities decoded", () => {
    const xml = `<w:body><w:p><w:r><w:t>Keep </w:t></w:r><w:del><w:r><w:delText>gone</w:delText><w:t>gone</w:t></w:r></w:del><w:r><w:t xml:space="preserve">this &amp; &#8220;that&#8221;</w:t></w:r></w:p><w:p/></w:body>`;
    expect(wordXmlText(xml).text).toBe("Keep this & “that”\n\n");
  });

  it("PDF: each page's lines in reading order, a blank line between paragraphs and pages", async () => {
    const got = await extractDocumentText(fixture("lesson.pdf"));
    expect(got.kind).toBe("pdf");
    expect(got.text).toBe(
      "Growing Good Fruit\n\nLesson 1: Love - Caring for Others\nRead Galatians 5:22-23 and talk about it.\nLearn It. See It. Choose It.\n\nLesson 2: Love - Loving When It's Difficult",
    );
    expect(got.notes.join(" ")).toMatch(/1 page has no text to read/);
  });

  it("PDF with no text (a scan): says so", async () => {
    await expect(extractDocumentText(fixture("scan.pdf"))).rejects.toThrow(/scanned PDF/);
  });

  it("PDF lines: pieces on one baseline join in order, with a space where the gap is wide", () => {
    const it = (str: string, x: number, y: number, width: number) => ({ str, transform: [12, 0, 0, 12, x, y], width, height: 12 });
    expect(pdfLines([it("world", 140, 700, 30), it("Hello", 72, 700, 30), it("Next line", 72, 686, 50)])).toEqual(["Hello world", "Next line"]);
  });
});
