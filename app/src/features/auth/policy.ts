import type { Role } from './types';

/** Same rule the legacy sign-in used: 12+ chars with a lower-case letter, an upper-case letter and a number. */
export function passwordProblem(pw: string, repeat: string): string | null {
  if (pw !== repeat) return 'The two passwords do not match.';
  if (pw.length < 12 || !/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) {
    return 'Use at least 12 characters with a lower-case letter, an upper-case letter and a number.';
  }
  return null;
}

export const canEdit = (role: Role | null) => role === 'editor' || role === 'admin';
export const isAdmin = (role: Role | null) => role === 'admin';
/** Taking data out of the app (CSV, print, PDF) is for people who can edit; viewers read on screen only. */
export const canExport = (role: Role | null) => canEdit(role);

/** Every browser-side copy of app data starts with this prefix; they are removed on sign-out. */
export const LOCAL_DATA_PREFIX = 'blueprint-';
export function clearLocalData(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(LOCAL_DATA_PREFIX)) localStorage.removeItem(k);
    sessionStorage.removeItem('cb-annc-dismissed');
  } catch {
    /* storage unavailable */
  }
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export const toEmail = (username: string, domain: string) => `${username.trim().toLowerCase()}@${domain}`;

export const MAX_FAILS = 5;
export const LOCK_MS = 30_000;
