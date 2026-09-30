import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Book, fitBook, type GotoRequest } from './components/Book';
import { CAMERAS, DISTANCE, PHONE_PERSPECTIVE } from './lib/camera';
import { InkCtx, type InkContext, type PhotoInfo } from './components/context';
import { Desk } from './components/Desk';
import { Icon, type IconName } from './components/Icons';
import { Page, type Fresh, type Side } from './components/Page';
import { CalendarPanel, EntriesPanel, PanelShell, PhotosPanel, SearchPanel, SettingsPanel, type PanelId } from './components/Panels';
import { Sticker, STICKERS } from './components/Sticker';
import { maxSpread, spreadOfPage, visiblePages, type Mode, type PageRef } from './lib/book';
import {
  addPhoto, collectPhotos, db, deleteEntry, eraseEverything, exportBackup, importBackup, isSeeded, loadSettings, markSeeded, saveEntry, saveSettings,
} from './lib/db';
import { longDate, todayISO } from './lib/dates';
import { haptic, playPageTurn } from './lib/feedback';
import { canvasMeasurer, CLEAN_FONT, HAND_FONTS, loadFont, type Measurer } from './lib/fonts';
import { findCaret, hitTest, layoutBook, selectionRects, type BookLayout, type PageLayout } from './lib/layout';
import { DEFAULT_SETTINGS, INKS, photoChar, stickerChar, type Entry, type Settings } from './lib/model';
import { seedEntries } from './lib/seed';
import { onBackButton, saveFile } from './lib/native';

const sortEntries = (list: Entry[]) => [...list].sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));

/** Height of the status bar area when the app draws edge to edge (Android app, notched phones). */
function readSafeTop(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;padding-top:var(--safe-area-inset-top, env(safe-area-inset-top, 0px))';
  document.body.appendChild(probe);
  const v = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return v;
}

function useViewport() {
  const read = () => ({
    safeTop: readSafeTop(),
    w: window.innerWidth,
    h: window.innerHeight,
    vvh: window.visualViewport?.height ?? window.innerHeight,
    vvTop: window.visualViewport?.offsetTop ?? 0,
  });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const on = () => setVp(read());
    window.addEventListener('resize', on);
    window.visualViewport?.addEventListener('resize', on);
    window.visualViewport?.addEventListener('scroll', on);
    return () => {
      window.removeEventListener('resize', on);
      window.visualViewport?.removeEventListener('resize', on);
      window.visualViewport?.removeEventListener('scroll', on);
    };
  }, []);
  return vp;
}

/** A value that only updates once it has stopped changing (e.g. while the keyboard slides in). */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

function usePrefersReducedMotion() {
  const q = '(prefers-reduced-motion: reduce)';
  const [v, setV] = useState(() => window.matchMedia?.(q).matches ?? false);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setV(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return v;
}

/** Reuse page objects whose content did not change, so unchanged pages skip re-rendering. */
function useStablePages(layout: BookLayout | null): BookLayout | null {
  const prev = useRef(new Map<number, { sig: string; page: PageLayout }>());
  return useMemo(() => {
    if (!layout) return null;
    const next = new Map<number, { sig: string; page: PageLayout }>();
    const pages = layout.pages.map((p) => {
      const sig = JSON.stringify([p.kind, p.lines, p.photos]);
      const old = prev.current.get(p.index);
      const keep = old && old.sig === sig ? old.page : p;
      next.set(p.index, { sig, page: keep });
      return keep;
    });
    prev.current = next;
    return { ...layout, pages };
  }, [layout]);
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [photos, setPhotos] = useState<Map<number, PhotoInfo>>(new Map());
  const [fontsReady, setFontsReady] = useState(0);
  const [open, setOpen] = useState(false);
  const [spread, setSpread] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [sel, setSel] = useState<[number, number]>([0, 0]);
  const [fresh, setFresh] = useState<Fresh | null>(null);
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [goto, setGoto] = useState<GotoRequest | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [stickerPicker, setStickerPicker] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lowPower, setLowPower] = useState(false);
  const [asking, setAsking] = useState<{ message: string; action: string; run: () => void } | null>(null);
  const vp = useViewport();
  const systemReduced = usePrefersReducedMotion();

  const ta = useRef<HTMLTextAreaElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const saveTimers = useRef(new Map<string, number>());
  /** After an edit, bring the caret's page into view: with a page turn, or straight there for a new entry. */
  const followCaret = useRef<false | 'turn' | 'jump'>(false);
  const blurTimer = useRef<number | null>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  // --- Load -----------------------------------------------------------------
  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      let list = await db.entries.toArray();
      if (!list.length && !(await isSeeded())) {
        list = seedEntries();
        await db.entries.bulkPut(list);
        await markSeeded();
      }
      const ph = await db.photos.toArray();
      setPhotos(new Map(ph.map((p) => [p.id, { url: URL.createObjectURL(p.blob), width: p.width, height: p.height }])));
      setSettings(s);
      setEntries(sortEntries(list));
      setReady(true);
    })().catch((err) => {
      console.error(err);
      setSettings((s) => s ?? DEFAULT_SETTINGS);
      setReady(true);
      setToast('Could not open saved pages on this device. New writing may not be kept.');
    });
  }, []);

  const font = settings ? (settings.cleanMode ? CLEAN_FONT : HAND_FONTS[settings.font]) : HAND_FONTS.cursive;
  useEffect(() => {
    let live = true;
    loadFont(font).then(() => live && setFontsReady((n) => n + 1));
    return () => {
      live = false;
    };
  }, [font]);

  const measurer: Measurer = useMemo(() => canvasMeasurer(font), [font, fontsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Layout ---------------------------------------------------------------
  const natural = !settings?.cleanMode;
  const rawLayout = useMemo(
    () => (settings && fontsReady ? layoutBook(entries, measurer, { size: font.size, newPagePerEntry: settings.newPagePerEntry, natural }) : null),
    [entries, measurer, font, settings, fontsReady, natural],
  );
  const layout = useStablePages(rawLayout);
  const pageCount = layout?.pages.length ?? 4;

  // The on-screen keyboard shrinks the window on Android. Keep laying the book out for
  // the full screen while writing, so it doesn't jump to a smaller size or another layout.
  const stable = useRef({ w: vp.w, h: vp.h });
  if (!editing || vp.w !== stable.current.w || vp.h > stable.current.h) stable.current = { w: vp.w, h: vp.h };
  const layoutH = stable.current.h;
  const mode: Mode = vp.w >= 760 && vp.w > layoutH * 1.05 ? 'two' : 'one';
  const settledVvh = useSettled(vp.vvh, 180);
  const keyboardOpen = vp.vvh < layoutH - 120;
  const wide = mode === 'two';
  const navSpace = wide ? 140 : 0;
  const bottomBar = wide ? 0 : 68;
  const area = { w: Math.max(200, vp.w - navSpace * 2 - (wide ? 16 : 12)), h: Math.max(200, layoutH - bottomBar - vp.safeTop - (wide ? 36 : 20)) };

  // Keep the spread valid when the mode or page count changes.
  const lastMode = useRef(mode);
  useEffect(() => {
    if (lastMode.current !== mode) {
      // Keep the same page in view across orientation changes.
      const page = lastMode.current === 'two' ? Math.max(0, 2 * spread - (spread > 0 ? 1 : 0)) : spread;
      lastMode.current = mode;
      setSpread(spreadOfPage(mode, page));
      return;
    }
    const max = maxSpread(mode, pageCount);
    if (spread > max) setSpread(max);
  }, [mode, pageCount, spread]);

  // --- Saving -----------------------------------------------------------------
  const scheduleSave = useCallback((e: Entry) => {
    const t = saveTimers.current.get(e.id);
    if (t) clearTimeout(t);
    saveTimers.current.set(
      e.id,
      window.setTimeout(() => {
        saveTimers.current.delete(e.id);
        saveEntry(e).catch(() => setToast('Saving failed. Is storage full?'));
      }, 350),
    );
  }, []);

  const flushSaves = useCallback(() => {
    saveTimers.current.forEach((t, id) => {
      clearTimeout(t);
      const e = entriesRef.current.find((x) => x.id === id);
      if (e) void saveEntry(e);
    });
    saveTimers.current.clear();
  }, []);

  useEffect(() => {
    const on = () => document.visibilityState === 'hidden' && flushSaves();
    document.addEventListener('visibilitychange', on);
    window.addEventListener('pagehide', flushSaves);
    return () => {
      document.removeEventListener('visibilitychange', on);
      window.removeEventListener('pagehide', flushSaves);
    };
  }, [flushSaves]);

  const updateSettings = useCallback((s: Settings) => {
    setSettings(s);
    void saveSettings(s);
  }, []);

  const updateEntry = useCallback(
    (id: string, patch: Partial<Entry>) => {
      setEntries((list) => {
        const next = list.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e));
        const e = next.find((x) => x.id === id);
        if (e) scheduleSave(e);
        return patch.date ? sortEntries(next) : next;
      });
    },
    [scheduleSave],
  );

  // --- Navigation -----------------------------------------------------------
  const nonce = useRef(0);
  const goSpread = useCallback((to: number) => setGoto({ to, nonce: ++nonce.current }), []);
  const goEntry = useCallback(
    (id: string) => {
      const p = layout?.entryPage.get(id);
      if (p !== undefined) goSpread(spreadOfPage(mode, p));
      setPanel(null);
    },
    [layout, mode, goSpread],
  );

  const openBook = useCallback(() => {
    if (!layout) return;
    const last = layout.lastContentPage;
    // Open at the latest writing, like a bookmark.
    setSpread(spreadOfPage(mode, entries.length ? last : 0));
    setOpen(true);
    if (settings?.sound) playPageTurn(900, 0.7);
  }, [layout, mode, entries.length, settings?.sound]);

  const reducedMotion = settings?.motion === 'reduced' || (settings?.motion !== 'full' && systemReduced);

  // --- Writing --------------------------------------------------------------
  const readSel = useCallback(() => {
    const t = ta.current;
    if (!t) return;
    setSel((s) => (s[0] === t.selectionStart && s[1] === t.selectionEnd ? s : [t.selectionStart, t.selectionEnd]));
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', readSel);
    return () => document.removeEventListener('selectionchange', readSel);
  }, [readSel]);

  const focusEditor = useCallback((entry: Entry, offset: number) => {
    const t = ta.current;
    if (!t) return;
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    if (t.dataset.entry !== entry.id || t.value !== entry.body) {
      t.value = entry.body;
      t.dataset.entry = entry.id;
    }
    t.focus({ preventScroll: true });
    t.setSelectionRange(offset, offset);
    setEditing(entry.id);
    setSel([offset, offset]);
    setFresh(null);
  }, []);

  const startEditing = useCallback(
    (id: string, offset: number) => {
      const e = entriesRef.current.find((x) => x.id === id);
      if (e) focusEditor(e, Math.min(offset, e.body.length));
    },
    [focusEditor],
  );

  const newEntry = useCallback(
    (date = todayISO()) => {
      const now = Date.now();
      const e: Entry = { id: crypto.randomUUID(), date, createdAt: now, updatedAt: now, body: '' };
      setEntries((list) => sortEntries([...list, e]));
      scheduleSave(e);
      entriesRef.current = sortEntries([...entriesRef.current, e]);
      setPanel(null);
      if (!open) setOpen(true);
      // Go straight to the new page: a page turn on top of the zoom and the keyboard opening is too much at once.
      followCaret.current = 'jump';
      focusEditor(e, 0);
    },
    [focusEditor, scheduleSave, open],
  );

  const endEditing = useCallback(() => {
    const id = ta.current?.dataset.entry;
    setEditing(null);
    setStickerPicker(false);
    setFresh(null);
    ta.current?.blur();
    if (!id) return;
    const e = entriesRef.current.find((x) => x.id === id);
    if (e && !e.body.trim()) {
      // An empty page leaves no trace.
      setEntries((list) => list.filter((x) => x.id !== id));
      const t = saveTimers.current.get(id);
      if (t) clearTimeout(t);
      saveTimers.current.delete(id);
      void deleteEntry(id);
    } else flushSaves();
    void collectPhotos();
  }, [flushSaves]);

  const onInput = useCallback(() => {
    const t = ta.current;
    const id = t?.dataset.entry;
    if (!t || !id) return;
    const before = entriesRef.current.find((x) => x.id === id)?.body ?? '';
    const v = t.value;
    const pos = t.selectionStart;
    const typedOne = v.length === before.length + 1 && pos > 0 && v.slice(0, pos - 1) + v.slice(pos) === before && !/\s/.test(v[pos - 1]);
    setFresh(typedOne && settings?.writeIn && !reducedMotion ? { entryId: id, offset: pos } : null);
    followCaret.current = 'turn';
    updateEntry(id, { body: v });
    readSel();
  }, [updateEntry, readSel, settings?.writeIn, reducedMotion]);

  /** Insert text at the caret as if typed, so undo keeps working. */
  const insertText = useCallback(
    (text: string) => {
      const t = ta.current;
      if (!t) return;
      t.focus({ preventScroll: true });
      const ok = document.execCommand?.('insertText', false, text);
      if (!ok) {
        t.setRangeText(text, t.selectionStart, t.selectionEnd, 'end');
        onInput();
      }
    },
    [onInput],
  );

  /** Put a prefix ("- " or "[ ] ") at the start of the caret's line, or take it away. */
  const toggleLinePrefix = useCallback(
    (prefix: string) => {
      const t = ta.current;
      if (!t) return;
      const v = t.value;
      const pos = t.selectionStart;
      const ls = v.lastIndexOf('\n', pos - 1) + 1;
      const line = v.slice(ls);
      const existing = /^(- |\* |\[[ xX]\] )/.exec(line)?.[0];
      t.setSelectionRange(ls, ls + (existing?.length ?? 0));
      const replacement = existing === prefix || (prefix === '[ ] ' && existing && existing.startsWith('[')) ? '' : prefix;
      insertText(replacement);
      const np = Math.max(ls, pos - (existing?.length ?? 0) + replacement.length);
      t.setSelectionRange(np, np);
      readSel();
    },
    [insertText, readSel],
  );

  const toggleCheckbox = useCallback(
    (id: string, offset: number) => {
      const e = entriesRef.current.find((x) => x.id === id);
      if (!e) return;
      const mark = e.body[offset + 1] === ' ' ? 'x' : ' ';
      const body = e.body.slice(0, offset + 1) + mark + e.body.slice(offset + 2);
      updateEntry(id, { body });
      if (ta.current?.dataset.entry === id) {
        const { selectionStart: a, selectionEnd: b } = ta.current;
        ta.current.value = body;
        ta.current.setSelectionRange(a, b);
      }
      haptic(6);
    },
    [updateEntry],
  );

  const onTap = useCallback(
    (pageIndex: number, x: number, y: number) => {
      if (!layout) return;
      const page = layout.pages[pageIndex];
      if (page.kind === 'title') {
        setPanel('settings');
        return;
      }
      const hit = hitTest(page, x, y, measurer, font.size);
      switch (hit.kind) {
        case 'text':
          return startEditing(hit.entryId, hit.offset);
        case 'heading':
          if (editing === hit.entryId) {
            dateInput.current?.showPicker?.();
            dateInput.current?.focus();
          } else startEditing(hit.entryId, 0);
          return;
        case 'checkbox':
          return toggleCheckbox(hit.entryId, hit.offset);
        case 'photo':
          return setLightbox(hit.photoId);
        case 'empty': {
          const list = entriesRef.current;
          if (!list.length || pageIndex > layout.lastContentPage) return newEntry();
          const last = list[list.length - 1];
          return startEditing(last.id, last.body.length);
        }
      }
    },
    [layout, measurer, font.size, startEditing, toggleCheckbox, editing, newEntry],
  );

  const onBlur = useCallback(() => {
    // Taps on the page or toolbar briefly steal focus; only stop writing if it stays away.
    blurTimer.current = window.setTimeout(() => {
      blurTimer.current = null;
      if (document.activeElement !== ta.current && document.activeElement !== dateInput.current) endEditing();
    }, 250);
  }, [endEditing]);

  // Caret, selection and following the caret to its page.
  const caret = useMemo(() => {
    if (!editing || !layout) return null;
    return findCaret(layout, editing, sel[1], measurer, font.size);
  }, [editing, layout, sel, measurer, font.size]);
  const selRects = useMemo(() => {
    if (!editing || !layout || sel[0] === sel[1]) return [];
    return selectionRects(layout, editing, Math.min(...sel), Math.max(...sel), measurer, font.size);
  }, [editing, layout, sel, measurer, font.size]);

  useEffect(() => {
    if (!caret || !followCaret.current || !open) return;
    const how = followCaret.current;
    followCaret.current = false;
    if (visiblePages(mode, spread).includes(caret.page)) return;
    if (how === 'jump') setSpread(spreadOfPage(mode, caret.page));
    else goSpread(spreadOfPage(mode, caret.page));
  }, [caret, mode, spread, goSpread, open]);

  // --- Photos -----------------------------------------------------------------
  const onPhotoPicked = useCallback(
    async (file: File) => {
      try {
        const id = await addPhoto(file);
        const p = await db.photos.get(id);
        if (p) setPhotos((m) => new Map(m).set(id, { url: URL.createObjectURL(p.blob), width: p.width, height: p.height }));
        const t = ta.current;
        if (!t) return;
        t.focus({ preventScroll: true });
        const v = t.value;
        const pos = t.selectionStart;
        const pre = pos > 0 && v[pos - 1] !== '\n' ? '\n' : '';
        const post = v[pos] !== '\n' ? '\n' : '';
        insertText(pre + photoChar(id) + post);
      } catch {
        setToast('That photo could not be added.');
      }
    },
    [insertText],
  );

  // --- Android back button ------------------------------------------------------
  const backState = useRef({ asking, lightbox, stickerPicker, panel, editing, open });
  backState.current = { asking, lightbox, stickerPicker, panel, editing, open };
  useEffect(
    () =>
      onBackButton(() => {
        const b = backState.current;
        if (b.asking) setAsking(null);
        else if (b.lightbox !== null) setLightbox(null);
        else if (b.stickerPicker) setStickerPicker(false);
        else if (b.panel) setPanel(null);
        else if (b.editing) endEditing();
        else return false;
        return true;
      }),
    [endEditing],
  );

  // --- Keyboard shortcuts -------------------------------------------------------
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (panel || lightbox !== null) return;
      if (editing) {
        if (e.key === 'Escape') endEditing();
        return;
      }
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
      if (!open) {
        if (e.key === 'Enter' || e.key === ' ') openBook();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') goSpread(spread + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goSpread(spread - 1);
      else if (e.key === 'Home') goSpread(0);
      else if (e.key === 'End' && layout) goSpread(spreadOfPage(mode, layout.lastContentPage));
      else if (e.key === 'n') {
        e.preventDefault();
        newEntry();
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [panel, lightbox, editing, open, spread, layout, mode, goSpread, newEntry, endEditing, openBook]);

  // --- Keeping the caret above the on-screen keyboard -------------------------
  const perspective = settings?.view === 'perspective';
  const tilted = perspective && !editing;
  const fit = fitBook(mode, open, area.w, area.h, tilted);
  const areaTop = (wide ? 18 : 10) + vp.safeTop;
  // Zoom in on the writing on phones, and on any device while its on-screen keyboard is up.
  const softKeyboard = settledVvh < layoutH - 120;
  const writingVisible = Math.min(area.h, settledVvh - areaTop - (wide ? 96 : 64));
  const writing =
    editing && caret && open && (mode === 'one' || softKeyboard) ? { page: caret.page, caretY: caret.y, visibleHeight: writingVisible } : null;
  // The page never scrolls; undo any scroll the browser makes to reveal the hidden input.
  useEffect(() => {
    const on = () => {
      if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
    };
    window.addEventListener('scroll', on);
    window.visualViewport?.addEventListener('scroll', on);
    return () => {
      window.removeEventListener('scroll', on);
      window.visualViewport?.removeEventListener('scroll', on);
    };
  }, []);

  // --- Rendering ------------------------------------------------------------------
  const inkCtx: InkContext | null = useMemo(
    () => (settings ? { font, measurer, settings, photos, natural } : null),
    [font, measurer, settings, photos, natural],
  );

  const renderPage = useCallback(
    (ref: PageRef, side: Side, role: 'static' | 'layer') => {
      if (!layout) return null;
      if (ref.kind === 'endpaper') return <Page kind="endpaper" which={ref.which} side={side} />;
      const page = layout.pages[ref.index];
      if (!page) return null;
      if (ref.kind === 'ghost') return <Page kind="ghost" page={page} side={side} />;
      const isCaretPage = caret?.page === ref.index;
      const backIndex = mode === 'two' ? (ref.index % 2 === 0 ? ref.index + 1 : ref.index - 1) : -1;
      const pageSel = selRects.filter((s) => s.page === ref.index);
      return (
        <Page
          kind="page"
          page={page}
          back={role === 'static' && backIndex > 0 ? layout.pages[backIndex] : undefined}
          side={side}
          caret={isCaretPage && sel[0] === sel[1] ? caret : null}
          selection={pageSel.length ? pageSel : undefined}
          fresh={fresh}
          hidden={role === 'layer'}
        />
      );
    },
    [layout, caret, mode, selRects, sel, fresh],
  );

  if (!ready || !settings || !inkCtx) {
    return <div className="loading">Opening your journal…</div>;
  }

  const ink = INKS[settings.ink].color;
  const editingEntry = editing ? entries.find((e) => e.id === editing) : undefined;

  const navItems: [PanelId, IconName, string][] = [
    ['entries', 'entries', 'Entries'],
    ['calendar', 'calendar', 'Calendar'],
    ['search', 'search', 'Search'],
    ['photos', 'photos', 'Photos'],
    ['settings', 'settings', 'Settings'],
  ];

  return (
    <InkCtx.Provider value={inkCtx}>
      <div
        className={`app ${wide ? 'is-wide' : 'is-narrow'} ${editing ? 'is-editing' : ''} ${reducedMotion ? 'reduced' : ''}`}
        style={{ '--ink': ink, '--hand': font.family, '--hand-weight': font.weight } as React.CSSProperties}
      >
        <Desk
          theme={settings.theme}
          props={settings.props && wide}
          onPen={() => newEntry()}
          camera={tilted ? (mode === 'one' ? PHONE_PERSPECTIVE : CAMERAS.perspective) : CAMERAS.flat}
          distance={DISTANCE * fit.scale}
        >
          <main className="stage" style={{ top: areaTop, left: (vp.w - area.w) / 2, width: area.w, height: area.h }}>
            <Book
              mode={mode}
              pageCount={pageCount}
              spread={spread}
              onSpreadChange={setSpread}
              open={open}
              onOpen={openBook}
              coverTitle={settings.owner ? `${settings.owner}’s Journal` : 'Journal'}
              width={area.w}
              height={area.h}
              renderPage={renderPage}
              onTap={onTap}
              onTurnStart={(ms) => settings.sound && playPageTurn(ms)}
              onTurnEnd={() => settings.haptics && haptic(8)}
              reducedMotion={reducedMotion}
              goto={goto}
              perspective={perspective}
              flatten={!!editing}
              lowPower={lowPower}
              onLowPower={() => setLowPower(true)}
              compact={!wide}
              writing={writing}
            />
          </main>
        </Desk>

        {open && !(editing && !wide) && (
          <nav className={`index ${wide ? 'index-side' : 'index-bar'}`} aria-label="Journal index">
            {navItems.map(([id, icon, label]) => (
              <button key={id} className="index-item" onClick={() => setPanel(id)} aria-label={label}>
                <Icon name={icon} size={wide ? 18 : 22} />
                <span>{label}</span>
              </button>
            ))}
            <button
              className="index-item index-view"
              onClick={() => updateSettings({ ...settings, view: perspective ? 'flat' : 'perspective' })}
              aria-pressed={perspective}
              aria-label={perspective ? 'Switch to flat view' : 'Switch to 3D view'}
            >
              <Icon name={perspective ? 'flat' : 'cube'} size={wide ? 18 : 22} />
              <span>{perspective ? 'Flat view' : '3D view'}</span>
            </button>
            <button className="index-item index-write" onClick={() => newEntry()} aria-label="New entry">
              <Icon name="pen" size={wide ? 18 : 22} />
              <span>Write</span>
            </button>
          </nav>
        )}

        {editing && (
          <div
            className="editor-bar"
            style={!wide && keyboardOpen ? { top: vp.vvTop + vp.vvh - 56, bottom: 'auto' } : undefined}
            onPointerDown={(e) => (e.target as HTMLElement).closest('button') && e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            role="toolbar"
            aria-label="Writing tools"
          >
            <button onClick={() => toggleLinePrefix('- ')} aria-label="Bullet list" title="Bullet list">
              <Icon name="bullet" />
            </button>
            <button onClick={() => toggleLinePrefix('[ ] ')} aria-label="Checklist" title="Checklist">
              <Icon name="checkbox" />
            </button>
            <button onClick={() => setStickerPicker((v) => !v)} aria-label="Ink doodles" title="Ink doodles" aria-expanded={stickerPicker}>
              <Icon name="doodle" />
            </button>
            <button onClick={() => photoInput.current?.click()} aria-label="Add a photo" title="Add a photo">
              <Icon name="photos" />
            </button>
            <button
              onClick={() => {
                dateInput.current?.showPicker?.();
                dateInput.current?.focus();
              }}
              aria-label={`Change date (${editingEntry ? longDate(editingEntry.date) : ''})`}
              title="Change date"
            >
              <Icon name="calendar" />
            </button>
            <button
              onClick={() => {
                const id = editing;
                const e = entries.find((x) => x.id === id);
                if (!id || !e) return;
                const tear = () => {
                  const t = saveTimers.current.get(id);
                  if (t) clearTimeout(t);
                  saveTimers.current.delete(id);
                  entriesRef.current = entriesRef.current.filter((x) => x.id !== id);
                  setEntries((list) => list.filter((x) => x.id !== id));
                  if (ta.current) {
                    ta.current.value = '';
                    delete ta.current.dataset.entry;
                    ta.current.blur();
                  }
                  setEditing(null);
                  void deleteEntry(id).then(collectPhotos);
                };
                if (!e.body.trim()) tear();
                else setAsking({ message: `Tear out the entry from ${longDate(e.date)}? This cannot be undone.`, action: 'Tear it out', run: tear });
              }}
              aria-label="Tear out this entry"
              title="Tear out this entry"
            >
              <Icon name="trash" />
            </button>
            <span className="editor-spacer" />
            <button className="editor-done" onClick={endEditing} aria-label="Done writing">
              <Icon name="check" /> <span>Done</span>
            </button>
            {stickerPicker && (
              <div className="sticker-picker" role="menu" aria-label="Ink doodles">
                {STICKERS.map((s, i) => (
                  <button
                    key={s.name}
                    role="menuitem"
                    onClick={() => {
                      insertText(stickerChar(i));
                      setStickerPicker(false);
                    }}
                    aria-label={s.name}
                    title={s.name}
                  >
                    <Sticker index={i} size={34} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <textarea
          ref={ta}
          className="hidden-input"
          aria-label={editingEntry ? `Journal entry for ${longDate(editingEntry.date)}` : 'Journal entry'}
          autoCapitalize="sentences"
          spellCheck
          onInput={onInput}
          onSelect={readSel}
          onKeyUp={readSel}
          onBlur={onBlur}
          style={caret ? { top: Math.round(areaTop + Math.max(0, writingVisible) * 0.4) } : undefined}
        />
        <input
          ref={dateInput}
          type="date"
          className="hidden-date"
          tabIndex={-1}
          aria-label="Entry date"
          value={editingEntry?.date ?? todayISO()}
          onChange={(e) => {
            if (editing && e.target.value) {
              followCaret.current = 'turn';
              updateEntry(editing, { date: e.target.value });
            }
            ta.current?.focus({ preventScroll: true });
          }}
          onBlur={() => !editing || ta.current?.focus({ preventScroll: true })}
        />
        <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void onPhotoPicked(f);
        }} />

        {panel && (
          <PanelShell
            title={{ entries: 'Entries', calendar: 'Calendar', search: 'Search', photos: 'Photos', settings: 'Settings' }[panel]}
            onClose={() => setPanel(null)}
          >
            {panel === 'entries' && <EntriesPanel entries={entries} onPick={goEntry} />}
            {panel === 'calendar' && <CalendarPanel entries={entries} onPick={goEntry} onNew={(d) => newEntry(d)} />}
            {panel === 'search' && <SearchPanel entries={entries} onPick={goEntry} />}
            {panel === 'photos' && <PhotosPanel entries={entries} photos={photos} onPick={goEntry} />}
            {panel === 'settings' && (
              <SettingsPanel
                settings={settings}
                onChange={updateSettings}
                onExport={async () => {
                  try {
                    await saveFile(await exportBackup(), `journal-backup-${todayISO()}.json`);
                  } catch (err) {
                    // Closing the share sheet without choosing anything is not an error.
                    if (!/cancel/i.test(String(err))) setToast('The backup could not be saved. Try again.');
                  }
                }}
                onImport={(f) =>
                  setAsking({
                    message: 'Restoring replaces every page in this journal with the pages from the backup.',
                    action: 'Restore backup',
                    run: async () => {
                      try {
                        await importBackup(f);
                        window.location.reload();
                      } catch (err) {
                        setToast(err instanceof Error ? err.message : 'That backup could not be read.');
                      }
                    },
                  })
                }
                onErase={() =>
                  setAsking({
                    message: 'Erase every page and photo on this device? This cannot be undone.',
                    action: 'Erase everything',
                    run: async () => {
                      await eraseEverything();
                      window.location.reload();
                    },
                  })
                }
                onClose={() => {
                  setPanel(null);
                  setOpen(false);
                }}
              />
            )}
          </PanelShell>
        )}

        {lightbox !== null && (
          <div className="lightbox" onClick={() => setLightbox(null)} role="dialog" aria-label="Photo">
            {photos.get(lightbox) && (
              <figure className="lightbox-print">
                <img src={photos.get(lightbox)!.url} alt="Journal photo" />
              </figure>
            )}
          </div>
        )}

        {asking && (
          <div className="panel-backdrop confirm-backdrop" onClick={() => setAsking(null)}>
            <div className="confirm" role="alertdialog" aria-modal="true" aria-label={asking.action} onClick={(e) => e.stopPropagation()}>
              <p>{asking.message}</p>
              <div className="btn-row">
                <button className="btn" autoFocus onClick={() => setAsking(null)}>
                  Keep it
                </button>
                <button
                  className="btn danger"
                  onClick={() => {
                    const run = asking.run;
                    setAsking(null);
                    run();
                  }}
                >
                  {asking.action}
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className="toast" role="status" onClick={() => setToast(null)}>
            {toast}
          </div>
        )}
      </div>
    </InkCtx.Provider>
  );
}

