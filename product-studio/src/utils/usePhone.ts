import { useEffect, useState } from "react";

/** Phone-width screens (the editor stacks below 900px; thumbnails grow below 600px so they stay readable). */
const QUERY = "(max-width: 600px)";

export function usePhone(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(QUERY).matches);
  useEffect(() => {
    const m = window.matchMedia?.(QUERY);
    if (!m) return;
    const on = () => setPhone(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return phone;
}

/** Thumbnail height for this screen: larger on a phone, where a small page is hard to read. */
export const thumbHeight = (phone: boolean, desktopPx: number, phonePx: number) => (phone ? phonePx : desktopPx);
