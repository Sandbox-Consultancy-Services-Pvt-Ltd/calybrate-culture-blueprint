import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MigrationNotice } from './AnnouncementsPane';
import { getSettings, isMissingMigration, setSetting } from './api';
import { IDLE_MAX, IDLE_MIN, validIdle } from './model';
import { PageHeader, Skeleton, useAdminUi } from './ui';
import { env } from '../../lib/env';

export function SettingsPane({ db }: { db: SupabaseClient }) {
  const { toast } = useAdminUi();
  const [saved, setSaved] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void getSettings(db).then((r) => {
      if (!live) return;
      if (!r.ok) setMissing(isMissingMigration(r.message));
      const n = r.ok && typeof r.data?.idle_minutes === 'number' ? r.data.idle_minutes : env.idleMinutes;
      setSaved(n);
      setDraft(String(n));
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [db]);

  const n = Number(draft);
  const changed = loaded && draft.trim() !== '' && n !== saved;

  async function save() {
    if (!validIdle(n)) return setErr(`Enter a whole number of minutes from ${IDLE_MIN} to ${IDLE_MAX}.`);
    setBusy(true);
    setErr(null);
    const r = await setSetting(db, 'idle_minutes', n);
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    setSaved(n);
    toast('Settings saved. People get the new time the next time they open the app.');
  }

  return (
    <>
      <PageHeader title="Settings" sub="Rules that apply to everyone who uses the app." />
      {missing ? (
        <MigrationNotice what="Settings" />
      ) : (
        <section className="ad-card wide">
          <h3>Security</h3>
          <div className="ad-setting">
            <div>
              <b>Sign out after inactivity</b>
              <p>Someone who has not touched the page for this long is signed out, so an unattended screen cannot be used.</p>
            </div>
            <div className="ctl">
              {!loaded ? (
                <Skeleton w={110} h={38} r={10} />
              ) : (
                <>
                  <label className="ad-unit">
                    <input
                      id="st-idle"
                      type="number"
                      inputMode="numeric"
                      min={IDLE_MIN}
                      max={IDLE_MAX}
                      value={draft}
                      aria-label="Minutes of inactivity before sign-out"
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <span>minutes</span>
                  </label>
                  <button type="button" className="ad-btn primary small" id="st-save" disabled={!changed || busy} onClick={() => void save()}>
                    Save
                  </button>
                </>
              )}
            </div>
          </div>
          {err && (
            <p className="ad-err" role="alert">
              {err}
            </p>
          )}
        </section>
      )}
    </>
  );
}
