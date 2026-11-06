/** Hardcoded category themes. Each one is a CSS block in styles/themes.css, picked with `data-theme` on <html>. */
export const THEMES = [
  { id: 'calybrate', label: 'Calybrate' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'banking', label: 'Banking' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];
const KEY = 'cb-theme';

export const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

export function applyTheme(id: ThemeId) {
  if (id === 'calybrate') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', id);
}

export function savedTheme(): ThemeId {
  try {
    const v = localStorage.getItem(KEY);
    return isTheme(v) ? v : 'calybrate';
  } catch {
    return 'calybrate';
  }
}

let current: ThemeId = savedTheme();
const listeners = new Set<() => void>();

/** Current theme, shared by everything that shows or changes it (the header dropdown and the Practice Layout tabs). */
export const getTheme = () => current;
export function subscribeTheme(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Apply, remember and announce a theme. */
export function setTheme(id: ThemeId) {
  current = id;
  applyTheme(id);
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode: the theme just will not persist */
  }
  listeners.forEach((f) => f());
}
