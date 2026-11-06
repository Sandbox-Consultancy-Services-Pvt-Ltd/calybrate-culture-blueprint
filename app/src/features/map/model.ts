import { DEFAULT_LAYOUT, PMAP, PRACTICES, VALUE_CODE, VALUE_ID, VALUES, VMAP, type Layout, type Sop } from './data';

export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
/** Gives every practice an (empty) entry: practices added by an administrator are missing from older saved layouts. Changes `l` and returns it. */
export function normalize(l: Layout): Layout {
  for (const p of PRACTICES) {
    l.ps[p.id] ??= [];
    l.pv[p.id] ??= [];
  }
  return l;
}
/** Drops SOPs and values that no longer exist (an older saved version may mention one that has been deleted). Changes `l` and returns it. */
export function prune(l: Layout, sops: Sop[]): Layout {
  const known = new Set(sops.map((s) => s.n));
  for (const k of Object.keys(l.ps)) l.ps[k] = l.ps[k].filter((n) => known.has(n));
  for (const k of Object.keys(l.pv)) l.pv[k] = l.pv[k].filter((v) => !!VMAP[v]);
  return l;
}
/** Removes a deleted SOP, value or practice from the layout. */
export function dropFromLayout(l: Layout, kind: 'value' | 'practice' | 'sop', id: string): void {
  if (kind === 'practice') {
    delete l.ps[id];
    delete l.pv[id];
  } else if (kind === 'sop') for (const k of Object.keys(l.ps)) l.ps[k] = l.ps[k].filter((n) => n !== +id);
  else for (const k of Object.keys(l.pv)) l.pv[k] = l.pv[k].filter((v) => v !== id);
}
export const defaultLayout = (): Layout => normalize(clone(DEFAULT_LAYOUT));

/** Is `o` a layout this page can use? Every SOP and value it mentions is known (a practice it does not mention just has no links yet). */
export function valid(o: unknown, sops: Sop[]): o is Layout {
  const x = o as Layout | null;
  if (!x || typeof x !== 'object' || !x.ps || !x.pv) return false;
  const known = new Set(sops.map((s) => s.n));
  // The nine built-in practices must be there; one added later may be missing from an older saved layout.
  const builtIn = (id: string) => id in DEFAULT_LAYOUT.ps;
  const ok = <T,>(a: unknown, id: string, fine: (x: T) => boolean) => (a === undefined && !builtIn(id)) || (Array.isArray(a) && a.every(fine));
  return PRACTICES.every((p) => ok<number>(x.ps[p.id], p.id, (n) => known.has(n)) && ok<string>(x.pv[p.id], p.id, (v) => !!VMAP[v]));
}

/* ---------- what is stored in the shared database ---------- */
export const toDbLayout = (s: Layout) => ({
  schema_version: 2,
  practices: Object.fromEntries(PRACTICES.map((p) => [p.id, { sops: [...s.ps[p.id]], values: s.pv[p.id].map((v) => VALUE_CODE[v]) }])),
});
export function fromDbLayout(l: { practices?: Record<string, { sops?: number[]; values?: string[] }> } | null | undefined): Layout {
  const n: Layout = { ps: {}, pv: {} };
  for (const p of PRACTICES) {
    const x = l?.practices?.[p.id] ?? {};
    n.ps[p.id] = (x.sops ?? []).slice();
    n.pv[p.id] = (x.values ?? []).map((c) => VALUE_ID[c]).filter(Boolean);
  }
  return n;
}
export const sameLayout = (x: Layout, y: Layout) =>
  PRACTICES.every((p) => [...x.ps[p.id]].sort().join() === [...y.ps[p.id]].sort().join() && [...x.pv[p.id]].sort().join() === [...y.pv[p.id]].sort().join());

/** Layout from the three database tables; null when they are empty. */
export function layoutFromRows(
  sopLinks: Array<{ practices: { code: string } | null; sops: { sop_number: number } | null }>,
  valueLinks: Array<{ practices: { code: string } | null; core_values: { code: string } | null }>,
): Layout | null {
  if (!sopLinks.length && !valueLinks.length) return null;
  const n: Layout = { ps: {}, pv: {} };
  for (const p of PRACTICES) {
    n.ps[p.id] = [];
    n.pv[p.id] = [];
  }
  for (const r of sopLinks) {
    const p = r.practices?.code;
    if (p && n.ps[p] && r.sops) n.ps[p].push(r.sops.sop_number);
  }
  for (const r of valueLinks) {
    const p = r.practices?.code;
    const v = VALUE_ID[r.core_values?.code ?? ''];
    if (p && n.pv[p] && v) n.pv[p].push(v);
  }
  for (const x of Object.values(n.ps)) x.sort((a, b) => a - b);
  return n;
}

/* ---------- editing (all mutate `st` and return whether anything changed) ---------- */
export function addSop(st: Layout, p: string, n: number): boolean {
  if (st.ps[p].includes(n)) return false;
  st.ps[p].push(n);
  st.ps[p].sort((a, b) => a - b);
  return true;
}
export function rmSop(st: Layout, p: string, n: number): boolean {
  const i = st.ps[p].indexOf(n);
  if (i < 0) return false;
  st.ps[p].splice(i, 1);
  return true;
}
export function addVal(st: Layout, p: string, v: string): boolean {
  if (st.pv[p].includes(v)) return false;
  st.pv[p].push(v);
  return true;
}
export function rmVal(st: Layout, p: string, v: string): boolean {
  const i = st.pv[p].indexOf(v);
  if (i < 0) return false;
  st.pv[p].splice(i, 1);
  return true;
}

export const placedIn = (st: Layout, n: number) => PRACTICES.filter((p) => st.ps[p.id].includes(n)).map((p) => p.id);
export const practicesOf = (st: Layout, v: string) => PRACTICES.filter((p) => st.pv[p.id].includes(v)).map((p) => p.id);

/* ---------- wedges: one complete piece per value ---------- */
/** P9 (Exit) is the zero-tolerance mechanism and applies to every value, so it lives in the base band, not in a wedge. */
export const crossCutting = (pid: string) => pid === 'P9';

export interface WedgeItems {
  practices: string[];
  sops: number[];
}
/** Everything that belongs to one value's wedge: its practices (in practice order) and those practices' SOPs, each SOP once. */
export function wedgeItems(st: Layout, vid: string): WedgeItems {
  const practices = PRACTICES.filter((p) => !crossCutting(p.id) && st.pv[p.id].includes(vid)).map((p) => p.id);
  const first = new Map<number, number>();
  practices.forEach((p, i) =>
    st.ps[p].forEach((n) => {
      if (!first.has(n)) first.set(n, i);
    }),
  );
  // SOPs sit next to the first practice that uses them, so they line up with it on the ring.
  const sops = [...first.keys()].sort((a, b) => first.get(a)! - first.get(b)! || a - b);
  return { practices, sops };
}
/** The values whose wedge shows this practice. */
export const wedgesOfPractice = (st: Layout, pid: string): string[] => (crossCutting(pid) ? [] : VALUES.filter((v) => st.pv[pid].includes(v.id)).map((v) => v.id));
/** The values whose wedge shows this SOP. */
export const wedgesOfSop = (st: Layout, n: number): string[] => VALUES.filter((v) => wedgeItems(st, v.id).sops.includes(n)).map((v) => v.id);

/* ---------- selection ---------- */
export interface Sel {
  type: string;
  id: string;
}
export interface Related {
  P: Set<string>;
  V: Set<string>;
  S: Set<number>;
  Z: boolean;
}
/** Everything linked to the current selection, or null when nothing is selected. */
export function related(st: Layout, sel: Sel | null): Related | null {
  if (!sel) return null;
  const P = new Set<string>();
  const V = new Set<string>();
  const S = new Set<number>();
  if (sel.type === 'value') {
    V.add(sel.id);
    for (const p of practicesOf(st, sel.id)) {
      P.add(p);
      st.ps[p].forEach((n) => S.add(n));
    }
  } else if (sel.type === 'practice') {
    P.add(sel.id);
    st.pv[sel.id].forEach((v) => V.add(v));
    st.ps[sel.id].forEach((n) => S.add(n));
  } else if (sel.type === 'sop') {
    const n = +sel.id;
    S.add(n);
    for (const p of placedIn(st, n)) {
      P.add(p);
      st.pv[p].forEach((v) => V.add(v));
    }
  } else if (sel.type === 'zero') {
    P.add('P9');
    st.pv.P9.forEach((v) => V.add(v));
    st.ps.P9.forEach((n) => S.add(n));
  } else return null;
  const Z = sel.type === 'zero' || (P.has('P9') && sel.type !== 'value') || (sel.type === 'sop' && placedIn(st, +sel.id).includes('P9'));
  return { P, V, S, Z };
}
export const isSel = (sel: Sel | null, t: string, id: string | number) => !!sel && sel.type === t && String(sel.id) === String(id);

/* ---------- coverage ---------- */
export interface Coverage {
  noPrac: number;
  noSop: number;
  unplaced: number;
  placed: number;
  gaps: number;
}
export function coverage(st: Layout, sops: Sop[]): Coverage {
  const placed = sops.filter((s) => placedIn(st, s.n).length).length;
  const noPrac = Object.keys(VMAP).filter((v) => !practicesOf(st, v).length).length;
  const noSop = PRACTICES.filter((p) => !st.ps[p.id].length).length;
  const unplaced = sops.length - placed;
  return { noPrac, noSop, unplaced, placed, gaps: noPrac + noSop + unplaced };
}

/* ---------- drag and drop ---------- */
/** Can a dragged SOP or practice be dropped on a target with this `data-drop` value? */
export function okTarget(kind: 'sop' | 'prac', drop: string | undefined): boolean {
  if (!drop) return false;
  if (kind === 'sop') return drop === 'tray' || !!PMAP[drop];
  return drop === 'ptray' || drop.startsWith('V:');
}

export interface DropResult {
  changed: boolean;
  toast?: string;
}
/** Applies a finished drag to the layout. `from` is the data-from of the dragged element. */
export function applyDrop(st: Layout, kind: 'sop' | 'prac', id: string | number, from: string, to: string): DropResult {
  if (kind === 'sop') {
    const n = +id;
    if (to === 'tray') return { changed: !!PMAP[from] && rmSop(st, from, n) };
    if (PMAP[to] && to !== from) {
      const added = addSop(st, to, n);
      const removed = !!PMAP[from] && rmSop(st, from, n);
      return { changed: added || removed, toast: `SOP ${n} → ${to} · ${PMAP[to].n}` };
    }
    return { changed: false };
  }
  const pid = String(id);
  if (to === 'ptray') return { changed: from.startsWith('V:') && rmVal(st, pid, from.slice(2)) };
  if (to.startsWith('V:') && to !== from) {
    const v = to.slice(2);
    const added = addVal(st, pid, v);
    const removed = from.startsWith('V:') && rmVal(st, pid, from.slice(2));
    return { changed: added || removed, toast: `${pid} now safeguards ${VMAP[v].n}` };
  }
  return { changed: false };
}
