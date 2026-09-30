// Small bridge to the Android app shell (Capacitor). On the web these fall back
// to browser behaviour.

import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const isNative = Capacitor.isNativePlatform();

const toBase64 = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

/** Hand a file to the person: the share sheet in the app (save to Files, Drive, …), a download on the web. */
export async function saveFile(blob: Blob, name: string): Promise<void> {
  if (isNative) {
    const { uri } = await Filesystem.writeFile({ path: name, data: await toBase64(blob), directory: Directory.Cache });
    await Share.share({ title: name, files: [uri], dialogTitle: 'Save your journal backup' });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/**
 * Android back button. The handler returns true when it handled the press
 * (closed a panel, stopped writing, …); otherwise the app goes to the background.
 */
export function onBackButton(handler: () => boolean): () => void {
  if (!isNative) return () => {};
  const sub = NativeApp.addListener('backButton', () => {
    if (!handler()) void NativeApp.minimizeApp();
  });
  return () => {
    void sub.then((s) => s.remove());
  };
}
