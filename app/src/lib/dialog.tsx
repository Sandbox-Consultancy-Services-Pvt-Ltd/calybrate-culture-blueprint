import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import '../styles/dialog.css';

/**
 * App-wide confirmation and question dialogs, replacing the browser's `confirm()` / `prompt()`.
 * They are plain functions returning a Promise, so React components and the vanilla controllers
 * (Safeguard Map) use exactly the same look and behaviour.
 *
 *   if (!(await askConfirm({ title: 'Delete it?', text: '...', confirmLabel: 'Delete', tone: 'danger' }))) return;
 */
export type Tone = 'danger' | 'warn' | 'info';

export interface ConfirmOptions {
  title: string;
  text?: ReactNode;
  /** Short bullet list of what will happen. */
  points?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` is red and focuses Cancel first; `warn` is amber; `info` is blue. */
  tone?: Tone;
}

export interface PromptOptions {
  title: string;
  text?: ReactNode;
  label: string;
  initial?: string;
  placeholder?: string;
  maxLength?: number;
  confirmLabel?: string;
  cancelLabel?: string;
}

const GLYPH: Record<Tone, string> = { danger: '!', warn: '!', info: '?' };

function mount<T>(render: (done: (v: T) => void) => ReactElement): Promise<T> {
  return new Promise<T>((resolve) => {
    const host = document.createElement('div');
    host.className = 'cb-dlg-host';
    document.body.append(host);
    const root = createRoot(host);
    const before = document.activeElement as HTMLElement | null;
    document.body.classList.add('cb-dlg-open');
    let finished = false;
    const done = (v: T) => {
      if (finished) return;
      finished = true;
      document.body.classList.remove('cb-dlg-open');
      resolve(v);
      // Unmount after the click that closed it has finished handling.
      setTimeout(() => {
        root.unmount();
        host.remove();
        if (before && document.contains(before)) before.focus();
      }, 0);
    };
    flushSync(() => root.render(render(done)));
  });
}

/** Keeps Tab inside the dialog and closes it on Escape. */
function useModalKeys(onCancel: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    } else if (e.key === 'Tab' && ref.current) {
      const f = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]),input,textarea,select,[href]')];
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  return { ref, onKeyDown };
}

function Shell({ tone, title, text, points, children, onCancel }: { tone: Tone; title: string; text?: ReactNode; points?: string[]; children: ReactNode; onCancel: () => void }) {
  const tid = useId();
  const did = useId();
  const { ref, onKeyDown } = useModalKeys(onCancel);
  return (
    <div className="cb-dlg-back" onMouseDown={(e) => e.target === e.currentTarget && onCancel()} onKeyDown={onKeyDown}>
      <div className={`cb-dlg ${tone}`} role="dialog" aria-modal="true" aria-labelledby={tid} aria-describedby={text || points ? did : undefined} ref={ref}>
        <div className="cb-dlg-head">
          <span className="cb-dlg-ico" aria-hidden="true">
            {GLYPH[tone]}
          </span>
          <h2 id={tid}>{title}</h2>
        </div>
        {(text || points?.length) && (
          <div className="cb-dlg-body" id={did}>
            {text && <p>{text}</p>}
            {points && points.length > 0 && (
              <ul>
                {points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function ConfirmDialog({ o, done }: { o: ConfirmOptions; done: (v: boolean) => void }) {
  const tone = o.tone ?? 'warn';
  const cancel = useRef<HTMLButtonElement>(null);
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // For destructive actions the safe button has focus, so a stray Enter cannot delete anything.
    (tone === 'danger' ? cancel : ok).current?.focus();
  }, [tone]);
  return (
    <Shell tone={tone} title={o.title} text={o.text} points={o.points} onCancel={() => done(false)}>
      <div className="cb-dlg-foot">
        <button type="button" className="cb-btn outline" ref={cancel} onClick={() => done(false)}>
          {o.cancelLabel ?? 'Cancel'}
        </button>
        <button type="button" className={`cb-btn ${tone === 'danger' ? 'danger' : 'primary'}`} ref={ok} onClick={() => done(true)}>
          {o.confirmLabel ?? 'Confirm'}
        </button>
      </div>
    </Shell>
  );
}

function PromptDialog({ o, done }: { o: PromptOptions; done: (v: string | null) => void }) {
  const [value, setValue] = useState(o.initial ?? '');
  const input = useRef<HTMLInputElement>(null);
  const iid = useId();
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const clean = value.trim();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (clean) done(clean);
  };
  return (
    <Shell tone="info" title={o.title} text={o.text} onCancel={() => done(null)}>
      <form onSubmit={submit}>
        <div className="cb-dlg-field">
          <label htmlFor={iid}>{o.label}</label>
          <input id={iid} ref={input} type="text" value={value} maxLength={o.maxLength ?? 80} placeholder={o.placeholder} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="cb-dlg-foot">
          <button type="button" className="cb-btn outline" onClick={() => done(null)}>
            {o.cancelLabel ?? 'Cancel'}
          </button>
          <button type="submit" className="cb-btn primary" disabled={!clean}>
            {o.confirmLabel ?? 'Save'}
          </button>
        </div>
      </form>
    </Shell>
  );
}

/** Resolves `true` if the person confirms, `false` for Cancel, Esc or a click outside. */
export const askConfirm = (o: ConfirmOptions): Promise<boolean> => mount<boolean>((done) => <ConfirmDialog o={o} done={done} />);

/** Resolves the trimmed text, or `null` if cancelled. */
export const askPrompt = (o: PromptOptions): Promise<string | null> => mount<string | null>((done) => <PromptDialog o={o} done={done} />);
