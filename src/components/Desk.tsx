import type { ReactNode } from 'react';
import type { CameraAngles } from '../lib/camera';
import type { ThemeId } from '../lib/model';

interface DeskProps {
  theme: ThemeId;
  props: boolean;
  onPen: () => void;
  /** The desk tilts with the same camera as the book, so everything shares one perspective. */
  camera: CameraAngles;
  distance: number;
  children: ReactNode;
}

/** The wooden desk, window light, and a few things lying around. */
export function Desk({ theme, props, onPen, camera, distance, children }: DeskProps) {
  const showProps = props && theme !== 'plain';
  return (
    <div className={`desk theme-${theme}`}>
      <div
        className="desk-plane"
        // Looking straight down needs no 3D transform; leaving it off keeps the big desk layer cheap.
        style={{ transform: camera.tilt || camera.turn ? `perspective(${distance.toFixed(0)}px) rotateX(${camera.tilt}deg) rotateZ(${camera.turn}deg)` : 'none' }}
      >
        <div className="desk-wood" />
        {showProps && (
          <div className="desk-props" aria-hidden>
            <Cup />
            <Glasses />
          </div>
        )}
        {showProps && (
          <button className="desk-pen" onClick={onPen} aria-label="New entry" title="New entry">
            <Pen />
          </button>
        )}
      </div>
      <div className="desk-light" />
      {theme === 'rainy' && <div className="desk-rain" />}
      {children}
      <div className="desk-vignette" />
    </div>
  );
}

function Cup() {
  return (
    <svg className="prop-cup" viewBox="0 0 260 220" width={260} height={220}>
      <defs>
        <radialGradient id="cupCoffee" cx="45%" cy="42%" r="60%">
          <stop offset="0" stopColor="#c89a6a" />
          <stop offset="0.35" stopColor="#a8703f" />
          <stop offset="0.8" stopColor="#6d4122" />
          <stop offset="1" stopColor="#4a2a14" />
        </radialGradient>
        <radialGradient id="cupBody" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#f4efe6" />
          <stop offset="0.7" stopColor="#dcd3c4" />
          <stop offset="1" stopColor="#b9ae9c" />
        </radialGradient>
        <filter id="cupShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      <ellipse cx="120" cy="122" rx="96" ry="92" fill="#1a0f06" opacity=".45" filter="url(#cupShadow)" />
      <path d="M190 88 C236 78 250 150 196 150" fill="none" stroke="#cfc4b3" strokeWidth="16" strokeLinecap="round" />
      <path d="M190 88 C236 78 250 150 196 150" fill="none" stroke="#efe8dc" strokeWidth="7" strokeLinecap="round" opacity=".7" />
      <circle cx="112" cy="110" r="88" fill="url(#cupBody)" />
      <circle cx="112" cy="110" r="88" fill="none" stroke="#a79a86" strokeWidth="1.5" opacity=".6" />
      <circle cx="112" cy="110" r="72" fill="#e9e2d6" />
      <circle cx="112" cy="110" r="66" fill="url(#cupCoffee)" />
      <path d="M72 96 C90 70 138 66 156 92" fill="none" stroke="#e9c9a2" strokeWidth="5" opacity=".45" strokeLinecap="round" />
      <ellipse cx="92" cy="84" rx="16" ry="7" fill="#fff" opacity=".22" transform="rotate(-25 92 84)" />
    </svg>
  );
}

function Glasses() {
  return (
    <svg className="prop-glasses" viewBox="0 0 300 140" width={300} height={140}>
      <defs>
        <filter id="glShadow" x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <linearGradient id="lens" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".04" />
          <stop offset="1" stopColor="#fff" stopOpacity=".16" />
        </linearGradient>
      </defs>
      <g transform="translate(8 14)" opacity=".5" filter="url(#glShadow)" fill="none" stroke="#120a04" strokeWidth="7">
        <ellipse cx="80" cy="62" rx="52" ry="44" />
        <ellipse cx="200" cy="62" rx="52" ry="44" />
      </g>
      <g fill="none" stroke="#3a2416" strokeWidth="6">
        <ellipse cx="80" cy="62" rx="52" ry="44" fill="url(#lens)" />
        <ellipse cx="200" cy="62" rx="52" ry="44" fill="url(#lens)" />
        <path d="M132 58 Q140 48 148 58" />
        <path d="M28 52 L4 20" strokeWidth="5" />
        <path d="M252 52 L292 14" strokeWidth="5" />
      </g>
      <g fill="none" stroke="#7a5238" strokeWidth="1.6" opacity=".7">
        <ellipse cx="80" cy="60" rx="50" ry="42" />
        <ellipse cx="200" cy="60" rx="50" ry="42" />
      </g>
    </svg>
  );
}

function Pen() {
  return (
    <svg viewBox="0 0 60 360" width={60} height={360} aria-hidden>
      <defs>
        <linearGradient id="penBody" x1="0" x2="1">
          <stop offset="0" stopColor="#0c0b0a" />
          <stop offset=".35" stopColor="#3b3733" />
          <stop offset=".5" stopColor="#1a1816" />
          <stop offset="1" stopColor="#050505" />
        </linearGradient>
        <linearGradient id="penGold" x1="0" x2="1">
          <stop offset="0" stopColor="#7a5a24" />
          <stop offset=".4" stopColor="#e9cf8a" />
          <stop offset="1" stopColor="#6b4c1a" />
        </linearGradient>
        <filter id="penShadow" x="-60%" y="-10%" width="220%" height="120%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <rect x="22" y="22" width="22" height="300" rx="11" fill="#140a03" opacity=".45" filter="url(#penShadow)" />
      <path d="M19 30 Q19 16 30 16 Q41 16 41 30 L41 210 L19 210 Z" fill="url(#penBody)" />
      <rect x="18" y="210" width="24" height="10" fill="url(#penGold)" />
      <rect x="18" y="200" width="24" height="4" fill="url(#penGold)" />
      <rect x="37" y="40" width="4" height="110" rx="2" fill="url(#penGold)" />
      <path d="M20 220 L40 220 L38 290 L22 290 Z" fill="url(#penBody)" />
      <path d="M22 290 L38 290 L34 320 L30 344 L26 320 Z" fill="url(#penGold)" />
      <path d="M30 300 L30 338" stroke="#4a3413" strokeWidth="1" />
      <circle cx="30" cy="304" r="1.8" fill="#4a3413" />
    </svg>
  );
}
