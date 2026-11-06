import { banking } from './banking';
import { engineering } from './engineering';
import { healthcare } from './healthcare';
import type { Category } from './types';

/**
 * Tab order. Calybrate is the original hand-drawn diagram (layout: null) and follows the live SOP data; the others are
 * their own layouts. To add an industry: create a layout file like engineering.ts, add it here, and add a colour block
 * in styles/themes.css (plus the id in app/theme.ts).
 */
export const CATEGORIES: Category[] = [
  { id: 'calybrate', label: 'Calybrate', theme: 'calybrate', layout: null },
  { id: 'healthcare', label: 'Healthcare', theme: 'healthcare', layout: healthcare },
  { id: 'engineering', label: 'Engineering', theme: 'engineering', layout: engineering },
  { id: 'banking', label: 'Banking', theme: 'banking', layout: banking },
];

export const DEFAULT_CATEGORY = CATEGORIES[0].id;
export const categoryOf = (id: string | null | undefined): Category => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
export type { Category } from './types';
