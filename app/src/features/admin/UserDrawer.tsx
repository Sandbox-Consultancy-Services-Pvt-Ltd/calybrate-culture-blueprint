import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { callRpc } from './api';
import { activityPhrase, ago, cap, ROLE_INFO, when, type AdminUser, type ChangeRow } from './model';
import { Avatar, Icon, Skeleton, type MenuItem } from './ui';

/** Side panel with everything about one person and what they changed lately. */
export function UserDrawer({ db, user, actions, onClose }: { db: SupabaseClient; user: AdminUser; actions: MenuItem[]; onClose: () => void }) {
  const [rows, setRows] = useState<ChangeRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  useEffect(() => {
    let live = true;
    setRows(null);
    setFailed(false);
    void callRpc<ChangeRow[]>(db, 'admin_list_changes', { p_table: null, p_user: user.user_id, p_from: null, p_to: null, p_limit: 20, p_offset: 0 }).then((r) => {
      if (!live) return;
      if (!r.ok) setFailed(true);
      setRows(r.ok ? (r.data ?? []) : []);
    });
    return () => {
      live = false;
    };
  }, [db, user.user_id]);

  const twoStep = user.mfa_required ? (user.mfa_enrolled ? 'On' : 'Not set up yet') : 'Turned off';
  const facts: Array<[string, string]> = [
    ['Username', user.username],
    ['Role', cap(user.role)],
    ['Status', user.is_active ? 'Active' : 'Deactivated'],
    ['Two-step', twoStep],
    ['Last sign-in', user.last_sign_in_at ? `${when(user.last_sign_in_at)} (${ago(user.last_sign_in_at)})` : 'Never'],
    ['Password', user.must_change_password ? 'Must choose a new one' : 'Chosen by the person'],
  ];

  return (
    <div className="ad-drawer-wrap">
      <div className="ad-backdrop" onClick={onClose} />
      <aside className="ad-drawer" role="dialog" aria-modal="true" aria-label={`Details for ${user.display_name}`}>
        <header>
          <Avatar name={user.display_name} size={52} />
          <div className="who">
            <h2>{user.display_name + (user.is_me ? ' (you)' : '')}</h2>
            <span className={`ad-badge ${user.is_active ? 'ok' : 'off'}`}>{user.is_active ? 'Active' : 'Deactivated'}</span>
          </div>
          <button type="button" className="ad-iconbtn" aria-label="Close details" onClick={onClose}>
            <Icon name="x" />
          </button>
        </header>
        <div className="body">
          <p className="ad-help">{ROLE_INFO[user.role]}</p>
          <dl className="ad-facts">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <h3>Actions</h3>
          <div className="ad-dacts">
            {actions
              .filter((a) => !a.hidden)
              .map((a) => (
                <button key={a.label} type="button" className={`ad-lnk${a.danger ? ' danger' : ''}`} onClick={a.onSelect}>
                  {a.label}
                </button>
              ))}
          </div>
          <h3>Recent changes by {user.display_name.split(' ')[0]}</h3>
          {!rows && (
            <div className="ad-sk-stack" role="status" aria-busy="true" aria-label="Loading recent changes">
              <Skeleton w="90%" />
              <Skeleton w="75%" />
              <Skeleton w="82%" />
            </div>
          )}
          {failed && <p className="ad-err">Recent changes could not be loaded.</p>}
          {rows && !failed && !rows.length && <p className="ad-empty">No changes made yet.</p>}
          {!!rows?.length && (
            <ul className="ad-feed">
              {rows.map((r, i) => (
                <li key={i}>
                  <span className="t">{activityPhrase(r)}</span>
                  <small>{ago(r.occurred_at)}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
