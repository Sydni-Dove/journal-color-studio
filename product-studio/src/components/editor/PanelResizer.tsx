/**
 * EDITOR | PREVIEW divider (desktop only). Drag, or focus it and use the
 * arrow keys (Shift = larger steps, Home / End = limits). The width is a UI
 * preference only — it changes how much room the preview has, never the
 * product's physical geometry. Hidden on narrow screens (stacked flow).
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export const PANEL_MIN = 360;
export const PANEL_MAX = 600;
/** The preview always keeps at least this much width. */
const PREVIEW_MIN = 480;
const KEY = "dove-product-studio:v1:ui:panel-width";

/** Default: ~30% of the window, between 420 and 480 px. */
export function defaultPanelWidth(windowW: number): number {
  return Math.round(Math.min(480, Math.max(420, windowW * 0.3)));
}

export function clampPanelWidth(w: number, windowW: number): number {
  const max = Math.max(PANEL_MIN, Math.min(PANEL_MAX, windowW - PREVIEW_MIN));
  return Math.round(Math.min(max, Math.max(PANEL_MIN, w)));
}

function readStored(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function usePanelWidth() {
  const winW = () => (typeof window === "undefined" ? 1280 : window.innerWidth);
  const [width, setWidth] = useState(() => clampPanelWidth(readStored() ?? defaultPanelWidth(winW()), winW()));
  useEffect(() => {
    const onResize = () => setWidth((w) => clampPanelWidth(w, winW()));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const set = useCallback((w: number) => {
    const next = clampPanelWidth(w, winW());
    setWidth(next);
    try {
      localStorage.setItem(KEY, String(next));
    } catch {
      /* preference only */
    }
  }, []);
  const reset = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* preference only */
    }
    setWidth(clampPanelWidth(defaultPanelWidth(winW()), winW()));
  }, []);
  return { width, set, reset };
}

export function PanelResizer({ width, onChange, onReset }: { width: number; onChange: (w: number) => void; onReset: () => void }) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  const max = clampPanelWidth(PANEL_MAX, typeof window === "undefined" ? 1280 : window.innerWidth);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: e.clientX, w: width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) onChange(drag.current.w + (e.clientX - drag.current.x));
  };
  const end = () => (drag.current = null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === "ArrowLeft") onChange(width - step);
    else if (e.key === "ArrowRight") onChange(width + step);
    else if (e.key === "Home") onChange(PANEL_MIN);
    else if (e.key === "End") onChange(PANEL_MAX);
    else return;
    e.preventDefault();
  };
  return (
    <div
      className="panel-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the editor panel"
      aria-valuemin={PANEL_MIN}
      aria-valuemax={max}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  );
}
