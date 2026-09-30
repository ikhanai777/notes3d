import { describe, expect, it } from 'vitest';
import { CAMERAS, fitCamera, project, unproject } from './camera';

const box = { x0: -26, x1: 1044, y0: -22, y1: 744 };

describe('camera', () => {
  it('flat view is a plain scale and offset', () => {
    const f = fitCamera(box, CAMERAS.flat, 1000, 700);
    const p = project(f.matrix, { x: 100, y: 200 });
    expect(p.x).toBeCloseTo(f.tx + 100 * f.scale);
    expect(p.y).toBeCloseTo(f.ty + 200 * f.scale);
  });

  it('maps screen taps back to the same page point in perspective', () => {
    const f = fitCamera(box, CAMERAS.perspective, 1200, 800);
    for (const q of [{ x: 0, y: 0 }, { x: 740, y: 360 }, { x: 1000, y: 720 }]) {
      const back = unproject(f.matrix, project(f.matrix, q));
      expect(back.x).toBeCloseTo(q.x, 3);
      expect(back.y).toBeCloseTo(q.y, 3);
    }
  });

  it('keeps the tilted book inside the area', () => {
    const f = fitCamera(box, CAMERAS.perspective, 390, 700);
    for (const q of [{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 }]) {
      const p = project(f.matrix, q);
      expect(p.x).toBeGreaterThanOrEqual(-0.01);
      expect(p.x).toBeLessThanOrEqual(390.01);
      expect(p.y).toBeGreaterThanOrEqual(-0.01);
      expect(p.y).toBeLessThanOrEqual(700.01);
    }
  });

  it('makes the near edge of the book larger than the far edge', () => {
    const f = fitCamera(box, { tilt: 34, turn: 0 }, 1200, 800);
    const top = project(f.matrix, { x: box.x1, y: box.y0 }).x - project(f.matrix, { x: box.x0, y: box.y0 }).x;
    const bottom = project(f.matrix, { x: box.x1, y: box.y1 }).x - project(f.matrix, { x: box.x0, y: box.y1 }).x;
    expect(bottom).toBeGreaterThan(top);
  });
});
