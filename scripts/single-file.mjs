// Bundles dist/ into one self-contained HTML page (scripts, styles and fonts inlined),
// for hosts that serve a single file. Run after `vite build`.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const out = process.argv[2] ?? join(dist, 'notes3d-single.html');
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const jsPath = /<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/.exec(html)[1];
const cssPath = /<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/.exec(html)[1];

let css = readFileSync(join(dist, cssPath), 'utf8');
// Keep only the woff2 source of each @font-face and embed it.
css = css.replace(/src:\s*url\(\.\/([^)]+\.woff2)\)\s*format\("woff2"\)(?:\s*,\s*url\([^)]+\)\s*format\("woff"\))?/g, (_, file) => {
  const data = readFileSync(join(dist, 'assets', file)).toString('base64');
  return `src:url(data:font/woff2;base64,${data}) format("woff2")`;
});
const js = readFileSync(join(dist, jsPath), 'utf8').replace(/<\/script/gi, '<\\/script');
const icon = readFileSync(join(dist, 'icon.svg')).toString('base64');

const page = `<title>Notes3D Journal</title>
<meta name="theme-color" content="#3a2415">
<link rel="icon" href="data:image/svg+xml;base64,${icon}">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
writeFileSync(out, page);
console.log(`${out}: ${(page.length / 1024).toFixed(0)} KB`);
