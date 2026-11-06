import type { SupabaseClient } from '@supabase/supabase-js';
import {
  UUID_RE,
  cleanItems,
  docsFromRows,
  wrapItems,
  metaFromRows,
  statusToDb,
  type AreaDbRow,
  type Docs,
  type Item,
  type Meta,
  type OutcomeDbRow,
  type PillarDbRow,
  type PromiseDbRow,
  type Standard,
  type StandardDbRow,
} from './model';

export const LS_KEY = 'blueprint-cct-outcomes-v2';
const LS_KEY_V1 = 'blueprint-cct-outcomes-v1';
export const LS_HOW = 'blueprint-ox-how-hidden';
export const LS_COLLAPSED = 'blueprint-ox-collapsed';

/* ---------- offline copy (no database): kept in this browser ---------- */
export function lsRead(): Docs {
  try {
    const v2 = localStorage.getItem(LS_KEY);
    const raw = JSON.parse(v2 || localStorage.getItem(LS_KEY_V1) || '{}');
    if (!raw || typeof raw !== 'object') return {};
    const docs: Docs = {};
    for (const [k, d] of Object.entries(raw as Record<string, Record<string, unknown>>)) {
      if (!d || typeof d !== 'object') continue;
      // v1 boxes held a flat list of outcomes: wrap them in one "General" standard
      const standards = Array.isArray(d.standards) ? (d.standards as Standard[]) : wrapItems(cleanItems((d.items as Item[]) ?? []));
      docs[k] = {
        row: String(d.row ?? ''),
        col: String(d.col ?? ''),
        promise: String(d.promise ?? ''),
        standards,
        updatedAt: (d.updatedAt as string | null) ?? null,
        by: (d.by as string | null) ?? null,
      };
    }
    return docs;
  } catch {
    return {};
  }
}
export function lsWrite(docs: Docs): boolean {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(docs));
    return true;
  } catch {
    return false;
  }
}

/* ---------- shared database ---------- */
export async function loadMeta(db: SupabaseClient, isAdmin: boolean): Promise<Meta | null> {
  const o = db.schema('outcomes');
  const [p, a] = await Promise.all([
    o.from('pillars').select('*').order('sort_order', { ascending: true }),
    o.from('areas').select('id,code,name,sort_order,is_active,parent_area_id').order('sort_order', { ascending: true }),
  ]);
  if (p.error || a.error) return null;
  return metaFromRows(p.data as PillarDbRow[], a.data as AreaDbRow[], isAdmin);
}

export async function loadDocs(db: SupabaseClient): Promise<Docs> {
  const o = db.schema('outcomes');
  const [p, s, r] = await Promise.all([
    o.from('promises').select('id,promise,updated_at,updated_by,areas(code),pillars(code)'),
    o.from('standards').select('id,promise_id,title,sort_order,updated_at').order('sort_order', { ascending: true }),
    o
      .from('outcomes')
      .select('id,standard_id,description,target_value,current_value,sort_order,updated_at,updated_by,outcome_statuses(code)')
      .order('sort_order', { ascending: true }),
  ]);
  if (p.error || s.error || r.error) throw new Error('load failed');
  return docsFromRows(
    (p.data ?? []) as unknown as PromiseDbRow[],
    (s.data ?? []) as unknown as StandardDbRow[],
    (r.data ?? []).map((x) => ({ ...x, areas: null, pillars: null })) as unknown as OutcomeDbRow[],
  );
}

export class SaveError extends Error {
  constructor(public code: number) {
    super('save failed');
  }
}

export async function saveBox(db: SupabaseClient, area: string, pillar: string, promise: string, standards: Standard[]): Promise<void> {
  const payload = standards.map((s) => ({
    id: UUID_RE.test(s.id) ? s.id : null,
    title: s.title,
    items: s.items.map((x) => ({
      id: UUID_RE.test(x.id) ? x.id : null,
      description: x.text,
      target_value: x.target,
      current_value: x.current,
      status: statusToDb(x.status),
    })),
  }));
  const r = await db.schema('outcomes').rpc('save_box', { p_area_code: area, p_pillar_code: pillar, p_promise: promise, p_standards: payload });
  if (r.error) {
    const forbidden = r.error.code === '42501' || r.status === 401 || r.status === 403;
    throw new SaveError(forbidden ? 403 : r.status || 500);
  }
}
