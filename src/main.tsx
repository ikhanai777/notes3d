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
import { LEATHER_GRAIN, MARBLE, PAPER_FIBRES, PAPER_GRAIN, PAPER_MOTTLE, WOOD_GRAIN } from './lib/paper';

// Procedural textures are generated once and shared through CSS variables.
const root = document.documentElement.style;
root.setProperty('--tex-grain', PAPER_GRAIN);
root.setProperty('--tex-mottle', PAPER_MOTTLE);
root.setProperty('--tex-fibres', PAPER_FIBRES);
root.setProperty('--tex-leather', LEATHER_GRAIN);
root.setProperty('--tex-wood', WOOD_GRAIN);
root.setProperty('--tex-marble', MARBLE);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
