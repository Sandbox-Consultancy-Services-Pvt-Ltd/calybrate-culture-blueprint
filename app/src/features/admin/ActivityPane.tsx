import { Fragment, useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logAccess } from '../../lib/accessLog';
import { callRpc, download } from './api';
import { PageHeader, TableSkeleton, useAdminUi } from './ui';
import { OP, TABLE_LABELS, activityCsv, diffRows, logArgs, plural, summary, when, type AdminUser, type ChangeRow, type LogFilter } from './model';

const PAGE = 50;

function Row({ row }: { row: ChangeRow }) {
  const [open, setOpen] = useState(false);
  const d = diffRows(row);
  const [label, tone] = OP[row.operation];
  return (
    <>
      <tr>
        <td>{when(row.occurred_at)}</td>
        <td>{row.changed_by_name}</td>
        <td>
          <span className={`ad-badge ${tone}`}>{label}</span> {summary(row)}
        </td>
        <td>
          <button type="button" className="ad-lnk" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide' : 'Details'}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="detail">
          <td colSpan={4}>
            {d.length ? (
              <table className="ad-diff">
                <thead>
                  <tr>
                    {['Field', 'Before', 'After'].map((t) => (
                      <th key={t}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.map((x) => (
                    <tr key={x[0]}>
                      <td>{x[0]}</td>
                      <td>{x[1]}</td>
                      <td>{x[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <em>No field changes recorded.</em>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

interface AccessRow {
  id: number;
  occurred_at: string;
  user_name: string;
  action: string;
  detail: string | null;
}
const ACTION_LABEL: Record<string, string> = {
  export_csv: 'Exported a CSV',
  print: 'Printed / saved as PDF',
  backup: 'Downloaded a backup',
  document_open: 'Opened a document',
  activity_export: 'Exported the activity log',
};

/** Who took data out of the app (needs migration 0018; shows nothing if it is not applied yet). */
function AccessLog({ db }: { db: SupabaseClient }) {
  const [rows, setRows] = useState<AccessRow[] | null>(null);
  useEffect(() => {
    let live = true;
    void callRpc<AccessRow[]>(db, 'admin_list_access', { p_limit: 50, p_offset: 0 }).then((r) => live && setRows(r.ok ? (r.data ?? []) : null));
    return () => {
      live = false;
    };
  }, [db]);
  if (!rows) return null;
  return (
    <section aria-label="Exports and downloads" style={{ marginTop: 28 }}>
      <h3>Exports and downloads</h3>
      {!rows.length ? (
        <p className="ad-empty">Nobody has exported, printed or opened a document yet.</p>
      ) : (
        <div className="ad-scroll">
          <table className="ad-table">
            <thead>
              <tr>
                {['When', 'Who', 'What'].map((t) => (
                  <th key={t}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{when(r.occurred_at)}</td>
                  <td>{r.user_name}</td>
                  <td>
                    {ACTION_LABEL[r.action] ?? r.action}
                    {r.detail ? ` · ${r.detail}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ActivityPane({ db, users }: { db: SupabaseClient; users: AdminUser[] }) {
  const { toast } = useAdminUi();
  const [draft, setDraft] = useState<LogFilter>({});
  const [filter, setFilter] = useState<LogFilter>({});
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<ChangeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const r = await callRpc<ChangeRow[]>(db, 'admin_list_changes', logArgs(filter, PAGE, page * PAGE));
    if (!r.ok) {
      setError(r.message);
      setRows([]);
    } else {
      setError(null);
      setRows(r.data ?? []);
    }
  }, [db, filter, page]);
  useEffect(() => {
    void load();
  }, [load]);

  const apply = (f: LogFilter) => {
    setFilter(f);
    setPage(0);
  };
  const total = rows?.length ? Number(rows[0].total_count) : 0;

  async function exportLog() {
    const r = await callRpc<ChangeRow[]>(db, 'admin_list_changes', logArgs(filter, 500, 0));
    if (!r.ok) return toast(r.message, true);
    const data = r.data ?? [];
    logAccess('activity_export', `${data.length} rows`);
    download(`culture-blueprint-activity-${new Date().toISOString().slice(0, 10)}.csv`, activityCsv(data), 'text/csv;charset=utf-8');
    toast(`Exported ${plural(data.length, 'change', 'changes')}${data.length >= 500 ? ' (the latest 500; narrow the dates for more)' : ''}`);
  }

  return (
    <>
      <PageHeader title="Activity" sub="Every change to outcomes, the Safeguard Map, SOP status, pillars, areas, settings and user accounts, with who made it and when." />
      <div className="ad-filters">
        <label>
          Type
          <select id="al-table" aria-label="Type of change" value={draft.table ?? ''} onChange={(e) => setDraft({ ...draft, table: e.target.value })}>
            <option value="">Everything</option>
            {Object.entries(TABLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Person
          <select id="al-user" aria-label="Person" value={draft.user ?? ''} onChange={(e) => setDraft({ ...draft, user: e.target.value })}>
            <option value="">Everyone</option>
            {users.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.display_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input type="date" id="al-from" aria-label="From date" value={draft.from ?? ''} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        </label>
        <label>
          To
          <input type="date" id="al-to" aria-label="To date" value={draft.to ?? ''} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        </label>
        <button type="button" className="ad-btn primary small" id="al-apply" onClick={() => apply(draft)}>
          Apply
        </button>
        <button
          type="button"
          className="ad-btn outline small"
          onClick={() => {
            setDraft({});
            apply({});
          }}
        >
          Clear
        </button>
        <button type="button" className="ad-btn outline small" id="al-export" onClick={() => void exportLog()}>
          Export CSV
        </button>
      </div>
      <div id="ad-log-out">
        {!rows && <TableSkeleton cols={4} rows={8} label="Loading activity" />}
        {error && (
          <p className="ad-err" role="alert">
            {error}
          </p>
        )}
        {!error && rows && !rows.length && <p className="ad-empty">No changes match these filters.</p>}
        {!error && rows && rows.length > 0 && (
          <Fragment>
            <div className="ad-scroll">
              <table className="ad-table">
                <thead>
                  <tr>
                    {['When', 'Who', 'What', ''].map((t, i) => (
                      <th key={i}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <Row key={`${page}-${i}`} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ad-pager">
              <span>
                Showing {page * PAGE + 1}–{page * PAGE + rows.length} of {total}
              </span>
              <button type="button" className="ad-btn outline small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Newer
              </button>
              <button type="button" className="ad-btn outline small" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>
                Older
              </button>
            </div>
          </Fragment>
        )}
      </div>
      <AccessLog db={db} />
    </>
  );
}
