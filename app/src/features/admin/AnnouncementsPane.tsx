import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteAnnouncement, isMissingMigration, listAnnouncements, saveAnnouncement } from './api';
import { announcementState, TONES, TONE_LABEL, when, type Announcement, type Tone } from './model';
import { Dialog, EmptyState, Icon, PageHeader, RowMenu, Skeleton, useAdminUi } from './ui';

const STATE_LABEL = { live: 'Showing now', off: 'Turned off', scheduled: 'Scheduled', ended: 'Ended' } as const;
const STATE_TONE = { live: 'ok', off: 'off', scheduled: 'warn', ended: 'off' } as const;

/** `datetime-local` inputs use local time without a zone. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export function MigrationNotice({ what }: { what: string }) {
  return (
    <EmptyState icon="alert" title={`${what} is not switched on yet`} text="Ask whoever looks after the database to run migration 0017_admin_settings.sql in the Supabase SQL editor, then reload this page." />
  );
}

export function Banner({ tone, children }: { tone: Tone; children: string }) {
  return (
    <div className={`ad-annc ${tone}`} role="note">
      <Icon name={tone === 'warning' ? 'alert' : tone === 'success' ? 'check' : 'megaphone'} />
      <span>{children}</span>
    </div>
  );
}

function EditDialog({ db, item, onClose, onSaved }: { db: SupabaseClient; item: Announcement | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useAdminUi();
  const [message, setMessage] = useState(item?.message ?? '');
  const [tone, setTone] = useState<Tone>(item?.tone ?? 'info');
  const [active, setActive] = useState(item?.is_active ?? true);
  const [from, setFrom] = useState(toLocalInput(item?.starts_at ?? null));
  const [to, setTo] = useState(toLocalInput(item?.ends_at ?? null));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text) return setErr('Write the message people will see.');
    if (from && to && new Date(to) <= new Date(from)) return setErr('The end must be after the start.');
    setBusy(true);
    setErr(null);
    const r = await saveAnnouncement(db, { id: item?.id ?? null, message: text, tone, is_active: active, starts_at: fromLocalInput(from), ends_at: fromLocalInput(to) });
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    toast(item ? 'Announcement saved' : 'Announcement created');
    onSaved();
    onClose();
  }

  return (
    <Dialog title={item ? 'Edit announcement' : 'New announcement'} onClose={onClose}>
      <form className="ad-form" onSubmit={submit}>
        <label>
          Message
          <textarea id="an-msg" maxLength={300} rows={3} required value={message} onChange={(e) => setMessage(e.target.value)} placeholder="For example: The system will be offline on Sunday from 8 to 9 pm." />
          <small>{message.length}/300</small>
        </label>
        <div className="f">
          <span className="lbl">Style</span>
          <div className="ad-seg" role="radiogroup" aria-label="Style">
            {TONES.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={t === tone} className={t === tone ? 'on' : undefined} onClick={() => setTone(t)}>
                {TONE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="ad-two">
          <label>
            Show from (optional)
            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            Hide after (optional)
            <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <label className="ad-check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Turned on
        </label>
        {message.trim() && (
          <div className="f">
            <span className="lbl">Preview</span>
            <Banner tone={tone}>{message.trim()}</Banner>
          </div>
        )}
        {err && (
          <p className="ad-err" role="alert">
            {err}
          </p>
        )}
        <div className="ad-frow">
          <button type="button" className="ad-btn outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="ad-btn primary" id="an-save" disabled={busy}>
            {item ? 'Save changes' : 'Create announcement'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function AnnouncementsPane({ db, openNew = false }: { db: SupabaseClient; openNew?: boolean }) {
  const { toast, confirm } = useAdminUi();
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Announcement | 'new' | null>(openNew ? 'new' : null);

  const load = useCallback(async () => {
    const r = await listAnnouncements(db);
    if (!r.ok) {
      setMissing(isMissingMigration(r.message));
      setError(r.message);
      setItems([]);
      return;
    }
    setError(null);
    setMissing(false);
    setItems(r.data ?? []);
  }, [db]);
  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(a: Announcement) {
    const r = await saveAnnouncement(db, { id: a.id, message: a.message, tone: a.tone, is_active: !a.is_active, starts_at: a.starts_at, ends_at: a.ends_at });
    if (!r.ok) toast(r.message, true);
    else toast(a.is_active ? 'Announcement turned off' : 'Announcement turned on');
    await load();
  }
  async function remove(a: Announcement) {
    if (!(await confirm('Delete announcement', 'It disappears for everyone straight away. To keep it for later, turn it off instead.', 'Delete', true))) return;
    const r = await deleteAnnouncement(db, a.id);
    if (!r.ok) toast(r.message, true);
    else toast('Announcement deleted');
    await load();
  }

  return (
    <>
      <PageHeader title="Announcements" sub="A short message shown at the top of every page for everyone who is signed in.">
        {!missing && (
          <button type="button" className="ad-btn primary with-ico" id="an-new" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /> New announcement
          </button>
        )}
      </PageHeader>
      {missing && <MigrationNotice what="Announcements" />}
      {!missing && error && (
        <p className="ad-err" role="alert">
          {error}
        </p>
      )}
      {!missing && !items && (
        <div className="ad-sk-stack" role="status" aria-busy="true" aria-label="Loading announcements">
          <Skeleton w="90%" h={58} r={12} />
          <Skeleton w="80%" h={58} r={12} />
        </div>
      )}
      {!missing && items && !items.length && !error && (
        <EmptyState icon="megaphone" title="No announcements yet" text="Use announcements for planned downtime, new features or reminders.">
          <button type="button" className="ad-btn primary" onClick={() => setEditing('new')}>
            Write the first one
          </button>
        </EmptyState>
      )}
      {!missing && !!items?.length && (
        <ul className="ad-annc-list">
          {items.map((a) => {
            const st = announcementState(a);
            return (
              <li key={a.id} className="ad-annc-row">
                <Banner tone={a.tone}>{a.message}</Banner>
                <div className="meta">
                  <span className={`ad-badge ${STATE_TONE[st]}`}>{STATE_LABEL[st]}</span>
                  {(a.starts_at || a.ends_at) && (
                    <small>
                      {a.starts_at ? `From ${when(a.starts_at)}` : ''}
                      {a.starts_at && a.ends_at ? ' · ' : ''}
                      {a.ends_at ? `Until ${when(a.ends_at)}` : ''}
                    </small>
                  )}
                  <span className="sp" />
                  <button type="button" className="ad-lnk" onClick={() => void toggle(a)}>
                    {a.is_active ? 'Turn off' : 'Turn on'}
                  </button>
                  <RowMenu
                    label="More actions for this announcement"
                    items={[
                      { label: 'Edit', onSelect: () => setEditing(a) },
                      { label: 'Delete', danger: true, onSelect: () => void remove(a) },
                    ]}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {editing && <EditDialog db={db} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => void load()} />}
    </>
  );
}
