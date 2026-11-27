/**
 * COVER STUDIO — handing a prompt to ChatGPT.
 *
 * "Generate in ChatGPT" opens ChatGPT in a new tab with the prompt already in the message box, for the maker to read and
 * send. ChatGPT has two address parameters, and they behave differently (checked in a real browser, 2026-11-13):
 *   ?q=       fills the box AND sends it at once — never used here (the maker must review it first).
 *   ?prompt=  fills the box and waits — used.
 * The parameter is ChatGPT's, not an API: it can change. So the studio always keeps the copy-and-paste way next to it, copies the
 * prompt as a backup when it launches, and says what to do when the box comes up empty.
 */
import { promptTitle, rememberPrompt } from "../prompts/library";

export const CHATGPT_HOME = "https://chatgpt.com/";

/** The longest address the launch uses. Longer prompts are not put in an address (browsers, proxies and ChatGPT cut long ones). */
export const CHATGPT_URL_MAX = 8000;

/** ChatGPT's address with `message` waiting in the message box (not sent). */
export const chatgptPromptUrl = (message: string): string => `${CHATGPT_HOME}?prompt=${encodeURIComponent(message)}`;

/** Whether the prompt fits in an address; if not, the launch falls back to copy-and-paste. */
export const fitsInAddress = (message: string): boolean => chatgptPromptUrl(message).length <= CHATGPT_URL_MAX;

export type LaunchResult = "launched" | "too-long" | "blocked";

/**
 * Open ChatGPT with the message waiting in its box. `open` is window.open (a parameter so it can be tested).
 * "too-long": nothing prefilled — ChatGPT's plain page is opened instead and the message must be pasted.
 * "blocked": the browser refused the new tab.
 */
export function launchChatGpt(message: string, open: (url: string, target: string) => Window | null): LaunchResult {
  // Every prompt sent to ChatGPT is kept in My Prompts, as it was sent.
  rememberPrompt(message, promptTitle(message), "Sent to ChatGPT");
  const direct = fitsInAddress(message);
  const w = open(direct ? chatgptPromptUrl(message) : CHATGPT_HOME, "_blank");
  if (!w) return "blocked";
  try {
    w.opener = null; // the new tab gets no handle back to this studio
  } catch {
    /* already detached */
  }
  return direct ? "launched" : "too-long";
}
