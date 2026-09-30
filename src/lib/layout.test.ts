import { describe, expect, it } from 'vitest';
import type { Measurer } from './fonts';
import { findCaret, hitTest, layoutBook, PAGE, baselineY } from './layout';
import { photoChar, stickerChar, type Entry } from './model';

// Monospace fake: every character is 10px wide.
const m: Measurer = { width: (t) => t.length * 10, baseline: (s) => s * 0.8 };
const opts = { size: 20, newPagePerEntry: false, natural: false };
const entry = (id: string, body: string, date = '2026-09-30'): Entry => ({ id, body, date, createdAt: 0, updatedAt: 0 });

describe('layoutBook', () => {
  it('starts with a title page and puts the first entry on page 1', () => {
    const book = layoutBook([entry('a', 'Hello world')], m, opts);
    expect(book.pages[0].kind).toBe('title');
    expect(book.entryPage.get('a')).toBe(1);
    const lines = book.pages[1].lines;
    expect(lines[0].kind).toBe('heading');
    expect(lines[1].runs.map((r) => (r.kind === 'word' ? r.text : ''))).toEqual(['Hello', 'world']);
    expect(book.pages.length % 2).toBe(0);
  });

  it('wraps words to the ruled line width', () => {
    const words = Array.from({ length: 30 }, (_, i) => `w${i}xx`).join(' ');
    const book = layoutBook([entry('a', words)], m, opts);
    const text = book.pages[1].lines.filter((l) => l.kind === 'text');
    expect(text.length).toBeGreaterThan(1);
    for (const l of text) for (const r of l.runs) if (r.kind === 'word') expect(r.x + r.w).toBeLessThanOrEqual(PAGE.W - PAGE.MX + 0.01);
  });

  it('flows onto the next page', () => {
    const body = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
    const book = layoutBook([entry('a', body)], m, opts);
    expect(book.pages[2].lines.length).toBeGreaterThan(0);
    expect(book.pages[1].lines.length).toBe(PAGE.ROWS);
  });

  it('places photos as blocks and stickers inline', () => {
    const body = `Leaf ${stickerChar(0)}\n${photoChar(7)}\nafter`;
    const book = layoutBook([entry('a', body)], m, opts);
    const p = book.pages[1];
    expect(p.photos).toHaveLength(1);
    expect(p.photos[0].photoId).toBe(7);
    expect(p.lines[1].runs.some((r) => r.kind === 'sticker')).toBe(true);
    const after = p.lines.find((l) => l.runs.some((r) => r.kind === 'word' && r.text === 'after'))!;
    expect(after.row).toBe(p.photos[0].row + PAGE.PHOTO_ROWS);
  });

  it('recognises bullets and checkboxes', () => {
    const book = layoutBook([entry('a', '- milk\n[x] eggs')], m, opts);
    const [, b, c] = book.pages[1].lines;
    expect(b.runs[0].kind).toBe('bullet');
    expect(c.runs[0]).toMatchObject({ kind: 'checkbox', checked: true });
  });
});

describe('caret and hit-testing', () => {
  const book = layoutBook([entry('a', 'Hello world\n\nNext')], m, opts);
  it('maps offsets to positions', () => {
    const c = findCaret(book, 'a', 3, m, 20)!;
    expect(c.page).toBe(1);
    expect(c.x).toBe(PAGE.MX + 30);
    expect(c.y).toBe(baselineY(1));
    expect(findCaret(book, 'a', 12, m, 20)!.y).toBe(baselineY(2));
    expect(findCaret(book, 'a', 17, m, 20)!.y).toBe(baselineY(3));
  });
  it('maps taps back to offsets', () => {
    const hit = hitTest(book.pages[1], PAGE.MX + 31, baselineY(1) - 8, m, 20);
    expect(hit).toEqual({ kind: 'text', entryId: 'a', offset: 3 });
    expect(hitTest(book.pages[1], 100, baselineY(0) - 8, m, 20)).toEqual({ kind: 'heading', entryId: 'a' });
    expect(hitTest(book.pages[1], 100, baselineY(10), m, 20)).toEqual({ kind: 'text', entryId: 'a', offset: 17 });
  });
});
