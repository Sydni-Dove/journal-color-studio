/**
 * Three real Dove Expressions pages rebuilt with the Page Composer's pieces
 * only — the same data the editor writes (no page-specific renderer code).
 */
import type { PromptSet } from "../../src/types/prompts";

/** PROJECT SNAPSHOT: heading, two info blanks, paired writing areas, "Next 3 moves", blockers / dates, notes. */
export const PROJECT_SNAPSHOT = (): PromptSet => ({
  blocks: [
    { id: "title", kind: "heading", label: "PROJECT SNAPSHOT" },
    { id: "info", kind: "info", label: "", fields: ["Updated", "Stage / Status"] },
    { id: "purpose", label: "Purpose", space: "fixed", lineCount: 3, responseStyle: "ruled" },
    { id: "focus", label: "Current focus", space: "fixed", lineCount: 3, responseStyle: "ruled", beside: true },
    { id: "update", label: "Update", space: "fixed", lineCount: 3, responseStyle: "ruled" },
    { id: "done", label: "Recently completed", space: "fixed", lineCount: 3, responseStyle: "ruled", beside: true },
    { id: "moves", label: "Next 3 moves", space: "fixed", lineCount: 3, responseStyle: "checkboxes", taskMarker: "circle", taskMarkerPosition: "left" },
    { id: "blockers", label: "Waiting / Blockers", space: "fixed", lineCount: 3, responseStyle: "ruled" },
    { id: "dates", label: "Important dates", space: "fixed", lineCount: 3, responseStyle: "ruled", beside: true },
    { id: "notes", label: "Notes", space: "fill", responseStyle: "ruled" },
  ],
});

/** REVELATION TO EXECUTION: heading, four equal writing areas, then Status / Review date. */
export const REVELATION_TO_EXECUTION = (): PromptSet => ({
  blocks: [
    { id: "title", kind: "heading", label: "Revelation to Execution" },
    { id: "received", label: "What I received", space: "equal", responseStyle: "ruled" },
    { id: "concerns", label: "What I believe it concerns", space: "equal", responseStyle: "ruled" },
    { id: "discern", label: "Scripture + what needs discernment", space: "equal", responseStyle: "ruled" },
    { id: "next", label: "Next act of obedience or action", space: "equal", responseStyle: "ruled" },
    { id: "status", kind: "info", label: "", fields: ["Status", "Review date"] },
  ],
});

/** MASTER DASHBOARD: one structured table filling the page. */
export const MASTER_DASHBOARD = (rows = 16): PromptSet => ({
  blocks: [
    { id: "title", kind: "heading", label: "Master Dashboard" },
    {
      id: "projects",
      label: "",
      space: "fixed",
      lineCount: rows,
      responseStyle: "table",
      table: { columns: ["Project / Area", "Status / Priority", "Next Step / Notes"], rows, showHeader: true, borders: "horizontal" },
    },
  ],
});
