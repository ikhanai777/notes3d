import Dexie, { type Table } from 'dexie';
import { DEFAULT_SETTINGS, photoIdsIn, type Entry, type Photo, type Settings } from './model';

class JournalDB extends Dexie {
  entries!: Table<Entry, string>;
  photos!: Table<Photo, number>;
  kv!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('notes3d');
    this.version(1).stores({
      entries: 'id, date, updatedAt',
      photos: '++id',
      kv: 'key',
    });
  }
}

export const db = new JournalDB();

export async function loadSettings(): Promise<Settings> {
  const row = await db.kv.get('settings');
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export const saveSettings = (s: Settings) => db.kv.put({ key: 'settings', value: s });

export const saveEntry = (e: Entry) => db.entries.put(e);
export const deleteEntry = (id: string) => db.entries.delete(id);

export async function isSeeded(): Promise<boolean> {
  return !!(await db.kv.get('seeded'));
}
export const markSeeded = () => db.kv.put({ key: 'seeded', value: true });

/** Scale a picked image down and store it. Returns the photo id. */
export async function addPhoto(file: Blob): Promise<number> {
  const bmp = await createImageBitmap(file);
  const max = 1600;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.86));
  return db.photos.add({ blob, width: w, height: h, createdAt: Date.now() } as Photo);
}

/** Remove photos no entry refers to any more. */
export async function collectPhotos(): Promise<void> {
  const used = new Set<number>();
  (await db.entries.toArray()).forEach((e) => photoIdsIn(e.body).forEach((id) => used.add(id)));
  const orphans = (await db.photos.toCollection().primaryKeys()).filter((id) => !used.has(id));
  if (orphans.length) await db.photos.bulkDelete(orphans);
}

// ---------------------------------------------------------------------------
// Backup

interface Backup {
  app: 'notes3d';
  version: 1;
  settings: Settings;
  entries: Entry[];
  photos: { id: number; width: number; height: number; createdAt: number; data: string }[];
}

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

export async function exportBackup(): Promise<Blob> {
  const photos = await db.photos.toArray();
  const backup: Backup = {
    app: 'notes3d',
    version: 1,
    settings: await loadSettings(),
    entries: await db.entries.toArray(),
    photos: await Promise.all(
      photos.map(async (p) => ({ id: p.id, width: p.width, height: p.height, createdAt: p.createdAt, data: await blobToDataUrl(p.blob) })),
    ),
  };
  return new Blob([JSON.stringify(backup)], { type: 'application/json' });
}

export async function importBackup(file: Blob): Promise<void> {
  const data = JSON.parse(await file.text()) as Backup;
  if (data.app !== 'notes3d' || !Array.isArray(data.entries)) throw new Error('This file is not a Notes3D backup.');
  // Decode photos first: awaiting non-database work inside a transaction would end it early.
  const photos: Photo[] = await Promise.all(
    (data.photos ?? []).map(async (p) => ({
      id: p.id, width: p.width, height: p.height, createdAt: p.createdAt,
      blob: await (await fetch(p.data)).blob(),
    })),
  );
  await db.transaction('rw', db.entries, db.photos, db.kv, async () => {
    await db.entries.clear();
    await db.photos.clear();
    await db.entries.bulkPut(data.entries);
    await db.photos.bulkPut(photos);
    if (data.settings) await db.kv.put({ key: 'settings', value: data.settings });
    await db.kv.put({ key: 'seeded', value: true });
  });
}

export async function eraseEverything(): Promise<void> {
  await db.transaction('rw', db.entries, db.photos, db.kv, async () => {
    await db.entries.clear();
    await db.photos.clear();
    await db.kv.put({ key: 'seeded', value: true });
  });
}
