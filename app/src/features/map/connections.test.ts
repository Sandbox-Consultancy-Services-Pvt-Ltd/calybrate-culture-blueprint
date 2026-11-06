import { PRACTICES, VALUES, defaultSops } from './data';
import { connectionsLayout, connectionsSVG, valueRing, type CLayout } from './connections';
import { defaultLayout } from './model';

const sops = defaultSops();
const has = (L: CLayout, a: string, b: string) => L.edges.some((e) => e.from === a && e.to === b);
const ids = (L: CLayout, kind: string) => L.nodes.filter((n) => n.kind === kind).map((n) => n.base);
const gap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

describe('connections: repeated layout (every place an item belongs)', () => {
  const st = defaultLayout();
  const L = connectionsLayout(st, sops, 'repeat');

  it('has unique keys and one tree edge per node', () => {
    expect(new Set(L.nodes.map((n) => n.key)).size).toBe(L.nodes.length);
    expect(L.edges).toHaveLength(L.nodes.length);
  });
  it('draws a practice under every value that guards it, and its SOPs under each copy', () => {
    for (const p of PRACTICES.filter((p) => p.id !== 'P9')) for (const v of st.pv[p.id]!) expect(has(L, `V:${v}`, `P:${p.id}@${v}`)).toBe(true);
    // P1 guards Quality and Consistency, and uses SOPs 1, 5 and 12 in both places
    for (const v of ['qual', 'cons']) for (const n of [1, 5, 12]) expect(has(L, `P:P1@${v}`, `S:${n}@P:P1@${v}`)).toBe(true);
  });
  it('marks items drawn more than once as shared, and the rest not', () => {
    expect(L.nodes.filter((n) => n.base === 'P:P1').every((n) => n.shared)).toBe(true);
    expect(L.nodes.filter((n) => n.base === 'P:P6').every((n) => !n.shared)).toBe(true); // guards Quality only
  });
  it('puts P9 and its SOPs in the zero-tolerance branch, pointing down', () => {
    expect(Math.round(L.nodes.find((n) => n.kind === 'Z')!.ang)).toBe(90);
    expect(L.nodes.find((n) => n.base === 'P:P9')!.parent).toBe('Z');
    expect(L.nodes.find((n) => n.base === 'S:8')!.zero).toBe(true);
  });
  it('lists SOPs with no branch under "not placed"', () => {
    expect(L.unplaced.S).toEqual([2, 3, 4, 7, 9, 10, 11]);
    expect(L.unplaced.P).toEqual([]);
  });
});

describe('connections: unique layout (each item once)', () => {
  const st = defaultLayout();
  const L = connectionsLayout(st, sops, 'unique');

  it('draws every value, practice and placed SOP exactly once', () => {
    expect(new Set(L.nodes.map((n) => n.key)).size).toBe(L.nodes.length);
    for (const v of VALUES) expect(ids(L, 'V').filter((b) => b === `V:${v.id}`)).toHaveLength(1);
    for (const p of PRACTICES) expect(ids(L, 'P').filter((b) => b === `P:${p.id}`)).toHaveLength(1);
    expect(ids(L, 'S').sort()).toEqual(['S:1', 'S:12', 'S:5', 'S:6', 'S:8']);
  });
  it('has every real connection as a line, and none that are not real', () => {
    for (const p of PRACTICES.filter((p) => p.id !== 'P9')) for (const v of st.pv[p.id]!) expect(has(L, `V:${v}`, `P:${p.id}`)).toBe(true);
    for (const p of PRACTICES) for (const n of st.ps[p.id]!) if ([1, 5, 6, 8, 12].includes(n)) expect(has(L, `P:${p.id}`, `S:${n}`)).toBe(true);
    const vp = L.edges.filter((e) => e.from?.startsWith('V:') && e.to.startsWith('P:')).length;
    expect(vp).toBe(PRACTICES.filter((p) => p.id !== 'P9').reduce((a, p) => a + st.pv[p.id]!.length, 0));
    const ps = L.edges.filter((e) => e.from?.startsWith('P:') && e.to.startsWith('S:')).length;
    expect(ps).toBe(PRACTICES.reduce((a, p) => a + st.ps[p.id]!.filter((n) => [1, 5, 6, 8, 12].includes(n)).length, 0));
  });
  it('is the same set of connections the repeated layout draws, with the copies merged', () => {
    const R = connectionsLayout(st, sops, 'repeat');
    const base = (key: string | null) => (key === null ? 'PUR' : key.split('@')[0]!);
    const merged = new Set(R.edges.map((e) => `${base(e.from)}>${base(e.to)}`));
    expect(new Set(L.edges.map((e) => `${base(e.from)}>${base(e.to)}`))).toEqual(merged);
  });
  it('keeps the zero-tolerance branch straight down', () => {
    expect(Math.round(L.nodes.find((n) => n.kind === 'Z')!.ang)).toBe(90);
    expect(Math.round(L.nodes.find((n) => n.base === 'P:P9')!.ang)).toBe(90);
    expect(Math.round(L.nodes.find((n) => n.base === 'S:8')!.ang)).toBe(90);
  });
  it('keeps nodes on the same ring apart', () => {
    for (const kind of ['V', 'P', 'S']) {
      const ns = L.nodes.filter((n) => n.kind === kind && n.base !== 'P:P9');
      for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) if (ns[i]!.r === ns[j]!.r) expect(gap(ns[i]!.ang, ns[j]!.ang)).toBeGreaterThan(8);
    }
  });
  it('orders the values so each linked pair is next to each other where it can be', () => {
    const ring = valueRing(st);
    expect([...ring].sort()).toEqual(VALUES.map((v) => v.id).sort());
    const dist = (a: string, b: string) => {
      const d = Math.abs(ring.indexOf(a) - ring.indexOf(b));
      return Math.min(d, ring.length - d);
    };
    for (const [a, b] of [['qual', 'cons'], ['cons', 'resp'], ['resp', 'cust'], ['cust', 'avail']]) expect(dist(a!, b!)).toBe(1);
  });
});

describe('connections: drawing', () => {
  it('copes with an empty layout in both layouts', () => {
    const st = defaultLayout();
    for (const p of PRACTICES) {
      st.ps[p.id] = [];
      st.pv[p.id] = [];
    }
    for (const mode of ['repeat', 'unique'] as const) {
      const L = connectionsLayout(st, sops, mode);
      expect(L.unplaced.S).toHaveLength(sops.length);
      expect(() => connectionsSVG({ st, sel: null, sops }, mode)).not.toThrow();
    }
  });
  it('lights only the branch of a selected value in the repeated layout', () => {
    const svg = connectionsSVG({ st: defaultLayout(), sel: { type: 'value', id: 'cons' }, sops }, 'repeat');
    const cls = (id: string) => [...svg.matchAll(new RegExp(`<g class="([^"]*)"[^>]*data-open="practice:${id}"`, 'g'))].map((m) => m[1]!);
    expect(cls('P1').filter((c) => c.includes(' lit'))).toHaveLength(1); // only the copy under Consistency, not the one under Quality
    expect(cls('P1').filter((c) => c.includes(' dim'))).toHaveLength(1);
    expect(cls('P2').every((c) => c.includes(' dim'))).toBe(true); // Quality and Availability only
  });
  it('lights the whole path of a selected SOP in the unique layout', () => {
    const svg = connectionsSVG({ st: defaultLayout(), sel: { type: 'sop', id: '5' }, sops }, 'unique');
    const cls = (t: string, id: string) => svg.match(new RegExp(`<g class="([^"]*)"[^>]*data-open="${t}:${id}"`))![1]!;
    for (const p of ['P1', 'P2']) expect(cls('practice', p)).toContain(' lit');
    for (const v of ['qual', 'cons', 'avail']) expect(cls('value', v)).toContain(' lit');
    expect(cls('practice', 'P3')).toContain(' dim');
  });
  it('adds branch-growth delays only while animating', () => {
    const c = { st: defaultLayout(), sel: null, sops };
    expect(connectionsSVG(c, 'unique', 'grow')).toContain('a-grow');
    expect(connectionsSVG(c, 'unique', 'grow')).toContain('--dn:');
    expect(connectionsSVG(c, 'unique')).not.toContain('a-grow');
  });
});
