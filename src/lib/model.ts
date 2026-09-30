export interface Entry {
  id: string;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  createdAt: number;
  updatedAt: number;
  /**
   * Plain text. Special characters embed objects:
   *  U+E000..U+E0FF  ink doodle (sticker index)
   *  U+F0000..       photo (photo id = code point - 0xF0000)
   * A line starting with "- " is a bullet; "[ ] " / "[x] " is a checkbox.
   */
  body: string;
}

export interface Photo {
  id: number;
  blob: Blob;
  width: number;
  height: number;
  createdAt: number;
}

export type FontId = 'cursive' | 'casual' | 'loose' | 'print';
export type InkId = 'navy' | 'black' | 'sepia' | 'green' | 'burgundy';
export type PaperId = 'ruled' | 'dotted' | 'grid' | 'blank';
export type ThemeId = 'rainy' | 'morning' | 'evening' | 'plain';
export type MotionPref = 'auto' | 'full' | 'reduced';
export type ViewId = 'flat' | 'perspective';

export interface Settings {
  owner: string;
  font: FontId;
  ink: InkId;
  paper: PaperId;
  theme: ThemeId;
  sound: boolean;
  haptics: boolean;
  newPagePerEntry: boolean;
  cleanMode: boolean;
  writeIn: boolean;
  motion: MotionPref;
  props: boolean;
  view: ViewId;
}

export const DEFAULT_SETTINGS: Settings = {
  owner: '',
  font: 'cursive',
  ink: 'navy',
  paper: 'ruled',
  theme: 'rainy',
  sound: true,
  haptics: true,
  newPagePerEntry: false,
  cleanMode: false,
  writeIn: true,
  motion: 'auto',
  props: true,
  view: 'flat',
};

export const INKS: Record<InkId, { label: string; color: string }> = {
  navy: { label: 'Midnight navy', color: '#1b2440' },
  black: { label: 'Iron black', color: '#1d1c1a' },
  sepia: { label: 'Sepia', color: '#5a3a22' },
  green: { label: 'Forest green', color: '#1f3d2c' },
  burgundy: { label: 'Burgundy', color: '#5b1a2a' },
};

export const STICKER_BASE = 0xe000;
export const PHOTO_BASE = 0xf0000;

export const isStickerCp = (cp: number) => cp >= STICKER_BASE && cp < STICKER_BASE + 0x100;
export const isPhotoCp = (cp: number) => cp >= PHOTO_BASE && cp <= 0xffffd;
export const photoChar = (id: number) => String.fromCodePoint(PHOTO_BASE + id);
export const stickerChar = (i: number) => String.fromCodePoint(STICKER_BASE + i);

/** Readable text for search, index snippets and screen readers. */
export function plainText(body: string): string {
  let out = '';
  for (const ch of body) {
    const cp = ch.codePointAt(0)!;
    if (isPhotoCp(cp)) out += ' ';
    else if (isStickerCp(cp)) out += ' ';
    else out += ch;
  }
  return out;
}

export function photoIdsIn(body: string): number[] {
  const ids: number[] = [];
  for (const ch of body) {
    const cp = ch.codePointAt(0)!;
    if (isPhotoCp(cp)) ids.push(cp - PHOTO_BASE);
  }
  return ids;
}

/** First meaningful line of an entry, used as its title in the index. */
export function entryTitle(body: string): string {
  const line = plainText(body)
    .split('\n')
    .map((l) => l.replace(/^(- |\* |\[[ xX]\] )/, '').trim())
    .find((l) => l.length > 0);
  if (!line) return 'Untitled page';
  return line.length > 60 ? line.slice(0, 57).trimEnd() + '…' : line;
}
