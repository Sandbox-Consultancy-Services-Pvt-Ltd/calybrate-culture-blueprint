export type ViewKey = 'dash' | 'cct' | 'map' | 'outcomes' | 'admin';

export interface ViewMeta {
  key: ViewKey;
  /** Hash used by the legacy page, e.g. `#cct`. Kept so existing links and bookmarks still work. */
  hash: string;
  nav: string;
  sub: string;
  title: string;
}

export const VIEWS: ViewMeta[] = [
  { key: 'dash', hash: 'lifecycle', nav: 'Practice', sub: 'Practice Layout', title: 'Blueprint · Practice Layout' },
  { key: 'cct', hash: 'cct', nav: 'Framework', sub: 'Performance Framework · Care · Convenience · Time', title: 'Blueprint · Performance Framework' },
  { key: 'map', hash: 'map', nav: 'Safeguard Map', sub: 'Business Codex · Safeguard Map', title: 'Blueprint · Business Codex · Safeguard Map' },
  { key: 'outcomes', hash: 'outcomes', nav: 'Outcomes', sub: 'Performance Outcomes', title: 'Blueprint · Performance Outcomes' },
  { key: 'admin', hash: 'admin', nav: 'Admin', sub: 'Administration', title: 'Blueprint · Administration' },
];

/**
 * Maps `location.hash` to a view. Same rules as the legacy router:
 * unknown hashes fall back to the Life Cycle, and Admin is only for admins.
 */
export function resolveRoute(hash: string, isAdmin: boolean): ViewKey {
  const h = hash.replace(/^#/, '');
  const found = VIEWS.find((v) => v.hash === h || (v.key !== 'dash' && v.key === h));
  const key: ViewKey = found ? found.key : 'dash';
  if (key === 'admin' && !isAdmin) return 'dash';
  return key;
}
