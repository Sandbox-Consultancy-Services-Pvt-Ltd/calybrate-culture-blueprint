import { afterEach, describe, expect, it } from 'vitest';
import { AREA_CODES, PMAP, PRACTICES, VALUES, VALUE_CODE, VALUE_ID, VMAP, defaultSops } from '../map/data';
import { applyContent, applySopTitles, type PracticeRow, type ValueRow } from './content';

const before = { v: { ...VMAP.qual }, p: { ...PMAP.P3 }, nv: VALUES.length, np: PRACTICES.length };
afterEach(() => {
  Object.assign(VMAP.qual, before.v);
  Object.assign(PMAP.P3, before.p);
  // drop anything a test added
  for (const v of VALUES.splice(0).filter((x) => ['avail', 'resp', 'cons', 'cust', 'qual'].includes(x.id))) VALUES.push(v);
  for (const k of Object.keys(VMAP)) if (!VALUES.some((v) => v.id === k)) delete VMAP[k];
  for (const k of Object.keys(VALUE_ID)) if (!VMAP[VALUE_ID[k]]) delete VALUE_ID[k];
  for (const k of Object.keys(VALUE_CODE)) if (!VMAP[k]) delete VALUE_CODE[k];
  for (const p of PRACTICES.splice(0).filter((x) => /^P[1-9]$/.test(x.id))) PRACTICES.push(p);
  for (const k of Object.keys(PMAP)) if (!PRACTICES.some((p) => p.id === k)) delete PMAP[k];
});

const val = (o: Partial<ValueRow> & { code: string }): ValueRow => ({ name: 'N', statement: 'S', description: 'D', sort_order: 1, value_groups: { code: AREA_CODES[0] }, ...o });
const prac = (o: Partial<PracticeRow> & { code: string }): PracticeRow => ({ name: 'N', summary: 'S', sort_order: 1, ...o });

describe('applyContent', () => {
  it('writes database wording onto the built-in value and practice (the Value statement is the old "Language option 02")', () => {
    applyContent({
      values: [val({ code: 'quality', name: 'Excellence', statement: 'We deliver excellence.', description: 'New descriptor.', sort_order: 5, value_groups: { code: AREA_CODES[3] } })],
      practices: [prac({ code: 'P3', name: 'Metric Led', summary: 'New summary.', sort_order: 3 })],
    });
    expect(VMAP.qual).toMatchObject({ n: 'Excellence', o2: 'We deliver excellence.', desc: 'New descriptor.' });
    expect(PMAP.P3).toMatchObject({ n: 'Metric Led', d: 'New summary.' });
  });

  it('ignores blank text', () => {
    applyContent({ values: [val({ code: 'quality', name: '  ', statement: '', description: '', sort_order: 5, value_groups: { code: AREA_CODES[3] } })], practices: [] });
    expect(VMAP.qual).toMatchObject(before.v);
  });

  it('adds a value that is new, in its area, with its code mapped both ways', () => {
    applyContent({ values: [val({ code: 'integrity', name: 'Integrity', sort_order: 6, value_groups: { code: AREA_CODES[1] } })], practices: [] });
    const v = VMAP.integrity;
    expect(v).toMatchObject({ n: 'Integrity', area: 1 });
    expect(VALUE_CODE.integrity).toBe('integrity');
    expect(VALUE_ID.integrity).toBe('integrity');
    // each area stays one piece of the ring
    const areas = VALUES.map((x) => x.area);
    expect(areas).toEqual([...areas].sort((a, b) => a - b));
    expect(VALUES.length).toBe(before.nv + 1);
  });

  it('skips a value whose area is unknown, and adds a new practice', () => {
    applyContent({ values: [val({ code: 'odd', value_groups: { code: 'nowhere' } })], practices: [prac({ code: 'P10', name: 'New practice', summary: 'Does things', sort_order: 10 })] });
    expect(VMAP.odd).toBeUndefined();
    expect(PMAP.P10).toMatchObject({ n: 'New practice', d: 'Does things', st: '' });
    expect(PRACTICES.at(-1)!.id).toBe('P10');
  });
});

describe('applySopTitles', () => {
  it('renames listed SOPs and adds ones that are new', () => {
    const sops = defaultSops();
    applySopTitles(sops, [
      { sop_number: 6, title: ' Performance & Reward ' },
      { sop_number: 13, title: 'Brand new', sop_statuses: { code: 'in-progress' } },
    ]);
    expect(sops.find((s) => s.n === 6)!.t).toBe('Performance & Reward');
    expect(sops.find((s) => s.n === 13)).toMatchObject({ t: 'Brand new', done: 0 });
    expect(sops.find((s) => s.n === 1)!.t).toBe('Talent Acquisition & Selection');
  });
});
