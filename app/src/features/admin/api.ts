import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../lib/env';
import type { AdminUser, Announcement, Tone } from './model';

export type Result<T> = { ok: true; data: T } | { ok: false; message: string };

/** Calls the user-management Edge Function (the only place that holds the service key). */
export async function callFunction<T = unknown>(db: SupabaseClient, body: Record<string, unknown>): Promise<Result<T>> {
  const r = await db.functions.invoke(env.adminFunction, { body });
  if (r.error) {
    let message = 'Something went wrong. Try again.';
    try {
      const ctx = (r.error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
      const j = ctx?.json ? await ctx.json() : null;
      if (j?.error) message = j.error;
    } catch {
      /* keep the generic message */
    }
    return { ok: false, message };
  }
  return { ok: true, data: r.data as T };
}

/** Calls a database function in the `app` schema. The database re-checks the admin role itself. */
export async function callRpc<T = unknown>(db: SupabaseClient, name: string, args: Record<string, unknown> = {}): Promise<Result<T>> {
  const r = await db.schema('app').rpc(name, args);
  return r.error ? { ok: false, message: r.error.message || 'Not allowed.' } : { ok: true, data: r.data as T };
}

/** A missing `mfa_required` means two-step is required, the same default the server uses. */
export async function listUsers(db: SupabaseClient): Promise<Result<{ users: AdminUser[] }>> {
  const r = await callFunction<{ users: AdminUser[] }>(db, { action: 'list' });
  if (!r.ok) return r;
  return { ok: true, data: { users: (r.data.users ?? []).map((u) => ({ ...u, mfa_required: u.mfa_required !== false })) } };
}

/* ---------- areas and pillars ---------- */
export interface PillarRow {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  color: string;
  is_active: boolean;
}
export interface AreaRow {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  parent_area_id: string | null;
}
export interface Structure {
  pillars: PillarRow[];
  areas: AreaRow[];
  /** Number of outcomes using each pillar/area id. */
  counts: { pillars: Record<string, number>; areas: Record<string, number> };
}

export async function loadStructure(db: SupabaseClient): Promise<Structure | null> {
  const o = db.schema('outcomes');
  const [p, a, c] = await Promise.all([
    o.from('pillars').select('*').order('sort_order'),
    o.from('areas').select('*').order('sort_order'),
    o.from('outcomes').select('area_id,pillar_id'),
  ]);
  if (p.error || a.error) return null;
  const counts: Structure['counts'] = { pillars: {}, areas: {} };
  for (const x of (c.data ?? []) as Array<{ area_id: string; pillar_id: string }>) {
    counts.pillars[x.pillar_id] = (counts.pillars[x.pillar_id] ?? 0) + 1;
    counts.areas[x.area_id] = (counts.areas[x.area_id] ?? 0) + 1;
  }
  return { pillars: p.data as PillarRow[], areas: a.data as AreaRow[], counts };
}

export type Kind = 'pillars' | 'areas';
/** Returns an error message, or null on success. */
export async function structOp(run: () => PromiseLike<{ error: { code?: string } | null }>): Promise<string | null> {
  const r = await run();
  if (!r.error) return null;
  return r.error.code === '23503'
    ? 'It is still in use, so it cannot be deleted. Archive it instead.'
    : 'That change could not be saved.';
}

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ---------- settings and announcements (migration 0017) ---------- */
/** True when the database says the function or table from migration 0017 is not there yet. */
export const isMissingMigration = (message: string) => /could not find the function|does not exist|schema cache/i.test(message);

export interface Settings {
  idle_minutes?: number;
}
export async function getSettings(db: SupabaseClient): Promise<Result<Settings>> {
  return callRpc<Settings>(db, 'get_settings');
}
export const setSetting = (db: SupabaseClient, key: string, value: unknown) => callRpc(db, 'admin_set_setting', { p_key: key, p_value: value });

export const listAnnouncements = (db: SupabaseClient) => callRpc<Announcement[]>(db, 'admin_list_announcements');
export const saveAnnouncement = (db: SupabaseClient, a: { id: string | null; message: string; tone: Tone; is_active: boolean; starts_at: string | null; ends_at: string | null }) =>
  callRpc<string>(db, 'admin_save_announcement', { p_id: a.id, p_message: a.message, p_tone: a.tone, p_is_active: a.is_active, p_starts_at: a.starts_at, p_ends_at: a.ends_at });
export const deleteAnnouncement = (db: SupabaseClient, id: string) => callRpc(db, 'admin_delete_announcement', { p_id: id });
export const activeAnnouncements = (db: SupabaseClient) => callRpc<Array<Pick<Announcement, 'id' | 'message' | 'tone'>>>(db, 'get_active_announcements');
