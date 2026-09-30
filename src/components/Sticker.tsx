// Ink doodles in the style of the reference sketches (maple leaf, steaming cup, …).

function star(cx: number, cy: number, R: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r : R;
    pts.push(`${(cx + Math.cos(a) * rad).toFixed(1)} ${(cy + Math.sin(a) * rad).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
}

function rays(cx: number, cy: number, r1: number, r2: number, n: number) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n + 0.2;
    d += `M${(cx + Math.cos(a) * r1).toFixed(1)} ${(cy + Math.sin(a) * r1).toFixed(1)} L${(cx + Math.cos(a) * r2).toFixed(1)} ${(cy + Math.sin(a) * r2).toFixed(1)} `;
  }
  return d;
}

export const STICKERS: { name: string; d: string; fill?: string }[] = [
  {
    name: 'Leaf',
    d: 'M24 5 L26.5 13 L31 9.5 L30.5 18 L38 15 L34.5 23 L41 25.5 L34 29 L36 34.5 L27.5 31.5 L24.5 37 L20.5 31.5 L12 34.5 L14 29 L7 25.5 L13.5 23 L10 15 L17.5 18 L17 9.5 L21.5 13 Z M24 37 Q23.5 41 21.5 44.5 M24 35 L24 10 M24 29 L34 21 M24 29 L14 21 M24 33 L32 30.5 M24 33 L16 30.5',
  },
  {
    name: 'Coffee',
    d: 'M12 20 Q23 23 34 20 M12 20 L14 36 Q15 39 18 39 L28 39 Q31 39 32 36 L34 20 M33.4 24 Q40 23.5 39 29 Q38 33 32.4 32 M7 40.5 Q23 45 39 40.5 M19 16 Q16 12.5 19 9.5 Q22 6.5 19 3 M26 16 Q23 12.5 26 9.5 Q29 6.5 26 3',
  },
  { name: 'Sun', d: `M31 24 A7 7 0 1 1 17 24 A7 7 0 1 1 31 24 Z ${rays(24, 24, 11, 17, 10)}` },
  {
    name: 'Rain',
    d: 'M13 28 Q7 28 8 22 Q9 17 15 18 Q17 11 24 12 Q31 12 32 18 Q39 17 40 23 Q40 28 34 28 Z M16 32 L14 37 M24 32 L22 38 M32 32 L30 37 M20 40 L19 43 M28 40 L27 43',
  },
  { name: 'Heart', d: 'M24 38 C14 31 7 25 10 17 C12 12 19 11 24 17 C29 11 36 12 38 17 C41 25 34 31 24 38 Z M14 19 Q15 16 18 16' },
  { name: 'Star', d: `${star(24, 25, 16, 6.8)} M40 8 L40 13 M37.5 10.5 L42.5 10.5` },
  {
    name: 'Flower',
    d: 'M24 23 Q18 12 24 8 Q30 12 24 23 Q14 20 13 14 Q20 11 24 23 Q34 20 35 14 Q28 11 24 23 Q16 26 15 31 Q22 31 24 23 Q32 26 33 31 Q26 31 24 23 M24 25 Q22.5 35 24 45 M24 38 Q30 32 34 35 Q30 39 24 38',
  },
  { name: 'Moon', d: 'M28 7 A17 17 0 1 0 40 33 A13 13 0 1 1 28 7 Z M10 10 L10 15 M7.5 12.5 L12.5 12.5 M39 11 L39 14 M37.5 12.5 L40.5 12.5' },
  {
    name: 'Book',
    d: 'M6 14 Q15 11 24 16 Q33 11 42 14 L42 36 Q33 33 24 38 Q15 33 6 36 Z M24 16 L24 38 M10 19.5 Q15 18.5 20 20.5 M10 24 Q15 23 20 25 M10 28.5 Q15 27.5 20 29.5 M28 20.5 Q33 18.5 38 19.5 M28 25 Q33 23 38 24',
  },
  { name: 'Mountains', d: 'M3 39 L17 16 L25 28 L31 19 L45 39 Z M13 22.5 L17 16 L21 22.5 L19 21.5 L17 23.5 L15 21.5 Z M39 11 A3.5 3.5 0 1 1 32 11 A3.5 3.5 0 1 1 39 11 Z' },
  { name: 'Birds', d: 'M6 24 Q12 17 18 23 Q24 17 30 24 M24 14 Q28 10.5 32 13.5 Q36 10.5 40 14 M30 32 Q33 29.5 36 31.5 Q39 29.5 42 32' },
  {
    name: 'Umbrella',
    d: 'M6 24 Q8 8 24 6 Q40 8 42 24 Q37.5 21 33 24 Q28.5 21 24 24 Q19.5 21 15 24 Q10.5 21 6 24 Z M24 6 L24 4 M24 24 L24 38 Q24 42 20.5 41.5 Q18.5 41 18.8 39',
  },
];

export function Sticker({ index, size = 44, title }: { index: number; size?: number; title?: string }) {
  const s = STICKERS[index % STICKERS.length];
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d={s.d} />
    </svg>
  );
}
