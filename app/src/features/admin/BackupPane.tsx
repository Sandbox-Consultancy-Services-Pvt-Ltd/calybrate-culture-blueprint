import { useRef, useState, type ChangeEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logAccess } from '../../lib/accessLog';
import { callRpc, download } from './api';
import { PageHeader, useAdminUi } from './ui';
import { canRestore, parseBackup, plural, when, type Backup } from './model';

const readText = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const rd = new FileReader();
    rd.onload = () => resolve(String(rd.result));
    rd.onerror = () => reject(rd.error);
    rd.readAsText(f);
  });

export function BackupPane({ db }: { db: SupabaseClient }) {
  const { toast } = useAdminUi();
  const [picked, setPicked] = useState<{ name: string; backup: Backup } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function downloadBackup() {
    const r = await callRpc<{ outcomes: unknown[] }>(db, 'admin_export_backup');
    if (!r.ok) return toast(r.message, true);
    download(`culture-blueprint-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(r.data, null, 2), 'application/json');
    logAccess('backup');
    try {
      localStorage.setItem('cb-last-backup', new Date().toISOString());
    } catch {
      /* ignore */
    }
    toast(`Backup downloaded: ${plural(r.data.outcomes.length, 'outcome', 'outcomes')}`);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    setPicked(null);
    setError(null);
    setTyped('');
    const f = e.target.files?.[0];
    if (!f) return;
    const parsed = parseBackup(await readText(f));
    if (!parsed.ok) return setError(parsed.message);
    setPicked({ name: f.name, backup: parsed.backup });
  }

  async function restore() {
    if (!picked) return;
    setBusy(true);
    const r = await callRpc<{ outcomes: number; sop_links: number }>(db, 'admin_restore_backup', { p_backup: picked.backup });
    if (!r.ok) {
      toast(r.message, true);
      setBusy(false);
      return;
    }
    toast(`Restored ${plural(r.data.outcomes, 'outcome', 'outcomes')} and ${plural(r.data.sop_links, 'SOP link', 'SOP links')}. Reloading…`);
    setTimeout(() => location.reload(), 1400);
  }

  const b = picked?.backup;
  return (
    <>
      <PageHeader title="Backup" sub="Keep a copy of your data, or bring one back." />
      <div className="ad-card">
        <h3>Download a backup</h3>
        <p>
          One file with all outcomes, Safeguard Map links, SOP status, pillars, areas and saved versions. User accounts are not included. Keep it somewhere
          safe: it holds company data.
        </p>
        <button type="button" className="ad-btn primary" id="bk-download" onClick={() => void downloadBackup()}>
          Download backup
        </button>
      </div>
      <div className="ad-card">
        <h3>Restore from a backup</h3>
        <p>
          Replaces the current outcomes, Safeguard Map links and SOP status with the contents of a backup file. A safety copy of the current Safeguard Map
          layout is saved first (see Saved versions).
        </p>
        <input type="file" accept="application/json,.json" id="bk-file" aria-label="Backup file" ref={fileRef} onChange={(e) => void onFile(e)} />
        <div id="bk-info">
          {error && (
            <p className="ad-err" role="alert">
              {error}
            </p>
          )}
          {picked && b && (
            <>
              <div className="ad-summary">
                <b>{picked.name}</b>
                <span>Taken {when(b.exported_at)}</span>
                <span>
                  {plural((b.outcomes ?? []).length, 'outcome', 'outcomes')} · {plural((b.practice_sops ?? []).length, 'SOP link', 'SOP links')} ·{' '}
                  {plural((b.practice_values ?? []).length, 'value link', 'value links')} · {plural((b.layout_snapshots ?? []).length, 'saved version', 'saved versions')}
                </span>
              </div>
              <p className="ad-warn">This replaces the current outcomes and links. It cannot be undone, except by restoring another backup.</p>
              <input type="text" id="bk-confirm" placeholder="Type RESTORE to confirm" aria-label="Type RESTORE to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} />
              <button type="button" className="ad-btn primary danger" id="bk-restore" disabled={busy || !canRestore(typed)} onClick={() => void restore()}>
                Restore this backup
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
