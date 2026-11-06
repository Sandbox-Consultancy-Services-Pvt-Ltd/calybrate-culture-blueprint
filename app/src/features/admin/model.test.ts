import { activityCsv, canRestore, diffRows, logArgs, parseBackup, plural, slugify, summary, uniqueCode, when, type ChangeRow } from './model';

const change = (over: Partial<ChangeRow>): ChangeRow => ({
  occurred_at: '2026-01-01T10:00:00Z',
  changed_by_name: 'Nimal',
  operation: 'UPDATE',
  table_name: 'outcomes',
  old_data: null,
  new_data: null,
  total_count: 1,
  ...over,
});

describe('diffRows', () => {
  it('lists only changed fields on update and skips bookkeeping columns', () => {
    const d = diffRows(change({ old_data: { id: 1, description: 'a', target_value: '5', updated_at: 'x' }, new_data: { id: 1, description: 'b', target_value: '5', updated_at: 'y' } }));
    expect(d).toEqual([['description', 'a', 'b']]);
  });
  it('shows only the new values on insert and only old on delete', () => {
    expect(diffRows(change({ operation: 'INSERT', new_data: { name: 'Cost', n: 2, obj: { a: 1 } } }))).toEqual([
      ['name', '', 'Cost'],
      ['n', '', '2'],
      ['obj', '', '{"a":1}'],
    ]);
    expect(diffRows(change({ operation: 'DELETE', old_data: { name: 'Cost' } }))).toEqual([['name', 'Cost', '']]);
  });
});

describe('summary', () => {
  it('names the thing that changed', () => {
    expect(summary(change({ new_data: { description: 'Customers rate care' } }))).toBe('Outcome: Customers rate care');
    expect(summary(change({ table_name: 'sops', new_data: { sop_number: 6 } }))).toBe('SOP status: SOP 6');
    expect(summary(change({ table_name: 'practice_sops', new_data: { name: 'x' } }))).toBe('SOP link');
    expect(summary(change({ table_name: 'mystery', new_data: {} }))).toBe('mystery');
    expect(summary(change({ new_data: { description: 'x'.repeat(200) } })).length).toBe('Outcome: '.length + 90);
  });
});

describe('activityCsv', () => {
  it('writes one line per changed field, and one for changes without fields', () => {
    const csv = activityCsv([
      change({ old_data: { description: 'a' }, new_data: { description: 'b, c' } }),
      change({ operation: 'DELETE', old_data: { id: 1 } }),
    ]);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('When,Who,Action,What,Field,Before,After');
    expect(lines[1]).toContain('Changed,"Outcome: b, c",description,a,"b, c"');
    expect(lines[2]).toMatch(/Removed,Outcome,,,$/);
    expect(lines).toHaveLength(3);
  });
});

describe('logArgs', () => {
  it('uses nulls for empty filters and covers the whole "to" day', () => {
    expect(logArgs({}, 50, 100)).toEqual({ p_table: null, p_user: null, p_from: null, p_to: null, p_limit: 50, p_offset: 100 });
    const a = logArgs({ table: 'outcomes', from: '2026-03-01', to: '2026-03-01' }, 50, 0);
    expect(a.p_table).toBe('outcomes');
    expect(new Date(a.p_to!).getTime() - new Date(a.p_from!).getTime()).toBe(86_400_000);
  });
});

describe('parseBackup', () => {
  it('rejects bad files with a clear message', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, message: 'That file is not valid JSON.' });
    expect(parseBackup('{"format":"other","version":1}')).toMatchObject({ ok: false, message: 'That is not a Culture Blueprint backup file.' });
    expect(parseBackup('{"format":"culture-blueprint-backup","version":2}')).toMatchObject({ ok: false });
    expect(parseBackup('null')).toMatchObject({ ok: false });
  });
  it('accepts a valid backup', () => {
    expect(parseBackup('{"format":"culture-blueprint-backup","version":1,"outcomes":[]}')).toMatchObject({ ok: true });
  });
  it('only allows restore when RESTORE is typed', () => {
    expect(canRestore('restore')).toBe(false);
    expect(canRestore(' RESTORE ')).toBe(true);
  });
});

describe('small helpers', () => {
  it('slugifies and picks unique codes', () => {
    expect(slugify('  Unit B! ')).toBe('unit-b');
    expect(slugify('***')).toBe('item');
    expect(uniqueCode('Radiology', ['team-4'])).toBe('radiology');
    expect(uniqueCode('Radiology', ['radiology', 'radiology-2'])).toBe('radiology-3');
  });
  it('pluralises and formats missing dates', () => {
    expect(plural(1, 'outcome', 'outcomes')).toBe('1 outcome');
    expect(plural(0, 'outcome', 'outcomes')).toBe('0 outcomes');
    expect(when(null)).toBe('Never');
  });
});

import { ago, dailyCounts, matchesUser, tally, userStats, type AdminUser } from './model';
describe('analytics', () => {
  const u = (o: Partial<AdminUser>): AdminUser => ({ user_id: 'x', username: 'a', display_name: 'A', role: 'viewer', is_active: true, must_change_password: false, mfa_enrolled: false, mfa_required: true, last_sign_in_at: null, is_me: false, ...o });
  it('summarises users', () => {
    const now = Date.parse('2026-11-04T12:00:00Z');
    const s = userStats([u({ role: 'admin', mfa_enrolled: true, last_sign_in_at: '2026-11-03T00:00:00Z' }), u({}), u({ is_active: false, mfa_enrolled: true })], now);
    expect(s).toMatchObject({ total: 3, active: 2, inactive: 1, mfaOn: 1, mfaOff: 1, mfaPct: 50, signedIn7d: 1, neverSignedIn: 1 });
    expect(s.byRole).toEqual({ viewer: 1, editor: 0, admin: 1 });
    expect(userStats([]).mfaPct).toBe(0);
  });
  it('buckets changes per day, keeping empty days', () => {
    const now = new Date(2026, 10, 4, 15);
    const out = dailyCounts([{ occurred_at: new Date(2026, 10, 4, 9).toISOString() }, { occurred_at: new Date(2026, 10, 4, 10).toISOString() }, { occurred_at: new Date(2026, 10, 2).toISOString() }, { occurred_at: new Date(2026, 9, 1).toISOString() }], 3, now);
    expect(out.map((x) => x.n)).toEqual([1, 0, 2]);
  });
  it('tallies, filters and words times', () => {
    expect(tally(['b', 'a', 'b'], (x) => x)).toEqual([['b', 2], ['a', 1]]);
    expect(matchesUser({ display_name: 'Kasun Perera', username: 'kasun.p' }, ' PERE ')).toBe(true);
    expect(matchesUser({ display_name: 'Kasun', username: 'k' }, 'zz')).toBe(false);
    const now = Date.parse('2026-11-04T12:00:00Z');
    expect(ago(null, now)).toBe('Never');
    expect(ago('2026-11-04T11:59:40Z', now)).toBe('Just now');
    expect(ago('2026-11-04T09:00:00Z', now)).toBe('3 h ago');
    expect(ago('2026-11-01T12:00:00Z', now)).toBe('3 days ago');
  });
});
