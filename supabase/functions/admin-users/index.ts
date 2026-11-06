// Edge Function: admin-users
// The only place that holds the service key. Lets an ADMIN (signed in, active, 2-step verified) manage accounts.
// POST { action: "list" | "create" | "update" | "reset_password" | "reset_mfa" | "delete", ... }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const USER_DOMAIN = Deno.env.get('USER_DOMAIN') ?? 'users.example.com';
const ROLES = ['viewer', 'editor', 'admin'];
const BAN_FOREVER = '876000h';

// Set ALLOWED_ORIGINS (comma separated, e.g. https://app.example.com) to answer browsers from those sites only.
// Unset keeps the old behaviour (any origin); the bearer token check below is the real protection either way.
const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
let cors: Record<string, string> = {};
function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allow = ALLOWED.length ? (ALLOWED.includes(origin) ? origin : ALLOWED[0]) : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    ...(ALLOWED.length ? { Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// Simple per-admin limit on sensitive actions (per function instance): 20 per 10 minutes.
const hits = new Map<string, number[]>();
function rateLimit(userId: string) {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 600_000);
  if (recent.length >= 20) throw new HttpError(429, 'Too many account changes. Wait a few minutes and try again.');
  recent.push(now);
  hits.set(userId, recent);
}
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function claims(token: string): Record<string, unknown> {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; }
}

function tempPassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%*-_+='];
  const all = sets.join('');
  const pick = (chars: string) => chars[crypto.getRandomValues(new Uint32Array(1))[0] % chars.length];
  const out = sets.map(pick);
  while (out.length < 20) out.push(pick(all));
  for (let i = out.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join('');
}

async function requireAdmin(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in first.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Your session is not valid. Sign in again.');
  const { data: prof } = await admin.schema('app').from('profiles').select('is_active, mfa_required, roles(code)').eq('user_id', data.user.id).maybeSingle();
  // Administrators always need a two-step verified session (the database also refuses to exempt an admin).
  if (claims(token)['aal'] !== 'aal2') throw new HttpError(403, 'Two-step verification is required.');
  // deno-lint-ignore no-explicit-any
  const role = (prof as any)?.roles?.code;
  if (!prof || !prof.is_active || role !== 'admin') throw new HttpError(403, 'Admins only.');
  return data.user;
}

async function activeAdminCount(excludeId?: string) {
  const { data } = await admin.schema('app').from('profiles').select('user_id, is_active, roles!inner(code)').eq('is_active', true).eq('roles.code', 'admin');
  return (data ?? []).filter((r) => r.user_id !== excludeId).length;
}
async function roleId(code: string) {
  const { data } = await admin.schema('app').from('roles').select('id').eq('code', code).single();
  if (!data) throw new HttpError(400, 'Unknown role.');
  return data.id as string;
}

Deno.serve(async (req) => {
  cors = corsFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Use POST.');
    const me = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '');
    if (['create', 'update', 'reset_password', 'reset_mfa', 'delete'].includes(action)) rateLimit(me.id);

    if (action === 'list') {
      // deno-lint-ignore no-explicit-any
      const all: any[] = [];
      for (let page = 1; page <= 25; page++) {
        const r = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (r.error) throw new HttpError(500, 'Could not list users.');
        all.push(...r.data.users);
        if (r.data.users.length < 200) break;
      }
      const users = { users: all };
      const { data: profs } = await admin.schema('app').from('profiles').select('user_id, username, display_name, is_active, must_change_password, mfa_required, created_at, roles(code, name)');
      const byId = new Map((profs ?? []).map((p) => [p.user_id, p]));
      const rows = users.users.filter((u) => byId.has(u.id));
      const verified = await Promise.all(rows.map(async (u) => {
        const f = await admin.auth.admin.mfa.listFactors({ userId: u.id });
        return (f.data?.factors ?? []).some((x) => x.status === 'verified');
      }));
      return json({
        users: rows.map((u, i) => {
          // deno-lint-ignore no-explicit-any
          const p: any = byId.get(u.id);
          return { user_id: u.id, username: p.username, display_name: p.display_name, role: p.roles?.code, is_active: p.is_active, must_change_password: p.must_change_password,
                   last_sign_in_at: u.last_sign_in_at ?? null, created_at: p.created_at, mfa_enrolled: verified[i], mfa_required: p.mfa_required !== false, is_me: u.id === me.id };
        }).sort((a, b) => a.display_name.localeCompare(b.display_name)),
      });
    }

    if (action === 'create') {
      const username = String(body.username ?? '').trim().toLowerCase();
      const display = String(body.display_name ?? '').trim();
      const role = String(body.role ?? '');
      if (!/^(?=.{3,16}$)[a-z0-9]+[._-]?[a-z0-9]+$/.test(username)) throw new HttpError(400, 'Username: 3-16 characters, lower-case letters and numbers, with at most one dot, dash or underscore.');
      if (!display) throw new HttpError(400, 'Enter the person’s name.');
      if (!ROLES.includes(role)) throw new HttpError(400, 'Choose a role.');
      const password = tempPassword();
      const { data: created, error } = await admin.auth.admin.createUser({ email: `${username}@${USER_DOMAIN}`, password, email_confirm: true, user_metadata: { username } });
      if (error || !created.user) throw new HttpError(400, error?.message?.includes('already') ? 'That username is already taken.' : 'Could not create the account.');
      const { error: pe } = await admin.schema('app').from('profiles').insert({ user_id: created.user.id, username, display_name: display, role_id: await roleId(role), must_change_password: true, created_by: me.id, updated_by: me.id });
      if (pe) { await admin.auth.admin.deleteUser(created.user.id); throw new HttpError(400, 'That username is already taken.'); }
      return json({ user_id: created.user.id, username, temp_password: password });
    }

    const userId = String(body.user_id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new HttpError(400, 'Missing user.');
    const { data: target } = await admin.schema('app').from('profiles').select('user_id, is_active, roles(code)').eq('user_id', userId).maybeSingle();
    if (!target) throw new HttpError(404, 'User not found.');
    // deno-lint-ignore no-explicit-any
    const targetRole = (target as any).roles?.code;

    if (action === 'update') {
      const patch: Record<string, unknown> = { updated_by: me.id };
      if (body.display_name !== undefined) { const d = String(body.display_name).trim(); if (!d) throw new HttpError(400, 'Name cannot be empty.'); patch.display_name = d; }
      if (body.role !== undefined) {
        if (!ROLES.includes(body.role)) throw new HttpError(400, 'Unknown role.');
        if (userId === me.id && body.role !== 'admin') throw new HttpError(400, 'You cannot change your own role.');
        if (targetRole === 'admin' && body.role !== 'admin' && (await activeAdminCount(userId)) < 1) throw new HttpError(400, 'There must always be at least one active admin.');
        patch.role_id = await roleId(body.role);
      }
      if (body.is_active !== undefined) {
        const on = !!body.is_active;
        if (!on && userId === me.id) throw new HttpError(400, 'You cannot deactivate yourself.');
        if (!on && targetRole === 'admin' && (await activeAdminCount(userId)) < 1) throw new HttpError(400, 'There must always be at least one active admin.');
        patch.is_active = on;
        const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: on ? 'none' : BAN_FOREVER });
        if (error) throw new HttpError(500, 'Could not update the sign-in status.');
      }
      if (body.mfa_required !== undefined) {
        const req = !!body.mfa_required;
        const finalRole = body.role !== undefined ? body.role : targetRole;
        if (!req && finalRole === 'admin') throw new HttpError(400, 'Administrators must always use two-step verification.');
        patch.mfa_required = req;
      }
      // Promoting someone to admin switches two-step back on for them.
      if (body.role === 'admin') patch.mfa_required = true;
      const { error } = await admin.schema('app').from('profiles').update(patch).eq('user_id', userId);
      if (error) throw new HttpError(500, 'Could not save the change.');
      return json({ ok: true, ...(patch.mfa_required !== undefined ? { mfa_required: patch.mfa_required } : {}) });
    }

    if (action === 'reset_password') {
      const password = tempPassword();
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) throw new HttpError(500, 'Could not reset the password.');
      await admin.schema('app').from('profiles').update({ must_change_password: true, updated_by: me.id }).eq('user_id', userId);
      return json({ temp_password: password });
    }

    if (action === 'reset_mfa') {
      const { data: f, error } = await admin.auth.admin.mfa.listFactors({ userId });
      if (error) throw new HttpError(500, 'Could not read the 2-step settings.');
      for (const factor of f?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ userId, id: factor.id });
      return json({ ok: true, removed: (f?.factors ?? []).length });
    }

    if (action === 'delete') {
      if (userId === me.id) throw new HttpError(400, 'You cannot delete yourself.');
      if (targetRole === 'admin' && (await activeAdminCount(userId)) < 1) throw new HttpError(400, 'There must always be at least one active admin.');
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new HttpError(500, 'Could not delete the user.');
      return json({ ok: true });
    }

    throw new HttpError(400, 'Unknown action.');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong.' }, 500);
  }
});
