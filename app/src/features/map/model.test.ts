import { checkFile, looksLikePdf } from './documents';
import { DEFAULT_LAYOUT, defaultSops } from './data';
import { addSop, addVal, applyDrop, coverage, crossCutting, wedgeItems, wedgesOfPractice, wedgesOfSop, defaultLayout, fromDbLayout, layoutFromRows, okTarget, placedIn, practicesOf, related, rmSop, rmVal, sameLayout, toDbLayout, valid } from './model';
import { coverageHTML, keyParts, infoHtml, ringsSVG, trayChip } from './render';

const sops = defaultSops();

describe('layout validity', () => {
  it('accepts the default and rejects broken layouts', () => {
    expect(valid(defaultLayout(), sops)).toBe(true);
    expect(valid(null, sops)).toBe(false);
    expect(valid({ ps: {}, pv: {} }, sops)).toBe(false);
    const bad = defaultLayout();
    bad.ps.P1.push(99);
    expect(valid(bad, sops)).toBe(false);
    const bad2 = defaultLayout();
    bad2.pv.P1.push('nope');
    expect(valid(bad2, sops)).toBe(false);
  });
  it('default is a fresh copy each time', () => {
    const a = defaultLayout();
    a.ps.P1.push(2);
    expect(DEFAULT_LAYOUT.ps.P1).toEqual([1, 5, 12]);
    expect(defaultLayout().ps.P1).toEqual([1, 5, 12]);
  });
});

describe('database format', () => {
  it('round-trips through the shared-database layout', () => {
    const st = defaultLayout();
    expect(toDbLayout(st).practices.P9).toEqual({ sops: [8], values: ['availability', 'mutual-respect', 'consistency', 'customer-first', 'quality'] });
    expect(sameLayout(fromDbLayout(toDbLayout(st)), st)).toBe(true);
  });
  it('builds a layout from table rows, or null when empty', () => {
    expect(layoutFromRows([], [])).toBeNull();
    const n = layoutFromRows(
      [
        { practices: { code: 'P1' }, sops: { sop_number: 5 } },
        { practices: { code: 'P1' }, sops: { sop_number: 1 } },
        { practices: null, sops: { sop_number: 2 } },
      ],
      [
        { practices: { code: 'P1' }, core_values: { code: 'quality' } },
        { practices: { code: 'P1' }, core_values: { code: 'unknown' } },
      ],
    )!;
    expect(n.ps.P1).toEqual([1, 5]);
    expect(n.pv.P1).toEqual(['qual']);
    expect(n.ps.P2).toEqual([]);
  });
  it('compares layouts ignoring order', () => {
    const a = defaultLayout();
    const b = defaultLayout();
    b.ps.P1.reverse();
    expect(sameLayout(a, b)).toBe(true);
    b.ps.P1.pop();
    expect(sameLayout(a, b)).toBe(false);
  });
});

describe('editing', () => {
  it('adds and removes without duplicates and reports changes', () => {
    const st = defaultLayout();
    expect(addSop(st, 'P5', 3)).toBe(true);
    expect(addSop(st, 'P5', 3)).toBe(false);
    expect(addSop(st, 'P5', 2)).toBe(true);
    expect(st.ps.P5).toEqual([2, 3]);
    expect(rmSop(st, 'P5', 9)).toBe(false);
    expect(rmSop(st, 'P5', 3)).toBe(true);
    expect(addVal(st, 'P6', 'qual')).toBe(false);
    expect(addVal(st, 'P6', 'resp')).toBe(true);
    expect(rmVal(st, 'P6', 'resp')).toBe(true);
  });
  it('finds placements', () => {
    const st = defaultLayout();
    expect(placedIn(st, 5)).toEqual(['P1', 'P2']);
    expect(practicesOf(st, 'resp')).toEqual(['P7', 'P8', 'P9']);
  });
});

describe('selection', () => {
  const st = defaultLayout();
  it('traces a value to its practices and SOPs', () => {
    const r = related(st, { type: 'value', id: 'resp' })!;
    expect([...r.P]).toEqual(['P7', 'P8', 'P9']);
    expect([...r.S]).toEqual([8]);
    expect(r.Z).toBe(false);
  });
  it('lights the zero-tolerance band when Exit is involved', () => {
    expect(related(st, { type: 'practice', id: 'P9' })!.Z).toBe(true);
    expect(related(st, { type: 'sop', id: '8' })!.Z).toBe(true);
    expect(related(st, { type: 'zero', id: 'z' })!.Z).toBe(true);
    expect(related(st, { type: 'sop', id: '6' })!.Z).toBe(false);
  });
  it('is null for nothing or purpose', () => {
    expect(related(st, null)).toBeNull();
    expect(related(st, { type: 'purpose', id: 'p' })).toBeNull();
  });
});

describe('coverage', () => {
  it('counts gaps', () => {
    const c = coverage(defaultLayout(), sops);
    expect(c).toEqual({ noPrac: 0, noSop: 4, unplaced: 7, placed: 5, gaps: 11 });
    expect(coverageHTML(c)).toContain('data-gapf="sops"><span>SOPs not placed</span><b>7</b>');
  });
});

describe('drag and drop rules', () => {
  it('allows SOPs on practices and the tray, practices on values and their tray', () => {
    expect(okTarget('sop', 'P3')).toBe(true);
    expect(okTarget('sop', 'tray')).toBe(true);
    expect(okTarget('sop', 'V:qual')).toBe(false);
    expect(okTarget('prac', 'V:qual')).toBe(true);
    expect(okTarget('prac', 'ptray')).toBe(true);
    expect(okTarget('prac', 'P3')).toBe(false);
    expect(okTarget('sop', undefined)).toBe(false);
  });
  it('moves an SOP between practices', () => {
    const st = defaultLayout();
    const r = applyDrop(st, 'sop', 5, 'P2', 'P5');
    expect(r.changed).toBe(true);
    expect(r.toast).toBe('SOP 5 → P5 · Incentive');
    expect(st.ps.P2).toEqual([]);
    expect(st.ps.P5).toEqual([5]);
  });
  it('copies an SOP from the library, and unlinks by dropping back on the tray', () => {
    const st = defaultLayout();
    expect(applyDrop(st, 'sop', 2, 'tray', 'P5').changed).toBe(true);
    expect(st.ps.P5).toEqual([2]);
    expect(applyDrop(st, 'sop', 2, 'P5', 'tray').changed).toBe(true);
    expect(st.ps.P5).toEqual([]);
    expect(applyDrop(st, 'sop', 2, 'tray', 'tray').changed).toBe(false);
  });
  it('dropping on the same practice changes nothing', () => {
    expect(applyDrop(defaultLayout(), 'sop', 5, 'P2', 'P2').changed).toBe(false);
  });
  it('moves a practice between values and unlinks it on the tray', () => {
    const st = defaultLayout();
    const r = applyDrop(st, 'prac', 'P6', 'V:qual', 'V:resp');
    expect(r).toEqual({ changed: true, toast: 'P6 now safeguards Mutual respect' });
    expect(st.pv.P6).toEqual(['resp']);
    expect(applyDrop(st, 'prac', 'P6', 'V:resp', 'ptray').changed).toBe(true);
    expect(st.pv.P6).toEqual([]);
    expect(applyDrop(st, 'prac', 'P6', 'ptray', 'ptray').changed).toBe(false);
  });
});

describe('rendered html', () => {
  const ctx = { st: defaultLayout(), sel: null, sops };
  it('draws the rings with only linked practices and placed SOPs', () => {
    const svg = ringsSVG(ctx);
    expect(svg).toContain('data-open="value:avail"');
    expect(svg).toContain('data-dragprac="P9"');
    expect(svg).toContain('data-dragsop="12"');
    expect(svg).not.toContain('data-dragsop="2"'); // SOP 2 is not placed yet
  });
  it('dims what is not linked to the selection', () => {
    const svg = ringsSVG({ ...ctx, sel: { type: 'practice', id: 'P3' } });
    expect(svg).toMatch(/class="pnode t-p lit sel" data-open="practice:P3"/);
    expect(svg).toMatch(/class="pnode t-p dim" data-open="practice:P1"/);
  });
  it('marks done and unplaced SOPs in the library', () => {
    expect(trayChip(ctx, 2)).toContain('sopchip done un');
    expect(trayChip(ctx, 6)).not.toContain(' un');
    expect(trayChip(ctx, 6)).toContain('<u>2</u>');
  });
  it('lists values by area with the gap flag', () => {
    const [v] = keyParts(ctx);
    expect(v).toContain('How we build trust');
    expect(v).toContain('data-gap="0"');
  });
});

describe('wedges: one complete piece per value', () => {
  const st = defaultLayout();
  it('puts Exit (P9) in the base band, never in a wedge', () => {
    expect(crossCutting('P9')).toBe(true);
    for (const v of ['avail', 'resp', 'cons', 'cust', 'qual']) expect(wedgeItems(st, v).practices).not.toContain('P9');
    expect(wedgesOfPractice(st, 'P9')).toEqual([]);
  });
  it('gives each wedge its practices and their SOPs, each SOP once', () => {
    expect(wedgeItems(st, 'qual').practices).toEqual(['P1', 'P2', 'P3', 'P4', 'P6']);
    expect(wedgeItems(st, 'qual').sops).toEqual([1, 5, 12, 6]);
    expect(wedgeItems(st, 'avail')).toEqual({ practices: ['P2', 'P5'], sops: [5] });
  });
  it('repeats a shared practice or SOP in every wedge it serves', () => {
    expect(wedgesOfPractice(st, 'P1')).toEqual(['cons', 'qual']);
    expect(wedgesOfSop(st, 5)).toEqual(['avail', 'cons', 'qual']);
    expect(wedgeItems(st, 'cons').practices).toContain('P1');
    expect(wedgeItems(st, 'qual').practices).toContain('P1');
  });
  it('draws shared items in every wedge with a count badge', () => {
    const svg = ringsSVG({ st, sel: null, sops });
    expect(svg.match(/data-dragprac="P1"/g)).toHaveLength(2);
    expect(svg).toContain('×3'); // SOP 5 sits in three wedges
    expect(svg.match(/data-dragprac="P9"/g)).toHaveLength(1);
  });
  it('lists the whole piece of a value in the details drawer, with shared markers and navigation', () => {
    const html = infoHtml({ st, sel: null, sops }, 'value', 'qual').h;
    expect(html).toContain('Everything in this piece');
    expect(html).toContain('data-open="practice:P6"');
    expect(html).toContain('Shared — also guards');
    expect(html).toContain('data-slice="next"');
  });
});

describe('documents in the details panel', () => {
  const base = { st: defaultLayout(), sel: null, sops };
  const doc = { name: '<b>SOP 6</b>.pdf', size: 2_500_000, at: '2026-11-04T10:00:00Z' };
  it('offers upload to editors and only Open to viewers', () => {
    const empty = { ...base, docsOn: true, docs: {}, canEdit: true };
    expect(infoHtml(empty, 'sop', '6').h).toContain('data-doc="upload"');
    expect(infoHtml(empty, 'practice', 'P1').h).toContain('data-doc="upload"');
    const full = { ...base, docsOn: true, docs: { 'sop:6': doc }, canEdit: false };
    const viewer = infoHtml(full, 'sop', '6').h;
    expect(viewer).toContain('data-doc="open"');
    expect(viewer).not.toContain('data-doc="upload"');
    expect(viewer).not.toContain('data-doc="remove"');
    expect(infoHtml({ ...full, canEdit: true }, 'sop', '6').h).toContain('data-doc="remove"');
  });
  it('escapes the file name and explains offline mode', () => {
    const html = infoHtml({ ...base, docsOn: true, docs: { 'sop:6': doc }, canEdit: true }, 'sop', '6').h;
    expect(html).not.toContain('<b>SOP 6</b>.pdf');
    expect(html).toContain('&lt;b&gt;SOP 6');
    expect(infoHtml({ ...base, docsOn: false }, 'practice', 'P2').h).toContain('not available in offline mode');
  });
});

describe('document file checks', () => {
  it('accepts a PDF and refuses other types, empty and oversized files', () => {
    expect(checkFile({ name: 'a.pdf', size: 1000, type: 'application/pdf' })).toBeNull();
    expect(checkFile({ name: 'a.docx', size: 1000, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).toMatch(/PDF/);
    expect(checkFile({ name: 'a.pdf', size: 0, type: 'application/pdf' })).toMatch(/empty/);
    expect(checkFile({ name: 'a.pdf', size: 21 * 1024 * 1024, type: 'application/pdf' })).toMatch(/20 MB/);
  });
  it('recognises a real PDF by its first bytes', async () => {
    expect(await looksLikePdf(new Blob(['%PDF-1.7 ...']))).toBe(true);
    expect(await looksLikePdf(new Blob(['PK\u0003\u0004']))).toBe(false);
  });
});
