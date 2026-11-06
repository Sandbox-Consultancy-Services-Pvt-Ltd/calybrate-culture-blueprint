import {
  FALLBACK_META,
  boxMatches,
  buildCsv,
  cleanItems,
  cleanStandards,
  docsFromRows,
  flatItems,
  groupsOf,
  inkOn,
  leavesOf,
  metaFromRows,
  statusFromDb,
  statusOf,
  statusToDb,
  tint,
  totalsOf,
  type Docs,
  type OutcomeDbRow,
  type PromiseDbRow,
  type StandardDbRow,
} from './model';

const row = (over: Partial<OutcomeDbRow>): OutcomeDbRow => ({
  id: 'a',
  standard_id: 's-nc',
  description: 'Rate care 4.5',
  target_value: '4.5',
  current_value: '4.1',
  updated_at: '2026-01-01T00:00:00Z',
  updated_by: null,
  areas: { code: 'team-1' },
  pillars: { code: 'care' },
  outcome_statuses: { code: 'on-track' },
  ...over,
});
const promise = (id: string, area: string, pillar: string, text = ''): PromiseDbRow => ({
  id,
  promise: text,
  updated_at: '2026-01-01T00:00:00Z',
  updated_by: null,
  areas: { code: area },
  pillars: { code: pillar },
});
const standard = (id: string, promise_id: string, title: string, sort_order = 0): StandardDbRow => ({
  id,
  promise_id,
  title,
  sort_order,
  updated_at: '2026-01-01T00:00:00Z',
});

describe('statuses', () => {
  it('maps to and from the database codes', () => {
    expect(statusToDb('risk')).toBe('at-risk');
    expect(statusFromDb('achieved')).toBe('done');
    expect(statusFromDb('weird')).toBe('draft');
    expect(statusOf('nope').id).toBe('draft');
  });
});

describe('structure', () => {
  it('groups sub-areas under their parent and keeps childless areas as one row', () => {
    const g = groupsOf(FALLBACK_META);
    expect(g.map((x) => x.area.code)).toEqual(['operations', 'team-1', 'team-2', 'administration', 'team-3', 'team-4']);
    expect(g[0].rows.map((r) => r.code)).toEqual(['unit-a', 'unit-b']);
    expect(g[0].rows[0].areaName).toBe('Operations');
    expect(g[3].rows.map((r) => r.code)).toEqual(['human-resources', 'finance', 'it']);
    expect(g[1].rows).toEqual([{ code: 'team-1', name: 'Team 1', areaName: null, tag: null }]);
    expect(leavesOf(FALLBACK_META)).toHaveLength(9);
  });
});

describe('docs and totals', () => {
  const docs = docsFromRows(
    [promise('p-nc', 'team-1', 'care', 'Every customer feels cared for'), promise('p-lt', 'team-4', 'time'), promise('p-hr', 'human-resources', 'care', 'Staff are supported')],
    [standard('s-nc', 'p-nc', 'Bedside manner', 1), standard('s-nc0', 'p-nc', 'Pain control', 0), standard('s-lt', 'p-lt', 'Turnaround')],
    [
      row({ id: '1', sort_order: 1 }),
      row({ id: '2', sort_order: 0, outcome_statuses: { code: 'achieved' }, updated_at: '2026-02-01T00:00:00Z' }),
      row({ id: '3', standard_id: 's-lt', outcome_statuses: { code: 'at-risk' } }),
      row({ id: '4', standard_id: 'missing' }),
    ],
  );
  it('builds one doc per box: promise, ordered standards, outcomes, latest update time', () => {
    expect(Object.keys(docs).sort()).toEqual(['human-resources__care', 'team-1__care', 'team-4__time']);
    const d = docs['team-1__care'];
    expect(d.promise).toBe('Every customer feels cared for');
    expect(d.standards.map((x) => x.title)).toEqual(['Pain control', 'Bedside manner']);
    expect(d.standards[1].items.map((x) => x.id)).toEqual(['2', '1']);
    expect(flatItems(d)).toHaveLength(2);
    expect(d.updatedAt).toBe('2026-02-01T00:00:00Z');
  });
  it('totals boxes, outcomes and statuses (a promise alone counts as filled)', () => {
    const t = totalsOf(FALLBACK_META, docs);
    expect(t).toEqual({ boxes: 27, filled: 3, count: 3, by: { draft: 0, track: 1, risk: 1, done: 1 } });
  });
  it('filters boxes', () => {
    const d = docs['team-1__care'];
    expect(boxMatches(d, { status: null, onlyEmpty: false })).toBe(true);
    expect(boxMatches(d, { status: 'risk', onlyEmpty: false })).toBe(false);
    expect(boxMatches(d, { status: 'done', onlyEmpty: false })).toBe(true);
    expect(boxMatches(d, { status: null, onlyEmpty: true })).toBe(false);
    expect(boxMatches(docs['human-resources__care'], { status: null, onlyEmpty: true })).toBe(false);
    expect(boxMatches(undefined, { status: null, onlyEmpty: true })).toBe(true);
  });
});

describe('cleanItems', () => {
  it('trims, fixes unknown statuses and drops empty rows', () => {
    const out = cleanItems([
      { id: 'x', text: '  Goal ', target: ' 90% ', current: '', status: 'bogus' },
      { text: '', target: '', current: '' },
    ]);
    expect(out).toEqual([{ id: 'x', text: 'Goal', target: '90%', current: '', status: 'draft' }]);
  });
});

describe('cleanStandards', () => {
  it('keeps titled standards, drops completely empty ones and cleans their outcomes', () => {
    const out = cleanStandards([
      { id: 's1', title: ' Waiting ', items: [{ text: ' x ' }, { text: '' }] },
      { id: 's2', title: '', items: [{ text: '' }] },
      { id: 's3', title: '', items: [{ text: 'only outcome' }] },
      { id: 's4', title: 'No outcomes yet' },
    ]);
    expect(out.map((s) => [s.id, s.title, s.items.length])).toEqual([['s1', 'Waiting', 1], ['s3', '', 1], ['s4', 'No outcomes yet', 0]]);
  });
});

describe('metaFromRows', () => {
  it('keeps the fallback when the database is empty', () => {
    expect(metaFromRows([], [], true)).toBeNull();
  });
  it('maps parents, colours and the admin-only manage flag', () => {
    const m = metaFromRows(
      [{ id: 'p1', code: 'care', name: 'Care', sort_order: 1, color: null, is_active: true }],
      [
        { id: 'a1', code: 'ops', name: 'Ops', sort_order: 1, parent_area_id: null },
        { id: 'a2', code: 'ward', name: 'Ward', sort_order: 2, parent_area_id: 'a1' },
        { id: 'a3', code: 'old', name: 'Old', sort_order: 3, parent_area_id: null, is_active: false },
      ],
      false,
    )!;
    expect(m.pillars[0].color).toBe('#8f80f0');
    expect(m.areas).toEqual([
      { code: 'ops', name: 'Ops', parent: null },
      { code: 'ward', name: 'Ward', parent: 'ops' },
    ]);
    expect(m.canManage).toBe(false);
  });
});

describe('csv', () => {
  it('returns null when empty and escapes cells otherwise', () => {
    expect(buildCsv(FALLBACK_META, {})).toBeNull();
    const docs: Docs = {
      'team-1__care': {
        row: 'team-1',
        col: 'care',
        promise: 'Be kind',
        updatedAt: null,
        standards: [{ id: 's', title: 'Greeting', items: [{ id: '1', text: 'Say "hi", now', target: '', current: '', status: 'track' }] }],
      },
    };
    const csv = buildCsv(FALLBACK_META, docs)!;
    expect(csv.startsWith('﻿Area,')).toBe(true);
    expect(csv).toContain('"Say ""hi"", now"');
    expect(csv).toContain('On track');
    expect(csv).toContain('Be kind,Greeting,');
  });
});

describe('colour helpers', () => {
  it('picks readable ink and tints', () => {
    expect(inkOn('#493D9E')).toBe('#ffffff');
    expect(inkOn('#e5e0ff')).toBe('#171717');
    expect(tint('#000000', 0.5)).toBe('rgba(0,0,0,0.5)');
  });
});

import { parseCsv as _parseCsv, planImport as _planImport, buildCsv as _buildCsv, activePillars, docId } from './model';
describe('csv template', () => {
  it('imports cleanly as a template', async () => {
    const { buildTemplateCsv, planImport } = await import('./model');
    const plan = planImport(FALLBACK_META, {}, buildTemplateCsv(FALLBACK_META));
    expect(plan.errors).toEqual([]);
    expect(plan.added).toBe(2);
  });
});
describe('csv import', () => {
  it('parses quotes, CRLF and BOM', () => {
    expect(_parseCsv('\uFEFFa,"b,""x""",c\r\n\r\n1,2,3')).toEqual([['a', 'b,"x"', 'c'], ['1', '2', '3']]);
  });
  it('round-trips an export without duplicating, and reports bad rows', () => {
    const meta = FALLBACK_META;
    const leaf = leavesOf(meta)[0];
    const p = activePillars(meta)[0];
    const docs = {
      [docId(leaf.code, p.code)]: {
        row: leaf.code,
        col: p.code,
        promise: 'Short waits',
        updatedAt: null,
        standards: [{ id: 's', title: 'Triage', items: [{ id: 'a', text: 'Cut wait, "fast"', target: '10', current: '12', status: 'risk' as const }] }],
      },
    };
    const csv = _buildCsv(meta, docs)!;
    expect(_planImport(meta, docs, csv)).toMatchObject({ added: 0, duplicates: 1, errors: [], cells: [] });
    const plan = _planImport(meta, {}, csv + '\r\nNope,,Time,,,x,,,,\r\n');
    expect(plan.added).toBe(1);
    expect(plan.cells[0].promise).toBe('Short waits');
    expect(plan.cells[0].standards[0]).toMatchObject({ title: 'Triage' });
    expect(plan.cells[0].standards[0].items[0]).toMatchObject({ text: 'Cut wait, "fast"', status: 'risk', current: '12' });
    expect(plan.errors[0]).toMatch(/Line \d+: no area/);
  });
  it('accepts a legacy file (no promise or standard columns) by using a General standard', () => {
    const legacy = 'Area,Sub-area,Pillar,Measurable outcome,Target,Current,Status\r\nTeam 1,,Care,Old goal,90%,80%,On track\r\n';
    const plan = _planImport(FALLBACK_META, {}, legacy);
    expect(plan.errors).toEqual([]);
    expect(plan.cells[0].standards[0]).toMatchObject({ title: 'General' });
    expect(plan.cells[0].standards[0].items[0]).toMatchObject({ text: 'Old goal', target: '90%', current: '80%', status: 'track' });
  });
});
