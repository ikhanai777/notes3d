import { createContext, useContext } from 'react';
import type { HandFont, Measurer } from '../lib/fonts';
import type { Settings } from '../lib/model';

export interface PhotoInfo {
  url: string;
  width: number;
  height: number;
}

export interface InkContext {
  font: HandFont;
  measurer: Measurer;
  settings: Settings;
  photos: Map<number, PhotoInfo>;
  /** Natural handwriting variation (off in clean reading mode). */
  natural: boolean;
}

export const InkCtx = createContext<InkContext | null>(null);

export function useInk(): InkContext {
  const v = useContext(InkCtx);
  if (!v) throw new Error('InkCtx missing');
  return v;
}
