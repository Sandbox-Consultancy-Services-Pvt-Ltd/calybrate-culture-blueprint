import { afterEach, describe, expect, it } from 'vitest';
import { PMAP, PRACTICES, VALUES, VMAP, defaultSops } from './data';
import { defaultLayout, normalize, valid } from './model';
import { connectionsSVG } from './connections';
import { editHtml, editInitial, infoHtml, pillarsHTML, ringsSVG, type Ctx } from './render';

const ctx = (): Ctx => ({ st: defaultLayout(), sel: null, sops: defaultSops(), docs: {}, docsOn: false, canEdit: true });
const orig = { n: VMAP.qual.n, o2: VMAP.qual.o2, desc: VMAP.qual.desc, pn: PMAP.P1.n };
afterEach(() => {
  Object.assign(VMAP.qual, { n: orig.n, o2: orig.o2, desc: orig.desc });
  PMAP.P1.n = orig.pn;
  for (const p of PRACTICES.splice(0).filter((x) => /^P[1-9]$/.test(x.id))) PRACTICES.push(p);
  for (const k of Object.keys(PMAP)) if (!PRACTICES.some((p) => p.id === k)) delete PMAP[k];
});

describe('wording typed by an administrator is escaped', () => {
  it('in the details panel, the ring and the edit form', () => {
    VMAP.qual.n = 'Q<script>alert(1)</script>';
    VMAP.qual.o2 = 'A "quoted" <b>statement</b>';
    PMAP.P1.n = 'Skills & <i>things</i>';
    const c = ctx();
    const panel = infoHtml(c, 'value', 'qual').h;
    const ring = ringsSVG(c);
    const form = editHtml(c, 'value', 'qual').h;
    for (const html of [panel, ring, form]) {
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<b>statement</b>');
      expect(html).not.toContain('<i>things</i>');
    }
    expect(panel).toContain('A &quot;quoted&quot; &lt;b&gt;statement&lt;/b&gt;');
    expect(form).toContain('value="Q&lt;script&gt;alert(1)&lt;/script&gt;"');
  });
});

describe('edit form', () => {
  it('starts from the current wording, and empty for a new item', () => {
    const c = ctx();
    expect(editInitial(c, 'value', 'qual')).toEqual({ n: VMAP.qual.n, o2: VMAP.qual.o2, desc: VMAP.qual.desc });
    expect(editInitial(c, 'practice', 'P3').n).toBe('Metric Driven');
    expect(editInitial(c, 'sop', '6').t).toBe('Performance Management');
    expect(editInitial(c, 'value', null)).toEqual({ n: '', o2: '', desc: '' });
    expect(editHtml(c, 'value', null).h).toContain('data-f="area"'); // only a new value picks its area
    expect(editHtml(c, 'value', 'qual').h).not.toContain('data-f="area"');
  });
});

describe('a practice added after a layout was saved', () => {
  it('is accepted by valid() and given empty links by normalize()', () => {
    const saved = defaultLayout();
    PRACTICES.push({ id: 'P10', n: 'New', st: '', d: 'd' });
    PMAP.P10 = PRACTICES[PRACTICES.length - 1];
    expect(valid(saved, defaultSops())).toBe(true);
    normalize(saved);
    expect(saved.ps.P10).toEqual([]);
    expect(saved.pv.P10).toEqual([]);
    // and the rings and panels still draw with it
    expect(() => ringsSVG({ ...ctx(), st: saved })).not.toThrow();
  });

  it('keeps a ring with six values in even wedges', () => {
    VALUES.push({ id: 'zz', n: 'Extra', o2: 'x', area: 3, desc: 'x' });
    VMAP.zz = VALUES[VALUES.length - 1];
    try {
      const svg = ringsSVG(ctx());
      expect(svg.match(/class="wedge/g)).toHaveLength(6);
    } finally {
      VALUES.pop();
      delete VMAP.zz;
    }
  });
});

describe('delete', () => {
  it('only items an administrator added can be deleted', async () => {
    const { canDelete } = await import('./data');
    expect(canDelete('sop', 12)).toBe(false);
    expect(canDelete('sop', 13)).toBe(true);
    expect(canDelete('practice', 'P9')).toBe(false);
    expect(canDelete('practice', 'P10')).toBe(true);
    expect(canDelete('value', 'qual')).toBe(false);
    expect(canDelete('value', 'integrity')).toBe(true);
    expect(editHtml(ctx(), 'practice', 'P3').h).not.toContain('data-ed-delete');
    expect(editHtml(ctx(), 'practice', 'P3').h).toContain('reworded but not deleted');
  });

  it('takes a deleted item out of a layout, and prunes it from an older saved one', async () => {
    const { dropFromLayout, prune } = await import('./model');
    const l = defaultLayout();
    l.ps.P10 = [13, 1];
    l.pv.P10 = ['zz'];
    dropFromLayout(l, 'sop', '13');
    expect(l.ps.P10).toEqual([1]);
    dropFromLayout(l, 'practice', 'P10');
    expect(l.ps.P10).toBeUndefined();
    const old = defaultLayout();
    old.ps.P1.push(13);
    old.pv.P1.push('gone');
    prune(old, defaultSops());
    expect(old.ps.P1).toEqual([1, 5, 12]);
    expect(old.pv.P1).toEqual(['qual', 'cons']);
  });
});

describe('a malicious name cannot break out into an attribute or a tag', () => {
  const PAYLOADS = [`"><img src=x onerror=alert(1)>`, `' onmouseover='alert(1)`, `</title><svg onload=alert(1)>`];
  /** No element anywhere may carry an inline event handler. */
  const handlers = (html: string) => {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    return [...doc.querySelectorAll('*')].filter((el) => [...el.attributes].some((a) => /^on/i.test(a.name))).length;
  };

  for (const payload of PAYLOADS) {
    it(`for ${payload}`, () => {
      VMAP.qual.n = payload;
      VMAP.qual.o2 = payload;
      VMAP.qual.desc = payload;
      PMAP.P1.n = payload;
      const c = ctx();
      const pages = [
        ringsSVG(c),
        pillarsHTML(c),
        connectionsSVG(c, 'repeat'),
        infoHtml(c, 'value', 'qual').h,
        infoHtml(c, 'practice', 'P1').h,
        editHtml(c, 'value', 'qual').h,
        editHtml(c, 'practice', 'P1').h,
      ];
      for (const html of pages) expect(handlers(html)).toBe(0);
    });
  }
});
