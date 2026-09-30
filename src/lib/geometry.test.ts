import { describe, expect, it } from 'vitest';
import { computeFold, constrain } from './geometry';

const W = 500;
const H = 720;
const apply = (mtx: number[], x: number, y: number) => ({ x: mtx[0] * x + mtx[2] * y + mtx[4], y: mtx[1] * x + mtx[3] * y + mtx[5] });

describe('computeFold', () => {
  it('is flat when the corner is at rest', () => {
    expect(computeFold('fwd', 'bottom', { x: 2 * W, y: H }, W, H).flat).toBe(true);
  });

  it('lands the back page exactly on the left slot at the end of a forward turn', () => {
    const f = computeFold('fwd', 'bottom', { x: 0, y: H }, W, H);
    const p = apply(f.flapMatrix, 10, 20);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(20);
  });

  it('lands the back page exactly on the right slot at the end of a backward turn', () => {
    const f = computeFold('back', 'top', { x: 0, y: 0 }, W, H);
    const p = apply(f.flapMatrix, 10, 20);
    expect(p.x).toBeCloseTo(W + 10);
    expect(p.y).toBeCloseTo(20);
  });

  it('keeps the flap attached to the fold line mid-turn', () => {
    const f = computeFold('fwd', 'bottom', { x: 700, y: 600 }, W, H);
    // Every flap vertex maps from the back page's local clip polygon.
    f.flapClip.forEach((q, i) => {
      const p = apply(f.flapMatrix, q.x, q.y);
      expect(p.x).toBeCloseTo(f.flap[i].x);
      expect(p.y).toBeCloseTo(f.flap[i].y);
    });
    // Points on the fold line stay put.
    const onFold = f.revealed.filter((q) => Math.abs((q.x - f.mid.x) * f.normal.x + (q.y - f.mid.y) * f.normal.y) < 1e-6);
    expect(onFold.length).toBe(2);
  });

  it('never stretches the paper past the spine', () => {
    const p = constrain({ x: -400, y: H + 300 }, 'bottom', W, H);
    expect(Math.hypot(p.x - W, p.y - H)).toBeLessThanOrEqual(W + 1e-6);
  });
});
