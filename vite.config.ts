import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The Android app (Capacitor) ships its files inside the APK, so it needs no service worker.
const forApp = process.env.CAP === '1';

export default defineConfig({
  // Relative paths so the build works from any sub-folder (e.g. GitHub Pages).
  base: './',
  plugins: [
    react(),
    !forApp &&
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Notes3D Journal',
        short_name: 'Journal',
        description: 'A journal that looks and feels like a real paper book.',
        theme_color: '#3a2415',
        background_color: '#2a190e',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
});
