import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tab } from './AdminNav';
import { callRpc, getSettings, isMissingMigration, loadStructure, type Structure } from './api';
import { Icon, PageHeader, Skeleton, type IconName } from './ui';
import {
  OP,
  ROLES,
  TABLE_LABELS,
  activitySentence,
  ago,
  attentionItems,
  cap,
  dailyCounts,
  deltaPct,
  plural,
  tally,
  userStats,
  type AdminUser,
  type ChangeRow,
  type StatusFilter,
} from './model';

const DAYS = 14;
const LIMIT = 1000;
export const LAST_BACKUP_KEY = 'cb-last-backup';

type Go = (tab: Tab, next?: { status?: StatusFilter; add?: boolean }) => void;

function Kpi({ icon, label, value, hint, tone, loading, delta }: { icon: IconName; label: string; value: string | number; hint?: string; tone?: 'ok' | 'warn'; loading: boolean; delta?: number | null }) {
  return (
    <div className={`ad-kpi${tone ? ` ${tone}` : ''}`}>
      <span className="k">
        <Icon name={icon} size={15} /> {label}
      </span>
      {loading ? <Skeleton w={64} h={30} r={8} /> : <b>{value}</b>}
      {loading ? (
        <Skeleton w="70%" h={11} />
      ) : (
        (hint || delta != null) && (
          <small>
            {delta != null && <span className={`ad-delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`}>{delta > 0 ? `▲ ${delta}%` : delta < 0 ? `▼ ${Math.abs(delta)}%` : '● same'}</span>} {hint}
          </small>
        )
      )}
    </div>
  );
}

/** Horizontal bars; each bar is a share of the biggest value. */
function Bars({ items, empty }: { items: Array<[string, number]>; empty: string }) {
  const max = Math.max(1, ...items.map((i) => i[1]));
  if (!items.length) return <p className="ad-empty">{empty}</p>;
  return (
    <ul className="ad-bars">
      {items.map(([k, n]) => (
        <li key={k}>
          <span className="n">{k}</span>
          <span className="t">
            <i style={{ width: `${(n / max) * 100}%` }} />
          </span>
          <span className="v">{n}</span>
        </li>
      ))}
    </ul>
  );
}

function Panel({ title, sub, children, loading, rows = 4, wide, action }: { title: string; sub?: string; children: ReactNode; loading: boolean; rows?: number; wide?: boolean; action?: ReactNode }) {
  return (
    <section className={`ad-panel${wide ? ' wide' : ''}`}>
      <div className="ph">
        <div>
          <h3>{title}</h3>
          {sub && <p className="sub">{sub}</p>}
        </div>
        {action}
      </div>
      {loading ? (
        <div className="ad-sk-stack" role="status" aria-busy="true" aria-label={`Loading ${title}`}>
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={i} w={`${92 - i * 12}%`} h={14} />
          ))}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

type Health = 'ok' | 'warn' | 'bad';
function HealthRow({ label, state, text, action }: { label: string; state: Health | 'wait'; text: string; action?: ReactNode }) {
  return (
    <li className={`h-${state}`}>
      <span className="led" aria-hidden="true" />
      <span className="l">
        <b>{label}</b>
        <small>{text}</small>
      </span>
      {action}
    </li>
  );
}

export function OverviewPane({ db, users, go }: { db: SupabaseClient; users: AdminUser[] | null; go: Go }) {
  const [rows, setRows] = useState<ChangeRow[] | null>(null);
  const [logError, setLogError] = useState(false);
  const [structure, setStructure] = useState<Structure | null | undefined>(undefined);
  const [migration, setMigration] = useState<'wait' | 'ok' | 'missing' | 'bad'>('wait');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    // Twice the window, so the first half can be compared with the second.
    const from = new Date();
    from.setDate(from.getDate() - (DAYS * 2 - 1));
    from.setHours(0, 0, 0, 0);
    setRows(null);
    setLogError(false);
    setStructure(undefined);
    setMigration('wait');
    // All requests start together, so the page fills in as fast as the slowest one.
    void callRpc<ChangeRow[]>(db, 'admin_list_changes', { p_table: null, p_user: null, p_from: from.toISOString(), p_to: null, p_limit: LIMIT, p_offset: 0 }).then((r) => {
      if (!live) return;
      if (!r.ok) {
        setLogError(true);
        setRows([]);
      } else setRows(r.data ?? []);
    });
    void loadStructure(db).then((s) => live && setStructure(s));
    void getSettings(db).then((r) => live && setMigration(r.ok ? 'ok' : isMissingMigration(r.message) ? 'missing' : 'bad'));
    return () => {
      live = false;
    };
  }, [db, tick]);
  const retry = useCallback(() => setTick((t) => t + 1), []);

  const us = useMemo(() => (users ? userStats(users) : null), [users]);
  const attention = useMemo(() => (users ? attentionItems(users) : []), [users]);
  const all = useMemo(() => rows ?? [], [rows]);
  const cut = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - (DAYS - 1));
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);
  const recent = useMemo(() => all.filter((r) => Date.parse(r.occurred_at) >= cut), [all, cut]);
  const earlier = all.length - recent.length;
  const days = useMemo(() => dailyCounts(recent, DAYS), [recent]);
  const peak = Math.max(1, ...days.map((d) => d.n));
  const byType = useMemo(() => tally(recent, (r) => TABLE_LABELS[r.table_name] ?? r.table_name).slice(0, 6), [recent]);
  const byPerson = useMemo(() => tally(recent, (r) => r.changed_by_name || 'Unknown').slice(0, 6), [recent]);
  const byAction = useMemo(() => tally(recent, (r) => OP[r.operation][0]), [recent]);
  const outcomes = structure ? Object.values(structure.counts.areas).reduce((a, b) => a + b, 0) : 0;
  const lu = !us;
  const ll = rows === null;
  const stale = users ? users.filter((x) => x.is_active && x.last_sign_in_at && Date.now() - Date.parse(x.last_sign_in_at) > 60 * 86_400_000).slice(0, 3) : [];
  const lastBackup = (() => {
    try {
      return localStorage.getItem(LAST_BACKUP_KEY);
    } catch {
      return null;
    }
  })();
  const backupDays = lastBackup ? Math.floor((Date.now() - Date.parse(lastBackup)) / 86_400_000) : null;

  const quick: Array<[IconName, string, () => void]> = [
    ['plus', 'Add a user', () => go('users', { add: true })],
    ['megaphone', 'New announcement', () => go('announcements', { add: true })],
    ['download', 'Download a backup', () => go('backup')],
    ['activity', 'See recent activity', () => go('activity')],
  ];

  return (
    <div className="ad-over">
      <PageHeader title="Dashboard" sub="How the app is being used, and what needs your attention." />

      <div className="ad-quick" aria-label="Quick actions">
        {quick.map(([icon, label, run]) => (
          <button key={label} type="button" onClick={run}>
            <span className="ico">
              <Icon name={icon} />
            </span>
            {label}
          </button>
        ))}
      </div>

      <div className="ad-kpis">
        <Kpi icon="users" label="Active users" value={us?.active ?? 0} hint={us ? `${us.inactive} deactivated · ${us.total} in total` : undefined} loading={lu} />
        <Kpi
          icon="shield"
          label="Two-step coverage"
          value={`${us?.mfaPct ?? 0}%`}
          hint={
            us
              ? us.mfaOff
                ? `${plural(us.mfaOff, 'person', 'people')} still to set up`
                : us.mfaExempt
                  ? `${us.mfaExempt} with two-step turned off`
                  : 'Everyone is covered'
              : undefined
          }
          tone={us ? (us.mfaOff ? 'warn' : 'ok') : undefined}
          loading={lu}
        />
        <Kpi icon="clock" label="Signed in this week" value={us?.signedIn7d ?? 0} hint={us ? `${us.neverSignedIn} never signed in` : undefined} loading={lu} />
        <Kpi
          icon="activity"
          label={`Changes, last ${DAYS} days`}
          value={logError ? '–' : recent.length}
          hint={logError ? 'Activity could not be loaded' : `${plural(byPerson.length, 'person', 'people')} made changes`}
          delta={logError ? null : deltaPct(recent.length, earlier)}
          loading={ll}
        />
        <Kpi
          icon="structure"
          label="Outcomes tracked"
          value={structure ? outcomes : '–'}
          hint={
            structure
              ? `${structure.pillars.filter((p) => p.is_active).length} pillars · ${structure.areas.filter((a) => a.is_active).length} areas`
              : structure === null
                ? 'Could not be loaded'
                : undefined
          }
          loading={structure === undefined}
        />
      </div>

      <div className="ad-grid">
        <Panel title="Needs attention" sub={attention.length || stale.length ? 'Click an item to see the people involved' : undefined} loading={lu} rows={3}>
          {us && (
            <ul className="ad-attn">
              {attention.map((a) => (
                <li key={a.key}>
                  <span className="ico warn">
                    <Icon name="alert" size={16} />
                  </span>
                  <span className="t">{a.text}</span>
                  <button type="button" className="ad-lnk" onClick={() => go('users', { status: a.key })}>
                    Review
                  </button>
                </li>
              ))}
              {stale.map((x) => (
                <li key={x.user_id}>
                  <span className="ico">
                    <Icon name="clock" size={16} />
                  </span>
                  <span className="t">
                    {x.display_name} last signed in {ago(x.last_sign_in_at)}.
                  </span>
                  <button type="button" className="ad-lnk" onClick={() => go('users')}>
                    View
                  </button>
                </li>
              ))}
              {!attention.length && !stale.length && (
                <li className="good">
                  <span className="ico ok">
                    <Icon name="check" size={16} />
                  </span>
                  <span className="t">Nothing needs attention.</span>
                </li>
              )}
            </ul>
          )}
        </Panel>

        <Panel
          title="Recent activity"
          sub="Latest changes by anyone"
          loading={ll}
          rows={5}
          action={
            <button type="button" className="ad-lnk" onClick={() => go('activity')}>
              View all
            </button>
          }
        >
          {logError ? (
            <p className="ad-err">The activity log could not be loaded.</p>
          ) : !all.length ? (
            <p className="ad-empty">No changes yet.</p>
          ) : (
            <ul className="ad-feed">
              {all.slice(0, 8).map((r, i) => (
                <li key={i}>
                  <span className="t">{activitySentence(r)}</span>
                  <small>{ago(r.occurred_at)}</small>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Activity, last ${DAYS} days`} sub="Changes made each day" loading={ll} rows={5} wide>
          {logError ? (
            <p className="ad-err">The activity log could not be loaded.</p>
          ) : (
            <div className="ad-chart" role="img" aria-label={`Changes per day over the last ${DAYS} days. Busiest day had ${peak}.`}>
              {days.map((d) => (
                <div key={d.day} className="col" title={`${d.day}: ${plural(d.n, 'change', 'changes')}`}>
                  <span className="v">{d.n || ''}</span>
                  <i style={{ height: `${Math.max(d.n ? 6 : 2, (d.n / peak) * 100)}%` }} className={d.n ? '' : 'z'} />
                  <span className="d">{Number(d.day.slice(8))}</span>
                </div>
              ))}
            </div>
          )}
          {!logError && rows && rows.length >= LIMIT && <p className="ad-help">Based on the latest {LIMIT} changes.</p>}
        </Panel>

        <Panel title="People by role" sub="Active accounts" loading={lu} rows={3}>
          <Bars items={ROLES.map((r) => [cap(r), us?.byRole[r] ?? 0] as [string, number])} empty="No users yet." />
        </Panel>

        <Panel title="What changed" sub="By type" loading={ll}>
          <Bars items={byType} empty="No changes in this period." />
        </Panel>

        <Panel title="Who is making changes" sub="Most active first" loading={ll}>
          <Bars items={byPerson} empty="No changes in this period." />
        </Panel>

        <Panel title="Kind of change" loading={ll} rows={3}>
          <Bars items={byAction} empty="No changes in this period." />
        </Panel>

        <Panel
          title="System health"
          sub="Quick checks"
          loading={false}
          action={
            <button type="button" className="ad-lnk" onClick={retry}>
              Check again
            </button>
          }
        >
          <ul className="ad-health">
            <HealthRow label="Database" state={rows === null ? 'wait' : logError ? 'bad' : 'ok'} text={rows === null ? 'Checking…' : logError ? 'The activity log could not be read.' : 'Connected.'} />
            <HealthRow label="User service" state={users ? 'ok' : 'wait'} text={users ? 'The user list loaded.' : 'Checking…'} />
            <HealthRow
              label="Backup"
              state={backupDays == null ? 'warn' : backupDays > 30 ? 'warn' : 'ok'}
              text={backupDays == null ? 'No backup downloaded from this browser yet.' : backupDays === 0 ? 'Downloaded today.' : `Last downloaded ${plural(backupDays, 'day', 'days')} ago.`}
              action={
                backupDays == null || backupDays > 30 ? (
                  <button type="button" className="ad-lnk" onClick={() => go('backup')}>
                    Back up
                  </button>
                ) : undefined
              }
            />
            <HealthRow
              label="Announcements and settings"
              state={migration === 'wait' ? 'wait' : migration === 'ok' ? 'ok' : migration === 'missing' ? 'warn' : 'bad'}
              text={migration === 'wait' ? 'Checking…' : migration === 'ok' ? 'Switched on.' : migration === 'missing' ? 'Run migration 0017 to switch them on.' : 'Could not be checked.'}
            />
          </ul>
        </Panel>
      </div>
    </div>
  );
}
