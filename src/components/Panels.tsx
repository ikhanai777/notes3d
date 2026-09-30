import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MONTHS, parseISODate, shortDate, toISODate, todayISO, longDate } from '../lib/dates';
import { CLEAN_FONT, HAND_FONTS } from '../lib/fonts';
import { entryTitle, INKS, photoIdsIn, plainText, type Entry, type FontId, type InkId, type PaperId, type Settings, type ThemeId } from '../lib/model';
import { Icon } from './Icons';
import type { PhotoInfo } from './context';

export type PanelId = 'entries' | 'calendar' | 'search' | 'photos' | 'settings';

export function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="panel-backdrop" onClick={onClose}>
      <section className="panel" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="panel-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className="panel-body">{children}</div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function EntriesPanel({ entries, onPick }: { entries: Entry[]; onPick: (id: string) => void }) {
  const groups = useMemo(() => {
    const g = new Map<string, Entry[]>();
    [...entries].reverse().forEach((e) => {
      const d = parseISODate(e.date);
      const k = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(e);
    });
    return [...g.entries()];
  }, [entries]);
  if (!entries.length) return <p className="panel-empty">No entries yet. Tap the pen to write your first page.</p>;
  return (
    <div className="toc">
      {groups.map(([month, list]) => (
        <div key={month} className="toc-group">
          <h3>{month}</h3>
          <ul>
            {list.map((e) => (
              <li key={e.id}>
                <button onClick={() => onPick(e.id)}>
                  <span className="toc-date">{shortDate(e.date)}</span>
                  <span className="toc-title">{entryTitle(e.body)}</span>
                  <span className="toc-dots" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function CalendarPanel({ entries, onPick, onNew }: { entries: Entry[]; onPick: (id: string) => void; onNew: (date: string) => void }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const byDate = useMemo(() => {
    const m = new Map<string, Entry[]>();
    entries.forEach((e) => m.set(e.date, [...(m.get(e.date) ?? []), e]));
    return m;
  }, [entries]);
  const [asking, setAsking] = useState<string | null>(null);
  const first = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const today = todayISO();
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  return (
    <div className="calendar">
      <div className="cal-head">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month">
          <Icon name="chevronLeft" />
        </button>
        <div className="cal-month">
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </div>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Next month">
          <Icon name="chevronRight" />
        </button>
      </div>
      <div className="cal-grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="cal-dow">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const iso = toISODate(new Date(month.getFullYear(), month.getMonth(), d));
          const has = byDate.get(iso);
          return (
            <button
              key={i}
              className={`cal-day ${has ? 'has' : ''} ${iso === today ? 'today' : ''} ${asking === iso ? 'asking' : ''}`}
              onClick={() => (has ? onPick(has[0].id) : setAsking(iso))}
              aria-label={`${longDate(iso)}${has ? `, ${has.length} ${has.length > 1 ? 'entries' : 'entry'}` : ''}`}
            >
              {d}
              {has && <span className="cal-dot" />}
            </button>
          );
        })}
      </div>
      {asking && (
        <div className="cal-ask">
          <span>Nothing written on {longDate(asking)}.</span>
          <button className="btn" onClick={() => onNew(asking)}>
            <Icon name="pen" size={16} /> Write about that day
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function SearchPanel({ entries, onPick }: { entries: Entry[]; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const out: { e: Entry; before: string; hit: string; after: string }[] = [];
    for (const e of [...entries].reverse()) {
      const text = plainText(e.body).replace(/\s+/g, ' ');
      const i = text.toLowerCase().indexOf(needle);
      const inDate = longDate(e.date).toLowerCase().includes(needle);
      if (i < 0 && !inDate) continue;
      if (i < 0) out.push({ e, before: text.slice(0, 80), hit: '', after: '' });
      else out.push({ e, before: (i > 40 ? '…' : '') + text.slice(Math.max(0, i - 40), i), hit: text.slice(i, i + needle.length), after: text.slice(i + needle.length, i + needle.length + 60) });
    }
    return out;
  }, [q, entries]);
  return (
    <div className="search">
      <label className="search-field">
        <Icon name="search" />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your journal…" aria-label="Search" type="search" />
      </label>
      {q.trim().length >= 2 && !results.length && <p className="panel-empty">Nothing found for “{q}”.</p>}
      <ul className="search-results">
        {results.map(({ e, before, hit, after }) => (
          <li key={e.id}>
            <button onClick={() => onPick(e.id)}>
              <span className="toc-date">{shortDate(e.date)}</span>
              <span className="search-snippet">
                {before}
                {hit && <mark>{hit}</mark>}
                {after}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function PhotosPanel({ entries, photos, onPick }: { entries: Entry[]; photos: Map<number, PhotoInfo>; onPick: (id: string) => void }) {
  const items = entries.flatMap((e) => photoIdsIn(e.body).map((id) => ({ e, id })));
  if (!items.length) return <p className="panel-empty">No photos yet. While writing, use the photo button to tape one into your journal.</p>;
  return (
    <div className="photo-grid">
      {items.map(({ e, id }, i) => {
        const info = photos.get(id);
        return (
          <button key={`${id}-${i}`} className="photo-thumb" style={{ transform: `rotate(${((i * 37) % 7) - 3}deg)` }} onClick={() => onPick(e.id)}>
            {info && <img src={info.url} alt="" />}
            <span>{shortDate(e.date)}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function SettingsPanel({
  settings,
  onChange,
  onExport,
  onImport,
  onErase,
  onClose: onCloseBook,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onExport: () => void;
  onImport: (f: File) => void;
  onErase: () => void;
  onClose: () => void;
}) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="settings">
      <fieldset>
        <legend>Journal</legend>
        <label className="field">
          <span>Belongs to</span>
          <input value={settings.owner} onChange={(e) => set('owner', e.target.value)} placeholder="Your name" maxLength={40} />
        </label>
      </fieldset>

      <fieldset>
        <legend>Handwriting</legend>
        <div className="choice-grid">
          {(Object.keys(HAND_FONTS) as FontId[]).map((id) => (
            <button key={id} className={`choice ${settings.font === id ? 'on' : ''}`} onClick={() => set('font', id)} aria-pressed={settings.font === id}>
              <span className="choice-sample" style={{ fontFamily: HAND_FONTS[id].family, fontSize: HAND_FONTS[id].size * 0.9, color: INKS[settings.ink].color }}>
                {HAND_FONTS[id].sample}
              </span>
              <span className="choice-label">{HAND_FONTS[id].label}</span>
            </button>
          ))}
        </div>
        <div className="swatches" role="radiogroup" aria-label="Ink colour">
          {(Object.keys(INKS) as InkId[]).map((id) => (
            <button
              key={id}
              role="radio"
              aria-checked={settings.ink === id}
              aria-label={INKS[id].label}
              title={INKS[id].label}
              className={`swatch ${settings.ink === id ? 'on' : ''}`}
              style={{ background: INKS[id].color }}
              onClick={() => set('ink', id)}
            />
          ))}
        </div>
        <Toggle label="Letters appear as you write" checked={settings.writeIn} onChange={(v) => set('writeIn', v)} />
      </fieldset>

      <fieldset>
        <legend>Paper</legend>
        <Segmented<PaperId>
          value={settings.paper}
          onChange={(v) => set('paper', v)}
          options={[['ruled', 'Ruled'], ['dotted', 'Dotted'], ['grid', 'Grid'], ['blank', 'Blank']]}
        />
        <Toggle label="Start each entry on a new page" checked={settings.newPagePerEntry} onChange={(v) => set('newPagePerEntry', v)} />
      </fieldset>

      <fieldset>
        <legend>Desk</legend>
        <Segmented<ThemeId>
          value={settings.theme}
          onChange={(v) => set('theme', v)}
          options={[['rainy', 'Rainy afternoon'], ['morning', 'Morning sun'], ['evening', 'Lamplight'], ['plain', 'Plain']]}
        />
        <Toggle label="Coffee, glasses and pen on the desk" checked={settings.props} onChange={(v) => set('props', v)} />
      </fieldset>

      <fieldset>
        <legend>Motion, sound & reading</legend>
        <Segmented
          value={settings.motion}
          onChange={(v) => set('motion', v)}
          options={[['auto', 'Follow system'], ['full', 'Full page turns'], ['reduced', 'Reduced motion']]}
        />
        <Toggle label="Page-turn sound" checked={settings.sound} onChange={(v) => set('sound', v)} />
        <Toggle label="Vibrate on page turn" checked={settings.haptics} onChange={(v) => set('haptics', v)} />
        <Toggle label={`Clean reading mode (${CLEAN_FONT.label.toLowerCase()} font, steady lines)`} checked={settings.cleanMode} onChange={(v) => set('cleanMode', v)} />
      </fieldset>

      <fieldset>
        <legend>Your data</legend>
        <p className="hint">Everything is stored only on this device. Keep a backup file somewhere safe.</p>
        <div className="btn-row">
          <button className="btn" onClick={onExport}>
            <Icon name="download" size={16} /> Export backup
          </button>
          <button className="btn" onClick={() => file.current?.click()}>
            <Icon name="upload" size={16} /> Restore backup
          </button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
        </div>
        <div className="btn-row">
          <button className="btn" onClick={onCloseBook}>
            <Icon name="book" size={16} /> Close the journal
          </button>
          <button className="btn danger" onClick={onErase}>
            <Icon name="trash" size={16} /> Erase everything
          </button>
        </div>
      </fieldset>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden />
      <span>{label}</span>
    </label>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}
