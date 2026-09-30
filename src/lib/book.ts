// Which page sits where: spreads, leaves, and the faces of a turning leaf.
//
// Two-page mode (tablet/desktop): leaf j carries page 2j on its front and 2j+1 on
// its back. Spread s shows page 2s-1 on the left and 2s on the right.
// One-page mode (phone): each leaf carries one page, like a pocket notebook; its
// back is the reverse of that page (ruled, with a faint show-through).

import type { Dir } from './geometry';

export type Mode = 'two' | 'one';

export type PageRef =
  | { kind: 'page'; index: number }
  | { kind: 'ghost'; index: number }
  | { kind: 'endpaper'; which: 'front' | 'back' };

export function maxSpread(mode: Mode, pageCount: number): number {
  return mode === 'two' ? Math.ceil(pageCount / 2) : pageCount - 1;
}

export function leftOf(mode: Mode, s: number): PageRef {
  if (s === 0) return { kind: 'endpaper', which: 'front' };
  return mode === 'two' ? { kind: 'page', index: 2 * s - 1 } : { kind: 'ghost', index: s - 1 };
}

export function rightOf(mode: Mode, s: number, pageCount: number): PageRef {
  const i = mode === 'two' ? 2 * s : s;
  return i < pageCount ? { kind: 'page', index: i } : { kind: 'endpaper', which: 'back' };
}

export function spreadOfPage(mode: Mode, page: number): number {
  return mode === 'two' ? Math.ceil(page / 2) : page;
}

/** Content pages the reader can see on a spread. */
export function visiblePages(mode: Mode, s: number): number[] {
  return mode === 'two' ? [2 * s - 1, 2 * s].filter((p) => p >= 0) : [s];
}

export interface FlipFaces {
  dir: Dir;
  from: number;
  to: number;
  /** Side of the turning leaf showing at the start. */
  front: PageRef;
  /** Side of the turning leaf showing at the end. */
  back: PageRef;
  /** Page revealed beneath the turning leaf. */
  under: PageRef;
  /** Page on the other side of the spine that stays put. */
  still: PageRef;
}

export function flipFaces(mode: Mode, from: number, to: number, pageCount: number): FlipFaces {
  if (to > from) {
    return { dir: 'fwd', from, to, front: rightOf(mode, from, pageCount), back: leftOf(mode, to), under: rightOf(mode, to, pageCount), still: leftOf(mode, from) };
  }
  return { dir: 'back', from, to, front: leftOf(mode, from), back: rightOf(mode, to, pageCount), under: leftOf(mode, to), still: rightOf(mode, from, pageCount) };
}
