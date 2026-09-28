import { useEffect, useState } from "react";
import { googleFontsHref, localFontFaces } from "../presets/typography/typography";
import type { FontSelection } from "../types/tokens";

const LINK_ID = "ps-google-fonts";
const LOCAL_ID = "ps-local-fonts";
const WEIGHTS = [400, 500, 600, 700];

/**
 * Loads the selected font families and reports when they are ready, so text
 * measurement (validation) runs against the real glyph metrics.
 */
export function useFontLoader(fonts: FontSelection): boolean {
  const families = [...new Set(Object.values(fonts))].sort();
  const key = families.join("|");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // UI chrome fonts are always included.
    const href = googleFontsHref([...families, "Lato", "Playfair Display"]);
    let link = document.getElementById(LINK_ID) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = LINK_ID;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    let local = document.getElementById(LOCAL_ID) as HTMLStyleElement | null;
    if (!local) {
      local = document.createElement("style");
      local.id = LOCAL_ID;
      document.head.appendChild(local);
    }
    const faces = localFontFaces(families);
    if (local.textContent !== faces) local.textContent = faces;
    if (link.href !== href) {
      setReady(false);
      link.href = href;
    }
    let cancelled = false;
    const done = () => !cancelled && setReady(true);
    // Every weight a role may use: a bold or medium face measured before it loads would be measured with
    // the regular face's (different) widths, and layouts would fit headings the live check then rejects.
    const loads = families.flatMap((f) => WEIGHTS.map((w) => document.fonts.load(`${w} 16px "${f}"`).catch(() => undefined)));
    Promise.all(loads).then(() => document.fonts.ready).then(done, done);
    return () => {
      cancelled = true;
    };
  }, [key]);

  return ready;
}

/**
 * Counts completed font-face loads. A face can finish after the fonts were
 * reported ready (a weight first drawn later); measurements made before it
 * arrived used a fallback's widths, so text must be measured again.
 */
export function useFontFacesLoaded(): number {
  const [loaded, setLoaded] = useState(0);
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts?.addEventListener) return;
    const bump = () => setLoaded((n) => n + 1);
    document.fonts.addEventListener("loadingdone", bump);
    return () => document.fonts.removeEventListener("loadingdone", bump);
  }, []);
  return loaded;
}
