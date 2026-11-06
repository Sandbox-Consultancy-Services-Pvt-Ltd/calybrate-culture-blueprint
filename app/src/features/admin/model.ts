export type Role = 'viewer' | 'editor' | 'admin';

export interface AdminUser {
  user_id: string;
  username: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  mfa_enrolled: boolean;
  /** False when an admin turned two-step verification off for this person. */
  mfa_required: boolean;
  last_sign_in_at: string | null;
  is_me: boolean;
}

export const ROLES: Role[] = ['viewer', 'editor', 'admin'];
export const ROLE_INFO: Record<Role, string> = {
  viewer: 'Can read everything, cannot change anything.',
  editor: 'Can edit outcomes, the Safeguard Map layout and SOP status.',
  admin: 'Everything an editor can do, plus users, areas, pillars, backups and the activity log.',
};
export const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export const TABLE_LABELS: Record<string, string> = {
  outcomes: 'Outcome',
  promises: 'Promise',
  standards: 'Standard',
  practice_sops: 'SOP link',
  practice_values: 'Value link',
  sops: 'SOP status',
  layout_snapshots: 'Saved version',
  pillars: 'Pillar',
  areas: 'Area',
  profiles: 'User account',
  core_values: 'Value',
  practices: 'Practice',
  settings: 'Setting',
  announcements: 'Announcement',
};

export type Operation = 'INSERT' | 'UPDATE' | 'DELETE';
export const OP: Record<Operation, [string, 'ok' | 'warn' | 'off']> = {
  INSERT: ['Added', 'ok'],
  UPDATE: ['Changed', 'warn'],
  DELETE: ['Removed', 'off'],
};

export interface ChangeRow {
  occurred_at: string;
  changed_by_name: string;
  operation: Operation;
  table_name: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  total_count: number | string;
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function when(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export const slugify = (s: string) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';

/** First free code for a new pillar/area: `radiology`, then `radiology-2`, ... */
export function uniqueCode(name: string, taken: string[]): string {
  const base = slugify(name);
  let code = base;
  let k = 2;
  while (taken.includes(code)) code = `${base}-${k++}`;
  return code;
}

export const fmt = (v: unknown): string => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

const SKIP = new Set(['updated_at', 'updated_by', 'created_at', 'created_by', 'id']);

/** Field-by-field before/after for one change. */
export function diffRows(row: Pick<ChangeRow, 'operation' | 'old_data' | 'new_data'>): Array<[string, string, string]> {
  const o = row.old_data ?? {};
  const n = row.new_data ?? {};
  const out: Array<[string, string, string]> = [];
  for (const k of new Set([...Object.keys(o), ...Object.keys(n)])) {
    if (SKIP.has(k)) continue;
    const a = o[k];
    const b = n[k];
    if (row.operation === 'UPDATE' && JSON.stringify(a) === JSON.stringify(b)) continue;
    out.push([k, row.operation === 'INSERT' ? '' : fmt(a), row.operation === 'DELETE' ? '' : fmt(b)]);
  }
  return out;
}

/** One-line description, e.g. `Outcome: Customers rate care 4.5`. */
export function summary(row: Pick<ChangeRow, 'table_name' | 'new_data' | 'old_data'>): string {
  const d = (row.new_data ?? row.old_data ?? {}) as Record<string, unknown>;
  const label = TABLE_LABELS[row.table_name] ?? row.table_name;
  let name: unknown = d.description || d.promise || d.name || d.title || d.display_name || d.username || d.code || '';
  if (row.table_name === 'practice_sops' || row.table_name === 'practice_values') name = '';
  if (row.table_name === 'sops' && d.sop_number) name = `SOP ${d.sop_number}`;
  return label + (name ? `: ${String(name).slice(0, 90)}` : '');
}

const csvCell = (v: unknown) => {
  const s = fmt(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function activityCsv(rows: ChangeRow[]): string {
  const lines: string[][] = [['When', 'Who', 'Action', 'What', 'Field', 'Before', 'After']];
  for (const row of rows) {
    const d = diffRows(row);
    const head = [row.occurred_at, row.changed_by_name, OP[row.operation][0], summary(row)];
    if (!d.length) lines.push([...head, '', '', '']);
    for (const x of d) lines.push([...head, ...x]);
  }
  return '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n');
}

export interface LogFilter {
  table?: string;
  user?: string;
  from?: string;
  to?: string;
}
/** Arguments for the `admin_list_changes` database function. `to` is inclusive of the whole day. */
export function logArgs(f: LogFilter, limit: number, offset: number) {
  return {
    p_table: f.table || null,
    p_user: f.user || null,
    p_from: f.from ? new Date(`${f.from}T00:00:00`).toISOString() : null,
    p_to: f.to ? new Date(new Date(`${f.to}T00:00:00`).getTime() + 86_400_000).toISOString() : null,
    p_limit: limit,
    p_offset: offset,
  };
}

export interface Backup {
  format: 'culture-blueprint-backup';
  version: 1;
  exported_at?: string;
  outcomes?: unknown[];
  practice_sops?: unknown[];
  practice_values?: unknown[];
  layout_snapshots?: unknown[];
}
/** Parses and checks a backup file. Returns the backup, or a message to show the person. */
export function parseBackup(text: string): { ok: true; backup: Backup } | { ok: false; message: string } {
  let b: unknown;
  try {
    b = JSON.parse(text);
  } catch {
    return { ok: false, message: 'That file is not valid JSON.' };
  }
  const x = b as Partial<Backup> | null;
  if (!x || x.format !== 'culture-blueprint-backup' || x.version !== 1) {
    return { ok: false, message: 'That is not a Culture Blueprint backup file.' };
  }
  return { ok: true, backup: x as Backup };
}

export const RESTORE_WORD = 'RESTORE';
export const canRestore = (typed: string) => typed.trim() === RESTORE_WORD;

/* ---------- analytics (pure, so they are easy to test) ---------- */
export interface UserStats {
  total: number;
  active: number;
  inactive: number;
  byRole: Record<Role, number>;
  /** Active users who have set up two-step verification. */
  mfaOn: number;
  /** Active users who must use two-step but have not set it up. */
  mfaOff: number;
  /** Active users for whom an admin turned two-step off. */
  mfaExempt: number;
  /** Share of active users with two-step on, 0–100. */
  mfaPct: number;
  signedIn7d: number;
  neverSignedIn: number;
  mustChange: number;
}
export function userStats(users: AdminUser[], now = Date.now()): UserStats {
  const act = users.filter((u) => u.is_active);
  const byRole: Record<Role, number> = { viewer: 0, editor: 0, admin: 0 };
  for (const u of act) if (u.role in byRole) byRole[u.role]++;
  const mfaOn = act.filter((u) => u.mfa_required && u.mfa_enrolled).length;
  const mfaExempt = act.filter((u) => !u.mfa_required).length;
  const week = now - 7 * 86_400_000;
  return {
    total: users.length,
    active: act.length,
    inactive: users.length - act.length,
    byRole,
    mfaOn,
    mfaOff: act.length - mfaOn - mfaExempt,
    mfaExempt,
    mfaPct: act.length ? Math.round((mfaOn / act.length) * 100) : 0,
    signedIn7d: act.filter((u) => u.last_sign_in_at && Date.parse(u.last_sign_in_at) >= week).length,
    neverSignedIn: act.filter((u) => !u.last_sign_in_at).length,
    mustChange: act.filter((u) => u.must_change_password).length,
  };
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Changes per local day for the last `days` days, oldest first, including empty days. */
export function dailyCounts(rows: Pick<ChangeRow, 'occurred_at'>[], days: number, now = new Date()): Array<{ day: string; n: number }> {
  const out: Array<{ day: string; n: number }> = [];
  for (let i = days - 1; i >= 0; i--) out.push({ day: dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)), n: 0 });
  const idx = new Map(out.map((x, i) => [x.day, i]));
  for (const r of rows) {
    const i = idx.get(dayKey(new Date(r.occurred_at)));
    if (i != null) out[i].n++;
  }
  return out;
}

/** Counts by a key, biggest first. */
export function tally<T>(rows: T[], key: (r: T) => string): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Case-insensitive match on name or username. */
export function matchesUser(u: Pick<AdminUser, 'display_name' | 'username'>, q: string): boolean {
  const s = q.trim().toLowerCase();
  return !s || u.display_name.toLowerCase().includes(s) || u.username.toLowerCase().includes(s);
}

/** "3 days ago", "just now", "Never". */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'Never';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const m = Math.round((now - t) / 60_000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 31 ? `${d} ${d === 1 ? 'day' : 'days'} ago` : when(iso);
}

/* ---------- users: filter, sort, export ---------- */
export type StatusFilter = 'all' | 'active' | 'inactive' | 'no2step' | 'never' | 'mustchange';
export type RoleFilter = 'all' | Role;
export type UserSort = 'name' | 'role' | 'recent' | 'oldest';

export interface UserFilter {
  q: string;
  role: RoleFilter;
  status: StatusFilter;
}
export const NO_FILTER: UserFilter = { q: '', role: 'all', status: 'all' };

export function matchesStatus(u: AdminUser, s: StatusFilter): boolean {
  switch (s) {
    case 'active':
      return u.is_active;
    case 'inactive':
      return !u.is_active;
    case 'no2step':
      return u.is_active && u.mfa_required && !u.mfa_enrolled;
    case 'never':
      return u.is_active && !u.last_sign_in_at;
    case 'mustchange':
      return u.is_active && u.must_change_password;
    default:
      return true;
  }
}

export function filterUsers(users: AdminUser[], f: UserFilter): AdminUser[] {
  return users.filter((u) => matchesUser(u, f.q) && (f.role === 'all' || u.role === f.role) && matchesStatus(u, f.status));
}

export function sortUsers(users: AdminUser[], by: UserSort): AdminUser[] {
  const t = (u: AdminUser) => (u.last_sign_in_at ? Date.parse(u.last_sign_in_at) : 0);
  const byName = (a: AdminUser, b: AdminUser) => a.display_name.localeCompare(b.display_name);
  const out = [...users];
  if (by === 'role') out.sort((a, b) => ROLES.indexOf(b.role) - ROLES.indexOf(a.role) || byName(a, b));
  else if (by === 'recent') out.sort((a, b) => t(b) - t(a) || byName(a, b));
  else if (by === 'oldest') out.sort((a, b) => t(a) - t(b) || byName(a, b));
  else out.sort(byName);
  return out;
}

/** Up to two capital letters from a name, for the round avatar. */
export function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export function usersToCsv(users: AdminUser[]): string {
  const lines: string[][] = [['Name', 'Username', 'Role', 'Status', 'Two-step', 'Last sign-in']];
  for (const u of users) {
    lines.push([
      u.display_name,
      u.username,
      cap(u.role),
      u.is_active ? 'Active' : 'Deactivated',
      u.mfa_required ? (u.mfa_enrolled ? 'On' : 'Not set up') : 'Turned off',
      u.last_sign_in_at ?? '',
    ]);
  }
  return '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n');
}

/** The people who need an admin's attention, one group per reason. */
export interface Attention {
  key: StatusFilter;
  count: number;
  text: string;
}
export function attentionItems(users: AdminUser[]): Attention[] {
  const st = userStats(users);
  const out: Attention[] = [];
  if (st.mfaOff) out.push({ key: 'no2step', count: st.mfaOff, text: `${plural(st.mfaOff, 'active person has', 'active people have')} not set up two-step verification.` });
  if (st.mustChange) out.push({ key: 'mustchange', count: st.mustChange, text: `${plural(st.mustChange, 'person has', 'people have')} not yet chosen their own password.` });
  if (st.neverSignedIn) out.push({ key: 'never', count: st.neverSignedIn, text: `${plural(st.neverSignedIn, 'account has', 'accounts have')} never been used.` });
  return out;
}

/** "added an outcome: Customers rate care" (no name), for lists that already say who. */
export function activityPhrase(row: Pick<ChangeRow, 'operation' | 'table_name' | 'new_data' | 'old_data'>): string {
  const verb = row.operation === 'INSERT' ? 'added' : row.operation === 'DELETE' ? 'removed' : 'changed';
  const text = summary(row).replace(/^[^:]+/, (m) => m.toLowerCase());
  return `${verb} ${/^[aeiou]/i.test(text) ? 'an' : 'a'} ${text}`;
}

/** "Kasun added an outcome: ..." style line for the activity feed. */
export function activitySentence(row: Pick<ChangeRow, 'changed_by_name' | 'operation' | 'table_name' | 'new_data' | 'old_data'>): string {
  return `${row.changed_by_name || 'Someone'} ${activityPhrase(row)}`;
}

/** Percent change from `before` to `now`; null when there is nothing to compare with. */
export function deltaPct(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

/* ---------- announcements and settings ---------- */
export type Tone = 'info' | 'warning' | 'success';
export interface Announcement {
  id: string;
  message: string;
  tone: Tone;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}
export const TONES: Tone[] = ['info', 'warning', 'success'];
export const TONE_LABEL: Record<Tone, string> = { info: 'Information', warning: 'Important', success: 'Good news' };

/** Whether an announcement is showing to people right now. */
export function announcementState(a: Pick<Announcement, 'is_active' | 'starts_at' | 'ends_at'>, now = Date.now()): 'live' | 'off' | 'scheduled' | 'ended' {
  if (!a.is_active) return 'off';
  if (a.starts_at && Date.parse(a.starts_at) > now) return 'scheduled';
  if (a.ends_at && Date.parse(a.ends_at) <= now) return 'ended';
  return 'live';
}

export const IDLE_MIN = 5;
export const IDLE_MAX = 240;
export const validIdle = (n: number) => Number.isInteger(n) && n >= IDLE_MIN && n <= IDLE_MAX;
