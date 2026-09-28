/**
 * A tab left open keeps running the version it loaded. When the tab regains
 * focus (and every few minutes), compare the page's own script with the one
 * the server now serves; if a newer build is deployed, say so and offer to
 * reload. Read-only: it never reloads by itself (unsaved edits stay put).
 */
import { useEffect, useState } from "react";

const scriptOf = (html: string) => html.match(/assets\/index-[\w-]+\.js/)?.[0] ?? null;

export function useUpdateCheck(intervalMs = 5 * 60_000): boolean {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const mine = [...document.querySelectorAll<HTMLScriptElement>("script[src]")].map((s) => scriptOf(s.src)).find(Boolean);
    if (!mine) return; // dev server: nothing to compare
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch(`./?v=${Date.now()}`, { cache: "no-store" });
        const latest = res.ok ? scriptOf(await res.text()) : null;
        if (alive && latest && latest !== mine) setStale(true);
      } catch {
        /* offline: try again later */
      }
    };
    const onFocus = () => document.visibilityState === "visible" && check();
    const id = window.setInterval(check, intervalMs);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [intervalMs]);
  return stale;
}
