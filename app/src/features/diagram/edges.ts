/** Connector-line drawing shared by the Life Cycle and CCT diagrams (ported from the legacy page unchanged). */
export const SVG_NS = 'http://www.w3.org/2000/svg';

export type Pt = [number, number];
export type Side = 'l' | 'r' | 't' | 'b';
export type EdgeKind = 'seq' | 'flow' | 'link' | 'out' | 'loop';

export interface Edge {
  a: string;
  as: Side;
  b: string;
  bs: Side;
  t: EdgeKind;
  mid?: number;
  pad?: number;
  ao?: number;
  bo?: number;
  r?: number;
  custom?: string;
}

export interface Box {
  l: number;
  t: number;
  w: number;
  h: number;
  r: number;
  b: number;
  cx: number;
  cy: number;
}

const COLORS: Record<EdgeKind, string> = { seq: 'var(--blue-300)', flow: 'var(--blue-600)', link: 'var(--blue-500)', out: 'var(--green-700)', loop: 'var(--green-700)' };

/** Arrow-head markers, one per edge kind, with ids like `lcDefs-a-flow`. */
export function mkDefs(defs: SVGDefsElement) {
  for (const [k, c] of Object.entries(COLORS)) {
    const m = document.createElementNS(SVG_NS, 'marker');
    m.setAttribute('id', `${defs.id}-a-${k}`);
    m.setAttribute('viewBox', '0 0 10 10');
    m.setAttribute('refX', '8.5');
    m.setAttribute('refY', '5');
    m.setAttribute('markerWidth', '7.5');
    m.setAttribute('markerHeight', '7.5');
    m.setAttribute('orient', 'auto-start-reverse');
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', 'M0 0 L10 5 L0 10 z');
    p.setAttribute('fill', c);
    m.appendChild(p);
    defs.appendChild(m);
  }
}

/** Element rectangle relative to `root`, in unscaled diagram pixels. */
export function rect(el: Element, root: Element, scale: number): Box {
  const r = el.getBoundingClientRect();
  const c = root.getBoundingClientRect();
  const l = (r.left - c.left) / scale;
  const t = (r.top - c.top) / scale;
  const w = r.width / scale;
  const h = r.height / scale;
  return { l, t, w, h, r: l + w, b: t + h, cx: l + w / 2, cy: t + h / 2 };
}

export function anchor(b: Box, side: Side, off = 0): Pt {
  return side === 'r' ? [b.r, b.cy + off] : side === 'l' ? [b.l, b.cy + off] : side === 't' ? [b.cx + off, b.t] : [b.cx + off, b.b];
}

export function route(p: Pt, q: Pt, as: Side, bs: Side, mid?: number, pad = 18): Pt[] {
  if (as === bs && (as === 'l' || as === 'r')) {
    const x = as === 'l' ? Math.min(p[0], q[0]) - pad : Math.max(p[0], q[0]) + pad;
    return [p, [x, p[1]], [x, q[1]], q];
  }
  const hs = as === 'l' || as === 'r';
  const he = bs === 'l' || bs === 'r';
  if (hs && he) {
    if (Math.abs(p[1] - q[1]) < 1.5) return [p, [q[0], p[1]]];
    const mx = mid ?? (p[0] + q[0]) / 2;
    return [p, [mx, p[1]], [mx, q[1]], q];
  }
  if (!hs && !he) {
    if (Math.abs(p[0] - q[0]) < 1.5) return [p, [p[0], q[1]]];
    const my = mid ?? (p[1] + q[1]) / 2;
    return [p, [p[0], my], [q[0], my], q];
  }
  if (hs && !he) return [p, [q[0], p[1]], q];
  return [p, [p[0], q[1]], q];
}

/** SVG path through the points with rounded corners. */
export function rounded(pts: Pt[], rad = 9): string {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const r = Math.min(rad, l1 / 2, l2 / 2);
    const p1 = [b[0] - ((b[0] - a[0]) / l1) * r, b[1] - ((b[1] - a[1]) / l1) * r];
    const p2 = [b[0] + ((c[0] - b[0]) / l2) * r, b[1] + ((c[1] - b[1]) / l2) * r];
    d += ` L${p1[0]} ${p1[1]} Q${b[0]} ${b[1]} ${p2[0]} ${p2[1]}`;
  }
  const e = pts[pts.length - 1];
  return `${d} L${e[0]} ${e[1]}`;
}

/** Redraws every edge into `svg` (existing `path.edge` nodes are removed first). */
export function drawEdges(root: HTMLElement, svg: SVGSVGElement, defs: SVGDefsElement, edges: Edge[], scale: number) {
  svg.querySelectorAll('path.edge').forEach((n) => n.remove());
  for (const e of edges) {
    const A = root.querySelector<HTMLElement>(`#${CSS.escape(e.a)}`);
    const B = root.querySelector<HTMLElement>(`#${CSS.escape(e.b)}`);
    if (!A || !B) continue;
    const p = anchor(rect(A, root, scale), e.as, e.ao || 0);
    const q = anchor(rect(B, root, scale), e.bs, e.bo || 0);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', rounded(route(p, q, e.as, e.bs, e.mid, e.pad), e.r ?? 9));
    path.setAttribute('class', `edge ${e.t}`);
    path.setAttribute('marker-end', `url(#${defs.id}-a-${e.t})`);
    path.dataset.a = e.a;
    path.dataset.b = e.b;
    svg.appendChild(path);
  }
}
