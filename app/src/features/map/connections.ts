/**
 * Connections view: a radial tree growing out of Purpose, in two layouts of the same data.
 *   Purpose → Value → Practice → SOP   (and a separate Zero-tolerance branch: Purpose → P9 → its SOPs)
 *
 *   'repeat'  every place an item belongs is drawn, so a practice that guards two values appears under both of them
 *             (and an SOP under every practice that uses it). It is a true tree: no lines cross.
 *   'unique'  every item appears once. The values are ordered round the ring so linked items sit next to each other,
 *             each practice is placed between the values it guards and each SOP between the practices that use it.
 *
 * `connectionsLayout` is pure geometry (testable); `connectionsSVG` turns it into markup.
 */
import { AREAS, PMAP, PRACTICES, VALUES, VMAP, type Layout, type Sop } from './data';
import { crossCutting, isSel, related } from './model';
import type { Ctx } from './render';

export const CX = 500;
export const CY = 500;
const R_PUR = 58;
const R_AREA = 84;
const R_VAL = 165;
const R_PRA = 262;
const R_LEAF = 352;
const GAP_VALUE = 0.55; // empty slots between values of one Area (repeat layout)
const GAP_AREA = 1.5; // ... between Areas, and around the zero-tolerance branch
const MIN_PRACTICE_GAP = 16; // degrees, unique layout
const MIN_LEAF_GAP = 10;

export type ConnMode = 'repeat' | 'unique';
export type ConnAnim = 'grow' | 'leave';

/** One colour per value, so a line tells you which value it belongs to. */
const VALUE_COL: Record<string, string> = { avail: '#2F7F1D', resp: '#0A7F8C', cons: '#1D5FC4', cust: '#C2650A', qual: '#6B3FA0' };
export const ZERO_COL = '#475569';
export const valueColour = (vid: string | null) => (vid === null ? ZERO_COL : (VALUE_COL[vid] ?? 'var(--blue-700)'));

export type NodeKind = 'V' | 'P' | 'S' | 'Z';
export interface CNode {
  key: string; // unique per drawn node: "V:cons", "P:P1@cons" (repeat) or "P:P1" (unique), "S:5@P:P1@cons", "Z"
  base: string; // the item itself, the same for every copy: "V:cons", "P:P1", "S:5", "Z"
  kind: NodeKind;
  id: string; // value id, practice id or SOP number as text ('z' for the zero-tolerance label)
  ang: number; // degrees, 0 = right, clockwise
  r: number;
  parent: string | null; // key of the node above it; null = Purpose
  area: number; // -1 for the zero-tolerance branch
  vid: string | null; // the value whose colour it wears; null = zero tolerance
  zero: boolean;
  gap: boolean; // a value with no practice, or a practice with no SOP yet
  leaf: boolean;
  shared: boolean; // repeat layout: this item is drawn in more than one place
}
export interface CEdge {
  from: string | null; // null = Purpose
  to: string;
  vid: string | null;
  zero: boolean;
}
export interface CArea {
  area: number;
  a0: number;
  a1: number;
}
export interface CLayout {
  nodes: CNode[];
  edges: CEdge[];
  areas: CArea[];
  /** Practices (not linked to a value) and SOPs (not used by any placed practice) that have no branch. */
  unplaced: { P: string[]; S: number[] };
}

const rad = (d: number) => (d * Math.PI) / 180;
const norm360 = (a: number) => ((a % 360) + 360) % 360;

/** Leaves near the top or bottom alternate between two radii, so their horizontal labels do not collide. */
function stagger(nodes: CNode[]) {
  let i = 0;
  for (const n of [...nodes].filter((x) => x.leaf).sort((a, b) => norm360(a.ang) - norm360(b.ang))) if (Math.abs(Math.sin(rad(n.ang))) > 0.72) n.r += (i++ % 2) * 38;
}

/**
 * Leaf labels are horizontal text that runs away from the centre, so neighbours near the top and bottom can print over
 * each other. Any labelled leaf whose text would land on another label or node is moved outward in small steps.
 */
function declutter(nodes: CNode[], textOf: (n: CNode) => string | null) {
  const LH = 15; // label height
  const CW = 6.7; // average character width
  interface Box {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
  }
  const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const dot = (n: CNode): Box => {
    const [x, y] = pol(n.r, n.ang);
    const r = (n.kind === 'S' ? 17 : 20) + 3;
    return { x0: x - r, x1: x + r, y0: y - r, y1: y + r };
  };
  const labelBox = (n: CNode, text: string): Box => {
    const [x, y] = pol(n.r, n.ang);
    const r = n.kind === 'S' ? 17 : 20;
    const w = Math.min(text.length, 36) * CW;
    const x0 = Math.cos(rad(n.ang)) >= -0.001 ? x + r + 9 : x - r - 9 - w;
    return { x0, x1: x0 + w, y0: y - LH / 2, y1: y + LH / 2 };
  };
  const texts = new Map<CNode, string | null>(); // asked in drawing order, which decides which copy of an SOP is named
  for (const n of nodes) texts.set(n, n.leaf && !n.zero && (n.kind === 'S' || n.kind === 'P') ? textOf(n) : null);
  const done: Box[] = [];
  for (const n of [...nodes].sort((a, b) => norm360(a.ang) - norm360(b.ang))) {
    const text = texts.get(n);
    if (!text) continue;
    for (let step = 0; step < 3 && (done.some((b) => hit(labelBox(n, text), b)) || nodes.some((o) => o !== n && hit(labelBox(n, text), dot(o)))); step++) n.r += 32;
    done.push(labelBox(n, text));
  }
}

/** The text printed beside a leaf, or null when it prints none (in the repeated tree an SOP is named once per value branch). */
function labelText(sops: Sop[], once: boolean) {
  const named = new Set<string>();
  return (n: CNode): string | null => {
    if (n.kind === 'P') return PMAP[n.id]?.n ?? null;
    const nk = `${n.vid}:${n.id}`;
    if (once && named.has(nk)) return null;
    named.add(nk);
    return sops.find((x) => x.n === +n.id)?.t ?? null;
  };
}

function unplacedOf(nodes: CNode[], sops: Sop[]) {
  const placedP = new Set(nodes.filter((n) => n.kind === 'P').map((n) => n.id));
  const placedS = new Set(nodes.filter((n) => n.kind === 'S').map((n) => +n.id));
  return { P: PRACTICES.filter((p) => !placedP.has(p.id)).map((p) => p.id), S: sops.filter((s) => !placedS.has(s.n)).map((s) => s.n) };
}

export function connectionsLayout(st: Layout, sops: Sop[], mode: ConnMode = 'repeat'): CLayout {
  return mode === 'unique' ? uniqueLayout(st, sops) : repeatLayout(st, sops);
}

/* ---------- repeat: a true tree, shared items drawn under every parent ---------- */
function repeatLayout(st: Layout, sops: Sop[]): CLayout {
  const known = new Set(sops.map((s) => s.n));
  const values = [...VALUES].sort((a, b) => a.area - b.area); // stable: keeps the default order inside an Area
  const norm = PRACTICES.filter((p) => !crossCutting(p.id));
  const sopsOf = (p: string) => (st.ps[p] ?? []).filter((n) => known.has(n));

  interface T {
    node: Omit<CNode, 'ang'>;
    slot: number; // filled in for leaves
    kids: T[];
  }
  let cursor = 0;
  const leaf = (t: T) => {
    t.slot = cursor + 0.5;
    cursor += 1;
  };
  const slotOf = (t: T): number => (t.kids.length ? (slotOf(t.kids[0]!) + slotOf(t.kids[t.kids.length - 1]!)) / 2 : t.slot);
  const mk = (n: Omit<CNode, 'parent' | 'ang' | 'shared'>, parent: string | null): T => ({ node: { ...n, parent, shared: false }, slot: 0, kids: [] });

  const branch = (pid: string, parent: T, vid: string | null, area: number): T => {
    const ns = sopsOf(pid);
    const key = vid === null ? `P:${pid}` : `P:${pid}@${vid}`;
    const t = mk({ key, base: `P:${pid}`, kind: 'P', id: pid, r: ns.length ? R_PRA : R_LEAF, area, vid, zero: vid === null, gap: !(st.ps[pid] ?? []).length, leaf: !ns.length }, parent.node.key);
    if (ns.length) {
      t.kids = ns.map((n) => {
        const s = mk({ key: `S:${n}@${key}`, base: `S:${n}`, kind: 'S', id: String(n), r: R_LEAF, area, vid, zero: vid === null, gap: false, leaf: true }, key);
        leaf(s);
        return s;
      });
    } else leaf(t);
    return t;
  };

  const roots: T[] = [];
  let prevArea = -2;
  for (const v of values) {
    const ps = norm.filter((p) => (st.pv[p.id] ?? []).includes(v.id));
    if (roots.length) cursor += v.area === prevArea ? GAP_VALUE : GAP_AREA;
    prevArea = v.area;
    const vt = mk({ key: `V:${v.id}`, base: `V:${v.id}`, kind: 'V', id: v.id, r: R_VAL, area: v.area, vid: v.id, zero: false, gap: !ps.length, leaf: !ps.length }, null);
    vt.kids = ps.map((p) => branch(p.id, vt, v.id, v.area));
    if (!ps.length) leaf(vt);
    roots.push(vt);
  }
  // zero-tolerance branch (P9): always drawn, even when it has no SOPs yet
  cursor += GAP_AREA;
  const zt = mk({ key: 'Z', base: 'Z', kind: 'Z', id: 'z', r: R_VAL, area: -1, vid: null, zero: true, gap: false, leaf: false }, null);
  zt.kids = PRACTICES.filter((p) => crossCutting(p.id)).map((p) => branch(p.id, zt, null, -1));
  if (!zt.kids.length) leaf(zt);
  roots.push(zt);
  const total = cursor + GAP_AREA;

  // slots → angles, turned so the zero-tolerance branch points straight down
  const deg = 360 / total;
  const rot = 90 - slotOf(zt) * deg;
  const nodes: CNode[] = [];
  const edges: CEdge[] = [];
  const walk = (t: T) => {
    nodes.push({ ...t.node, ang: slotOf(t) * deg + rot });
    edges.push({ from: t.node.parent, to: t.node.key, vid: t.node.vid, zero: t.node.zero });
    t.kids.forEach(walk);
  };
  roots.forEach(walk);
  const copies = new Map<string, number>();
  for (const n of nodes) copies.set(n.base, (copies.get(n.base) ?? 0) + 1);
  for (const n of nodes) n.shared = (copies.get(n.base) ?? 0) > 1;
  stagger(nodes);
  declutter(nodes, labelText(sops, true));

  const areas: CArea[] = [];
  for (let a = 0; a < AREAS.length; a++) {
    const vs = roots.filter((t) => t.node.area === a && t.node.kind === 'V');
    if (!vs.length) continue;
    const first = (t: T): T => (t.kids.length ? first(t.kids[0]!) : t);
    const last = (t: T): T => (t.kids.length ? last(t.kids[t.kids.length - 1]!) : t);
    areas.push({ area: a, a0: first(vs[0]!).slot * deg + rot - deg * 0.38, a1: last(vs[vs.length - 1]!).slot * deg + rot + deg * 0.38 });
  }
  return { nodes, edges, areas, unplaced: unplacedOf(nodes, sops) };
}

/* ---------- unique: every item once, placed between the things it connects to ---------- */
interface Spot {
  ang: number;
  fixed: boolean;
}
/** Nudges neighbours apart until none is closer than `min` degrees. Fixed spots never move. */
function spread(spots: Spot[], min: number) {
  for (let it = 0; it < 80; it++) {
    spots.sort((a, b) => a.ang - b.ang);
    let moved = false;
    for (let i = 0; i < spots.length; i++) {
      const a = spots[i]!;
      const b = spots[(i + 1) % spots.length]!;
      if (a === b) continue;
      let d = b.ang - a.ang;
      if (i === spots.length - 1) d += 360;
      if (d >= min - 0.01) continue;
      moved = true;
      const push = min - d;
      if (a.fixed && b.fixed) continue;
      if (a.fixed) b.ang += push;
      else if (b.fixed) a.ang -= push;
      else {
        a.ang -= push / 2;
        b.ang += push / 2;
      }
    }
    if (!moved) break;
  }
}
/** Middle of some angles, taken round the circle (so 350° and 10° give 0°, not 180°). */
function meanAngle(angs: number[]): number {
  let x = 0;
  let y = 0;
  for (const a of angs) {
    x += Math.cos(rad(a));
    y += Math.sin(rad(a));
  }
  if (Math.hypot(x, y) < 1e-6) return angs[0] ?? 0; // exactly opposite: no sensible middle
  return norm360((Math.atan2(y, x) * 180) / Math.PI);
}
const permutations = <T>(a: T[]): T[][] => (a.length < 2 ? [a] : a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));

/** The order of values round the ring that keeps the values of each practice as close together as possible. */
export function valueRing(st: Layout): string[] {
  const ids = [...VALUES].sort((a, b) => a.area - b.area).map((v) => v.id);
  if (ids.length > 7) return ids; // too many to try every order; keep the default
  const slots = ids.length + 1; // slot 0 is the zero-tolerance branch
  const dist = (i: number, j: number) => {
    const d = Math.abs(i - j) % slots;
    return Math.min(d, slots - d);
  };
  let best = ids;
  let bestCost = Infinity;
  for (const perm of permutations(ids)) {
    const slot = new Map(perm.map((v, i) => [v, i + 1]));
    let cost = 0;
    for (const p of PRACTICES.filter((q) => !crossCutting(q.id))) {
      const g = (st.pv[p.id] ?? []).filter((v) => slot.has(v));
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) cost += dist(slot.get(g[i]!)!, slot.get(g[j]!)!);
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = perm;
    }
  }
  return best;
}

function uniqueLayout(st: Layout, sops: Sop[]): CLayout {
  const known = new Set(sops.map((s) => s.n));
  const order = valueRing(st);
  const step = 360 / (order.length + 1);
  const VA = new Map(order.map((v, i) => [v, norm360(90 + (i + 1) * step)]));
  const nodes: CNode[] = [];
  const edges: CEdge[] = [];
  const sopsOf = (p: string) => (st.ps[p] ?? []).filter((n) => known.has(n));

  for (const v of VALUES) {
    const guarded = PRACTICES.some((p) => !crossCutting(p.id) && (st.pv[p.id] ?? []).includes(v.id));
    nodes.push({ key: `V:${v.id}`, base: `V:${v.id}`, kind: 'V', id: v.id, ang: VA.get(v.id) ?? 0, r: R_VAL, parent: null, area: v.area, vid: v.id, zero: false, gap: !guarded, leaf: false, shared: false });
    edges.push({ from: null, to: `V:${v.id}`, vid: v.id, zero: false });
  }
  nodes.push({ key: 'Z', base: 'Z', kind: 'Z', id: 'z', ang: 90, r: R_VAL, parent: null, area: -1, vid: null, zero: true, gap: false, leaf: false, shared: false });
  edges.push({ from: null, to: 'Z', vid: null, zero: true });

  // practices: in the middle of the values they guard (a practice that guards no value has no branch)
  const placed = PRACTICES.filter((p) => crossCutting(p.id) || (st.pv[p.id] ?? []).some((v) => VA.has(v)));
  const pNodes = new Map<string, CNode>();
  const pSpots: Array<{ n: CNode; s: Spot }> = [];
  for (const p of placed) {
    const zero = crossCutting(p.id);
    const gs = (st.pv[p.id] ?? []).filter((v) => VA.has(v));
    const ns = sopsOf(p.id);
    const n: CNode = { key: `P:${p.id}`, base: `P:${p.id}`, kind: 'P', id: p.id, ang: zero ? 90 : meanAngle(gs.map((v) => VA.get(v)!)), r: ns.length ? R_PRA : R_LEAF, parent: zero ? 'Z' : `V:${gs[0]}`, area: zero ? -1 : (VMAP[gs[0]!]?.area ?? 0), vid: null, zero, gap: !(st.ps[p.id] ?? []).length, leaf: !ns.length, shared: false };
    pNodes.set(p.id, n);
    pSpots.push({ n, s: { ang: n.ang, fixed: zero } });
  }
  spread(
    pSpots.map((x) => x.s),
    MIN_PRACTICE_GAP,
  );
  const nearest = (ang: number, vs: string[]) => {
    const d = (v: string) => {
      const t = Math.abs(norm360(ang) - (VA.get(v) ?? 0));
      return Math.min(t, 360 - t);
    };
    return vs.reduce((a, b) => (d(b) < d(a) ? b : a));
  };
  for (const { n, s } of pSpots) {
    n.ang = norm360(s.ang);
    const gs = (st.pv[n.id] ?? []).filter((v) => VA.has(v));
    n.vid = n.zero || !gs.length ? null : nearest(n.ang, gs);
    n.parent = n.zero ? 'Z' : n.vid ? `V:${n.vid}` : null;
    nodes.push(n);
    if (n.zero) edges.push({ from: 'Z', to: n.key, vid: null, zero: true });
    else for (const v of gs) edges.push({ from: `V:${v}`, to: n.key, vid: v, zero: false });
  }

  // SOPs: in the middle of the practices that use them
  const sNodes: CNode[] = [];
  const sSpots: Array<{ n: CNode; s: Spot }> = [];
  for (const sop of sops) {
    const owners = placed.filter((p) => sopsOf(p.id).includes(sop.n));
    if (!owners.length) continue;
    const onlyZero = owners.every((p) => crossCutting(p.id));
    const first = pNodes.get(owners[0]!.id)!;
    const n: CNode = { key: `S:${sop.n}`, base: `S:${sop.n}`, kind: 'S', id: String(sop.n), ang: onlyZero ? 90 : meanAngle(owners.map((p) => pNodes.get(p.id)!.ang)), r: R_LEAF, parent: first.key, area: first.area, vid: first.vid, zero: onlyZero, gap: false, leaf: true, shared: false };
    sNodes.push(n);
    sSpots.push({ n, s: { ang: n.ang, fixed: onlyZero } });
    for (const p of owners) edges.push({ from: `P:${p.id}`, to: n.key, vid: pNodes.get(p.id)!.vid, zero: crossCutting(p.id) });
  }
  // SOPs and practices with no SOP share the outer ring
  const leafPractices = pSpots.filter((x) => x.n.leaf && !x.n.zero);
  spread(
    [...sSpots, ...leafPractices].map((x) => x.s),
    MIN_LEAF_GAP,
  );
  for (const { n, s } of [...sSpots, ...leafPractices]) n.ang = norm360(s.ang);
  nodes.push(...sNodes);
  stagger(nodes);
  declutter(nodes, labelText(sops, false));

  const areas = VALUES.map((v) => ({ area: v.area, a0: (VA.get(v.id) ?? 0) - 17, a1: (VA.get(v.id) ?? 0) + 17 }));
  return { nodes, edges, areas, unplaced: unplacedOf(nodes, sops) };
}

/* ---------- markup ---------- */
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);
const pol = (r: number, deg: number): [number, number] => [+(CX + r * Math.cos(rad(deg))).toFixed(1), +(CY + r * Math.sin(rad(deg))).toFixed(1)];

/** Radial link: leaves one node along its spoke and arrives along the other's, like d3's linkRadial. */
function link(a: { r: number; ang: number } | null, b: { r: number; ang: number }): string {
  const from = a ?? { r: R_PUR, ang: b.ang };
  const mid = (from.r + b.r) / 2;
  const [x1, y1] = pol(from.r, from.ang);
  const [c1x, c1y] = pol(mid, from.ang);
  const [c2x, c2y] = pol(mid, b.ang);
  const [x2, y2] = pol(b.r, b.ang);
  return `M${x1} ${y1} C${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}`;
}

/**
 * `anim` is used while switching layout: 'leave' pulls the branches back toward Purpose, 'grow' lets the new ones
 * grow out again, ring by ring. Each element's start delay is set inline (--d for lines, --dn for nodes).
 */
export function connectionsSVG(ctx: Ctx, mode: ConnMode = 'repeat', anim?: ConnAnim): string {
  const { st, sel, sops } = ctx;
  const R = related(st, sel);
  const L = connectionsLayout(st, sops, mode);
  const byKey = new Map(L.nodes.map((n) => [n.key, n]));
  const sopOf = (n: number) => sops.find((s) => s.n === n)!;

  // a node is lit when its item is related to the selection; in the repeated tree a copy is lit only when the branch above it is too
  const litOf = new Map<string, boolean>();
  if (R)
    for (const n of L.nodes) {
      const item = n.kind === 'V' ? R.V.has(n.id) : n.kind === 'Z' ? R.Z || R.P.has('P9') : n.kind === 'P' ? R.P.has(n.id) : R.S.has(+n.id);
      litOf.set(n.key, item && (mode === 'unique' || n.parent === null || !!litOf.get(n.parent)));
    }
  const isLit = (key: string | null) => (key === null ? !!R : !!litOf.get(key));
  const state = (lit: boolean) => (R ? (lit ? ' lit' : ' dim') : '');

  // branch-growth timing: values first, then practices, then SOPs; each ring starts as the one before reaches it
  const lvl = (n: CNode) => (n.kind === 'S' ? 2 : n.kind === 'P' ? 1 : 0);
  const dEdge = (n: CNode) => (anim === 'grow' ? +(lvl(n) * 0.3 + (norm360(n.ang) / 360) * 0.15).toFixed(3) : anim === 'leave' ? +((2 - lvl(n)) * 0.1).toFixed(3) : 0);
  const dNode = (n: CNode) => (anim === 'grow' ? +(dEdge(n) + 0.3).toFixed(3) : dEdge(n));
  const dly = (n: CNode) => (anim ? ` style="--dn:${dNode(n)}s"` : '');

  const label = mode === 'unique' ? 'one place each' : 'repeated under every value it serves';
  let h = `<svg class="rsvg csvg${anim ? ' a-' + anim : ''}" viewBox="-120 55 1240 885" role="img" aria-label="Connections tree: purpose in the centre, branching to values, then the practices that guard each value, then the SOPs each practice uses. Layout: ${label}.">`;

  // faint guide rings, one per level
  h += `<g class="cguide"><circle cx="${CX}" cy="${CY}" r="${R_VAL}"/><circle cx="${CX}" cy="${CY}" r="${R_PRA}"/><circle cx="${CX}" cy="${CY}" r="${R_LEAF}"/></g>`;

  // branches first, so nodes sit on top
  const group = (kind: NodeKind) => (kind === 'S' ? 't-s' : kind === 'P' ? 't-p' : 't-v');
  for (const k of ['V', 'P', 'S'] as const) {
    h += `<g class="${group(k)}">`;
    for (const e of L.edges) {
      const to = byKey.get(e.to)!;
      if ((k === 'V') !== (to.kind === 'V' || to.kind === 'Z') || (k !== 'V' && to.kind !== k)) continue;
      const from = e.from ? byKey.get(e.from)! : null;
      const lit = isLit(e.from) && isLit(e.to);
      h += `<path pathLength="1" class="lk${to.zero ? ' lk-zero' : ''}${state(lit)}" style="--d:${dEdge(to)}s;stroke:${valueColour(e.vid)}" d="${link(from, to)}"/>`;
    }
    h += `</g>`;
  }

  // arcs round the first ring group the values (by Area in the repeated layout, one per value in the unique one)
  h += `<g class="t-v">`;
  for (const a of L.areas) {
    const [x0, y0] = pol(R_AREA, a.a0);
    const [x1, y1] = pol(R_AREA, a.a1);
    const lit = L.nodes.some((n) => n.kind === 'V' && n.area === a.area && isLit(n.key));
    h += `<path class="carc${state(lit)}" d="M${x0} ${y0} A${R_AREA} ${R_AREA} 0 ${a.a1 - a.a0 > 180 ? 1 : 0} 1 ${x1} ${y1}"><title>${esc(AREAS[a.area] ?? '')}</title></path>`;
  }
  h += `</g>`;

  h += `<g class="pur t-pur${R ? ' lit' : ''}" data-open="purpose:p"><title>Purpose — To be the best care, brought closer to you</title><circle cx="${CX}" cy="${CY}" r="${R_PUR}"/><text x="${CX}" y="${CY - 13}" font-size="15">Purpose</text><text x="${CX}" y="${CY + 5}" font-size="11" font-weight="500">Best care,</text><text x="${CX}" y="${CY + 19}" font-size="11" font-weight="500">closer to you</text></g>`;

  const cls = (base: string, t: string, id: string | number, n: CNode) => base + state(isLit(n.key)) + (isSel(sel, t, id) ? ' sel' : '') + (n.gap ? ' gap' : '');
  /** Horizontal text beside the node, on the side facing away from the centre. */
  const tag = (n: CNode, x: number, y: number, r: number, text: string) => {
    const right = Math.cos(rad(n.ang)) >= -0.001;
    return `<text class="clab${right ? '' : ' end'}" x="${x + (right ? r + 9 : -(r + 9))}" y="${y}">${esc(clip(text, 36))}<title>${esc(text)}</title></text>`;
  };
  const ring = (x: number, y: number, r: number, col: string) => `<circle class="shr" cx="${x}" cy="${y}" r="${r + 5}" style="stroke:${col}"/>`;
  const named = new Set<string>(); // repeated layout: name an SOP once per value branch, so two practices sharing it do not print it twice
  for (const n of L.nodes) {
    const [x, y] = pol(n.r, n.ang);
    const col = valueColour(n.vid);
    if (n.kind === 'V' || n.kind === 'Z') {
      const name = n.kind === 'Z' ? 'Zero tolerance' : VMAP[n.id]!.n;
      const w = Math.round(name.length * 7.6 + 26);
      const open = n.kind === 'Z' ? 'zero:z' : `value:${n.id}`;
      const tip = n.kind === 'Z' ? 'Zero tolerance — applies to every value' : `${name} — ${AREAS[n.area]}`;
      const base = n.kind === 'Z' ? 't-z vnode zpill' : 't-v vnode';
      h += `<g class="${cls(base, n.kind === 'Z' ? 'zero' : 'value', n.kind === 'Z' ? 'z' : n.id, n)}"${dly(n)} data-open="${open}"><title>${esc(tip)}</title><g transform="translate(${x} ${y})"><rect x="${-w / 2}" y="-15" width="${w}" height="30" rx="15" style="fill:${col}"/><text x="0" y="0">${esc(name)}</text></g></g>`;
    } else if (n.kind === 'P') {
      const p = PMAP[n.id]!;
      const vs = (st.pv[p.id] ?? []).map((v) => VMAP[v]?.n).filter(Boolean).map((x) => esc(String(x)));
      const note = n.zero ? ' (applies to every value)' : ` · guards ${vs.join(', ')}`;
      const r = n.zero ? 19 : 20;
      h += `<g class="${cls(`pnode ${n.zero ? 't-z' : 't-p'}`, 'practice', p.id, n)}"${dly(n)} data-open="practice:${p.id}"><title>${p.id} — ${esc(p.n)}${note}${n.gap ? ' · no SOP yet' : ''}</title>${n.shared ? ring(x, y, r, col) : ''}<circle cx="${x}" cy="${y}" r="${r}" style="stroke:${col}"/><text x="${x}" y="${y}" style="font-size:13px">${p.id}</text>${n.leaf ? tag(n, x, y, r, p.n) : ''}</g>`;
    } else {
      const s = sopOf(+n.id);
      const owners = PRACTICES.filter((p) => (st.ps[p.id] ?? []).includes(s.n)).map((p) => p.id);
      const r = 17;
      const nk = `${n.vid}:${n.id}`;
      const showName = mode === 'unique' || !named.has(nk);
      named.add(nk);
      h += `<g class="${cls(`snode ${n.zero ? 't-z' : 't-s'}`, 'sop', s.n, n)}${s.done ? ' done' : ''}"${dly(n)} data-open="sop:${s.n}"><title>SOP ${s.n} — ${esc(s.t)}${s.done ? ' (Done)' : ''} · used by ${owners.join(', ')}</title>${n.shared ? ring(x, y, r, col) : ''}<circle cx="${x}" cy="${y}" r="${r}" style="stroke:${col}"/><text x="${x}" y="${y}" style="font-size:11.5px">S${s.n}</text>${showName ? tag(n, x, y, r, s.t) : ''}</g>`;
    }
  }
  h += `</svg>`;

  // the key floats in the empty space beside the diagram (below it on a narrow window), so the diagram gets the room
  const swatch = (c: string) => `<i class="lg la" style="background:${c};border-color:${c}"></i>`;
  h +=
    `<div class="rlegend clegend" aria-hidden="true">` +
    VALUES.map((v) => `<span>${swatch(valueColour(v.id))}${esc(v.n)}</span>`).join('') +
    `<span>${swatch(ZERO_COL)}Zero tolerance</span>` +
    (mode === 'repeat' ? `<span title="Shared items are drawn under every value they serve; click one and every copy lights up"><i class="lg ldr"></i>Shared item</span>` : '') +
    `<span title="Nothing below it yet"><i class="lg lgp"></i>Empty</span></div>` +
    `<div class="ckey" aria-hidden="true">${PRACTICES.map((p) => `<span><b>${p.id}</b> ${esc(p.n)}</span>`).join('')}</div>`;
  return h;
}
