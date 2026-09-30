// The camera looking at the book: flat (straight down) or perspective (tilted,
// like a photo of a journal on a desk).
//
// The CSS transform on the book is built from the same numbers as the matrix
// here, so screen points can be mapped back onto the page for taps and drags.

import type { Pt } from './geometry';

import type { ViewId } from './model';
export type { ViewId };

export interface CameraAngles {
  /** Tilt away from the viewer, degrees (0 = looking straight down). */
  tilt: number;
  /** Turn of the book on the desk, degrees. */
  turn: number;
}

export const CAMERAS: Record<ViewId, CameraAngles> = {
  flat: { tilt: 0, turn: 0 },
  perspective: { tilt: 34, turn: -7 },
};

/** Gentler angle for a single page on a phone held upright. */
export const PHONE_PERSPECTIVE: CameraAngles = { tilt: 26, turn: -4 };

/** Camera distance in book pixels. */
export const DISTANCE = 2400;

type M4 = number[]; // row-major 4×4, column vectors

export function mul(a: M4, b: M4): M4 {
  const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
  return o;
}

const translate = (x: number, y: number, z = 0): M4 => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
const scale2 = (s: number): M4 => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const perspective = (d: number): M4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -1 / d, 1];
const rad = (deg: number) => (deg * Math.PI) / 180;
const rotX = (deg: number): M4 => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1];
};
const rotZ = (deg: number): M4 => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
};

/** Project a book point (on the z = 0 plane unless given) through a matrix. */
export function project(m: M4, p: Pt, z = 0): Pt {
  const x = m[0] * p.x + m[1] * p.y + m[2] * z + m[3];
  const y = m[4] * p.x + m[5] * p.y + m[6] * z + m[7];
  const w = m[12] * p.x + m[13] * p.y + m[14] * z + m[15];
  return { x: x / w, y: y / w };
}

/** Map a screen point back onto the book's z = plane. */
export function unproject(m: M4, s: Pt, z = 0): Pt {
  // For points on a plane the projection is a homography; invert it.
  const h = [
    m[0], m[1], m[2] * z + m[3],
    m[4], m[5], m[6] * z + m[7],
    m[12], m[13], m[14] * z + m[15],
  ];
  const [a, b, c, d, e, f, g, hh, i] = h;
  const A = e * i - f * hh;
  const B = -(d * i - f * g);
  const C = d * hh - e * g;
  const D = -(b * i - c * hh);
  const E = a * i - c * g;
  const F = -(a * hh - b * g);
  const G = b * f - c * e;
  const Hh = -(a * f - c * d);
  const II = a * e - b * d;
  // inverse = adjugate / det (the determinant cancels in the division below)
  const x = A * s.x + D * s.y + G;
  const y = B * s.x + E * s.y + Hh;
  const w = C * s.x + F * s.y + II;
  return { x: x / w, y: y / w };
}

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Fit {
  scale: number;
  tx: number;
  ty: number;
  /** Full book → screen (relative to the book area) matrix. */
  matrix: M4;
  /** CSS transform with the same function list for every camera, so views animate. */
  css: string;
}

/**
 * Scale and place the book so the part in `box` fills a width × height area,
 * seen through the camera. The camera pivots on the middle of the box.
 */
export function fitCamera(box: Box, cam: CameraAngles, width: number, height: number): Fit {
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const view = mul(mul(mul(mul(translate(cx, cy), perspective(DISTANCE)), rotX(cam.tilt)), rotZ(cam.turn)), translate(-cx, -cy));
  const corners = [
    { x: box.x0, y: box.y0 },
    { x: box.x1, y: box.y0 },
    { x: box.x1, y: box.y1 },
    { x: box.x0, y: box.y1 },
  ].map((p) => project(view, p));
  const px0 = Math.min(...corners.map((p) => p.x));
  const px1 = Math.max(...corners.map((p) => p.x));
  const py0 = Math.min(...corners.map((p) => p.y));
  const py1 = Math.max(...corners.map((p) => p.y));
  const scale = Math.max(0.1, Math.min(width / (px1 - px0), height / (py1 - py0)));
  const tx = (width - (px1 - px0) * scale) / 2 - px0 * scale;
  const ty = (height - (py1 - py0) * scale) / 2 - py0 * scale;
  const matrix = mul(mul(translate(tx, ty), scale2(scale)), view);
  const css =
    `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${scale.toFixed(5)}) ` +
    `translate(${cx.toFixed(2)}px, ${cy.toFixed(2)}px) perspective(${DISTANCE}px) ` +
    `rotateX(${cam.tilt}deg) rotateZ(${cam.turn}deg) translate(${(-cx).toFixed(2)}px, ${(-cy).toFixed(2)}px)`;
  return { scale, tx, ty, matrix, css };
}
