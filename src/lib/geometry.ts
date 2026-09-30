// Page-fold geometry for the page-turn effect.
//
// The book is laid out in "book coordinates": left page slot is [0, W], right
// page slot is [W, 2W], spine at x = W, page height H. A turning page is folded
// along a straight line: the perpendicular bisector between the page corner at
// rest (C0) and where the user is holding it (P). The part of the page on the
// corner's side of that line is reflected across it and shows the page's back.

export type Pt = { x: number; y: number };
export type Dir = 'fwd' | 'back';
export type Corner = 'top' | 'bottom';

export interface Fold {
  /** No visible fold (corner at rest). */
  flat: boolean;
  /** Clip polygon for the still-flat part of the turning page, in its slot's local coords. */
  frontClip: Pt[];
  /** Clip polygon for the flap (the back of the page), in the back page's local coords. */
  flapClip: Pt[];
  /** CSS matrix (a, b, c, d, e, f) placing the back page element (at book origin) onto the flap. */
  flapMatrix: [number, number, number, number, number, number];
  /** Folded-over region of the turning page's slot (reveals the page underneath), in book coords. */
  revealed: Pt[];
  /** The flap as it currently lies, in book coords. */
  flap: Pt[];
  /** A point on the fold line and the unit normal pointing into the revealed region. */
  mid: Pt;
  normal: Pt;
  /** Distance between the resting corner and the held corner (size of the fold). */
  depth: number;
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const len = (a: Pt) => Math.hypot(a.x, a.y);

/** Resting corner of the turning page, in the forward frame (page on the right). */
export function restCorner(corner: Corner, W: number, H: number): Pt {
  return { x: 2 * W, y: corner === 'bottom' ? H : 0 };
}

/** Keep the held corner where real paper could reach, pinned at the spine. */
export function constrain(p: Pt, corner: Corner, W: number, H: number): Pt {
  const near: Pt = { x: W, y: corner === 'bottom' ? H : 0 };
  const far: Pt = { x: W, y: corner === 'bottom' ? 0 : H };
  let q = { ...p };
  const d1 = len(sub(q, near));
  if (d1 > W) q = { x: near.x + ((q.x - near.x) * W) / d1, y: near.y + ((q.y - near.y) * W) / d1 };
  const diag = Math.hypot(W, H);
  const d2 = len(sub(q, far));
  if (d2 > diag) q = { x: far.x + ((q.x - far.x) * diag) / d2, y: far.y + ((q.y - far.y) * diag) / d2 };
  return q;
}

/** Clip a convex polygon to the half-plane where keep(q) >= 0 (Sutherland–Hodgman, one edge). */
export function clipHalfPlane(poly: Pt[], side: (q: Pt) => number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

const mirror = (p: Pt, W: number): Pt => ({ x: 2 * W - p.x, y: p.y });

/**
 * Compute the fold for a page turn.
 * @param held held corner position in the *forward* frame (turning page on the right).
 */
export function computeFold(dir: Dir, corner: Corner, held: Pt, W: number, H: number): Fold {
  const c0f = restCorner(corner, W, H);
  const pf = constrain(held, corner, W, H);
  const depth = len(sub(c0f, pf));
  const rightRect: Pt[] = [
    { x: W, y: 0 },
    { x: 2 * W, y: 0 },
    { x: 2 * W, y: H },
    { x: W, y: H },
  ];

  // Move to real book coords: backward turns are the mirror image about the spine.
  const toBook = (p: Pt) => (dir === 'fwd' ? p : mirror(p, W));
  const c0 = toBook(c0f);
  const p = toBook(pf);
  const slot = dir === 'fwd' ? W : 0; // x offset of the turning page's slot
  const backSlot = dir === 'fwd' ? 0 : W; // where the page's back lands when the turn completes
  const pageRect = rightRect.map(toBook);

  if (depth < 0.5) {
    return {
      flat: true,
      frontClip: pageRect.map((q) => ({ x: q.x - slot, y: q.y })),
      flapClip: [],
      flapMatrix: [1, 0, 0, 1, 0, 0],
      revealed: [],
      flap: [],
      mid: c0,
      normal: { x: dir === 'fwd' ? 1 : -1, y: 0 },
      depth: 0,
    };
  }

  const n = { x: (c0.x - p.x) / depth, y: (c0.y - p.y) / depth };
  const m = { x: (c0.x + p.x) / 2, y: (c0.y + p.y) / 2 };
  const side = (q: Pt) => dot(sub(q, m), n);

  const front = clipHalfPlane(pageRect, (q) => -side(q));
  const revealed = clipHalfPlane(pageRect, side);

  // Reflection across the fold line: R(q) = A q + b, A = I - 2 n nᵀ, b = 2 (m·n) n.
  const A = [1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.y, 1 - 2 * n.y * n.y]; // row-major 2x2
  const mn = dot(m, n);
  const b = { x: 2 * mn * n.x, y: 2 * mn * n.y };
  const reflect = (q: Pt): Pt => ({ x: A[0] * q.x + A[1] * q.y + b.x, y: A[2] * q.x + A[3] * q.y + b.y });

  // The back page element sits at the book origin; its local point l shows paper point
  // Mx(l + backSlot), where Mx mirrors about the spine. Current position = R(Mx(l + o)).
  // Mx(u) = D u + (2W, 0) with D = diag(-1, 1), so K = A D and T = A (D o + (2W, 0)) + b.
  const K = [-A[0], A[1], -A[2], A[3]];
  const u0 = { x: 2 * W - backSlot, y: 0 };
  const T = { x: A[0] * u0.x + A[1] * u0.y + b.x, y: A[2] * u0.x + A[3] * u0.y + b.y };

  return {
    flat: false,
    frontClip: front.map((q) => ({ x: q.x - slot, y: q.y })),
    flapClip: revealed.map((q) => ({ x: 2 * W - q.x - backSlot, y: q.y })),
    flapMatrix: [K[0], K[2], K[1], K[3], T.x, T.y],
    revealed,
    flap: revealed.map(reflect),
    mid: m,
    normal: n,
    depth,
  };
}

/** Progress of a turn, 0 (at rest) … 1 (landed on the other side), from the forward-frame corner. */
export function progressOf(held: Pt, W: number): number {
  return Math.min(1, Math.max(0, (2 * W - held.x) / (2 * W)));
}

export const polygonCss = (pts: Pt[]) =>
  pts.length ? `polygon(${pts.map((q) => `${q.x.toFixed(2)}px ${q.y.toFixed(2)}px`).join(',')})` : 'polygon(0 0,0 0,0 0)';

export const pointsAttr = (pts: Pt[]) => pts.map((q) => `${q.x.toFixed(2)},${q.y.toFixed(2)}`).join(' ');
