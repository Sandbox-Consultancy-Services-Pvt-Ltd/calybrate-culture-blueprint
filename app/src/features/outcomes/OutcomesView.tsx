import { logAccess } from '../../lib/accessLog';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { askConfirm } from '../../lib/dialog';
import { LS_COLLAPSED, LS_HOW } from './data';
import { takeOutcomesFocus } from './focus';
import { OutcomeEditor, type EditTarget } from './OutcomeEditor';
import { useOutcomes, type OutcomesApi } from './useOutcomes';
import {
  STATUSES,
  activePillars,
  boxMatches,
  buildCsv,
  buildTemplateCsv,
  flatItems,
  groupsOf,
  hasContent,
  inkOn,
  itemsOf,
  leavesOf,
  planImport,
  plural,
  statusOf,
  tint,
  totalsOf,
  type Doc,
  type Filter,
  type Leaf,
  type Pillar,
  type StatusId,
} from './model';
import { useCssZoom } from '../../app/zoom';
import './outcomes.css';

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) || 'null') as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function Hero({ api }: { api: OutcomesApi }) {
  const t = totalsOf(api.meta, api.docs);
  return (
    <section className="hero">
      <div className="hero-in">
        <div>
          <div className="eyebrow">Calybrate Blueprint</div>
          <h1>Performance Outcomes</h1>
          <p>The measurable outcomes the organisation expects from every area of the organisation, set against each CCT pillar.</p>
        </div>
        <div className="stats" id="ox-hero-stats" aria-label="Summary">
          <div className="stat" title="Boxes that have at least one outcome">
            <b>
              {t.filled} / {t.boxes}
            </b>
            <span>boxes filled</span>
          </div>
          <div className="stat">
            <b>{t.count}</b>
            <span>{t.count === 1 ? 'outcome' : 'outcomes'}</span>
            <span className="ox-sd" aria-label="Outcomes by status">
              {STATUSES.map((s) => (
                <span key={s.id} title={s.label}>
                  <i style={{ background: s.color }} />
                  {t.by[s.id]}
                </span>
              ))}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Guide() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(LS_HOW) === '1';
    } catch {
      return false;
    }
  });
  if (hidden) return <div className="ox-how" id="ox-how" hidden />;
  const step = (n: number, title: string, text: string) => (
    <li>
      <b>{n}</b>
      <span>
        <strong>{title}</strong> {text}
      </span>
    </li>
  );
  return (
    <div className="ox-how" id="ox-how">
      <div className="ox-how-t">
        <strong>How this page works</strong>
        <button
          type="button"
          className="ox-lnk"
          onClick={() => {
            try {
              localStorage.setItem(LS_HOW, '1');
            } catch {
              /* ignore */
            }
            setHidden(true);
          }}
        >
          Hide
        </button>
      </div>
      <ol>
        {step(1, 'Find the area', '(a row) and the pillar (a column). Each box is one promise.')}
        {step(2, 'Write the promise', 'for that box.')}
        {step(3, 'Add standards', 'that help deliver the promise.')}
        {step(4, 'Add outcomes', 'under each standard. Record the current level and keep the status up to date.')}
      </ol>
    </div>
  );
}

function download(csv: string, name = 'blueprint-cct-outcomes.csv') {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

interface CellProps {
  api: OutcomesApi;
  leaf: Leaf;
  p: Pillar;
  doc: Doc | undefined;
  matches: boolean;
  open: (t: EditTarget, trigger: HTMLElement) => void;
}

function Cell({ api, leaf, p, doc, matches, open }: CellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const ready = !!api.mode;
  const title = `${leaf.areaName ? `${leaf.areaName}, ` : ''}${leaf.name}, ${p.name}`;
  const items = flatItems(doc);
  const filled = hasContent(doc);
  const nStd = doc?.standards.length ?? 0;

  return (
    <div
      ref={ref}
      className={`cell${filled ? ' has' : ''}${matches ? '' : ' dim'}`}
      data-leaf={leaf.code}
      data-p={p.code}
      style={{ '--pc': p.color, '--pt': tint(p.color, 0.12) } as CSSProperties}
      onClick={(e) => {
        if (ready && !(e.target as HTMLElement).closest('button,input,form')) open({ leaf, p }, ref.current!);
      }}
    >
      <div className="cell-top">
        <span className="cell-pillar">
          <i className="sw" style={{ background: p.color }} />
          {p.name}
        </span>
        <button
          type="button"
          className="cell-open"
          aria-label={`Open ${title} (${plural(nStd, 'standard', 'standards')}, ${plural(items.length, 'outcome', 'outcomes')})`}
          disabled={!ready}
          onClick={(e) => {
            e.stopPropagation();
            open({ leaf, p }, e.currentTarget);
          }}
        >
          {filled ? 'Edit' : api.canWrite ? 'Set up' : 'Open'}
        </button>
      </div>
      {!api.loaded && !api.timedOut ? (
        <span className="empty">Loading…</span>
      ) : (
        <>
          {!filled && <p className="empty">No promise yet.{api.canWrite ? ' Open the box to write it.' : ''}</p>}
          {filled && (
            <p className="o-promise">
              {doc?.promise ? doc.promise : <i>No promise written yet</i>}
            </p>
          )}
          {filled && (
            <p className="o-count">
              {plural(nStd, 'standard', 'standards')} · {plural(items.length, 'outcome', 'outcomes')}
            </p>
          )}
          {items.slice(0, 3).map((it) => {
            const s = statusOf(it.status);
            const meta = [it.target && `Target ${it.target}`, it.current && `Now ${it.current}`].filter(Boolean);
            return (
              <button
                key={it.id}
                type="button"
                className="o"
                title={s.label}
                disabled={!ready}
                onClick={(e) => {
                  e.stopPropagation();
                  open({ leaf, p, focusItemId: it.id }, e.currentTarget);
                }}
              >
                <i className="o-dot" style={{ background: s.color }} aria-hidden="true" />
                <span className="o-body">
                  <span className="o-text">{it.text || '(no description)'}</span>
                  {meta.length > 0 && <span className="o-meta">{meta.join(' · ')}</span>}
                </span>
                <span className="o-st">{s.label}</span>
              </button>
            );
          })}
          {items.length > 3 && (
            <button
              type="button"
              className="more"
              onClick={(e) => {
                e.stopPropagation();
                open({ leaf, p }, e.currentTarget);
              }}
            >
              +{items.length - 3} more
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function OutcomesView() {
  const api = useOutcomes();
  const { meta, docs } = api;
  const [filter, setFilter] = useState<Filter>({ status: null, onlyEmpty: false });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => readJson(LS_COLLAPSED, {}));
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuDo = (fn: () => void) => {
    setMenuOpen(false);
    fn();
  };
  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [menuOpen]);
  useCssZoom(mainRef);

  const P = useMemo(() => activePillars(meta), [meta]);
  const groups = useMemo(() => groupsOf(meta), [meta]);
  const leafCount = useMemo(() => leavesOf(meta).length, [meta]);
  const totals = totalsOf(meta, docs);

  // Arriving from the CCT Framework page: scroll to the area and open the requested box.
  useEffect(() => {
    if (!api.loaded) return;
    const req = takeOutcomesFocus();
    if (!req) return;
    // A parent area (e.g. Administration) opens its first sub-area.
    const leaf = leavesOf(meta).find((l) => l.code === req.area) ?? groupsOf(meta).find((g) => g.area.code === req.area)?.rows[0];
    const cell = document.querySelector<HTMLElement>(`.cell[data-leaf="${leaf?.code}"]${req.pillar ? `[data-p="${req.pillar}"]` : ''}`);
    if (!leaf || !cell) return;
    cell.scrollIntoView({ block: 'center' });
    const p = P.find((x) => x.code === req.pillar);
    if (p) open({ leaf, p }, cell);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.loaded]);

  const saveCollapsed = (c: Record<string, boolean>) => {
    setCollapsed(c);
    try {
      localStorage.setItem(LS_COLLAPSED, JSON.stringify(c));
    } catch {
      /* ignore */
    }
  };
  const open = useCallback((t: EditTarget, el: HTMLElement) => {
    trigger.current = el;
    setEditing(t);
  }, []);
  const close = useCallback(() => {
    setEditing(null);
    const t = trigger.current;
    if (t && document.body.contains(t)) t.focus();
    trigger.current = null;
  }, []);

  function exportCsv() {
    const csv = buildCsv(meta, docs);
    if (!csv) return api.say('Nothing to export yet. Add outcomes first.', true);
    if (!api.canExport) return api.say('Your role cannot export.', true);
    try {
      logAccess('export_csv', 'outcomes');
      download(csv);
      api.say('Export ready');
    } catch {
      api.say('Export is not available here.', true);
    }
  }

  function downloadTemplate() {
    try {
      download(buildTemplateCsv(meta), 'blueprint-cct-outcomes-template.csv');
      api.say('Template downloaded');
    } catch {
      api.say('Download is not available here.', true);
    }
  }

  async function importCsv(file: File) {
    let plan: ReturnType<typeof planImport>;
    try {
      plan = planImport(meta, docs, await file.text());
    } catch {
      return api.say('Could not read that file.', true);
    }
    const skipped = plan.errors.length;
    if (!plan.added) {
      const why = plan.errors[0] ?? (plan.duplicates ? 'Every outcome in the file is already here.' : 'No outcomes found in the file.');
      return api.say(`Nothing imported. ${why}`, true);
    }
    const points = [`${plural(plan.added, 'new outcome', 'new outcomes')} across ${plural(plan.cells.length, 'box', 'boxes')}.`, 'Existing outcomes are kept; the new ones are added to them.'];
    if (plan.duplicates) points.push(`${plural(plan.duplicates, 'row is', 'rows are')} already here and will be skipped.`);
    if (skipped) points.push(`${plural(skipped, 'row has', 'rows have')} a problem and will be skipped.`);
    const go = await askConfirm({
      title: `Import ${plural(plan.added, 'outcome', 'outcomes')}?`,
      text: `This adds to the shared Outcomes table that everyone sees. You cannot undo it in one step.`,
      points,
      confirmLabel: 'Import',
      tone: 'warn',
    });
    if (!go) return;
    setImporting(true);
    api.setBusy(true);
    try {
      let added = 0;
      let failed = 0;
      for (const c of plan.cells) {
        try {
          const res = await api.persist(c.leaf, c.pillar, c.promise, c.standards);
          if (res.ok) added += c.added;
          else failed++;
        } catch (e) {
          failed++;
          api.handleSaveError(e);
          if (e instanceof Error && 'code' in e && (e.code === 401 || e.code === 403)) break;
        }
      }
      const parts = [`${plural(added, 'outcome', 'outcomes')} imported`];
      if (plan.duplicates) parts.push(`${plan.duplicates} already there`);
      if (skipped) parts.push(`${skipped} row${skipped > 1 ? 's' : ''} skipped (${plan.errors[0]})`);
      if (failed) parts.push(`${failed} box${failed > 1 ? 'es' : ''} not saved`);
      api.say(parts.join(' · '), failed > 0 || (skipped > 0 && !added));
    } catch {
      api.say('Could not read that file.', true);
    } finally {
      api.setBusy(false);
      setImporting(false);
    }
  }

  const chip = (label: string, id: StatusId | null, color: string | null, n: number) => {
    const on = filter.status === id;
    return (
      <button
        key={label}
        type="button"
        className={`ox-chip${on ? ' on' : ''}`}
        aria-pressed={on}
        onClick={() => setFilter((f) => ({ ...f, status: on ? null : id }))}
      >
        {color && <i style={{ background: color }} />}
        {label}
        <em>{n}</em>
      </button>
    );
  };

  let shown = 0;

  return (
    <div id="viewOutcomes" className="view-in" data-print-root="portrait">
      <Hero api={api} />

      <div className="section ox-main" ref={mainRef}>
        <div id="ox-banner">
          {api.timedOut && !api.loaded && (
            <p className="ox-banner">
              <strong>Still connecting. </strong>The outcomes shown may be out of date.
            </p>
          )}
        </div>
        <Guide />

        <div className="ox-toolbar" id="ox-toolbar">
          <div className="ox-chips" role="group" aria-label="Filter by status">
            {chip('All', null, null, totals.count)}
            {STATUSES.map((s) => chip(s.label, s.id, s.color, totals.by[s.id]))}
          </div>
          <label className="ox-check">
            <input type="checkbox" checked={filter.onlyEmpty} onChange={(e) => setFilter((f) => ({ ...f, onlyEmpty: e.target.checked }))} /> Show only empty boxes
          </label>
          <div className="ox-tb-r" ref={menuRef}>
            {api.canWrite && !!api.mode && (
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                data-testid="ox-import-file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void importCsv(f);
                }}
              />
            )}
            {api.canExport && (
              <button type="button" className="ox-btn ox-ghost small" id="ox-export" onClick={exportCsv}>
                Export CSV
              </button>
            )}
            <button
              type="button"
              className="ox-btn ox-ghost small ox-ico ox-more-btn"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="More actions"
              title="More actions"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
            {menuOpen && (
              <div className="ox-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => menuDo(() => saveCollapsed(Object.fromEntries(groups.map((g) => [g.area.code, true]))))}>
                  Collapse all
                </button>
                <button type="button" role="menuitem" onClick={() => menuDo(() => saveCollapsed({}))}>
                  Expand all
                </button>
                {meta.canManage && (
                  <button
                    type="button"
                    role="menuitem"
                    id="ox-manage"
                    onClick={() =>
                      menuDo(() => {
                        try {
                          sessionStorage.setItem('cb-admin-tab', 'structure');
                        } catch {
                          /* ignore */
                        }
                        location.hash = '#admin';
                      })
                    }
                  >
                    Manage pillars
                  </button>
                )}
                {api.canWrite && !!api.mode && (
                  <>
                    <hr />
                    <button
                      type="button"
                      role="menuitem"
                      id="ox-import"
                      disabled={importing}
                      title="Add outcomes from a CSV file (same columns as Export CSV). Existing outcomes are kept."
                      onClick={() => menuDo(() => fileRef.current?.click())}
                    >
                      {importing ? 'Importing…' : 'Import CSV'}
                    </button>
                    <button type="button" role="menuitem" id="ox-template" title="A blank CSV with the right columns and example rows" onClick={() => menuDo(downloadTemplate)}>
                      Download import template
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className={`matrix${P.length > 4 ? ' wide' : ''}`} id="ox-matrix" style={{ '--ox-n': Math.max(P.length, 1) } as CSSProperties}>
          {!P.length ? (
            <p className="ox-empty-all">There are no active pillars yet. Use “Manage pillars” to add one.</p>
          ) : (
            <>
              <div className="mx-head" aria-hidden="true">
                <div className="corner">Area</div>
                <div className="ox-cells">
                  {P.map((p) => {
                    const rows = leavesOf(meta).filter((l) => hasContent(docs[`${l.code}__${p.code}`])).length;
                    return (
                      <div key={p.code} className="ph" style={{ background: p.color, color: inkOn(p.color) }}>
                        <b>{p.name}</b>
                        <span>
                          {rows} of {leafCount} rows defined
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {groups.map((g) => {
                const isCollapsed = !!collapsed[g.area.code];
                const total = g.rows.length * P.length;
                let done = 0;
                const dots: Partial<Record<StatusId, number>> = {};
                for (const r of g.rows)
                  for (const p of P) {
                    const it = itemsOf(docs, r.code, p.code);
                    if (hasContent(docs[`${r.code}__${p.code}`])) done++;
                    for (const x of it) dots[statusOf(x.status).id] = (dots[statusOf(x.status).id] ?? 0) + 1;
                  }
                return (
                  <section key={g.area.code} className={`ox-area${isCollapsed ? ' collapsed' : ''}`} aria-label={g.area.name}>
                    <div className="area-label">
                      <button
                        type="button"
                        className="ox-area-toggle"
                        aria-expanded={!isCollapsed}
                        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${g.area.name}`}
                        onClick={() => saveCollapsed({ ...collapsed, [g.area.code]: !isCollapsed })}
                      >
                        <span className="ox-chev" aria-hidden="true">
                          {isCollapsed ? '▸' : '▾'}
                        </span>
                        <span className="area-kicker">{g.rows.length > 1 || g.rows[0].tag ? `Area · ${g.rows.length} sub-areas` : 'Area'}</span>
                        <h3 className="area-title">{g.area.name}</h3>
                      </button>
                      <p className="area-meta">
                        {done} of {total} boxes filled
                      </p>
                      <span className="ox-dots">
                        {STATUSES.filter((s) => dots[s.id]).map((s) => (
                          <span key={s.id} title={`${s.label}: ${dots[s.id]}`}>
                            <i style={{ background: s.color }} />
                            {dots[s.id]}
                          </span>
                        ))}
                      </span>
                    </div>
                    <div className="area-body">
                      {g.rows.map((r) => (
                        <div className="subrow" key={r.code}>
                          {r.tag && (
                            <span className="sub-tag">
                              <i aria-hidden="true" />
                              {r.tag}
                            </span>
                          )}
                          <div className="ox-cells">
                            {P.map((p) => {
                              const doc = docs[`${r.code}__${p.code}`];
                              const ok = boxMatches(doc, filter);
                              if (ok) shown++;
                              return <Cell key={p.code} api={api} leaf={r} p={p} doc={doc} matches={ok} open={open} />;
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
              {(filter.status || filter.onlyEmpty) && !shown && (
                <p className="ox-empty-all">No box matches this filter. Clear the filter to see everything.</p>
              )}
            </>
          )}
        </div>
      </div>

      {editing && (
        <OutcomeEditor
          key={`${editing.leaf.code}__${editing.p.code}`}
          api={api}
          target={editing}
          onClose={close}
          onSwitch={(t) => setEditing(t)}
        />
      )}
      <div className={`ox-toast${api.toast ? ' on' : ''}${api.toast?.err ? ' err' : ''}`} id="ox-toast" role="status" aria-live="polite">
        {api.toast?.msg}
      </div>
    </div>
  );
}
