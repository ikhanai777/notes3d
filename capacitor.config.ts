import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.notes3d.journal',
  appName: 'Notes3D Journal',
  webDir: 'dist',
  backgroundColor: '#2a190e',
  android: {
    // No remote content: everything ships inside the app.
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'DARK',
    },
  },
};

export default config;
