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
import { CAMERAS, fitCamera, PHONE_PERSPECTIVE, placeCamera, unproject, type Fit } from '../lib/camera';
import { relative, restLift, shadeAt, stripEdges, turningLift } from '../lib/sheet';
import type { Side } from './Page';
import { Sheet, type SheetApi } from './Sheet';

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
  /** Show the book in perspective on the desk. */
  perspective: boolean;
  /** Look straight down for now (e.g. while writing), keeping the perspective style. */
  flatten: boolean;
  /** Pages with low-power turns (set when 3D turns are too slow on this device). */
  onLowPower?: () => void;
  lowPower: boolean;
  compact: boolean;
  /** While writing: zoom in on the page being written and keep the caret line in view. */
  writing?: WritingFocus | null;
}

export interface WritingFocus {
  page: number;
  /** Baseline of the caret's line, in page pixels. */
  caretY: number;
  /** Height of the part of the book area that isn't covered (e.g. by the keyboard). */
  visibleHeight: number;
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

/** Where the camera is and how the book fits into a width × height area. */
export function fitBook(mode: Mode, open: boolean, width: number, height: number, tilted = false): Fit {
  const cam = tilted ? (mode === 'one' ? PHONE_PERSPECTIVE : CAMERAS.perspective) : CAMERAS.flat;
  return fitCamera(viewBox(mode, open), cam, width, height);
}

/** Height of the page block on each side, in book pixels. */
function blockDepth(spread: number, max: number) {
  const f = max > 0 ? spread / max : 0;
  return { left: 3 + 12 * f, right: 3 + 12 * (1 - f) };
}

const STATIC_EDGES = [0, 56, W];

export function Book(props: BookProps) {
  const { mode, pageCount, spread, open, width, height, perspective, flatten, lowPower, compact } = props;
  const uid = useId().replace(/:/g, '');
  const [turn, setTurn] = useState<{ faces: FlipFaces; corner: Corner } | null>(null);
  const [fade, setFade] = useState(0);
  const [coverGone, setCoverGone] = useState(open);
  const tilted = perspective && !flatten;
  /** Turn pages as bending sheets in 3D (otherwise: the flat fold). */
  const turns3D = perspective && !lowPower;
  const lifted = tilted && !lowPower;

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
  const shadePoly = useRef<SVGPolygonElement>(null);
  const shadeGrad = useRef<SVGLinearGradientElement>(null);
  const bookEl = useRef<HTMLDivElement>(null);
  const leafApi = useRef<SheetApi>(null);
  const leftApi = useRef<SheetApi>(null);
  const rightApi = useRef<SheetApi>(null);
  const frames = useRef({ n: 0, total: 0, last: 0, strikes: 0 });

  // --- Fit on screen --------------------------------------------------------
  // While writing, the camera looks straight down at the text column of the page being
  // written, zoomed to the screen width. It only scrolls when the caret leaves the
  // comfortable middle band, so the page holds still while you type.
  const writeCam = useRef<{ page: number; scale: number; ty: number } | null>(null);
  let fitNow: Fit;
  const w = props.writing;
  if (w && open) {
    const slotX = mode === 'two' && w.page % 2 === 1 ? 0 : W;
    const x0 = slotX + PAGE.MX - 20;
    const x1 = slotX + W - PAGE.MX + 20;
    const sc = Math.min(width / (x1 - x0), 2.2);
    const tx = (width - (x1 - x0) * sc) / 2 - x0 * sc;
    const vis = Math.max(120, Math.min(height, w.visibleHeight));
    const clampTy = (t: number) => {
      const hi = 12;
      const lo = vis - (H + 12) * sc;
      return lo > hi ? (vis - H * sc) / 2 : Math.min(hi, Math.max(lo, t));
    };
    const prev = writeCam.current;
    let ty: number;
    if (prev && prev.page === w.page && Math.abs(prev.scale - sc) < 1e-3) {
      const y = prev.ty + w.caretY * sc;
      ty = y > vis * 0.14 && y < vis * 0.66 ? clampTy(prev.ty) : clampTy(vis * 0.4 - w.caretY * sc);
    } else ty = clampTy(vis * 0.4 - w.caretY * sc);
    writeCam.current = { page: w.page, scale: sc, ty };
    fitNow = placeCamera(viewBox(mode, open), CAMERAS.flat, sc, tx, ty);
  } else {
    writeCam.current = null;
    fitNow = fitBook(mode, open, width, height, tilted);
  }
  const fit = useRef(fitNow);
  fit.current = fitNow;
  const max = maxSpread(mode, pageCount);
  const depth = tilted ? blockDepth(spread, max) : { left: 0, right: 0 };
  const depthRef = useRef(depth);
  depthRef.current = depth;
  const leafEdges = stripEdges(W, compact ? 5 : 7);
  const geo = useRef({ turns3D, lifted, leafEdges, mode });
  geo.current = { turns3D, lifted, leafEdges, mode };

  // --- Geometry -------------------------------------------------------------
  const lift = (x: number, corner: Corner) => (corner === 'bottom' ? -1 : 1) * 0.05 * H * Math.sin(Math.PI * progressOf({ x, y: 0 }, W));

  /** Draw the turning page as a bending sheet lifting off the book. */
  const apply3D = useCallback((s: TurnState) => {
    const leaf = leafApi.current;
    if (!leaf) return;
    const g = geo.current;
    const pr = Math.min(1, Math.max(0, progressOf({ x: s.x, y: 0 }, W)));
    const theta = 180 * pr;
    const abs = turningLift(g.leafEdges, W, theta, 1, g.lifted);
    leaf.setAngles(relative(abs));
    const n = abs.length;
    const bd = [abs[0], ...abs.slice(1).map((a, i) => (a + abs[i]) / 2), abs[n - 1]];
    const shade = Array.from({ length: n }, (_, i) => [shadeAt(bd[i]), shadeAt(bd[i + 1])] as [number, number]);
    leaf.setShade(shade, shade);
    const d = depthRef.current;
    const back = s.faces.dir === 'back';
    const [zStart, zEnd] = back ? [d.left, d.right] : [d.right, d.left];
    leaf.setLift(zStart + (zEnd - zStart) * pr + 0.6);
    if (g.mode === 'one') {
      // Only the right-hand page is on screen: fade the sheet while it is over the left.
      const vis = abs.map((a) => (back ? Math.min(1, Math.max(0, (a - 30) / 40)) : Math.min(1, Math.max(0, (150 - a) / 40))));
      leaf.setOpacity(vis, vis);
    }
    // Shadows the lifted sheet casts on the pages below it.
    const sn = Math.sin((theta * Math.PI) / 180);
    const cast = (phi: number) => {
      const c = Math.cos((phi * Math.PI) / 180);
      const k = Math.pow(Math.max(0, Math.sin((phi * Math.PI) / 180)), 0.7);
      if (phi <= 90) {
        const reach = Math.max(4, c * 100);
        return `linear-gradient(var(--from-spine), rgba(20,12,4,${(0.1 * k).toFixed(3)}) 0%, rgba(20,12,4,${(0.34 * k).toFixed(3)}) ${(reach * 0.92).toFixed(1)}%, rgba(20,12,4,0) ${Math.min(100, reach + 14).toFixed(1)}%)`;
      }
      return `linear-gradient(var(--from-spine), rgba(20,12,4,${(0.22 * k).toFixed(3)}) 0%, rgba(20,12,4,0) ${(8 + 22 * k).toFixed(1)}%)`;
    };
    const startSide = back ? leftApi.current : rightApi.current;
    const endSide = back ? rightApi.current : leftApi.current;
    startSide?.setPageShade(sn > 0.001 ? cast(theta) : '');
    endSide?.setPageShade(sn > 0.001 ? cast(180 - theta) : '');
  }, []);

  const apply = useCallback(() => {
    const s = state.current;
    if (s && geo.current.turns3D) return apply3D(s);
    if (!s || !frontEl.current || !flapEl.current || !flapClipEl.current) return;
    const held: Pt = { x: s.x, y: s.yBase + lift(s.x, s.corner) };
    const f = computeFold(s.faces.dir, s.corner, held, W, H);
    frontEl.current.style.clipPath = polygonCss(f.frontClip);
    const polys = [revealPoly.current, shadePoly.current];
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
  }, [apply3D]);

  const stopAnim = () => {
    if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    animRef.current = null;
  };

  const finish = useCallback((completed: boolean) => {
    const s = state.current;
    stopAnim();
    state.current = null;
    setTurn(null);
    leftApi.current?.setPageShade('');
    rightApi.current?.setPageShade('');
    // Fall back to the lighter page turn if 3D turns run slowly on this device.
    const f = frames.current;
    if (geo.current.turns3D && f.n > 8 && f.total / f.n > 30) {
      f.strikes++;
      if (f.strikes >= 2) propsRef.current.onLowPower?.();
    }
    f.n = 0;
    f.total = 0;
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
        const f = frames.current;
        if (f.last) {
          f.n++;
          f.total += now - f.last;
        }
        f.last = now;
        const t = Math.min(1, (now - t0) / dur);
        const e = easing(t);
        s.x = x0 + (toX - x0) * e;
        s.yBase = y0 + (c0.y - y0) * e;
        apply();
        if (t < 1) animRef.current = requestAnimationFrame(step);
        else {
          frames.current.last = 0;
          finish(toX < W);
        }
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
    const d = depthRef.current;
    return unproject(fit.current.matrix, { x: e.clientX - r.left, y: e.clientY - r.top }, (d.left + d.right) / 2);
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
  const shownSpread = faces ? faces.to : spread;
  const stackL = Math.min(10, 1.5 + shownSpread * 0.14);
  const stackR = Math.min(10, 1.5 + (max - shownSpread) * 0.14);
  const showLeft = open && mode === 'two';
  const staticLift = relative(restLift(2, lifted));
  const foldZ = Math.max(depth.left, depth.right) + 0.6;
  const leatherLeft = showLeft ? -16 : W - 10;

  const staticPage = (ref: PageRef, side: Side) =>
    perspective ? (
      <Sheet
        key={side}
        className={`sheet-static sheet-${side}`}
        edges={STATIC_EDGES}
        mirror={side === 'left'}
        angles={staticLift}
        z={side === 'left' ? depth.left : depth.right}
        api={side === 'left' ? leftApi : rightApi}
        front={props.renderPage(ref, side, 'static')}
      />
    ) : (
      <div key={side} className="slot" style={{ left: side === 'left' ? 0 : W }}>
        {props.renderPage(ref, side, 'static')}
      </div>
    );

  return (
    <div className="book-area" style={{ width, height }}>
      <div
        ref={bookEl}
        className={`book book-${mode} ${perspective ? 'book-3d' : ''} ${open ? 'is-open' : 'is-closed'} ${w && open ? 'is-writing' : ''}`}
        style={{ transform: perspective ? fitNow.css : `translate(${fitNow.tx.toFixed(2)}px, ${fitNow.ty.toFixed(2)}px) scale(${fitNow.scale.toFixed(5)})` }}
      >
        <div className={`spread ${perspective ? 'spread-3d' : ''}`} key={`fade-${fade}`} data-fade={fade > 0 || undefined}>
          <div className="leather-base" style={{ left: leatherLeft }} />
          {perspective && (
            <>
              <div className="board-edge board-edge-bottom" style={{ left: leatherLeft, width: 2 * W + 16 - leatherLeft }} />
              <div className="board-edge board-edge-right" />
              <div className="block-edge block-edge-x" style={{ left: 2 * W, width: depth.right, transform: `translateZ(${depth.right}px) rotateY(90deg)` }} />
              <div className="block-edge block-edge-y" style={{ left: W, width: W, height: depth.right, transform: `translateZ(${depth.right}px) rotateX(-90deg)` }} />
              {showLeft && (
                <>
                  <div className="block-edge block-edge-x block-edge-left" style={{ left: -depth.left, width: depth.left, transform: `translateZ(${depth.left}px) rotateY(-90deg)` }} />
                  <div className="block-edge block-edge-y" style={{ left: 0, width: W, height: depth.left, transform: `translateZ(${depth.left}px) rotateX(-90deg)` }} />
                </>
              )}
            </>
          )}
          {!perspective && showLeft && <div className="stack stack-left" style={{ width: stackL, left: -stackL }} />}
          {!perspective && <div className="stack stack-right" style={{ width: stackR }} />}
          <div className="strap" aria-hidden style={perspective ? { transform: `translateZ(${Math.max(2, depth.right * 0.6)}px)` } : undefined}>
            <div className="strap-snap" />
          </div>
          <div className="spine-shadow" />

          {showLeft && staticPage(leftStatic, 'left')}
          {staticPage(rightStatic, 'right')}

          {faces && turns3D && (
            <Sheet
              key="leaf"
              className="sheet-leaf"
              edges={leafEdges}
              mirror={faces.dir === 'back'}
              angles={relative(restLift(leafEdges.length - 1, lifted))}
              z={(faces.dir === 'back' ? depth.left : depth.right) + 0.6}
              api={leafApi}
              front={props.renderPage(faces.front, faces.dir === 'fwd' ? 'right' : 'left', 'layer')}
              back={props.renderPage(faces.back, faces.dir === 'fwd' ? 'left' : 'right', 'layer')}
            />
          )}

          {faces && !turns3D && (
            <div className={`fold-plane ${mode === 'one' ? 'fold-plane-one' : ''}`} style={{ transform: `translateZ(${foldZ}px)` }}>
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
                </defs>
                <polygon ref={revealPoly} fill={`url(#rg${uid})`} />
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
            </div>
          )}

          <div
            className="hit"
            style={perspective ? { transform: `translateZ(${Math.max(depth.left, depth.right) + 40}px)` } : undefined}
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
            // In the 3D view the camera supplies the perspective; the flat view gives the cover its own.
            style={{ transform: `${perspective ? '' : 'perspective(2600px) '}translateZ(${(perspective ? blockDepth(0, max).right : 0) + 1}px) rotateY(${open ? -180 : 0}deg)` }}
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
