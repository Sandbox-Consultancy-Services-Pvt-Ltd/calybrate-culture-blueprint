import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { askConfirm } from '../../lib/dialog';
import type { OutcomesApi } from './useOutcomes';
import { MeasureField, StatusPick } from './StatusPick';
import {
  activePillars,
  blankItem,
  blankStandard,
  cleanStandards,
  docId,
  inkOn,
  leavesOf,
  type Item,
  type Leaf,
  type Pillar,
  type Standard,
} from './model';

interface Draft {
  promise: string;
  standards: Standard[];
}
const startStandard = (): Standard => ({ ...blankStandard(), items: [blankItem()] });
const toDraft = (promise: string, standards: Standard[]): Draft => ({
  promise,
  standards: standards.length ? standards.map((s) => ({ ...s, items: s.items.map((x) => ({ ...x })) })) : [startStandard()],
});
const snapshot = (d: Draft) => JSON.stringify({ promise: d.promise.trim(), standards: cleanStandards(d.standards) });
const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
};

export interface EditTarget {
  leaf: Leaf;
  p: Pillar;
  focusItemId?: string;
}

interface Props {
  api: OutcomesApi;
  target: EditTarget;
  onClose: () => void;
  /** Open another box (used by "Save & next box"). */
  onSwitch: (t: EditTarget) => void;
}

export function OutcomeEditor({ api, target, onClose, onSwitch }: Props) {
  const { leaf, p } = target;
  const { docs, meta, canWrite: writable } = api;
  const ro = !writable;
  const id = docId(leaf.code, p.code);
  const savedDoc = docs[id];
  const saved = useMemo<Draft>(() => ({ promise: savedDoc?.promise ?? '', standards: savedDoc?.standards ?? [] }), [savedDoc]);
  const savedAt = savedDoc?.updatedAt ?? null;
  const savedCount = useMemo(() => cleanStandards(saved.standards).reduce((n, st) => n + st.items.length, 0), [saved]);

  const [draft, setDraft] = useState<Draft>(() => toDraft(saved.promise, saved.standards));
  const orig = useRef(snapshot(saved));
  const base = useRef<string | null>(savedAt);
  const [remote, setRemote] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(target.focusItemId ? `f-${target.focusItemId}-t` : null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const dirty = snapshot(draft) !== orig.current;

  // Someone else saved this box while it is open: refresh if untouched, otherwise warn.
  useEffect(() => {
    if (saving || savedAt === base.current) return;
    if (!dirty) {
      setDraft(toDraft(saved.promise, saved.standards));
      orig.current = snapshot(saved);
      base.current = savedAt;
      setRemote(false);
    } else if (!remote) {
      setRemote(true);
    }
  }, [savedAt, saved, saving, dirty, remote]);

  useEffect(() => {
    document.body.classList.add('ox-lock');
    return () => document.body.classList.remove('ox-lock');
  }, []);

  // Focus when the dialog opens: the requested outcome, else the first field (or Close when read-only).
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const wanted = target.focusItemId ? document.getElementById(`f-${target.focusItemId}-t`) : null;
    if (wanted) wanted.focus();
    else if (!ro) dlg.querySelector<HTMLElement>('textarea, input, button')?.focus();
    else dlg.querySelector<HTMLElement>('.ox-x')?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus a newly added outcome.
  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  const next = useMemo(() => {
    const P = activePillars(meta);
    const list = leavesOf(meta).flatMap((l) => P.map((pp) => ({ leaf: l, p: pp })));
    const i = list.findIndex((b) => b.leaf.code === leaf.code && b.p.code === p.code);
    return i >= 0 ? list[i + 1] ?? null : null;
  }, [meta, leaf.code, p.code]);

  const requestClose = useCallback(() => {
    if (dirty && !confirmDiscard && !ro) setConfirmDiscard(true);
    else onClose();
  }, [dirty, confirmDiscard, ro, onClose]);

  async function save(goNext: boolean) {
    if (saving) return;
    const name = `${leaf.name} · ${p.name}`;
    // Saving an empty box deletes what was there for everyone, so ask first.
    const hadContent = !!saved.promise.trim() || cleanStandards(saved.standards).length > 0;
    if (!draft.promise.trim() && !cleanStandards(draft.standards).length && hadContent) {
      const n = savedCount;
      const yes = await askConfirm({
        title: 'Clear this box?',
        text: `Saving with nothing written removes the promise, its standards${n ? ` and ${n === 1 ? 'the outcome' : `all ${n} outcomes`}` : ''} in “${name}” for everyone.`,
        confirmLabel: 'Clear box',
        tone: 'danger',
      });
      if (!yes) return;
    }
    setSaving(true);
    api.setBusy(true);
    try {
      const res = await api.persist(leaf, p, draft.promise, draft.standards);
      api.say(
        res.device
          ? res.ok
            ? `${res.cleared ? 'Cleared on this device' : 'Saved on this device'}: ${name}`
            : `Kept for this visit only: ${name}`
          : `${res.cleared ? 'Cleared' : 'Saved'} ${name}`,
        !res.ok,
      );
      if (goNext && next) onSwitch({ leaf: next.leaf, p: next.p });
      else onClose();
    } catch (e) {
      setSaving(false);
      api.handleSaveError(e);
    } finally {
      api.setBusy(false);
    }
  }

  // Keyboard: Esc closes, Ctrl/Cmd+Enter saves, Tab stays inside the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !ro) {
        e.preventDefault();
        void save(false);
      } else if (e.key === 'Tab' && dialogRef.current) {
        const f = [...dialogRef.current.querySelectorAll<HTMLElement>('button,input,textarea,select,[href]')].filter(
          (x) => !(x as HTMLButtonElement).disabled,
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        } else if (!dialogRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const touch = () => setConfirmDiscard(false);
  const patchStandard = (sid: string, fn: (st: Standard) => Standard) => {
    setDraft((d) => ({ ...d, standards: d.standards.map((st) => (st.id === sid ? fn(st) : st)) }));
    touch();
  };
  const update = (sid: string, itemId: string, patch: Partial<Item>) =>
    patchStandard(sid, (st) => ({ ...st, items: st.items.map((x) => (x.id === itemId ? { ...x, ...patch } : x)) }));

  const removeItem = async (st: Standard, it: Item, label: string) => {
    if (it.text.trim() || it.target.trim() || it.current.trim()) {
      const yes = await askConfirm({
        title: `Remove ${label}?`,
        text: it.text.trim() ? `“${it.text.trim().slice(0, 120)}” will be removed when you save this box.` : 'It will be removed when you save this box.',
        confirmLabel: 'Remove',
        tone: 'warn',
      });
      if (!yes) return;
    }
    patchStandard(st.id, (s0) => ({ ...s0, items: s0.items.filter((x) => x.id !== it.id) }));
  };
  const removeStandard = async (st: Standard, label: string) => {
    const filled = cleanStandards([st])[0]?.items.length ?? 0;
    if (st.title.trim() || filled) {
      const yes = await askConfirm({
        title: `Remove ${label}?`,
        text: filled
          ? `This standard and its ${filled === 1 ? 'outcome' : `${filled} outcomes`} will be removed when you save this box.`
          : 'It will be removed when you save this box.',
        confirmLabel: 'Remove',
        tone: 'warn',
      });
      if (!yes) return;
    }
    setDraft((d) => ({ ...d, standards: d.standards.filter((x) => x.id !== st.id) }));
    touch();
  };

  return (
    <div className="ox-modal" id="ox-modal">
      <div className="ox-backdrop" onClick={requestClose} />
      <div className="ox-dialog" role="dialog" aria-modal="true" aria-labelledby="ox-dtitle" ref={dialogRef}>
        <div className="ox-dhead">
          <div>
            <p className="ox-kicker">Outcomes</p>
            <h2 id="ox-dtitle">
              {leaf.name} · {p.name}
            </h2>
            <p className="ox-crumb">
              {leaf.areaName ? `${leaf.areaName} › ` : ''}
              <b>{leaf.name}</b> ›{' '}
              <span className="ox-pill" style={{ background: p.color, color: inkOn(p.color) }}>
                {p.name}
              </span>
            </p>
          </div>
          <button type="button" className="ox-x" aria-label="Close" onClick={requestClose}>
            ×
          </button>
        </div>

        <div className="ox-dbody">
          <p className="ox-help">
            {ro
              ? 'You have view-only access, so this box can be read but not changed.'
              : 'Write one promise for this box. Break it into standards, then add the outcomes that show whether each standard is being met.'}
          </p>
          {remote && (
            <p className="ox-note warn">
              Someone else saved changes to this box while you were editing. Saving now replaces their version with yours.
            </p>
          )}

          <div className="f ox-promise">
            <label htmlFor="ox-promise">Promise</label>
            <textarea
              id="ox-promise"
              rows={2}
              placeholder="What do we promise people in this box?"
              maxLength={1000}
              disabled={ro}
              value={draft.promise}
              onChange={(e) => {
                setDraft((d) => ({ ...d, promise: e.target.value }));
                touch();
              }}
            />
          </div>

          {draft.standards.map((st, si) => {
            const sp = `s-${st.id}`;
            return (
              <section className="ox-std" key={st.id} aria-label={`Standard ${si + 1}`}>
                <div className="oc-top">
                  <b><span className="ox-num">{si + 1}</span>Standard</b>
                  {!ro && (
                    <button type="button" className="ox-lnk danger" aria-label={`Remove standard ${si + 1}`} onClick={() => void removeStandard(st, `standard ${si + 1}`)}>
                      Remove standard
                    </button>
                  )}
                </div>
                <div className="f">
                  <label htmlFor={`${sp}-t`}>Standard</label>
                  <input
                    id={`${sp}-t`}
                    type="text"
                    placeholder="How will we keep this promise?"
                    maxLength={300}
                    disabled={ro}
                    value={st.title}
                    onChange={(e) => patchStandard(st.id, (x) => ({ ...x, title: e.target.value }))}
                  />
                </div>

                {st.items.map((it, i) => {
                  const pre = `f-${it.id}`;
                  return (
                    <div className="oc" key={it.id}>
                      <div className="oc-top">
                        <b>Outcome {i + 1}</b>
                        {!ro && (
                          <button type="button" className="ox-lnk danger" aria-label={`Remove outcome ${i + 1} of standard ${si + 1}`} onClick={() => void removeItem(st, it, `outcome ${i + 1}`)}>
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="f">
                        <label htmlFor={`${pre}-t`}>Outcome</label>
                        <textarea id={`${pre}-t`} rows={2} placeholder="What will be true when this standard is met?" maxLength={1000} disabled={ro} value={it.text} onChange={(e) => update(st.id, it.id, { text: e.target.value })} />
                      </div>
                      <div className="f-row">
                        <div className="f">
                          <label htmlFor={`${pre}-g`}>Target</label>
                          <MeasureField id={`${pre}-g`} label="Target" disabled={ro} value={it.target} onChange={(v) => update(st.id, it.id, { target: v })} />
                        </div>
                        <div className="f">
                          <label htmlFor={`${pre}-c`}>Current level</label>
                          <MeasureField id={`${pre}-c`} label="Current level" disabled={ro} value={it.current} onChange={(v) => update(st.id, it.id, { current: v })} />
                        </div>
                      </div>
                      <div className="f">
                        <span className="lbl">Status</span>
                        <StatusPick name={`${pre}-s`} disabled={ro} value={it.status} onChange={(id) => update(st.id, it.id, { status: id })} />
                      </div>
                    </div>
                  );
                })}
                {!ro && (
                  <button
                    type="button"
                    className="ox-btn ox-ghost small"
                    onClick={() => {
                      const nb = blankItem();
                      patchStandard(st.id, (x) => ({ ...x, items: [...x.items, nb] }));
                      setFocusId(`f-${nb.id}-t`);
                    }}
                  >
                    + Add outcome
                  </button>
                )}
              </section>
            );
          })}
          {!ro && (
            <button
              type="button"
              className="ox-btn ox-ghost small"
              id="add-std"
              onClick={() => {
                const ns = { ...blankStandard(), items: [blankItem()] };
                setDraft((d) => ({ ...d, standards: [...d.standards, ns] }));
                setFocusId(`s-${ns.id}-t`);
                touch();
              }}
            >
              + Add standard
            </button>
          )}
        </div>

        <div className="ox-dfoot">
          {confirmDiscard ? (
            <>
              <p className="ox-note warn">You have unsaved changes in this box.</p>
              <div className="ox-frow">
                <button type="button" className="ox-btn small" onClick={() => setConfirmDiscard(false)}>
                  Keep editing
                </button>
                <button type="button" className="ox-btn ox-ghost small" onClick={onClose}>
                  Discard changes
                </button>
              </div>
            </>
          ) : (
            <div className="ox-frow">
              <p className="meta">{savedAt ? `Last saved ${fmtTime(savedAt)}` : 'Not saved yet'}</p>
              <button type="button" className="ox-btn ox-ghost small" onClick={requestClose}>
                {ro ? 'Close' : 'Cancel'}
              </button>
              {!ro && (
                <button
                  type="button"
                  className="ox-btn ox-ghost small"
                  id="ox-save-next"
                  disabled={saving || !next}
                  title={next ? `Save, then open ${next.leaf.name} · ${next.p.name}` : 'This is the last box'}
                  onClick={() => void save(true)}
                >
                  Save &amp; next box
                </button>
              )}
              {!ro && (
                <button type="button" className="ox-btn small" id="ox-save" disabled={saving} onClick={() => void save(false)}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
