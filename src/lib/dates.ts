const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const todayISO = () => toISODate(new Date());

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}

/** "Tuesday, October 26" + "th" + ", 2023" — split so the suffix can be superscripted. */
export function headingParts(iso: string): [string, string, string] {
  const d = parseISODate(iso);
  const day = d.getDate();
  return [`${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${day}`, ordinal(day), `, ${d.getFullYear()}`];
}

export function shortDate(iso: string): string {
  const d = parseISODate(iso);
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

export function longDate(iso: string): string {
  return headingParts(iso).join('');
}
