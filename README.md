# Notes3D

A journal app that looks and feels like a real paper book: cream deckle-edged pages, ruled lines, flowing ink handwriting, and pages you turn by dragging their corners.

- Product & technical spec: [docs/SPEC.md](docs/SPEC.md)
- Visual inspiration: [docs/reference/inspiration-journal.jpg](docs/reference/inspiration-journal.jpg)

## Run it

```sh
npm install
npm run dev      # http://localhost:5173 (add --host to open it from your phone on the same Wi-Fi)
npm test         # unit tests for page-fold geometry and pagination
npm run build    # production build in dist/ (installable PWA, works offline)
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml` (enable Pages → Source: GitHub Actions in the repo settings once).

## Using the journal

- **Open** the leather cover by tapping it. The book opens at your latest page.
- **Turn pages** by dragging a page corner, swiping, tapping the outer edge of a page, or with ←/→ on a keyboard. You can catch a page mid-turn.
- **Write** by tapping anywhere on a page, or tap the pen (or *Write*) for a new entry dated today. Typing appears as handwriting on the ruled lines and flows onto the next page.
- While writing, the toolbar adds bullet lists, checklists, ink doodles, taped-in photos, changes the entry's date, or tears the entry out. Tap a checkbox to tick it.
- The index (left side on tablets and desktops, bottom bar on phones) opens Entries, Calendar, Search, Photos and Settings.
- Settings: handwriting style, ink colour, paper (ruled/dotted/grid/blank), desk theme, sound, vibration, reduced motion, clean reading mode, and backup export/restore.

Phones (and tablets held upright) show one page at a time, like a pocket notebook; wider screens show a two-page spread.

## How it's built

- React + TypeScript + Vite; everything runs on the device. Entries and photos are stored in IndexedDB (Dexie). Nothing is sent to a server.
- **Page turns** (`src/lib/geometry.ts`, `src/components/Book.tsx`): the turning page is folded along the perpendicular bisector between its resting corner and your finger. The page is drawn in three layers: the still-flat part (clip-path), the folded flap showing the back of the page (a reflection matrix plus clip-path), and the page revealed underneath. SVG gradients add the shadows. Each animation frame writes straight to the DOM, so turns stay smooth on phones.
- **Handwriting** (`src/lib/layout.ts`, `src/components/Page.tsx`): a paginator measures words with the chosen handwriting font and places every line on a ruled line. Words get a small, deterministic variation in angle, baseline and ink density. Typing goes into a hidden textarea, so native keyboards, autocorrect, IME and undo all work; the caret and selection are drawn on the paper.
- **Paper** (`src/lib/paper.ts`): procedural fibres, grain and mottling, torn deckle edges (unique per page), gutter shading, faint show-through of the other side of the sheet, and marbled endpapers.
- Fonts are self-hosted (Fontsource, OFL): Dancing Script, Caveat, Homemade Apple, Kalam, Atkinson Hyperlegible, Inter.
