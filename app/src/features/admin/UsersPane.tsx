import { useMemo, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { USERNAME_HINT, isValidUsername } from '../../lib/username';
import { callFunction, download } from './api';
import { UserDrawer } from './UserDrawer';
import { Avatar, Dialog, EmptyState, Icon, PageHeader, RowMenu, TableSkeleton, useAdminUi, type MenuItem } from './ui';
import {
  NO_FILTER,
  ROLES,
  ROLE_INFO,
  ago,
  cap,
  filterUsers,
  plural,
  sortUsers,
  usersToCsv,
  when,
  type AdminUser,
  type Role,
  type RoleFilter,
  type StatusFilter,
  type UserSort,
} from './model';

function AddUserDialog({ db, onClose, onCreated }: { db: SupabaseClient; onClose: () => void; onCreated: () => void }) {
  const { showSecret } = useAdminUi();
  const [name, setName] = useState('');
  const [disp, setDisp] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isValidUsername(name.trim())) return setErr(`Username: ${USERNAME_HINT}`);
    setBusy(true);
    setErr(null);
    const r = await callFunction<{ username: string; temp_password: string }>(db, { action: 'create', username: name, display_name: disp, role });
    if (!r.ok) {
      setErr(r.message);
      setBusy(false);
      return;
    }
    onClose();
    showSecret('User created', r.data.username, r.data.temp_password);
    onCreated();
  }

  return (
    <Dialog title="Add a user" onClose={onClose}>
      <form className="ad-form" onSubmit={submit}>
        <label>
          Full name
          <input type="text" id="au-disp" autoComplete="off" maxLength={80} required value={disp} onChange={(e) => setDisp(e.target.value)} />
        </label>
        <label>
          Username (used to sign in)
          <input
            type="text"
            id="au-name"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={16}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <small>{USERNAME_HINT}</small>
        </label>
        <div className="f">
          <span className="lbl">Role</span>
          <div className="ad-roles" role="radiogroup" aria-label="Role">
            {ROLES.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={r === role} className={`ad-role${r === role ? ' on' : ''}`} data-role={r} onClick={() => setRole(r)}>
                <b>{cap(r)}</b>
                <span>{ROLE_INFO[r]}</span>
              </button>
            ))}
          </div>
        </div>
        {err && (
          <p className="ad-err" role="alert">
            {err}
          </p>
        )}
        <div className="ad-frow">
          <button type="button" className="ad-btn outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="ad-btn primary" id="au-save" disabled={busy}>
            Create user
          </button>
        </div>
      </form>
    </Dialog>
  );
}

const ROLE_CHIPS: Array<[RoleFilter, string]> = [
  ['all', 'All roles'],
  ['admin', 'Admins'],
  ['editor', 'Editors'],
  ['viewer', 'Viewers'],
];
const STATUS_CHIPS: Array<[StatusFilter, string]> = [
  ['all', 'Everyone'],
  ['active', 'Active'],
  ['inactive', 'Deactivated'],
  ['no2step', 'Without two-step'],
  ['never', 'Never signed in'],
  ['mustchange', 'Must change password'],
];

export function UsersPane({
  db,
  users,
  reload,
  loading = false,
  initialStatus = 'all',
  openAdd = false,
}: {
  db: SupabaseClient;
  users: AdminUser[];
  reload: () => Promise<void>;
  loading?: boolean;
  initialStatus?: StatusFilter;
  openAdd?: boolean;
}) {
  const { toast, confirm, showSecret } = useAdminUi();
  const [adding, setAdding] = useState(openAdd);
  const [filter, setFilter] = useState({ ...NO_FILTER, status: initialStatus });
  const [sort, setSort] = useState<UserSort>('name');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const shown = useMemo(() => sortUsers(filterUsers(users, filter), sort), [users, filter, sort]);
  const filtered = filter.q.trim() !== '' || filter.role !== 'all' || filter.status !== 'all';
  const open = users.find((u) => u.user_id === openId) ?? null;
  // Only people still in the list count; someone deleted meanwhile drops out of the selection.
  const chosen = users.filter((u) => picked.has(u.user_id) && !u.is_me);
  const allShownPicked = shown.some((u) => !u.is_me) && shown.filter((u) => !u.is_me).every((u) => picked.has(u.user_id));

  const act = async (body: Record<string, unknown>, ok: (data: never) => string | void) => {
    const r = await callFunction(db, body);
    if (!r.ok) toast(r.message, true);
    else {
      const m = ok(r.data as never);
      if (m) toast(m);
    }
    await reload();
    return r;
  };

  async function setRole(u: AdminUser, role: Role) {
    const up = ROLES.indexOf(role) > ROLES.indexOf(u.role);
    const ok = await confirm(
      `Change ${u.display_name} to ${cap(role)}`,
      role === 'admin'
        ? 'Admins can manage users, backups, areas, pillars and the activity log. Only give this to someone you fully trust.'
        : u.role === 'admin'
          ? `${u.display_name} will lose access to Administration straight away.`
          : up
            ? ROLE_INFO[role]
            : `${u.display_name} will lose some of what they can do now. ${ROLE_INFO[role]}`,
      `Make ${cap(role)}`,
      false,
      role === 'admin' || u.role === 'admin' ? 'warn' : 'info',
    );
    if (!ok) return;
    await act({ action: 'update', user_id: u.user_id, role }, () => `${u.display_name} is now ${role}`);
  }
  async function resetPassword(u: AdminUser) {
    if (!(await confirm('Reset password', `Create a new temporary password for ${u.display_name}? Their current password stops working.`, 'Reset password'))) return;
    const r = await callFunction<{ temp_password: string }>(db, { action: 'reset_password', user_id: u.user_id });
    if (!r.ok) return toast(r.message, true);
    showSecret('Password reset', u.username, r.data.temp_password);
    await reload();
  }
  async function resetMfa(u: AdminUser) {
    if (
      !(await confirm(
        'Reset two-step verification',
        `${u.display_name} will be asked to set up their authenticator app again the next time they sign in. Use this when someone lost their phone.`,
        'Reset two-step',
      ))
    )
      return;
    await act({ action: 'reset_mfa', user_id: u.user_id }, () => `Two-step reset for ${u.display_name}`);
  }
  async function toggleTwoStep(u: AdminUser) {
    const on = !u.mfa_required;
    const ok = on
      ? await confirm(`Turn on two-step for ${u.display_name}`, `${u.is_me ? 'You' : 'They'} will need a code from ${u.is_me ? 'your' : 'their'} authenticator app the next time ${u.is_me ? 'you' : 'they'} sign in.`, 'Turn on')
      : await confirm(
          `Turn off two-step for ${u.display_name}`,
          `${u.is_me ? 'You' : 'They'} will be able to sign in with just a password. This is less secure, so only do it when ${u.is_me ? 'you' : 'they'} cannot use an authenticator app.`,
          'Turn off',
          true,
        );
    if (!ok) return;
    const r = await callFunction<{ ok?: boolean; mfa_required?: boolean }>(db, { action: 'update', user_id: u.user_id, mfa_required: on });
    if (!r.ok) toast(r.message, true);
    else if (r.data?.mfa_required !== on) {
      // An older copy of the server function ignores this setting but still answers "ok".
      toast('The server did not apply this change. Update the admin-users Edge Function and run migration 0013, then try again.', true);
    } else toast(`Two-step ${on ? 'turned on' : 'turned off'} for ${u.display_name}`);
    await reload();
  }
  async function toggleActive(u: AdminUser) {
    const to = !u.is_active;
    if (!to && !(await confirm(`Deactivate ${u.display_name}`, 'They will not be able to sign in or see any data. You can activate them again later.', 'Deactivate', true))) return;
    await act({ action: 'update', user_id: u.user_id, is_active: to }, () => `${u.display_name} ${to ? 'activated' : 'deactivated'}`);
  }
  async function remove(u: AdminUser) {
    if (
      !(await confirm(
        `Delete ${u.display_name}`,
        'This removes the account for good. Changes they made stay in the activity log. To keep the account but block access, deactivate it instead.',
        'Delete user',
        true,
      ))
    )
      return;
    setOpenId(null);
    await act({ action: 'delete', user_id: u.user_id }, () => `Deleted ${u.display_name}`);
  }

  const actionsFor = (u: AdminUser): MenuItem[] => [
    { label: 'Reset password', onSelect: () => void resetPassword(u) },
    { label: 'Reset 2-step', hidden: !u.mfa_required, onSelect: () => void resetMfa(u) },
    { label: u.mfa_required ? 'Turn off 2-step' : 'Turn on 2-step', danger: u.mfa_required, hidden: u.mfa_required && u.role === 'admin', onSelect: () => void toggleTwoStep(u) },
    { label: u.is_active ? 'Deactivate' : 'Activate', danger: u.is_active, hidden: u.is_me, onSelect: () => void toggleActive(u) },
    { label: 'Delete', danger: true, hidden: u.is_me, onSelect: () => void remove(u) },
  ];

  /* ---- bulk actions: run one at a time so the server's own checks apply to each person ---- */
  async function bulk(title: string, text: string, label: string, danger: boolean, body: (u: AdminUser) => Record<string, unknown>, done: string, eligible: (u: AdminUser) => boolean = () => true) {
    const targets = chosen.filter(eligible);
    if (!targets.length) return toast('None of the selected people need that change.');
    // Never let a bulk change take away the last active admin.
    const adminsLeft = users.filter((u) => {
      const t = targets.find((x) => x.user_id === u.user_id);
      const b = t ? body(t) : {};
      return ((b.role as Role | undefined) ?? u.role) === 'admin' && ((b.is_active as boolean | undefined) ?? u.is_active);
    }).length;
    if (adminsLeft < 1) return toast('That would leave no active administrator.', true);
    if (!(await confirm(title, `${text} (${plural(targets.length, 'person', 'people')}).`, label, danger))) return;
    setBulkBusy(true);
    let failed = 0;
    let lastMsg = '';
    for (const u of targets) {
      const r = await callFunction(db, body(u));
      if (!r.ok) {
        failed++;
        lastMsg = r.message;
      }
    }
    setBulkBusy(false);
    setPicked(new Set());
    await reload();
    if (failed) toast(`${plural(targets.length - failed, 'person', 'people')} done, ${failed} failed. ${lastMsg}`, true);
    else toast(`${done}: ${plural(targets.length, 'person', 'people')}`);
  }

  const togglePick = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const pickAll = () => setPicked(allShownPicked ? new Set() : new Set(shown.filter((u) => !u.is_me).map((u) => u.user_id)));
  const exportCsv = () => {
    download(`users-${new Date().toISOString().slice(0, 10)}.csv`, usersToCsv(shown), 'text/csv;charset=utf-8');
    toast(`Exported ${plural(shown.length, 'person', 'people')}`);
  };

  return (
    <>
      <PageHeader title="Users" sub="People who can sign in. Viewers read, editors edit, admins manage everything.">
        <button type="button" className="ad-btn outline with-ico" id="us-export" disabled={!shown.length} onClick={exportCsv}>
          <Icon name="download" size={16} /> Export CSV
        </button>
        <button type="button" className="ad-btn primary with-ico" id="ad-add-user" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} /> Add user
        </button>
      </PageHeader>

      <div className="ad-toolbar">
        <label className="ad-search">
          <Icon name="search" size={16} />
          <input type="search" id="us-q" aria-label="Search people" placeholder="Search by name or username" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
        </label>
        <label className="ad-sort">
          <span>Sort</span>
          <select id="us-sort" value={sort} onChange={(e) => setSort(e.target.value as UserSort)}>
            <option value="name">Name</option>
            <option value="role">Role</option>
            <option value="recent">Signed in recently</option>
            <option value="oldest">Not signed in for longest</option>
          </select>
        </label>
      </div>
      <div className="ad-chips" role="group" aria-label="Filter by role">
        {ROLE_CHIPS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filter.role === k} className={filter.role === k ? 'on' : undefined} onClick={() => setFilter({ ...filter, role: k })}>
            {label}
          </button>
        ))}
      </div>
      <div className="ad-chips" role="group" aria-label="Filter by status">
        {STATUS_CHIPS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filter.status === k} className={filter.status === k ? 'on' : undefined} onClick={() => setFilter({ ...filter, status: k })}>
            {label}
          </button>
        ))}
        {!loading && <span className="ad-count">{plural(shown.length, 'person', 'people')}</span>}
      </div>

      {!!chosen.length && (
        <div className="ad-bulk" role="region" aria-label="Actions for the selected people">
          <b>{chosen.length} selected</b>
          <select
            aria-label="Change role of the selected people"
            disabled={bulkBusy}
            value=""
            onChange={(e) => {
              const role = e.target.value as Role;
              if (role)
                void bulk(`Change role to ${cap(role)}`, ROLE_INFO[role], `Make ${cap(role)}`, false, (u) => ({ action: 'update', user_id: u.user_id, role }), `Now ${role}`, (u) => u.role !== role);
            }}
          >
            <option value="">Change role…</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {cap(r)}
              </option>
            ))}
          </select>
          <button type="button" className="ad-lnk" disabled={bulkBusy} onClick={() => void bulk('Activate', 'They will be able to sign in again', 'Activate', false, (u) => ({ action: 'update', user_id: u.user_id, is_active: true }), 'Activated', (u) => !u.is_active)}>
            Activate
          </button>
          <button type="button" className="ad-lnk danger" disabled={bulkBusy} onClick={() => void bulk('Deactivate', 'They will not be able to sign in or see any data until you activate them again', 'Deactivate', true, (u) => ({ action: 'update', user_id: u.user_id, is_active: false }), 'Deactivated', (u) => u.is_active)}>
            Deactivate
          </button>
          <button type="button" className="ad-lnk" disabled={bulkBusy} onClick={() => void bulk('Reset two-step', 'They will set up their authenticator app again at next sign-in', 'Reset two-step', false, (u) => ({ action: 'reset_mfa', user_id: u.user_id }), 'Two-step reset', (u) => u.mfa_required)}>
            Reset 2-step
          </button>
          <span className="sp" />
          <button type="button" className="ad-lnk" onClick={() => setPicked(new Set())}>
            Clear
          </button>
        </div>
      )}

      {loading && <TableSkeleton cols={6} rows={5} label="Loading users" />}
      {!loading && !shown.length && (
        <EmptyState icon="users" title={users.length ? 'No one matches' : 'No users yet'} text={users.length ? 'Try a different search or filter.' : 'Add the first person who needs to sign in.'}>
          {filtered && (
            <button type="button" className="ad-btn outline small" onClick={() => setFilter(NO_FILTER)}>
              Clear filters
            </button>
          )}
        </EmptyState>
      )}
      <div className="ad-scroll" hidden={loading || !shown.length}>
        <table className="ad-table ad-users">
          <thead>
            <tr>
              <th className="chk">
                <input type="checkbox" aria-label="Select everyone shown" checked={allShownPicked} onChange={pickAll} />
              </th>
              {['Person', 'Role', 'Status', 'Two-step', 'Last sign-in', ''].map((t, i) => (
                <th key={i}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.user_id} className={u.is_active ? '' : 'off'} data-user={u.username}>
                <td className="chk" data-label="">
                  <input type="checkbox" aria-label={`Select ${u.display_name}`} disabled={u.is_me} checked={picked.has(u.user_id)} onChange={() => togglePick(u.user_id)} />
                </td>
                <td className="who">
                  <Avatar name={u.display_name} />
                  <button type="button" className="ad-person" onClick={() => setOpenId(u.user_id)} aria-label={`Open details for ${u.display_name}`}>
                    <b>{u.display_name + (u.is_me ? ' (you)' : '')}</b>
                    <small>{u.username}</small>
                  </button>
                </td>
                <td data-label="Role">
                  <select
                    aria-label={`Role of ${u.display_name}`}
                    disabled={u.is_me}
                    title={u.is_me ? 'You cannot change your own role' : undefined}
                    value={u.role}
                    onChange={(e) => void setRole(u, e.target.value as Role)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {cap(r)}
                      </option>
                    ))}
                  </select>
                </td>
                <td data-label="Status">
                  <span className={`ad-badge ${u.is_active ? 'ok' : 'off'}`}>{u.is_active ? 'Active' : 'Deactivated'}</span>
                  {u.must_change_password && <small>Must set a new password</small>}
                </td>
                <td data-label="Two-step">
                  {u.mfa_required ? (
                    <span className={`ad-badge ${u.mfa_enrolled ? 'ok' : 'warn'}`}>{u.mfa_enrolled ? 'On' : 'Not set up'}</span>
                  ) : (
                    <span className="ad-badge off">Turned off</span>
                  )}
                </td>
                <td data-label="Last sign-in" title={when(u.last_sign_in_at)}>
                  {ago(u.last_sign_in_at)}
                </td>
                <td className="acts">
                  <RowMenu label={`More actions for ${u.display_name}`} items={actionsFor(u)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <UserDrawer db={db} user={open} actions={actionsFor(open)} onClose={() => setOpenId(null)} />}
      {adding && <AddUserDialog db={db} onClose={() => setAdding(false)} onCreated={() => void reload()} />}
    </>
  );
}
