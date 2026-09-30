import { memo, useMemo, type CSSProperties, type ReactElement } from 'react';
import { baselineY, PAGE, type Line, type PageLayout, type PhotoBlock, type Run, type Selection } from '../lib/layout';
import { headingParts } from '../lib/dates';
import { decklePolygon } from '../lib/paper';
import { jitter } from '../lib/rng';
import type { PaperId } from '../lib/model';
import { useInk } from './context';
import { Sticker } from './Sticker';

export type Side = 'left' | 'right';

export interface Fresh {
  entryId: string;
  offset: number;
}

interface PageProps {
  kind: 'page' | 'ghost' | 'endpaper';
  side: Side;
  page?: PageLayout;
  /** The other side of this sheet, for faint show-through. */
  back?: PageLayout;
  which?: 'front' | 'back';
  caret?: { x: number; y: number } | null;
  selection?: Selection[];
  fresh?: Fresh | null;
  hidden?: boolean;
}

export const Page = memo(function Page(props: PageProps) {
  const { kind, side, page, back, which, caret, selection, fresh, hidden } = props;
  const { settings } = useInk();
  const seed = kind === 'endpaper' ? (which === 'front' ? 9001 : 9002) : (page?.index ?? 0) * 7919 + (kind === 'ghost' ? 13 : 0) + 1;
  const deckle = useMemo(() => decklePolygon(seed, side, PAGE.W, PAGE.H), [seed, side]);

  if (kind === 'endpaper') {
    return (
      <div className={`page page-${side} endpaper`} aria-hidden>
        <div className="paper marble" style={{ clipPath: which === 'back' ? deckle : undefined }}>
          {which === 'front' && (
            <div className="bookplate">
              <div className="bookplate-title">Ex Libris</div>
              <div className="bookplate-name">{settings.owner || ' '}</div>
            </div>
          )}
          <div className={`gutter gutter-${side}`} />
        </div>
      </div>
    );
  }

  const ghost = kind === 'ghost';
  return (
    <div className={`page page-${side}`} aria-hidden={hidden || ghost || undefined}>
      <div className="paper" style={{ clipPath: deckle }}>
        {page?.kind !== 'title' && <Rules template={settings.paper} seed={seed} />}
        {ghost && page && (
          <div className="show-through ghost-through">
            <Ink page={page} />
          </div>
        )}
        {!ghost && back && back.kind === 'content' && (back.lines.length > 0 || back.photos.length > 0) && (
          <div className="show-through">
            <Ink page={back} />
          </div>
        )}
        {!ghost && page?.kind === 'title' && <TitlePage />}
        {!ghost && page?.kind === 'content' && (
          <>
            {selection?.map((s, i) => <SelectionMark key={i} s={s} />)}
            <Ink page={page} fresh={fresh} />
            {caret && <Caret x={caret.x} y={caret.y} />}
            <div className={`page-number page-number-${side}`}>{page.index}</div>
          </>
        )}
        <div className="paper-age" />
        <div className={`gutter gutter-${side}`} />
      </div>
    </div>
  );
});

function Rules({ template, seed }: { template: PaperId; seed: number }) {
  const content = useMemo(() => {
    if (template === 'blank') return null;
    const els: ReactElement[] = [];
    if (template === 'ruled') {
      for (let r = -1; r < PAGE.ROWS; r++) {
        const y = baselineY(r) + 0.5;
        const wob = jitter(seed, r, 'rule') * 0.5;
        els.push(<path key={r} d={`M10 ${y} Q${PAGE.W / 2} ${y + wob} ${PAGE.W - 10} ${y + wob * 0.4}`} opacity={0.85 + jitter(seed, r) * 0.15} />);
      }
    } else if (template === 'dotted') {
      const step = PAGE.LINE / 2;
      for (let r = -1; r < PAGE.ROWS; r++) {
        for (let x = PAGE.MX - 10; x <= PAGE.W - PAGE.MX + 10; x += step) {
          els.push(<circle key={`${r}-${x}`} cx={x} cy={baselineY(r)} r={1.1} />);
        }
      }
    } else {
      const step = PAGE.LINE / 2;
      for (let y = baselineY(-1); y <= baselineY(PAGE.ROWS - 1); y += step) els.push(<line key={`h${y}`} x1={18} x2={PAGE.W - 18} y1={y} y2={y} />);
      for (let x = 18; x <= PAGE.W - 18; x += step) els.push(<line key={`v${x}`} x1={x} x2={x} y1={baselineY(-1)} y2={baselineY(PAGE.ROWS - 1)} />);
    }
    return els;
  }, [template, seed]);
  return (
    <svg className={`rules rules-${template}`} width={PAGE.W} height={PAGE.H} aria-hidden>
      {content}
    </svg>
  );
}

function Ink({ page, fresh }: { page: PageLayout; fresh?: Fresh | null }) {
  return (
    <div className="ink">
      {page.lines.map((line) => (
        <LineView key={`${line.entryId}-${line.kind}-${line.start}-${line.row}`} line={line} fresh={fresh?.entryId === line.entryId ? fresh : null} />
      ))}
      {page.photos.map((p) => (
        <PhotoView key={`${p.entryId}-${p.start}`} block={p} />
      ))}
    </div>
  );
}

function LineView({ line, fresh }: { line: Line; fresh: Fresh | null }) {
  const { font, measurer, natural } = useInk();
  const y = baselineY(line.row);
  if (line.kind === 'divider') {
    return (
      <svg className="divider" style={{ left: PAGE.W / 2 - 40, top: y - 22 }} width={80} height={20} aria-hidden>
        <path d="M4 12 Q14 4 24 11 T44 11 T64 10 Q70 9 76 12" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      </svg>
    );
  }
  if (line.kind === 'heading') {
    const size = font.headingSize;
    const [a, suf, c] = headingParts(line.date!);
    const tilt = natural ? jitter(line.entryId, 'head') * 0.5 : 0;
    return (
      <div
        className="w heading"
        style={{ left: PAGE.MX - 2, top: y - measurer.baseline(size), fontSize: size, lineHeight: `${size}px`, transform: `rotate(${tilt}deg)` }}
      >
        {a}
        <sup>{suf}</sup>
        {c}
      </div>
    );
  }
  const size = font.size;
  const base = measurer.baseline(size);
  const slope = natural ? jitter(line.entryId, line.start, 'slope') * 0.005 : 0;
  return (
    <>
      {line.runs.map((r, i) => (
        <RunView key={runKey(r, i, fresh)} run={r} entryId={line.entryId} y={y} base={base} size={size} slope={slope} fresh={fresh} />
      ))}
    </>
  );
}

function runKey(r: Run, i: number, fresh: Fresh | null) {
  if (r.kind === 'word' && fresh && r.end === fresh.offset) return `f${i}-${r.text}`;
  return String(i);
}

function RunView({ run, entryId, y, base, size, slope, fresh }: { run: Run; entryId: string; y: number; base: number; size: number; slope: number; fresh: Fresh | null }) {
  const { measurer, natural } = useInk();
  if (run.kind === 'bullet') {
    return (
      <svg className="bullet" style={{ left: run.x, top: y - size * 0.42 }} width={10} height={10} aria-hidden>
        <path d="M5 1.6 C7.6 1.4 8.6 3.6 8.3 5.3 C8 7.4 5.9 8.6 4 8.1 C2 7.6 1.3 5.6 1.9 4 C2.4 2.6 3.5 1.7 5 1.6 Z" fill="currentColor" />
      </svg>
    );
  }
  if (run.kind === 'checkbox') {
    return (
      <svg className="checkbox" style={{ left: run.x, top: y - 22 }} width={24} height={26} aria-hidden>
        <path d="M3 6.5 Q10 5.4 18.6 6 Q19.4 13 18.8 21 Q11 21.8 3.4 21.2 Q2.6 14 3 6.5 Z" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
        {run.checked && <path d="M6 13 Q8.5 15.5 10 18.5 Q14 9 22 2.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />}
      </svg>
    );
  }
  const drift = (run.x - PAGE.MX) * slope;
  const j1 = natural ? jitter(entryId, run.start, 'rot') : 0;
  const j2 = natural ? jitter(entryId, run.start, 'dy') : 0;
  const j3 = natural ? jitter(entryId, run.start, 'ink') : 0;
  if (run.kind === 'sticker') {
    return (
      <div className="sticker" style={{ left: run.x, top: y - run.w + 8, transform: `translateY(${-drift}px) rotate(${j1 * 6}deg)` }}>
        <Sticker index={run.sticker} size={run.w} />
      </div>
    );
  }
  const isFresh = !!fresh && run.end === fresh.offset && run.text.length > 0;
  const style: CSSProperties = {
    left: run.x,
    top: y - base,
    fontSize: size,
    lineHeight: `${size}px`,
    transform: natural ? `translateY(${(j2 * 0.7 - drift).toFixed(2)}px) rotate(${(j1 * 0.7).toFixed(2)}deg)` : undefined,
    opacity: natural ? 0.9 + j3 * 0.07 : 1,
  };
  if (isFresh) (style as Record<string, string | number>)['--reveal'] = `${measurer.width(run.text.slice(-1), size).toFixed(1)}px`;
  return (
    <span className={isFresh ? 'w ink-in' : 'w'} style={style}>
      {run.text}
    </span>
  );
}

function PhotoView({ block }: { block: PhotoBlock }) {
  const { photos, natural } = useInk();
  const info = photos.get(block.photoId);
  const top = baselineY(block.row) - PAGE.LINE + 14;
  const availH = block.rows * PAGE.LINE - 20;
  const pad = 9;
  const bottom = 28;
  const aspect = info ? info.width / info.height : 4 / 3;
  let imgH = availH - pad - bottom;
  let imgW = imgH * aspect;
  const maxW = PAGE.W - 2 * PAGE.MX - 40;
  if (imgW > maxW) {
    imgW = maxW;
    imgH = imgW / aspect;
  }
  const frameW = imgW + pad * 2;
  const frameH = imgH + pad + bottom;
  const j = natural ? jitter(block.entryId, block.photoId, 'photo') : 0;
  const left = PAGE.W / 2 - frameW / 2 + j * 28;
  return (
    <div
      className="photo"
      style={{ left, top: top + (availH - frameH) / 2, width: frameW, height: frameH, transform: `rotate(${(j * 3.2).toFixed(2)}deg)` }}
    >
      {info ? <img src={info.url} alt="Journal photo" draggable={false} style={{ width: imgW, height: imgH }} /> : <div className="photo-missing" style={{ width: imgW, height: imgH }} />}
      <div className="tape" style={{ transform: `translateX(-50%) rotate(${(-4 + j * 8).toFixed(1)}deg)` }} />
    </div>
  );
}

function Caret({ x, y }: { x: number; y: number }) {
  const { font } = useInk();
  return <div className="caret" style={{ left: x, top: y - font.size * 0.82, height: font.size * 0.98 }} />;
}

function SelectionMark({ s }: { s: Selection }) {
  const { font } = useInk();
  return <div className="selection" style={{ left: s.x - 2, top: s.y - font.size * 0.7, width: s.w + 4, height: font.size * 0.9 }} />;
}

function TitlePage() {
  const { settings, font } = useInk();
  const year = new Date().getFullYear();
  return (
    <div className="title-page">
      <div className="title-label">This journal belongs to</div>
      <div className="title-name" style={{ fontFamily: font.family, fontSize: font.headingSize * 1.3 }}>
        {settings.owner || <span className="title-placeholder">your name here</span>}
      </div>
      <div className="title-rule" />
      <div className="title-year" style={{ fontFamily: font.family, fontSize: font.size }}>
        {year}
      </div>
      <div className="title-doodle">
        <Sticker index={0} size={70} />
      </div>
      <div className="title-foot">Notes3D</div>
    </div>
  );
}
