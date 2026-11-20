/**
 * What went wrong with online saving or signing in, in plain words: above all, a server that couldn't be reached
 * (a timeout, the server down or overloaded, no internet) is never reported as a wrong password or a lost save.
 */

/** True when the problem is reaching the server (not a refusal from it). */
export function unreachable(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const x = (e ?? {}) as { name?: string; message?: string; status?: number; code?: string | number; details?: string };
  // An HTTP status (Postgres error codes like "42501" are five characters and aren't statuses).
  const status = typeof x.status === "number" ? x.status : /^\d{3}$/.test(String(x.code ?? "")) ? Number(x.code) : NaN;
  if (Number.isFinite(status) && (status === 0 || status === 408 || status === 429 || status >= 500)) return true;
  const text = `${x.name ?? ""} ${x.message ?? ""} ${x.details ?? ""}`;
  return /AbortError|TimeoutError|timed? ?out|Failed to fetch|NetworkError|Load failed|network|fetch failed|AuthRetryableFetchError|upstream|gateway|50[0234]|52[0-4]|ECONN|<html|Unexpected token/i.test(text);
}

export const SAVE_UNREACHABLE = "Couldn't reach the saving server, so your work isn't saved online yet. It's safe on this device and will be saved online automatically when the server answers again.";
export const SIGN_IN_UNREACHABLE = "Couldn't reach the sign-in server, so your password wasn't checked (nothing is wrong with it). Your work is safe on this device. Please try again in a few minutes.";
export const WRONG_PASSWORD = "That email and password don't match a Dove Expressions account.";

/** A failed online save or sync, for the screen. */
export function saveErrorMessage(e: unknown): string {
  if (unreachable(e)) return SAVE_UNREACHABLE;
  const m = (e as { message?: string })?.message;
  return `Online saving didn't work${m ? ` (${m})` : ""}. Your work is safe on this device and online saving will try again.`;
}

/** A failed sign-in, for the screen. */
export function signInErrorMessage(e: unknown): string {
  if (unreachable(e)) return SIGN_IN_UNREACHABLE;
  const m = (e as { message?: string })?.message ?? "";
  if (/invalid login credentials/i.test(m)) return WRONG_PASSWORD;
  if (/email not confirmed/i.test(m)) return "This email address hasn't been confirmed yet. Open the confirmation email, then sign in.";
  return m || SIGN_IN_UNREACHABLE;
}
