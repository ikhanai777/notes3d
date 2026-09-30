import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/dancing-script/500.css';
import '@fontsource/dancing-script/700.css';
import '@fontsource/caveat/500.css';
import '@fontsource/homemade-apple/400.css';
import '@fontsource/kalam/400.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import './styles.css';
import App from './App';
import { LEATHER_GRAIN, MARBLE, PAPER_FIBRES, PAPER_GRAIN, PAPER_MOTTLE, rasterize, WOOD_GRAIN } from './lib/paper';

// Procedural textures are generated once and shared through CSS variables.
const root = document.documentElement.style;
const textures: [string, string][] = [
  ['--tex-grain', PAPER_GRAIN],
  ['--tex-mottle', PAPER_MOTTLE],
  ['--tex-fibres', PAPER_FIBRES],
  ['--tex-leather', LEATHER_GRAIN],
  ['--tex-wood', WOOD_GRAIN],
  ['--tex-marble', MARBLE],
];
textures.forEach(([name, svg]) => root.setProperty(name, svg));
// Swap in bitmap copies as soon as they're ready (while the cover is still closed).
textures.forEach(([name, svg]) => void rasterize(svg).then((bmp) => bmp && root.setProperty(name, bmp)));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
