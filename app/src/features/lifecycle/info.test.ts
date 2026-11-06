import { buildCodex } from '../codex/model';
import { LC_EDGES, relatedIds } from './controller';
import { INFO, PRACTICES, drawerHtml, esc, offlineStore, practiceTitle, storeOf, stripQualifier, text } from './info';

const live = storeOf(
  buildCodex(
    [
      { sop_number: 1, title: 'Hiring <fast>', sop_statuses: { code: 'done' } },
      { sop_number: 8, title: 'Farewell', sop_statuses: { code: 'draft' } },
    ],
    [
      { practices: { code: 'P1' }, sops: { sop_number: 1 } },
      { practices: { code: 'P9' }, sops: { sop_number: 8 } },
    ],
    [],
    [
      { code: 'P1', name: 'Skills Hub' },
      { code: 'P8', name: 'Engagement (based on CCT)' },
    ],
  ),
  true,
);

describe('drawer content', () => {
  it('uses the static wording when there is no database', () => {
    const d = drawerHtml('s1', offlineStore)!;
    expect(d.t).toBe('Pipeline Building and Sourcing');
    expect(d.html).toContain('Covered by SOP 1 (Talent Acquisition &amp; Selection)');
    expect(d.html).toContain('SOP 12');
    expect(d.html).toContain('New Employee Orientation');
  });
  it('uses live SOP placements, titles and done ticks, escaping titles', () => {
    const d = drawerHtml('s1', live)!;
    expect(d.html).toContain('Covered by SOP 1 (Hiring &lt;fast&gt;)');
    expect(d.html).toContain('SOP 1 ✓');
    expect(d.html).not.toContain('SOP 12');
    expect(d.html).not.toContain('<fast>');
  });
  it('lists exit coverage with LOA and NDA', () => {
    expect(drawerHtml('s7', live)!.html).toContain('Covered in SOP 8 (Farewell), LOA and NDA');
    expect(drawerHtml('s7', offlineStore)!.html).toContain('Covered in SOP 8 (Employee Farewell), LOA and NDA');
  });
  it('shows no SOP section for stages that have none, and a link where defined', () => {
    expect(drawerHtml('s5', live)!.html).not.toContain('<h4>SOPs</h4>');
    expect(drawerHtml('cct', live)!.html).toContain('href="#cct"');
  });
  it('returns null for an unknown box', () => expect(drawerHtml('nope', live)).toBeNull());
  it('has a description for every practice and every drawer key referenced by the diagram', () => {
    for (const n of '123456789') expect(PRACTICES[n]).toBeDefined();
    expect(Object.keys(INFO)).toEqual(expect.arrayContaining(['s1', 's7', 'ops', 'comp', 'metric', 'adv', 'inc', 'dev', 'fb', 'eng', 'cct', 'exitend']));
  });
  it('builds practice clauses from live data', () => {
    expect(text(live).clause('P1', 'x')).toBe(' (SOP 1 — Hiring &lt;fast&gt;)');
    expect(text(offlineStore).clause('P1', 'fallback')).toBe('fallback');
    expect(text(live).clauseExit()).toBe(' (SOP 8 / LOA / NDA)');
  });
  it('escapes html', () => expect(esc('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;'));
});

describe('live practice names', () => {
  it('drops a qualifier the diagram already shows', () => {
    expect(stripQualifier('Engagement (based on CCT)', 'Based on CCT')).toBe('Engagement');
    expect(stripQualifier('Metric Driven (Outcome driven)', '(Outcome driven)')).toBe('Metric Driven');
    expect(stripQualifier('Skills Hub', '(6.1.1)')).toBe('Skills Hub');
  });
  it('renames the drawer heading, keeping its qualifier', () => {
    expect(drawerHtml('ops', live)!.t).toBe('Skills Hub');
    expect(drawerHtml('eng', live)!.t).toBe('Engagement (Based on CCT)');
    expect(drawerHtml('ops', offlineStore)!.t).toBe('OPS Skills Developing Center');
    expect(drawerHtml('metric', live)!.t).toBe('Metric Driven (Outcome driven)');
    expect(practiceTitle('Incentive', 'Incentive', 'Rewards')).toBe('Rewards');
  });
  it('tags every practice title in the markup', async () => {
    const html = (await import('./lifecycle.html?raw')).default;
    for (const n of '12345678') expect(html).toContain(`data-pname="P${n}"`);
  });
});

describe('connectors', () => {
  it('relates a box to its neighbours', () => {
    expect([...relatedIds('x-cct')].sort()).toEqual(['x-att', 'x-c1', 'x-c2', 'x-c3', 'x-cct', 'x-rev']);
  });
  it('only joins ids that exist in the markup', async () => {
    const html = (await import('./lifecycle.html?raw')).default;
    for (const e of LC_EDGES) {
      expect(html, e.a).toContain(`id="${e.a}"`);
      expect(html, e.b).toContain(`id="${e.b}"`);
    }
  });
});
