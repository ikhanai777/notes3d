// Page-turn sound (synthesised, no audio files) and haptics.

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  // Brown-ish noise sounds like paper rather than hiss.
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.06 * white) / 1.06;
    d[i] = last * 3.2 + white * 0.08;
  }
  return ctx;
}

/** Soft paper "whoosh" with a papery rustle, randomised so no two turns sound the same. */
export function playPageTurn(durationMs = 600, volume = 1) {
  const ac = audio();
  if (!ac || !noise) return;
  if (ac.state === 'suspended') void ac.resume();
  const t0 = ac.currentTime + 0.01;
  const dur = (durationMs / 1000) * (0.9 + Math.random() * 0.2);
  const vol = 0.22 * volume * (0.85 + Math.random() * 0.3);

  const src = ac.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 0.8;
  band.frequency.setValueAtTime(900, t0);
  band.frequency.exponentialRampToValueAtTime(2600 + Math.random() * 600, t0 + dur * 0.55);
  band.frequency.exponentialRampToValueAtTime(700, t0 + dur);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.35);
  gain.gain.exponentialRampToValueAtTime(vol * 0.5, t0 + dur * 0.8);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.08);
  src.connect(band).connect(gain).connect(ac.destination);
  src.start(t0, Math.random() * 0.3);
  src.stop(t0 + dur + 0.1);

  // Settle: a tiny soft tap as the page lands.
  const tap = ac.createBufferSource();
  tap.buffer = noise;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  const tg = ac.createGain();
  const t1 = t0 + dur * 0.92;
  tg.gain.setValueAtTime(0.0001, t1);
  tg.gain.exponentialRampToValueAtTime(vol * 0.9, t1 + 0.012);
  tg.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.09);
  tap.connect(lp).connect(tg).connect(ac.destination);
  tap.start(t1, 0.5);
  tap.stop(t1 + 0.1);
}

export function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Not supported.
  }
}
