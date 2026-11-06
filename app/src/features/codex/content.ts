import type { SupabaseClient } from '@supabase/supabase-js';
import { AREA_CODES, PMAP, PRACTICES, VALUES, VALUE_CODE, VALUE_ID, VMAP, type Practice, type Sop, type Value } from '../map/data';

/** The wording an administrator can change (and the items they can add): SOPs, practices and core values. */
export interface ValueRow {
  code: string;
  name: string;
  statement: string;
  description: string;
  sort_order: number;
  value_groups: { code: string } | null;
}
export interface PracticeRow {
  code: string;
  name: string;
  summary: string;
  sort_order: number;
}
export interface SopTitleRow {
  sop_number: number;
  title: string;
  sop_statuses?: { code: string } | null;
}
export interface ContentRows {
  values: ValueRow[];
  practices: PracticeRow[];
  sops: SopTitleRow[];
}

/** Adds a value to the live lists (the Safeguard Map draws from them) unless it is already there. */
export function registerValue(v: Value, code: string): Value {
  const known = VMAP[v.id];
  if (known) return known;
  VALUES.push(v);
  VMAP[v.id] = v;
  VALUE_CODE[v.id] = code;
  VALUE_ID[code] = v.id;
  return v;
}
export function registerPractice(p: Practice): Practice {
  const known = PMAP[p.id];
  if (known) return known;
  PRACTICES.push(p);
  PMAP[p.id] = p;
  return p;
}

/** Takes a deleted value / practice out of the live lists (the Safeguard Map draws from them). */
export function unregisterValue(id: string): void {
  const i = VALUES.findIndex((v) => v.id === id);
  if (i >= 0) VALUES.splice(i, 1);
  delete VMAP[id];
  const code = VALUE_CODE[id];
  delete VALUE_CODE[id];
  if (code) delete VALUE_ID[code];
}
export function unregisterPractice(id: string): void {
  const i = PRACTICES.findIndex((p) => p.id === id);
  if (i >= 0) PRACTICES.splice(i, 1);
  delete PMAP[id];
}

const num = (s: string) => parseInt(s.replace(/\D/g, ''), 10) || 0;

/**
 * Copies database wording onto the live value / practice objects (changed in place: VMAP / PMAP point at the same ones)
 * and adds any value or practice that is not built in. Blank database text is ignored so a bad row can never empty the page.
 */
export function applyContent(rows: Pick<ContentRows, 'values' | 'practices'>): void {
  const order: Record<string, number> = {};
  for (const r of rows.values) {
    order[r.code] = r.sort_order;
    let v = VMAP[VALUE_ID[r.code]];
    if (!v) {
      const area = AREA_CODES.indexOf(r.value_groups?.code ?? '');
      if (area < 0) continue;
      v = registerValue({ id: r.code, n: r.name, o2: r.statement, area, desc: r.description }, r.code);
    }
    if (r.name?.trim()) v.n = r.name.trim();
    if (r.statement?.trim()) v.o2 = r.statement.trim();
    if (r.description?.trim()) v.desc = r.description.trim();
  }
  // Each area stays one piece of the ring: by area, then in the order the database gives.
  if (rows.values.length) VALUES.sort((a, b) => a.area - b.area || (order[VALUE_CODE[a.id]] ?? 1e9) - (order[VALUE_CODE[b.id]] ?? 1e9));

  const porder: Record<string, number> = {};
  for (const r of rows.practices) {
    porder[r.code] = r.sort_order;
    let p = PMAP[r.code];
    if (!p) p = registerPractice({ id: r.code, n: r.name, st: '', d: r.summary });
    if (r.name?.trim()) p.n = r.name.trim();
    if (r.summary?.trim()) p.d = r.summary.trim();
  }
  if (rows.practices.length) PRACTICES.sort((a, b) => (porder[a.id] ?? num(a.id)) - (porder[b.id] ?? num(b.id)));
}

/** Same for the map's own SOP list (it keeps a private copy): renames, and adds SOPs that are new. */
export function applySopTitles(sops: Sop[], rows: SopTitleRow[]): void {
  for (const r of rows) {
    if (!r.title?.trim()) continue;
    const s = sops.find((x) => x.n === r.sop_number);
    if (s) s.t = r.title.trim();
    else sops.push({ n: r.sop_number, t: r.title.trim(), done: r.sop_statuses?.code === 'done' ? 1 : 0 });
  }
  sops.sort((a, b) => a.n - b.n);
}

/** Reads the editable wording. Throws when any of the three reads fail. */
export async function loadContent(db: SupabaseClient): Promise<ContentRows> {
  const c = db.schema('codex');
  const [v, p, s] = await Promise.all([
    c.from('core_values').select('code,name,statement,description,sort_order,value_groups(code)').order('sort_order'),
    c.from('practices').select('code,name,summary,sort_order').order('sort_order'),
    c.from('sops').select('sop_number,title,sop_statuses(code)').order('sop_number'),
  ]);
  if (v.error || p.error || s.error) throw new Error('content failed to load');
  return {
    values: v.data as unknown as ValueRow[],
    practices: p.data as unknown as PracticeRow[],
    sops: s.data as unknown as SopTitleRow[],
  };
}
