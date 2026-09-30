// Pagination: flows journal entries onto ruled pages, line by line.
//
// Every line of text sits on a ruled line. Entries follow each other through one
// continuous book, like a paper journal. The result is pure data; rendering and
// hit-testing both use it.

import type { Measurer } from './fonts';
import { isPhotoCp, isStickerCp, PHOTO_BASE, STICKER_BASE, type Entry } from './model';
import { jitter } from './rng';

export const PAGE = {
  W: 500,
  H: 720,
  LINE: 34,
  /** Baseline (ruled line) of row 0. */
  FIRST: 104,
  ROWS: 17,
  MX: 46,
  BULLET_INDENT: 24,
  CHECK_INDENT: 32,
  STICKER_W: 44,
  PHOTO_ROWS: 7,
};

export const baselineY = (row: number) => PAGE.FIRST + row * PAGE.LINE;

export type Run =
  | { kind: 'word'; text: string; start: number; end: number; x: number; w: number }
  | { kind: 'sticker'; sticker: number; start: number; end: number; x: number; w: number }
  | { kind: 'bullet'; x: number }
  | { kind: 'checkbox'; x: number; checked: boolean; start: number };

export interface Line {
  row: number;
  kind: 'heading' | 'text' | 'divider';
  entryId: string;
  /** Body offsets covered by this line: [start, end). */
  start: number;
  end: number;
  /** Offset where the caret goes when placed at the visual end of the line. */
  caretEnd: number;
  /** Where text begins (after a bullet or checkbox), as x and as body offset. */
  contentX: number;
  textStart: number;
  runs: Run[];
  date?: string;
}

export interface PhotoBlock {
  entryId: string;
  photoId: number;
  start: number;
  end: number;
  row: number;
  rows: number;
}

export interface PageLayout {
  index: number;
  kind: 'title' | 'content';
  lines: Line[];
  photos: PhotoBlock[];
}

export interface BookLayout {
  pages: PageLayout[];
  /** First page on which each entry appears. */
  entryPage: Map<string, number>;
  lastContentPage: number;
}

export interface LayoutOptions {
  size: number;
  newPagePerEntry: boolean;
  /** Vary word spacing a little, like handwriting. */
  natural: boolean;
}

interface Token {
  kind: 'word' | 'space' | 'sticker' | 'photo';
  text: string;
  start: number;
  end: number;
  cp?: number;
}

function tokenize(text: string, base: number): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i)!;
    const n = cp > 0xffff ? 2 : 1;
    if (isPhotoCp(cp) || isStickerCp(cp)) {
      out.push({ kind: isPhotoCp(cp) ? 'photo' : 'sticker', text: text.slice(i, i + n), start: base + i, end: base + i + n, cp });
      i += n;
      continue;
    }
    const isSpace = cp === 32 || cp === 9;
    let j = i + n;
    while (j < text.length) {
      const c = text.codePointAt(j)!;
      if (isPhotoCp(c) || isStickerCp(c)) break;
      if ((c === 32 || c === 9) !== isSpace) break;
      j += c > 0xffff ? 2 : 1;
    }
    out.push({ kind: isSpace ? 'space' : 'word', text: text.slice(i, j), start: base + i, end: base + j });
    i = j;
  }
  return out;
}

const BULLET_RE = /^(- |\* )/;
const CHECK_RE = /^\[( |x|X)\] /;

export function layoutBook(entries: Entry[], m: Measurer, opts: LayoutOptions): BookLayout {
  const pages: PageLayout[] = [{ index: 0, kind: 'title', lines: [], photos: [] }];
  const entryPage = new Map<string, number>();
  let pageIdx = 1;
  let row = 0;
  const cur = () => {
    while (pages.length <= pageIdx) pages.push({ index: pages.length, kind: 'content', lines: [], photos: [] });
    return pages[pageIdx];
  };
  const newPage = () => {
    pageIdx++;
    row = 0;
  };
  /** Claim the next ruled row, turning the page if needed. */
  const claimRow = () => {
    if (row >= PAGE.ROWS) newPage();
    const r = { page: cur(), row };
    row++;
    return r;
  };

  const maxX = PAGE.W - PAGE.MX;
  const spaceW = m.width(' ', opts.size) || opts.size * 0.25;

  for (const entry of entries) {
    if (row > 0) {
      if (opts.newPagePerEntry || row + 3 > PAGE.ROWS) newPage();
      else {
        const { page, row: r } = claimRow();
        page.lines.push({ row: r, kind: 'divider', entryId: entry.id, start: 0, end: 0, caretEnd: 0, contentX: PAGE.MX, textStart: 0, runs: [] });
      }
    }
    if (row + 2 > PAGE.ROWS) newPage();
    const head = claimRow();
    entryPage.set(entry.id, head.page.index);
    head.page.lines.push({
      row: head.row, kind: 'heading', entryId: entry.id, start: 0, end: 0, caretEnd: 0,
      contentX: PAGE.MX, textStart: 0, runs: [], date: entry.date,
    });

    const body = entry.body;
    let ps = 0;
    const paragraphs = body.split('\n');
    for (const para of paragraphs) {
      const paraStart = ps;
      ps += para.length + 1;

      let prefixLen = 0;
      let indent = 0;
      const lead: Run[] = [];
      const bullet = BULLET_RE.exec(para);
      const check = CHECK_RE.exec(para);
      if (bullet) {
        prefixLen = 2;
        indent = PAGE.BULLET_INDENT;
        lead.push({ kind: 'bullet', x: PAGE.MX + 6 });
      } else if (check) {
        prefixLen = 4;
        indent = PAGE.CHECK_INDENT;
        lead.push({ kind: 'checkbox', x: PAGE.MX + 2, checked: check[1] !== ' ', start: paraStart });
      }

      const x0 = PAGE.MX + indent;
      let line: Line = {
        row: -1, kind: 'text', entryId: entry.id, start: paraStart, end: paraStart, caretEnd: paraStart + prefixLen,
        contentX: x0, textStart: paraStart + prefixLen, runs: [...lead],
      };
      let x = x0;
      let pendingSpace = 0;
      let afterPhoto = false;
      const hasContent = () => line.runs.some((r) => r.kind === 'word' || r.kind === 'sticker');
      const emit = (end: number) => {
        const { page, row: r } = claimRow();
        line.row = r;
        line.end = end;
        page.lines.push(line);
      };
      const startLine = (start: number) => {
        line = { row: -1, kind: 'text', entryId: entry.id, start, end: start, caretEnd: start, contentX: x0, textStart: start, runs: [] };
        x = x0;
        pendingSpace = 0;
      };
      const place = (tok: Token, w: number, make: (x: number) => Run) => {
        const gap = line.runs.length && hasContent()
          ? pendingSpace * (opts.natural ? 1 + 0.12 * jitter(entry.id, tok.start, 'sp') : 1)
          : pendingSpace;
        if (x + gap + w > maxX && hasContent()) {
          emit(tok.start);
          startLine(tok.start);
          x += w;
          line.runs.push(make(x0));
        } else {
          line.runs.push(make(x + gap));
          x += gap + w;
        }
        line.caretEnd = tok.end;
        pendingSpace = 0;
        afterPhoto = false;
      };

      for (const tok of tokenize(para.slice(prefixLen), paraStart + prefixLen)) {
        if (tok.kind === 'space') {
          pendingSpace += spaceW * tok.text.length;
          if (!hasContent()) line.caretEnd = tok.end;
          continue;
        }
        if (tok.kind === 'photo') {
          if (hasContent() || line.runs.length) emit(tok.start);
          if (row + PAGE.PHOTO_ROWS > PAGE.ROWS) newPage();
          cur().photos.push({ entryId: entry.id, photoId: tok.cp! - PHOTO_BASE, start: tok.start, end: tok.end, row, rows: PAGE.PHOTO_ROWS });
          row += PAGE.PHOTO_ROWS;
          startLine(tok.end);
          afterPhoto = true;
          continue;
        }
        if (tok.kind === 'sticker') {
          place(tok, PAGE.STICKER_W, (sx) => ({ kind: 'sticker', sticker: tok.cp! - STICKER_BASE, start: tok.start, end: tok.end, x: sx, w: PAGE.STICKER_W }));
          continue;
        }
        // A word. Break words that are wider than a whole line.
        let rest = tok.text;
        let start = tok.start;
        while (rest.length) {
          let piece = rest;
          const avail = maxX - x0;
          if (m.width(piece, opts.size) > avail) {
            let k = piece.length - 1;
            while (k > 1 && m.width(piece.slice(0, k), opts.size) > avail) k--;
            piece = piece.slice(0, k);
          }
          const w = m.width(piece, opts.size);
          const t: Token = { kind: 'word', text: piece, start, end: start + piece.length };
          place(t, w, (wx) => ({ kind: 'word', text: piece, start: t.start, end: t.end, x: wx, w }));
          rest = rest.slice(piece.length);
          start += piece.length;
        }
      }
      if (!afterPhoto || hasContent()) emit(paraStart + para.length);
    }
  }

  const lastContentPage = pageIdx;
  // Leave some blank pages to write on, and finish on a whole leaf.
  let total = Math.max(lastContentPage + 3, 4);
  if (total % 2) total++;
  while (pages.length < total) pages.push({ index: pages.length, kind: 'content', lines: [], photos: [] });
  return { pages, entryPage, lastContentPage };
}

// ---------------------------------------------------------------------------
// Caret and hit-testing

export interface CaretPos {
  page: number;
  x: number;
  /** Baseline y. */
  y: number;
}

function offsetX(line: Line, offset: number, m: Measurer, size: number): number {
  let x = line.contentX;
  let prevEnd = line.textStart;
  if (offset <= prevEnd) return x;
  for (const r of line.runs) {
    if (r.kind === 'bullet' || r.kind === 'checkbox') continue;
    if (offset < r.start) {
      // In the gap before this run.
      return offset <= prevEnd ? x : Math.min(r.x, x + (offset - prevEnd) * m.width(' ', size));
    }
    if (offset <= r.end) {
      if (r.kind === 'sticker') return offset === r.start ? r.x : r.x + r.w;
      return r.x + m.width(r.text.slice(0, offset - r.start), size);
    }
    x = r.x + r.w;
    prevEnd = r.end;
  }
  return offset > prevEnd ? x + (offset - prevEnd) * m.width(' ', size) : x;
}

export function findCaret(book: BookLayout, entryId: string, offset: number, m: Measurer, size: number): CaretPos | null {
  const start = book.entryPage.get(entryId);
  if (start === undefined) return null;
  let best: { line: Line; page: number } | null = null;
  for (let p = start; p < book.pages.length; p++) {
    const page = book.pages[p];
    let seen = false;
    for (const line of page.lines) {
      if (line.entryId !== entryId || line.kind !== 'text') continue;
      seen = true;
      if (line.start <= offset && offset < line.end) return caretOn(line, p);
      if (line.start <= offset && offset <= line.end) best = { line, page: p };
    }
    for (const ph of page.photos) {
      if (ph.entryId !== entryId) continue;
      seen = true;
      if (offset === ph.end && (!best || best.line.end < ph.end)) {
        return { page: p, x: PAGE.W / 2 + 120, y: baselineY(ph.row + ph.rows - 1) };
      }
    }
    if (!seen && p > start && page.lines.length) break;
  }
  if (best) return caretOn(best.line, best.page);
  // Empty entry: first row after the heading.
  for (let p = start; p < book.pages.length; p++) {
    const h = book.pages[p].lines.find((l) => l.entryId === entryId && l.kind === 'heading');
    if (h) return { page: p, x: PAGE.MX, y: baselineY(h.row + 1) };
  }
  return null;

  function caretOn(line: Line, page: number): CaretPos {
    return { page, x: offsetX(line, offset, m, size), y: baselineY(line.row) };
  }
}

export interface Selection {
  page: number;
  x: number;
  y: number;
  w: number;
}

/** Highlight rectangles (per line) for a selection range within an entry. */
export function selectionRects(book: BookLayout, entryId: string, a: number, b: number, m: Measurer, size: number): Selection[] {
  const out: Selection[] = [];
  const start = book.entryPage.get(entryId);
  if (start === undefined || a === b) return out;
  for (let p = start; p < book.pages.length; p++) {
    for (const line of book.pages[p].lines) {
      if (line.entryId !== entryId || line.kind !== 'text') continue;
      const s = Math.max(a, line.start);
      const e = Math.min(b, line.end);
      if (s >= e) continue;
      const x1 = offsetX(line, s, m, size);
      const x2 = offsetX(line, Math.min(e, line.caretEnd), m, size);
      if (x2 > x1) out.push({ page: p, x: x1, y: baselineY(line.row), w: x2 - x1 });
    }
  }
  return out;
}

export type Hit =
  | { kind: 'text'; entryId: string; offset: number }
  | { kind: 'heading'; entryId: string }
  | { kind: 'checkbox'; entryId: string; offset: number }
  | { kind: 'photo'; entryId: string; photoId: number; offset: number }
  | { kind: 'empty' };

export function hitTest(page: PageLayout, x: number, y: number, m: Measurer, size: number): Hit {
  for (const ph of page.photos) {
    const top = baselineY(ph.row) - PAGE.LINE;
    const bottom = baselineY(ph.row + ph.rows - 1);
    if (y >= top && y <= bottom) return { kind: 'photo', entryId: ph.entryId, photoId: ph.photoId, offset: ph.end };
  }
  const row = Math.floor((y - (PAGE.FIRST - PAGE.LINE + 10)) / PAGE.LINE);
  const text = page.lines.filter((l) => l.kind !== 'divider');
  let line = text.find((l) => l.row === row);
  if (!line) {
    // Below the writing: go to the end of the last line above; above it: the first line.
    const above = text.filter((l) => l.row < row);
    if (above.length) {
      const last = above[above.length - 1];
      if (last.kind === 'heading') return { kind: 'text', entryId: last.entryId, offset: 0 };
      return { kind: 'text', entryId: last.entryId, offset: last.caretEnd };
    }
    const photoAbove = page.photos.filter((p) => p.row < row).pop();
    if (photoAbove) return { kind: 'text', entryId: photoAbove.entryId, offset: photoAbove.end };
    line = text[0];
    if (!line) return { kind: 'empty' };
  }
  if (line.kind === 'heading') return { kind: 'heading', entryId: line.entryId };

  for (const r of line.runs) {
    if (r.kind === 'checkbox' && x >= r.x - 8 && x <= r.x + 26) return { kind: 'checkbox', entryId: line.entryId, offset: r.start };
  }
  // Nearest character boundary.
  let best = line.caretEnd;
  let bestD = Infinity;
  const consider = (off: number, px: number) => {
    const d = Math.abs(px - x);
    if (d < bestD) {
      bestD = d;
      best = off;
    }
  };
  const words = line.runs.filter((r) => r.kind === 'word' || r.kind === 'sticker') as Extract<Run, { start: number; w: number }>[];
  if (!words.length) return { kind: 'text', entryId: line.entryId, offset: line.caretEnd };
  for (const r of words) {
    if (r.kind === 'sticker') {
      consider(r.start, r.x);
      consider(r.end, r.x + r.w);
      continue;
    }
    if (x < r.x - 30 || x > r.x + r.w + 30) {
      consider(r.start, r.x);
      consider(r.end, r.x + r.w);
      continue;
    }
    for (let i = 0; i <= r.text.length; i++) consider(r.start + i, r.x + m.width(r.text.slice(0, i), size));
  }
  return { kind: 'text', entryId: line.entryId, offset: Math.min(best, line.caretEnd) };
}
