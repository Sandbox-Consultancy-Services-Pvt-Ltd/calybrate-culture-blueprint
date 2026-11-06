import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { ActivityPane } from './ActivityPane';
import { AdminNav, TABS, type Tab } from './AdminNav';
import { AnnouncementsPane } from './AnnouncementsPane';
import { SettingsPane } from './SettingsPane';
import { BackupPane } from './BackupPane';
import { OverviewPane } from './OverviewPane';
import { StructurePane } from './StructurePane';
import { UsersPane } from './UsersPane';
import { listUsers } from './api';
import { AdminUiProvider, useAdminUi } from './ui';
import { attentionItems, type AdminUser, type StatusFilter } from './model';
import './admin.css';
import './admin-redesign.css';

const TAB_KEY = 'cb-admin-tab';

function initialTab(): Tab {
  try {
    const t = sessionStorage.getItem(TAB_KEY) as Tab | null;
    if (t && TABS.includes(t)) return t;
  } catch {
    /* ignore */
  }
  return 'overview';
}

/** Kept for the page's lifetime so coming back to Administration paints at once, then refreshes. */
let cachedUsers: AdminUser[] | null = null;

function Inner() {
  const db = supabase!;
  const { toast } = useAdminUi();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [users, setUsers] = useState<AdminUser[] | null>(cachedUsers);
  const [failed, setFailed] = useState(false);
  /** Where a dashboard shortcut sent us: which people to show, or to open the Add dialog. n remounts the pane. */
  const [preset, setPreset] = useState<{ status: StatusFilter; add: boolean; n: number }>({ status: 'all', add: false, n: 0 });

  const reload = useCallback(async () => {
    const r = await listUsers(db);
    if (!r.ok) {
      setFailed(true);
      return toast(r.message, true);
    }
    setFailed(false);
    cachedUsers = r.data.users ?? [];
    setUsers(cachedUsers);
  }, [db, toast]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const choose = (t: Tab, next?: { status?: StatusFilter; add?: boolean }) => {
    if (next || t === 'users') setPreset((p) => ({ status: next?.status ?? 'all', add: next?.add ?? false, n: p.n + 1 }));
    setTab(t);
    window.scrollTo({ top: 0 });
    try {
      sessionStorage.setItem(TAB_KEY, t);
    } catch {
      /* ignore */
    }
  };

  const needs = users ? attentionItems(users).length > 0 : false;

  return (
    <div id="viewAdmin" className="view-in">
      <div className="ad-shell">
        <AdminNav tab={tab} onChoose={(t) => choose(t)} counts={{ users: users?.length }} dots={{ overview: needs }} />
        <div className="ad-main">
          {failed && !users && (
            <p className="ad-err" role="alert">
              The user list could not be loaded.{' '}
              <button type="button" className="ad-lnk" onClick={() => void reload()}>
                Try again
              </button>
            </p>
          )}
          <div className="ad-pane" role="region" aria-label="Administration" data-pane={tab} id={`ad-${tab}`}>
            {tab === 'overview' && <OverviewPane db={db} users={users} go={choose} />}
            {tab === 'users' && (
              <UsersPane key={preset.n} db={db} users={users ?? []} loading={!users && !failed} reload={reload} initialStatus={preset.status} openAdd={preset.add} />
            )}
            {tab === 'activity' && <ActivityPane db={db} users={users ?? []} />}
            {tab === 'announcements' && <AnnouncementsPane db={db} openNew={preset.add} />}
            {tab === 'backup' && <BackupPane db={db} />}
            {tab === 'structure' && <StructurePane db={db} />}
            {tab === 'settings' && <SettingsPane db={db} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Admin-only. The database and the Edge Function re-check the role on every call. */
export function AdminView() {
  const { isAdmin } = useAuth();
  if (!supabase) {
    return (
      <div className="section" id="viewAdmin">
        <h2>Administration</h2>
        <p className="ad-help">Administration needs the shared database. Add the Supabase settings to turn it on.</p>
      </div>
    );
  }
  if (!isAdmin) return null;
  return (
    <AdminUiProvider>
      <Inner />
    </AdminUiProvider>
  );
}
