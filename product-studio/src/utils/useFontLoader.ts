import { useEffect, useState } from "react";
import { googleFontsHref } from "../presets/typography/typography";
import type { FontSelection } from "../types/tokens";

const LINK_ID = "ps-google-fonts";

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
    if (link.href !== href) {
      setReady(false);
      link.href = href;
    }
    let cancelled = false;
    const done = () => !cancelled && setReady(true);
    const loads = families.map((f) => document.fonts.load(`16px "${f}"`).catch(() => undefined));
    Promise.all(loads).then(() => document.fonts.ready).then(done, done);
    return () => {
      cancelled = true;
    };
  }, [key]);

  return ready;
}
