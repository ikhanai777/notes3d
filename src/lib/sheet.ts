// A sheet of paper in 3D, made of vertical strips hinged one after another from
// the spine. Angles are "lift" angles: 0 lies flat on the right-hand side,
// 90 stands upright, 180 lies flat on the left-hand side.

/** Width of the strip next to the spine, where an open book's pages rise. */
export const GUTTER = 56;
/** How far the page rises out of the spine, and settles back, when lying open. */
export const GUTTER_LIFT = 13;
export const OUTER_LIFT = -1.8;

/** Strip boundaries (distance from the spine) for a page of width W. */
export function stripEdges(W: number, count: number): number[] {
  const edges = [0, GUTTER];
  const rest = count - 1;
  for (let i = 1; i <= rest; i++) edges.push(GUTTER + ((W - GUTTER) * i) / rest);
  return edges;
}

/** Resting lift of each strip of an open page. */
export function restLift(count: number, lifted: boolean): number[] {
  return Array.from({ length: count }, (_, i) => (!lifted ? 0 : i === 0 ? GUTTER_LIFT : OUTER_LIFT));
}

/**
 * Absolute lift of each strip while turning.
 * @param theta 0 (resting on the starting side) … 180 (landed on the other side)
 * @param curl 0 … 1, how much the outer edge leads (the page bends as it's pulled)
 */
export function turningLift(edges: number[], W: number, theta: number, curl: number, lifted: boolean): number[] {
  const n = edges.length - 1;
  const rest = restLift(n, lifted);
  const s = Math.sin((theta * Math.PI) / 180);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const mid = (edges[i] + edges[i + 1]) / 2 / W;
    // The resting curve on the start side morphs into the mirrored curve on the landing side.
    const base = theta + rest[i] * (1 - (2 * theta) / 180);
    out.push(base + curl * 34 * s * Math.pow(mid, 1.5));
  }
  return out;
}

/** Relative hinge angle for each strip, from the absolute lifts. */
export const relative = (abs: number[]) => abs.map((a, i) => (i === 0 ? a : a - abs[i - 1]));

/** How much shadow a strip carries at a given lift (upright paper catches less light). */
export const shadeAt = (lift: number) => 0.3 * Math.pow(Math.abs(Math.sin((lift * Math.PI) / 180)), 1.1);
