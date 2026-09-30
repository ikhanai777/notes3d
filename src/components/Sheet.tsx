// Renders a page as a chain of hinged strips (see lib/sheet.ts). Each strip shows
// its slice of the page on the front and the matching slice of the next page on
// the back. Angles can be given as props (animated by CSS) or set every frame
// through `api`.

import { useImperativeHandle, useRef, type ReactNode, type Ref } from 'react';
import { PAGE } from '../lib/layout';

const W = PAGE.W;

export interface SheetApi {
  /** Relative hinge angles, one per strip. */
  setAngles(rel: number[]): void;
  /** Shadow on each strip: [left edge, right edge] alpha, for front and back. */
  setShade(front: [number, number][], back: [number, number][]): void;
  /** Overlay on the whole page, in page coordinates (e.g. the shadow of a page turning above it). */
  setPageShade(background: string): void;
  setOpacity(front: number[], back: number[]): void;
  setLift(z: number): void;
}

interface SheetProps {
  edges: number[];
  /** Grows leftwards from the spine (a left-hand page). */
  mirror: boolean;
  front: ReactNode;
  back?: ReactNode;
  angles?: number[];
  z?: number;
  className?: string;
  api?: Ref<SheetApi>;
}

export function Sheet({ edges, mirror, front, back, angles, z = 0, className, api }: SheetProps) {
  const n = edges.length - 1;
  const holders = useRef<(HTMLDivElement | null)[]>([]);
  const frontShades = useRef<(HTMLDivElement | null)[]>([]);
  const backShades = useRef<(HTMLDivElement | null)[]>([]);
  const frontFaces = useRef<(HTMLDivElement | null)[]>([]);
  const backFaces = useRef<(HTMLDivElement | null)[]>([]);
  const pageShades = useRef<(HTMLDivElement | null)[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const sign = mirror ? 1 : -1;

  useImperativeHandle(api, () => ({
    setAngles(rel) {
      rel.forEach((a, i) => {
        const el = holders.current[i];
        if (el) el.style.transform = `rotateY(${(sign * a).toFixed(3)}deg)`;
      });
    },
    setShade(f, b) {
      const grad = (edge: [number, number], flip: boolean) => {
        const [l, r] = flip ? [edge[1], edge[0]] : edge;
        return `linear-gradient(90deg, rgba(28,18,8,${l.toFixed(3)}), rgba(28,18,8,${r.toFixed(3)}))`;
      };
      f.forEach((e, i) => {
        const el = frontShades.current[i];
        if (el) el.style.background = grad(e, mirror);
      });
      b.forEach((e, i) => {
        const el = backShades.current[i];
        if (el) el.style.background = grad(e, !mirror);
      });
    },
    setPageShade(bg) {
      pageShades.current.forEach((el) => el && (el.style.background = bg));
    },
    setOpacity(f, b) {
      f.forEach((o, i) => frontFaces.current[i] && (frontFaces.current[i]!.style.opacity = String(o)));
      b.forEach((o, i) => backFaces.current[i] && (backFaces.current[i]!.style.opacity = String(o)));
    },
    setLift(zz) {
      if (root.current) root.current.style.transform = `translateZ(${zz.toFixed(2)}px)`;
    },
  }));

  // Build the chain from the outermost strip inwards so each holder nests in the previous one.
  let chain: ReactNode = null;
  for (let i = n - 1; i >= 0; i--) {
    const a = edges[i];
    const b = edges[i + 1];
    const sw = b - a;
    // Page-local x shown at the left edge of this strip's front and back.
    const frontX = mirror ? W - b : a;
    const backX = mirror ? a : W - b;
    const angle = angles?.[i] ?? 0;
    chain = (
      <div
        ref={(el) => {
          holders.current[i] = el;
        }}
        className="sheet-strip"
        style={{
          width: sw,
          left: mirror ? -sw : 0,
          transformOrigin: mirror ? '100% 50%' : '0 50%',
          transform: `rotateY(${(sign * angle).toFixed(3)}deg)`,
        }}
      >
        <div
          className="sheet-face"
          ref={(el) => {
            frontFaces.current[i] = el;
          }}
        >
          <div className="sheet-page" style={{ left: -frontX }}>
            {front}
            <div
              className="sheet-page-shade"
              ref={(el) => {
                pageShades.current[i] = el;
              }}
            />
          </div>
          <div
            className="sheet-shade"
            ref={(el) => {
              frontShades.current[i] = el;
            }}
          />
        </div>
        {back && (
          <div
            className="sheet-face sheet-back"
            ref={(el) => {
              backFaces.current[i] = el;
            }}
          >
            <div className="sheet-page" style={{ left: -backX }}>
              {back}
            </div>
            <div
              className="sheet-shade"
              ref={(el) => {
                backShades.current[i] = el;
              }}
            />
          </div>
        )}
        {chain && <div className="sheet-next" style={{ left: mirror ? 0 : sw }}>{chain}</div>}
      </div>
    );
  }

  return (
    <div ref={root} className={`sheet ${className ?? ''}`} style={{ transform: `translateZ(${z}px)` }}>
      {chain}
    </div>
  );
}

