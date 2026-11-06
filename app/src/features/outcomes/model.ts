export type StatusId = 'draft' | 'track' | 'risk' | 'done';

export interface Status {
  id: StatusId;
  /** Value stored in outcomes.outcome_statuses.code */
  db: string;
  label: string;
  color: string;
}

export const STATUSES: Status[] = [
  { id: 'draft', db: 'not-started', label: 'Not started', color: '#a1a1a1' },
  { id: 'track', db: 'on-track', label: 'On track', color: '#5e52b5' },
  { id: 'risk', db: 'at-risk', label: 'At risk', color: '#c27a00' },
  { id: 'done', db: 'achieved', label: 'Achieved', color: '#6a5bd6' },
];

export const PALETTE = ['#8f80f0', '#7d72c9', '#493D9E', '#C27A00', '#8E44AD', '#E4572E', '#B2A5FF', '#6C757D'];

export const statusOf = (id: string | undefined | null): Status => STATUSES.find((s) => s.id === id) ?? STATUSES[0];
export const statusFromDb = (code: string | undefined | null): StatusId =>
  STATUSES.find((s) => s.db === code)?.id ?? 'draft';
export const statusToDb = (id: string): string => STATUSES.find((s) => s.id === id)?.db ?? 'not-started';

export interface Pillar {
  id: string | null;
  code: string;
  name: string;
  color: string;
  sort: number;
  active: boolean;
}
export interface Area {
  code: string;
  name: string;
  parent: string | null;
}
export interface Meta {
  pillars: Pillar[];
  areas: Area[];
  canManage: boolean;
}

/** Used until (or instead of) the database: the original three pillars and the areas. */
export const FALLBACK_META: Meta = {
  pillars: [
    { id: null, code: 'care', name: 'Care', color: '#8f80f0', sort: 1, active: true },
    { id: null, code: 'convenience', name: 'Convenience', color: '#7d72c9', sort: 2, active: true },
    { id: null, code: 'time', name: 'Time', color: '#493D9E', sort: 3, active: true },
  ],
  areas: [
    { code: 'operations', name: 'Operations', parent: null },
    { code: 'unit-a', name: 'Unit A', parent: 'operations' },
    { code: 'unit-b', name: 'Unit B', parent: 'operations' },
    { code: 'team-1', name: 'Team 1', parent: null },
    { code: 'team-2', name: 'Team 2', parent: null },
    { code: 'administration', name: 'Administration', parent: null },
    { code: 'human-resources', name: 'Human Resources', parent: 'administration' },
    { code: 'finance', name: 'Finance', parent: 'administration' },
    { code: 'it', name: 'IT', parent: 'administration' },
    { code: 'team-3', name: 'Team 3', parent: null },
    { code: 'team-4', name: 'Team 4', parent: null },
  ],
  canManage: false,
};

export interface Item {
  id: string;
  text: string;
  target: string;
  current: string;
  status: StatusId;
}
/** A standard that helps deliver the promise; holds the outcomes that measure it. */
export interface Standard {
  id: string;
  title: string;
  items: Item[];
}
/** One box (leaf area x pillar): one promise, many standards, many outcomes under each standard. */
export interface Doc {
  row: string;
  col: string;
  promise: string;
  standards: Standard[];
  updatedAt: string | null;
  by?: string | null;
}
export type Docs = Record<string, Doc>;

export interface Leaf {
  code: string;
  name: string;
  areaName: string | null;
  tag: string | null;
}
export interface Group {
  area: Area;
  rows: Leaf[];
}

export const docId = (leaf: string, pillar: string) => `${leaf}__${pillar}`;
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const uid = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      });

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function tint(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#171717' : '#ffffff';
}

export const activePillars = (meta: Meta): Pillar[] =>
  meta.pillars.filter((p) => p.active).sort((a, b) => a.sort - b.sort);

/** Top-level areas, each with its rows: its sub-areas, or itself when it has none. */
export function groupsOf(meta: Meta): Group[] {
  const kids: Record<string, Area[]> = {};
  for (const a of meta.areas) (kids[a.parent ?? ''] ??= []).push(a);
  return (kids[''] ?? []).map((a) => {
    const sub = kids[a.code] ?? [];
    return {
      area: a,
      rows: sub.length
        ? sub.map((s) => ({ code: s.code, name: s.name, areaName: a.name, tag: s.name }))
        : [{ code: a.code, name: a.name, areaName: null, tag: null }],
    };
  });
}
export const leavesOf = (meta: Meta): Leaf[] => groupsOf(meta).flatMap((g) => g.rows);

/** All outcomes of a box, across its standards. */
export const flatItems = (doc: Pick<Doc, 'standards'> | undefined): Item[] => doc?.standards.flatMap((s) => s.items) ?? [];
export const itemsOf = (docs: Docs, leaf: string, pillar: string): Item[] => flatItems(docs[docId(leaf, pillar)]);
/** A box counts as filled once it has a promise, a standard or an outcome. */
export const hasContent = (doc: Pick<Doc, 'promise' | 'standards'> | undefined): boolean =>
  !!doc && (!!doc.promise || doc.standards.length > 0);

export const GENERAL = 'General';
export const blankStandard = (): Standard => ({ id: uid(), title: '', items: [] });
export const blankItem = (): Item => ({ id: uid(), text: '', target: '', current: '', status: 'draft' });

/** Trims text, assigns ids, drops completely empty rows. */
export function cleanItems(list: Array<Omit<Partial<Item>, 'status'> & { status?: string }>): Item[] {
  return list
    .map((x) => ({
      id: x.id || uid(),
      text: String(x.text ?? '').trim(),
      target: String(x.target ?? '').trim(),
      current: String(x.current ?? '').trim(),
      status: statusOf(x.status).id,
    }))
    .filter((x) => x.text || x.target || x.current);
}

type StandardInput = { id?: string; title?: string; items?: Array<Omit<Partial<Item>, 'status'> & { status?: string }> };
/** Trims everything; drops standards that have neither a title nor an outcome. */
export function cleanStandards(list: StandardInput[]): Standard[] {
  return list
    .map((s) => ({ id: s.id || uid(), title: String(s.title ?? '').trim(), items: cleanItems(s.items ?? []) }))
    .filter((s) => s.title || s.items.length);
}
/** Wraps a flat outcome list (older data) into one "General" standard. */
export const wrapItems = (items: Item[]): Standard[] => (items.length ? [{ id: uid(), title: GENERAL, items }] : []);

export interface Totals {
  boxes: number;
  filled: number;
  count: number;
  by: Record<StatusId, number>;
}
export function totalsOf(meta: Meta, docs: Docs): Totals {
  const P = activePillars(meta);
  const L = leavesOf(meta);
  const by: Totals['by'] = { draft: 0, track: 0, risk: 0, done: 0 };
  let filled = 0;
  let count = 0;
  for (const l of L) {
    for (const p of P) {
      const items = itemsOf(docs, l.code, p.code);
      if (hasContent(docs[docId(l.code, p.code)])) filled++;
      count += items.length;
      for (const it of items) by[statusOf(it.status).id]++;
    }
  }
  return { boxes: L.length * P.length, filled, count, by };
}

export interface Filter {
  status: StatusId | null;
  onlyEmpty: boolean;
}
export function boxMatches(doc: Doc | undefined, f: Filter): boolean {
  if (f.onlyEmpty && hasContent(doc)) return false;
  if (f.status && !flatItems(doc).some((it) => statusOf(it.status).id === f.status)) return false;
  return true;
}

/** Rows from the outcomes schema (with joined area, pillar and status) into per-box documents. */
export interface OutcomeDbRow {
  id: string;
  standard_id: string | null;
  description: string;
  target_value: string;
  current_value: string;
  sort_order?: number;
  updated_at: string;
  updated_by: string | null;
  areas: { code: string } | null;
  pillars: { code: string } | null;
  outcome_statuses: { code: string } | null;
}
export interface PromiseDbRow {
  id: string;
  promise: string;
  updated_at: string;
  updated_by: string | null;
  areas: { code: string } | null;
  pillars: { code: string } | null;
}
export interface StandardDbRow {
  id: string;
  promise_id: string;
  title: string;
  sort_order: number;
  updated_at: string;
}
export function docsFromRows(promises: PromiseDbRow[], standards: StandardDbRow[], outcomes: OutcomeDbRow[]): Docs {
  const docs: Docs = {};
  const byPromise = new Map<string, Doc>();
  const touch = (d: Doc, at: string) => {
    if (!d.updatedAt || at > d.updatedAt) d.updatedAt = at;
  };
  for (const p of promises) {
    const area = p.areas?.code;
    const pillar = p.pillars?.code;
    if (!area || !pillar) continue;
    const d: Doc = { row: area, col: pillar, promise: p.promise, standards: [], updatedAt: p.updated_at, by: p.updated_by ?? null };
    docs[docId(area, pillar)] = d;
    byPromise.set(p.id, d);
  }
  const byStandard = new Map<string, { doc: Doc; std: Standard }>();
  for (const s of [...standards].sort((a, b) => a.sort_order - b.sort_order)) {
    const doc = byPromise.get(s.promise_id);
    if (!doc) continue;
    const std: Standard = { id: s.id, title: s.title, items: [] };
    doc.standards.push(std);
    byStandard.set(s.id, { doc, std });
    touch(doc, s.updated_at);
  }
  for (const row of [...outcomes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
    const hit = row.standard_id ? byStandard.get(row.standard_id) : undefined;
    if (!hit) continue;
    hit.std.items.push({
      id: row.id,
      text: row.description,
      target: row.target_value,
      current: row.current_value,
      status: statusFromDb(row.outcome_statuses?.code),
    });
    touch(hit.doc, row.updated_at);
    if (row.updated_at >= (hit.doc.updatedAt ?? '')) hit.doc.by = row.updated_by ?? hit.doc.by ?? null;
  }
  return docs;
}

export interface PillarDbRow {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  color?: string | null;
  is_active?: boolean;
}
export interface AreaDbRow {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active?: boolean;
  parent_area_id: string | null;
}
/** Returns null when the database has no pillars or areas yet (keep the fallback). */
export function metaFromRows(pillars: PillarDbRow[], areas: AreaDbRow[], isAdmin: boolean): Meta | null {
  if (!pillars.length || !areas.length) return null;
  const byId = new Map(areas.map((a) => [a.id, a]));
  const manage = 'color' in pillars[0] && 'is_active' in pillars[0];
  return {
    pillars: pillars.map((p, i) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      sort: p.sort_order,
      color: p.color || PALETTE[i % PALETTE.length],
      active: manage ? p.is_active !== false : true,
    })),
    areas: areas
      .filter((a) => a.is_active !== false)
      .map((a) => ({
        code: a.code,
        name: a.name,
        parent: a.parent_area_id && byId.has(a.parent_area_id) ? byId.get(a.parent_area_id)!.code : null,
      })),
    canManage: manage && isAdmin,
  };
}

/* ---------- CSV export ---------- */
const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** Returns null when there is nothing to export. */
export function buildCsv(meta: Meta, docs: Docs): string | null {
  const rows: string[][] = [['Area', 'Sub-area', 'Pillar', 'Promise', 'Standard', 'Outcome', 'Target', 'Current level', 'Status', 'Last saved']];
  for (const l of leavesOf(meta)) {
    for (const p of activePillars(meta)) {
      const d = docs[docId(l.code, p.code)];
      if (!d || !hasContent(d)) continue;
      const head = [l.areaName || l.name, l.areaName ? l.name : '', p.name, d.promise];
      const saved = d.updatedAt ?? '';
      if (!d.standards.length) rows.push([...head, '', '', '', '', '', saved]);
      for (const s of d.standards) {
        if (!s.items.length) rows.push([...head, s.title, '', '', '', '', saved]);
        for (const it of s.items) rows.push([...head, s.title, it.text, it.target, it.current, statusOf(it.status).label, saved]);
      }
    }
  }
  if (rows.length === 1) return null;
  return '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** A blank import template: the export columns plus two example rows built from a real area and pillar. */
export function buildTemplateCsv(meta: Meta): string {
  const leaf = leavesOf(meta)[0];
  const pillar = activePillars(meta)[0];
  const area = leaf?.areaName || leaf?.name || 'Team 1';
  const sub = leaf?.areaName ? leaf.name : '';
  const pName = pillar?.name || 'Care';
  const rows: string[][] = [
    ['Area', 'Sub-area', 'Pillar', 'Promise', 'Standard', 'Outcome', 'Target', 'Current level', 'Status', 'Last saved'],
    [area, sub, pName, 'Example promise for this box (only used if the box has none)', 'Example standard', 'Example measurable outcome', '95%', '80%', STATUSES[0].label, ''],
    [area, sub, pName, '', 'Example standard', 'Another outcome under the same standard', '10 min', '', STATUSES[STATUSES.length - 1].label, ''],
  ];
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/* ---------- CSV import ---------- */
/** Minimal RFC 4180 parser: quoted cells, doubled quotes, CRLF/LF, BOM. Blank lines are skipped. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endRow = () => {
    row.push(cell);
    cell = '';
    if (row.some((c) => c.trim())) rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      endRow();
    } else cell += c;
  }
  if (cell || row.length) endRow();
  return rows;
}

export interface ImportPlan {
  /** Boxes to save, each with its full content (existing first, then the new rows). */
  cells: Array<{ leaf: Leaf; pillar: Pillar; promise: string; standards: Standard[]; added: number }>;
  added: number;
  duplicates: number;
  /** Human-readable problems, one per skipped row (1-based CSV line numbers). */
  errors: string[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const HEADERS: Record<string, string[]> = {
  area: ['area'],
  sub: ['sub-area', 'sub area', 'subarea'],
  pillar: ['pillar'],
  promise: ['promise'],
  standard: ['standard'],
  text: ['outcome', 'measurable outcome', 'description'],
  target: ['target'],
  current: ['current level', 'current'],
  status: ['status'],
};

/** Matches CSV rows (the export layout) to boxes and adds the outcomes that are not already there. Never removes anything. */
export function planImport(meta: Meta, docs: Docs, csv: string): ImportPlan {
  const plan: ImportPlan = { cells: [], added: 0, duplicates: 0, errors: [] };
  const rows = parseCsv(csv);
  if (!rows.length) {
    plan.errors.push('The file is empty.');
    return plan;
  }
  const head = rows[0].map(norm);
  const col: Record<string, number> = {};
  for (const [k, names] of Object.entries(HEADERS)) col[k] = head.findIndex((h) => names.includes(h));
  const missing = ['area', 'pillar', 'text'].filter((k) => col[k] < 0);
  if (missing.length) {
    plan.errors.push(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.map((k) => HEADERS[k][0]).join(', ')}. Use the file from “Export CSV” as a template.`);
    return plan;
  }
  const get = (r: string[], k: string) => (col[k] >= 0 ? (r[col[k]] ?? '').trim() : '');
  const leaves = leavesOf(meta);
  const pillars = activePillars(meta);
  type Cell = { leaf: Leaf; pillar: Pillar; promise: string; standards: Standard[]; seen: Set<string>; added: number; changed: boolean };
  const byKey = new Map<string, Cell>();

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const text = get(r, 'text');
    const target = get(r, 'target');
    const current = get(r, 'current');
    const promise = get(r, 'promise');
    const stdTitle = get(r, 'standard');
    const hasOutcome = !!(text || target || current);
    if (!hasOutcome && !promise && !stdTitle) return;
    const area = norm(get(r, 'area'));
    const sub = norm(get(r, 'sub'));
    const leaf = leaves.find((l) => (sub ? norm(l.areaName ?? '') === area && norm(l.name) === sub : !l.areaName && norm(l.name) === area));
    if (!leaf) {
      plan.errors.push(`Line ${line}: no area “${get(r, 'area')}${sub ? ` / ${get(r, 'sub')}` : ''}”.`);
      return;
    }
    const pillar = pillars.find((p) => norm(p.name) === norm(get(r, 'pillar')) || norm(p.code) === norm(get(r, 'pillar')));
    if (!pillar) {
      plan.errors.push(`Line ${line}: no active pillar “${get(r, 'pillar')}”.`);
      return;
    }
    if (hasOutcome && !text) {
      plan.errors.push(`Line ${line}: the outcome text is empty.`);
      return;
    }
    const st = get(r, 'status');
    const status = STATUSES.find((s) => !st || norm(s.label) === norm(st) || s.id === norm(st))?.id;
    if (!status) {
      plan.errors.push(`Line ${line}: unknown status “${st}”.`);
      return;
    }
    const key = docId(leaf.code, pillar.code);
    let cell = byKey.get(key);
    if (!cell) {
      const d = docs[key];
      const standards = (d?.standards ?? []).map((s) => ({ ...s, items: [...s.items] }));
      cell = { leaf, pillar, promise: d?.promise ?? '', standards, seen: new Set(flatItems(d).map((x) => norm(x.text))), added: 0, changed: false };
      byKey.set(key, cell);
    }
    // the promise is only filled in when the box has none yet; it never overwrites
    if (promise && !cell.promise) {
      cell.promise = promise;
      cell.changed = true;
    }
    if (!hasOutcome && !stdTitle) return;
    const title = stdTitle || GENERAL;
    let std = cell.standards.find((s) => norm(s.title) === norm(title));
    if (!std) {
      std = { id: uid(), title, items: [] };
      cell.standards.push(std);
      cell.changed = true;
    }
    if (!hasOutcome) return;
    if (cell.seen.has(norm(text))) {
      plan.duplicates++;
      return;
    }
    cell.seen.add(norm(text));
    std.items.push({ id: uid(), text, target, current, status });
    cell.added++;
    cell.changed = true;
    plan.added++;
  });
  plan.cells = [...byKey.values()]
    .filter((c) => c.changed)
    .map(({ leaf, pillar, promise, standards, added }) => ({ leaf, pillar, promise, standards, added }));
  return plan;
}
