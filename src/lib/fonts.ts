import type { FontId } from './model';

export interface HandFont {
  label: string;
  family: string;
  weight: number;
  size: number;
  headingSize: number;
  sample: string;
}

export const HAND_FONTS: Record<FontId, HandFont> = {
  cursive: { label: 'Flowing cursive', family: '"Dancing Script"', weight: 500, size: 27, headingSize: 30, sample: 'Dear diary' },
  casual: { label: 'Casual hand', family: 'Caveat', weight: 500, size: 30, headingSize: 32, sample: 'Dear diary' },
  loose: { label: 'Loose script', family: '"Homemade Apple"', weight: 400, size: 19, headingSize: 21, sample: 'Dear diary' },
  print: { label: 'Neat print', family: 'Kalam', weight: 400, size: 22, headingSize: 25, sample: 'Dear diary' },
};

export const CLEAN_FONT: HandFont = {
  label: 'Clean reading',
  family: '"Atkinson Hyperlegible"',
  weight: 400,
  size: 19,
  headingSize: 21,
  sample: 'Dear diary',
};

export const UI_FONT = '"Inter", system-ui, sans-serif';

export const cssFont = (f: HandFont, size: number) => `${f.weight} ${size}px ${f.family}`;

export interface Measurer {
  /** Width of text at the given font size. */
  width(text: string, size: number): number;
  /** Distance from the top of a line box of height `size` down to the baseline. */
  baseline(size: number): number;
}

/** Canvas-backed measurer with a width cache. Fonts must already be loaded. */
export function canvasMeasurer(font: HandFont): Measurer {
  const ctx = document.createElement('canvas').getContext('2d')!;
  const cache = new Map<string, number>();
  const baseCache = new Map<number, number>();
  return {
    width(text, size) {
      const key = size + '|' + text;
      let w = cache.get(key);
      if (w === undefined) {
        ctx.font = cssFont(font, size);
        w = ctx.measureText(text).width;
        cache.set(key, w);
      }
      return w;
    },
    baseline(size) {
      let b = baseCache.get(size);
      if (b === undefined) {
        ctx.font = cssFont(font, size);
        const m = ctx.measureText('Hg');
        const a = m.fontBoundingBoxAscent ?? size * 0.8;
        const d = m.fontBoundingBoxDescent ?? size * 0.2;
        b = (size - (a + d)) / 2 + a;
        baseCache.set(size, b);
      }
      return b;
    },
  };
}

export async function loadFont(font: HandFont): Promise<void> {
  if (!('fonts' in document)) return;
  try {
    await Promise.all([
      document.fonts.load(cssFont(font, font.size), 'abc'),
      document.fonts.load(cssFont(font, font.headingSize), 'abc'),
    ]);
  } catch {
    // Fall back to whatever is available; layout still works with the fallback font.
  }
}
