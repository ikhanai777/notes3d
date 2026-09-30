// Procedural materials: paper grain, fibres, leather, wood, and torn (deckle) page edges.

import { mulberry32 } from './rng';

const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' '))}")`;

/** Fine paper tooth: speckled, slightly warm. */
export const PAPER_GRAIN = svgUrl(`
<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'>
  <filter id='f'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/>
  <feColorMatrix values='0 0 0 0 .42  0 0 0 0 .34  0 0 0 0 .22  0 0 0 -.9 .62'/></filter>
  <rect width='256' height='256' filter='url(#f)'/>
</svg>`);

/** Large, soft mottling, like uneven pulp. */
export const PAPER_MOTTLE = svgUrl(`
<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'>
  <filter id='f'><feTurbulence type='fractalNoise' baseFrequency='.008' numOctaves='3' seed='4' stitchTiles='stitch'/>
  <feColorMatrix values='0 0 0 0 .55  0 0 0 0 .43  0 0 0 0 .25  0 0 0 -.55 .3'/></filter>
  <rect width='600' height='600' filter='url(#f)'/>
</svg>`);

/** A tile of stray cotton fibres. */
export const PAPER_FIBRES = (() => {
  const rnd = mulberry32(7);
  let paths = '';
  for (let i = 0; i < 46; i++) {
    const x = rnd() * 400;
    const y = rnd() * 400;
    const a = rnd() * Math.PI * 2;
    const l = 6 + rnd() * 22;
    const cx = x + Math.cos(a + 0.8) * l * 0.6;
    const cy = y + Math.sin(a + 0.8) * l * 0.6;
    const ex = x + Math.cos(a) * l;
    const ey = y + Math.sin(a) * l;
    const o = (0.06 + rnd() * 0.12).toFixed(2);
    const c = rnd() < 0.2 ? '90,110,140' : '120,95,60';
    paths += `<path d='M${x.toFixed(1)} ${y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}' stroke='rgba(${c},${o})' stroke-width='${(0.4 + rnd() * 0.5).toFixed(2)}' fill='none'/>`;
  }
  for (let i = 0; i < 26; i++) {
    const r = (0.4 + rnd() * 0.9).toFixed(2);
    paths += `<circle cx='${(rnd() * 400).toFixed(1)}' cy='${(rnd() * 400).toFixed(1)}' r='${r}' fill='rgba(110,85,50,${(0.08 + rnd() * 0.15).toFixed(2)})'/>`;
  }
  return svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'>${paths}</svg>`);
})();

export const LEATHER_GRAIN = svgUrl(`
<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'>
  <filter id='f'><feTurbulence type='fractalNoise' baseFrequency='.09' numOctaves='3' seed='9' stitchTiles='stitch'/>
  <feColorMatrix values='0 0 0 0 .08  0 0 0 0 .04  0 0 0 0 .02  0 0 0 -1.1 .62'/></filter>
  <filter id='g'><feTurbulence type='fractalNoise' baseFrequency='.7' numOctaves='2' seed='2' stitchTiles='stitch'/>
  <feColorMatrix values='0 0 0 0 1  0 0 0 0 .9  0 0 0 0 .8  0 0 0 -1 .55'/></filter>
  <rect width='300' height='300' filter='url(#f)'/>
  <rect width='300' height='300' filter='url(#g)' opacity='.35'/>
</svg>`);

export const WOOD_GRAIN = svgUrl(`
<svg xmlns='http://www.w3.org/2000/svg' width='900' height='900'>
  <filter id='f'><feTurbulence type='fractalNoise' baseFrequency='.0025 .11' numOctaves='5' seed='3' stitchTiles='stitch'/>
  <feColorMatrix values='0 0 0 0 .16  0 0 0 0 .09  0 0 0 0 .04  0 0 0 -2.2 1.35'/></filter>
  <filter id='k'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='5' stitchTiles='stitch'/>
  <feColorMatrix values='0 0 0 0 .1  0 0 0 0 .06  0 0 0 0 .03  0 0 0 -1 .5'/></filter>
  <rect width='900' height='900' filter='url(#f)'/>
  <rect width='900' height='900' filter='url(#k)' opacity='.5'/>
</svg>`);

/**
 * Torn deckle edge: a clip polygon for a page, straight along the spine and
 * ragged on the other three sides. Coordinates are in page pixels.
 */
export function decklePolygon(seed: number, side: 'left' | 'right', W: number, H: number): string {
  const rnd = mulberry32(seed);
  const pts: [number, number][] = [];
  // Smooth-ish noise: sum of a few random-phase sines plus small grain.
  const edge = (amp: number) => {
    const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
    const fr = [2 + rnd() * 2, 7 + rnd() * 5, 19 + rnd() * 9];
    return (t: number) => {
      let v = 0.5 * Math.sin(t * fr[0] + ph[0]) + 0.3 * Math.sin(t * fr[1] + ph[1]) + 0.2 * Math.sin(t * fr[2] + ph[2]);
      v = (v + 1) / 2; // 0..1
      const grain = rnd() * 0.9;
      const bite = rnd() < 0.025 ? 1.6 + rnd() * 1.6 : 0;
      return v * amp + grain + bite;
    };
  };
  const top = edge(2.2);
  const outer = edge(2.6);
  const bottom = edge(2.2);
  const steps = 70;
  const outerX = side === 'right' ? W : 0;
  const spineX = side === 'right' ? 0 : W;
  const sign = side === 'right' ? -1 : 1; // inward direction from the outer edge
  // Top edge, from spine to outer corner.
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = spineX + (outerX - spineX) * t;
    pts.push([x, top(t * 6.28)]);
  }
  // Outer edge, top to bottom.
  for (let i = 1; i < steps * 1.4; i++) {
    const t = i / (steps * 1.4);
    pts.push([outerX + sign * outer(t * 6.28), H * t]);
  }
  // Bottom edge, outer corner back to spine.
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = outerX + (spineX - outerX) * t;
    pts.push([x, H - bottom(t * 6.28)]);
  }
  return `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;
}

/** Marbled endpaper. */
export const MARBLE = svgUrl(`
<svg xmlns='http://www.w3.org/2000/svg' width='500' height='500'>
  <filter id='m' x='0' y='0' width='100%' height='100%'>
    <feTurbulence type='fractalNoise' baseFrequency='.006 .018' numOctaves='2' seed='11' result='t'/>
    <feTurbulence type='turbulence' baseFrequency='.012' numOctaves='3' seed='3' result='w'/>
    <feDisplacementMap in='t' in2='w' scale='90' xChannelSelector='R' yChannelSelector='G' result='d'/>
    <feColorMatrix in='d' type='matrix' values='0 0 0 0 .20  0 0 0 0 .30  0 0 0 0 .32  -2.4 0 0 0 1.35'/>
  </filter>
  <filter id='v' x='0' y='0' width='100%' height='100%'>
    <feTurbulence type='fractalNoise' baseFrequency='.01 .03' numOctaves='2' seed='23' result='t'/>
    <feTurbulence type='turbulence' baseFrequency='.02' numOctaves='2' seed='8' result='w'/>
    <feDisplacementMap in='t' in2='w' scale='70' xChannelSelector='G' yChannelSelector='R' result='d'/>
    <feColorMatrix in='d' type='matrix' values='0 0 0 0 .62  0 0 0 0 .30  0 0 0 0 .16  -3 0 0 0 1.55'/>
  </filter>
  <rect width='500' height='500' fill='#e9dcc0'/>
  <rect width='500' height='500' filter='url(#m)'/>
  <rect width='500' height='500' filter='url(#v)' opacity='.8'/>
</svg>`);

/**
 * Turn an SVG texture (drawn by noise filters, which are slow to repaint) into a
 * plain bitmap once, so zooming and page turns don't re-run the filters.
 * Returns a CSS url() for the bitmap, or null if the browser can't do it.
 */
export async function rasterize(cssUrl: string): Promise<string | null> {
  try {
    const src = /^url\("(.*)"\)$/.exec(cssUrl)?.[1];
    if (!src) return null;
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx || !canvas.width) return null;
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    return blob ? `url("${URL.createObjectURL(blob)}")` : null;
  } catch {
    return null;
  }
}
