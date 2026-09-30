// The book on the desk: leather cover, page block, and the page-turn engine.
//
// A turning page is drawn as three layers: the still-flat part of the page
// (clipped), the folded-over flap showing the back of the page (transformed by the
// fold reflection and clipped), and the page revealed underneath. Shadows are SVG
// polygons with gradients in book coordinates. Geometry updates go straight to the
// DOM every animation frame; React only renders when a turn starts or ends.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { computeFold, polygonCss, pointsAttr, progressOf, restCorner, type Corner, type Pt } from '../lib/geometry';
import { flipFaces, leftOf, maxSpread, rightOf, type FlipFaces, type Mode, type PageRef } from '../lib/book';
import { PAGE } from '../lib/layout';
import type { Side } from './Page';

const W = PAGE.W;
const H = PAGE.H;

export interface GotoRequest {
  to: number;
  nonce: number;
}

interface BookProps {
  mode: Mode;
  pageCount: number;
  spread: number;
  onSpreadChange: (s: number) => void;
  open: boolean;
  onOpen: () => void;
  coverTitle: string;
  width: number;
  height: number;
  renderPage: (ref: PageRef, side: Side, role: 'static' | 'layer') => ReactNode;
  onTap: (page: number, x: number, y: number) => void;
  onTurnStart?: (durationMs: number) => void;
  onTurnEnd?: () => void;
  reducedMotion: boolean;
  goto: GotoRequest | null;
}

interface TurnState {
  faces: FlipFaces;
  corner: Corner;
  x: number;
  yBase: number;
}

const ease = {
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

/** The visible part of the book in book coordinates, used for fitting it on screen. */
export function viewBox(mode: Mode, open: boolean) {
  const y0 = -22;
  const y1 = H + 24;
  if (mode === 'one' || !open) return { x0: W - 18, x1: 2 * W + 44, y0, y1 };
  return { x0: -26, x1: 2 * W + 44, y0, y1 };
}

/** Scale and offset that fit the book into a width × height area. */
export function fitBook(mode: Mode, open: boolean, width: number, height: number) {
  const vb = viewBox(mode, open);
  const scale = Math.max(0.1, Math.min(width / (vb.x1 - vb.x0), height / (vb.y1 - vb.y0)));
  const tx = (width - (vb.x1 - vb.x0) * scale) / 2 - vb.x0 * scale;
  const ty = (height - (vb.y1 - vb.y0) * scale) / 2 - vb.y0 * scale;
  return { scale, tx, ty };
}

export function Book(props: BookProps) {
  const { mode, pageCount, spread, open, width, height } = props;
  const uid = useId().replace(/:/g, '');
  const [turn, setTurn] = useState<{ faces: FlipFaces; corner: Corner } | null>(null);
  const [fade, setFade] = useState(0);
  const [coverGone, setCoverGone] = useState(open);

  const state = useRef<TurnState | null>(null);
  const animRef = useRef<number | null>(null);
  const pendingAuto = useRef<{ toX: number; dur: number; easing: (t: number) => number } | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const frontEl = useRef<HTMLDivElement>(null);
  const flapEl = useRef<HTMLDivElement>(null);
  const flapClipEl = useRef<HTMLDivElement>(null);
  const revealPoly = useRef<SVGPolygonElement>(null);
  const revealGrad = useRef<SVGLinearGradientElement>(null);
  const dropPoly = useRef<SVGPolygonElement>(null);
  const shadePoly = useRef<SVGPolygonElement>(null);
  const shadeGrad = useRef<SVGLinearGradientElement>(null);
  const bookEl = useRef<HTMLDivElement>(null);

  // --- Fit on screen --------------------------------------------------------
  const { scale, tx, ty } = fitBook(mode, open, width, height);
  const fit = useRef({ scale, tx, ty });
  fit.current = { scale, tx, ty };

  // --- Geometry -------------------------------------------------------------
  const lift = (x: number, corner: Corner) => (corner === 'bottom' ? -1 : 1) * 0.05 * H * Math.sin(Math.PI * progressOf({ x, y: 0 }, W));

  const apply = useCallback(() => {
    const s = state.current;
    if (!s || !frontEl.current || !flapEl.current || !flapClipEl.current) return;
    const held: Pt = { x: s.x, y: s.yBase + lift(s.x, s.corner) };
    const f = computeFold(s.faces.dir, s.corner, held, W, H);
    frontEl.current.style.clipPath = polygonCss(f.frontClip);
    const polys = [revealPoly.current, dropPoly.current, shadePoly.current];
    if (f.flat) {
      flapEl.current.style.visibility = 'hidden';
      polys.forEach((p) => p?.setAttribute('points', ''));
      return;
    }
    flapEl.current.style.visibility = 'visible';
    flapEl.current.style.transform = `matrix(${f.flapMatrix.map((v) => v.toFixed(5)).join(',')})`;
    flapClipEl.current.style.clipPath = polygonCss(f.flapClip);

    const pr = progressOf(held, W);
    const strength = Math.pow(Math.sin(Math.PI * Math.min(1, pr * 1.02)), 0.5);
    const shadowW = Math.min(110, 12 + f.depth * 0.3);
    const { mid: m, normal: n } = f;
    revealPoly.current?.setAttribute('points', pointsAttr(f.revealed));
    revealPoly.current?.setAttribute('opacity', strength.toFixed(3));
    const rg = revealGrad.current;
    if (rg) {
      rg.setAttribute('x1', String(m.x));
      rg.setAttribute('y1', String(m.y));
      rg.setAttribute('x2', String(m.x + n.x * shadowW));
      rg.setAttribute('y2', String(m.y + n.y * shadowW));
    }
    dropPoly.current?.setAttribute('points', pointsAttr(f.flap.map((q) => ({ x: q.x - n.x * 4, y: q.y - n.y * 4 + 3 }))));
    dropPoly.current?.setAttribute('opacity', (0.32 * strength).toFixed(3));
    shadePoly.current?.setAttribute('points', pointsAttr(f.flap));
    shadePoly.current?.setAttribute('opacity', strength.toFixed(3));
    const sg = shadeGrad.current;
    if (sg) {
      const half = Math.max(20, f.depth / 2);
      sg.setAttribute('x1', String(m.x));
      sg.setAttribute('y1', String(m.y));
      sg.setAttribute('x2', String(m.x - n.x * half));
      sg.setAttribute('y2', String(m.y - n.y * half));
    }
  }, []);

  const stopAnim = () => {
    if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    animRef.current = null;
  };

  const finish = useCallback((completed: boolean) => {
    const s = state.current;
    stopAnim();
    state.current = null;
    setTurn(null);
    if (s && completed) {
      propsRef.current.onSpreadChange(s.faces.to);
      propsRef.current.onTurnEnd?.();
    }
  }, []);

  const animateTo = useCallback(
    (toX: number, dur: number, easing: (t: number) => number) => {
      const s = state.current;
      if (!s) return;
      stopAnim();
      const x0 = s.x;
      const y0 = s.yBase;
      const c0 = restCorner(s.corner, W, H);
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / dur);
        const e = easing(t);
        s.x = x0 + (toX - x0) * e;
        s.yBase = y0 + (c0.y - y0) * e;
        apply();
        if (t < 1) animRef.current = requestAnimationFrame(step);
        else finish(toX < W);
      };
      animRef.current = requestAnimationFrame(step);
    },
    [apply, finish],
  );

  const begin = useCallback(
    (to: number, corner: Corner): boolean => {
      const p = propsRef.current;
      const max = maxSpread(p.mode, p.pageCount);
      if (to < 0 || to > max || to === p.spread || state.current) return false;
      const faces = flipFaces(p.mode, p.spread, to, p.pageCount);
      const c0 = restCorner(corner, W, H);
      state.current = { faces, corner, x: c0.x, yBase: c0.y };
      setTurn({ faces, corner });
      return true;
    },
    [],
  );

  /** Animated turn to any spread (a jump looks like one turn landing on the target). */
  const turnTo = useCallback(
    (to: number) => {
      const p = propsRef.current;
      const max = maxSpread(p.mode, p.pageCount);
      to = Math.max(0, Math.min(max, to));
      if (to === p.spread || state.current) return;
      if (p.reducedMotion) {
        p.onSpreadChange(to);
        setFade((f) => f + 1);
        p.onTurnStart?.(150);
        return;
      }
      if (!begin(to, 'bottom')) return;
      const dur = Math.abs(to - p.spread) > 1 ? 750 : 680;
      pendingAuto.current = { toX: 0, dur, easing: ease.inOut };
      p.onTurnStart?.(dur);
    },
    [begin],
  );

  // Start the queued animation once the turn layers exist in the DOM.
  useLayoutEffect(() => {
    if (!turn) return;
    apply();
    const auto = pendingAuto.current;
    if (auto) {
      pendingAuto.current = null;
      animateTo(auto.toX, auto.dur, auto.easing);
    }
  }, [turn, apply, animateTo]);

  useEffect(() => () => stopAnim(), []);

  // Closing the journal brings the cover back.
  useEffect(() => {
    if (!open) setCoverGone(false);
  }, [open]);

  // Programmatic navigation.
  const lastNonce = useRef(0);
  useEffect(() => {
    const g = props.goto;
    if (!g || g.nonce === lastNonce.current) return;
    lastNonce.current = g.nonce;
    turnTo(g.to);
  }, [props.goto, turnTo]);

  // --- Pointer input --------------------------------------------------------
  const drag = useRef<{
    id: number;
    start: Pt; // book coords
    last: Pt;
    lastT: number;
    vx: number;
    decided: boolean;
    active: boolean;
    k: number;
    x0: number;
    y0: number;
  } | null>(null);
  const suppressClick = useRef(0);

  const toBook = (e: { clientX: number; clientY: number }): Pt => {
    const r = bookEl.current!.parentElement!.getBoundingClientRect();
    const f = fit.current;
    return { x: (e.clientX - r.left - f.tx) / f.scale, y: (e.clientY - r.top - f.ty) / f.scale };
  };
  /** Pointer position in the forward frame of the current turn. */
  const fwdX = (x: number) => (state.current?.faces.dir === 'back' ? 2 * W - x : x);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!open || e.button > 0) return;
    const p = toBook(e);
    drag.current = { id: e.pointerId, start: p, last: p, lastT: e.timeStamp, vx: 0, decided: false, active: false, k: 1, x0: 0, y0: 0 };
    if (state.current && animRef.current !== null) {
      // Catch a turning page mid-air.
      stopAnim();
      const s = state.current;
      Object.assign(drag.current, { decided: true, active: true, k: mode === 'one' ? 2 : 1.3, x0: s.x, y0: s.yBase });
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const p = toBook(e);
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.vx = 0.7 * ((p.x - d.last.x) / dt) + 0.3 * d.vx;
    d.last = p;
    d.lastT = e.timeStamp;
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    if (!d.decided) {
      if (Math.hypot(dx, dy) * fit.current.scale < 9) return;
      d.decided = true;
      if (Math.abs(dx) < Math.abs(dy) * 0.8) return; // vertical gesture: not a page turn
      const fromRight = mode === 'one' || d.start.x >= W;
      const dir = mode === 'one' ? (dx < 0 ? 'fwd' : 'back') : fromRight ? 'fwd' : 'back';
      if ((dir === 'fwd' && dx > 0) || (dir === 'back' && dx < 0)) return;
      if (propsRef.current.reducedMotion) {
        turnTo(spread + (dir === 'fwd' ? 1 : -1));
        suppressClick.current = e.timeStamp + 400;
        return;
      }
      const corner: Corner = d.start.y < H / 2 ? 'top' : 'bottom';
      if (!begin(spread + (dir === 'fwd' ? 1 : -1), corner)) return;
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      const startF = dir === 'back' ? 2 * W - d.start.x : d.start.x;
      // Dragging from where you grabbed to the far edge of what you can see completes the turn.
      const reach = mode === 'one' ? Math.max(startF - W, 0.35 * W) : Math.max(startF, W);
      d.k = Math.min(2.6, (2 * W) / reach);
      d.active = true;
      d.x0 = 2 * W;
      d.y0 = restCorner(corner, W, H).y;
    }
    if (!d.active || !state.current) return;
    const s = state.current;
    const moveF = fwdX(p.x) - fwdX(d.start.x);
    s.x = Math.max(-0.2 * W, Math.min(2 * W, d.x0 + moveF * d.k));
    s.yBase = d.y0 + dy * 0.35;
    if (animRef.current === null) animRef.current = requestAnimationFrame(() => {
      animRef.current = null;
      apply();
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.decided) suppressClick.current = e.timeStamp + 400;
    if (!d.active || !state.current) return;
    stopAnim();
    const s = state.current;
    const vF = s.faces.dir === 'back' ? -d.vx : d.vx; // book px per ms, negative = towards completion
    const pr = progressOf({ x: s.x, y: 0 }, W);
    const complete = e.type !== 'pointercancel' && (vF < -0.25 || (pr > 0.4 && vF < 0.25));
    const remaining = complete ? pr > 1 ? 0 : 1 - pr : pr;
    const dur = Math.max(160, 620 * remaining);
    if (complete) propsRef.current.onTurnStart?.(dur);
    animateTo(complete ? 0 : 2 * W, dur, ease.out);
  };

  const onClick = (e: React.MouseEvent) => {
    if (!open || e.timeStamp < suppressClick.current || state.current) return;
    const p = toBook(e);
    const side: Side = mode === 'one' || p.x >= W ? 'right' : 'left';
    const px = side === 'right' ? p.x - W : p.x;
    if (px < -8 || px > W + 8 || p.y < -8 || p.y > H + 8) return;
    // Taps in the outer margin turn the page (in one-page mode, the inner margin goes back).
    const edge = 34;
    if (side === 'right' && px > W - edge) return turnTo(spread + 1);
    if (side === 'left' && px < edge) return turnTo(spread - 1);
    if (mode === 'one' && px < edge * 0.8 && spread > 0) return turnTo(spread - 1);
    const ref = side === 'right' ? rightOf(mode, spread, pageCount) : leftOf(mode, spread);
    if (ref.kind === 'page') props.onTap(ref.index, px, p.y);
    else if (ref.kind === 'endpaper' && ref.which === 'back') turnTo(spread - 1);
    else if (ref.kind === 'endpaper') turnTo(spread + 1);
  };

  // --- Rendering ------------------------------------------------------------
  const faces = turn?.faces;
  const leftStatic = faces ? (faces.dir === 'fwd' ? faces.still : faces.under) : leftOf(mode, spread);
  const rightStatic = faces ? (faces.dir === 'fwd' ? faces.under : faces.still) : rightOf(mode, spread, pageCount);
  const max = maxSpread(mode, pageCount);
  const shownSpread = faces ? faces.to : spread;
  const stackL = Math.min(10, 1.5 + shownSpread * 0.14);
  const stackR = Math.min(10, 1.5 + (max - shownSpread) * 0.14);
  const showLeft = open && mode === 'two';

  return (
    <div className="book-area" style={{ width, height }}>
      <div
        ref={bookEl}
        className={`book book-${mode} ${open ? 'is-open' : 'is-closed'}`}
        style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
      >
        <div className={`spread ${mode === 'one' ? 'spread-one' : ''}`} key={`fade-${fade}`} data-fade={fade > 0 || undefined}>
          <div className="leather-base" style={showLeft ? undefined : { left: W - 10 }} />
          {showLeft && <div className="stack stack-left" style={{ width: stackL, left: -stackL }} />}
          <div className="stack stack-right" style={{ width: stackR }} />
          <div className="strap" aria-hidden>
            <div className="strap-snap" />
          </div>
          <div className="spine-shadow" />

          {showLeft && <div className="slot" style={{ left: 0 }}>{props.renderPage(leftStatic, 'left', 'static')}</div>}
          <div className="slot" style={{ left: W }}>{props.renderPage(rightStatic, 'right', 'static')}</div>

          {faces && (
            <>
              <div ref={frontEl} className="slot turning" style={{ left: faces.dir === 'fwd' ? W : 0 }}>
                {props.renderPage(faces.front, faces.dir === 'fwd' ? 'right' : 'left', 'layer')}
              </div>
              <svg className="turn-shadows" width={2 * W} height={H} aria-hidden>
                <defs>
                  <linearGradient id={`rg${uid}`} ref={revealGrad} gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#1a1008" stopOpacity="0.42" />
                    <stop offset="0.35" stopColor="#1a1008" stopOpacity="0.16" />
                    <stop offset="1" stopColor="#1a1008" stopOpacity="0" />
                  </linearGradient>
                  <filter id={`bl${uid}`} x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="7" />
                  </filter>
                </defs>
                <polygon ref={revealPoly} fill={`url(#rg${uid})`} />
                <polygon ref={dropPoly} fill="#1a1008" filter={`url(#bl${uid})`} />
              </svg>
              <div ref={flapEl} className="flap">
                <div ref={flapClipEl} className="flap-clip">
                  {props.renderPage(faces.back, faces.dir === 'fwd' ? 'left' : 'right', 'layer')}
                </div>
              </div>
              <svg className="turn-shadows" width={2 * W} height={H} aria-hidden>
                <defs>
                  <linearGradient id={`sg${uid}`} ref={shadeGrad} gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#2a1a0a" stopOpacity="0.30" />
                    <stop offset="0.06" stopColor="#fffaf0" stopOpacity="0.10" />
                    <stop offset="0.22" stopColor="#fffaf0" stopOpacity="0.28" />
                    <stop offset="0.6" stopColor="#fffaf0" stopOpacity="0" />
                    <stop offset="1" stopColor="#2a1a0a" stopOpacity="0.14" />
                  </linearGradient>
                </defs>
                <polygon ref={shadePoly} fill={`url(#sg${uid})`} />
              </svg>
            </>
          )}

          <div
            className="hit"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={onClick}
            // Keep the writing caret's focus when tapping around the page.
            onMouseDown={(e) => e.preventDefault()}
          />
        </div>

        {!coverGone && (
          <div
            className={`cover ${open ? 'cover-open' : ''} ${mode === 'one' ? 'cover-one' : ''}`}
            onClick={() => !open && props.onOpen()}
            onTransitionEnd={(e) => e.propertyName === 'transform' && open && setCoverGone(true)}
            role={open ? undefined : 'button'}
            aria-label={open ? undefined : 'Open journal'}
            tabIndex={open ? -1 : 0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !open && props.onOpen()}
          >
            <div className="cover-front">
              <div className="cover-stitch" />
              <div className="cover-title">{props.coverTitle}</div>
              <div className="cover-year">{new Date().getFullYear()}</div>
              <div className="cover-hint">Tap to open</div>
            </div>
            <div className="cover-back" />
          </div>
        )}
      </div>
    </div>
  );
}
