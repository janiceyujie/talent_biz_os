type Rect = { left: number; top: number; bottom: number };
type Size = { width: number; height: number };
/** Coordinates use the visible viewport so zoom, small screens and the on-screen keyboard stay bounded. */
export function placeHint(anchor: Rect, size: Size, viewport: Size & { left: number; top: number }, preferAbove = false) {
  const margin = 16, gap = 6;
  const topEdge = viewport.top + margin, bottomEdge = viewport.top + viewport.height - margin;
  const above = Math.max(0, anchor.top - gap - topEdge), below = Math.max(0, bottomEdge - anchor.bottom - gap);
  const useAbove = preferAbove ? above >= size.height || above >= below : below < size.height && above > below;
  const maxHeight = Math.max(1, Math.min(size.height, useAbove ? above : below));
  const left = Math.max(viewport.left + margin, Math.min(anchor.left - 8, viewport.left + viewport.width - margin - size.width));
  const top = Math.max(topEdge, Math.min(useAbove ? anchor.top - gap - maxHeight : anchor.bottom + gap, bottomEdge - maxHeight));
  return { left, top, maxHeight };
}
