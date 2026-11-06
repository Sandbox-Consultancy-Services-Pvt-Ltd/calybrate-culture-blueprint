import { askConfirm, type Tone } from '../../lib/dialog';
import { initials } from './model';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/** A dialog styled like the legacy admin modal. Esc and the backdrop close it. */
export function Dialog({
  title,
  narrow,
  footer,
  onClose,
  children,
}: {
  title: string;
  narrow?: boolean;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.body.classList.add('ox-lock');
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button.primary')?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => {
      document.body.classList.remove('ox-lock');
      document.removeEventListener('keydown', esc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="ad-modal" id="ad-modal">
      <div className="ad-backdrop" onClick={onClose} />
      <div className={`ad-dialog${narrow ? ' narrow' : ''}`} role="dialog" aria-modal="true" aria-labelledby="ad-mt" ref={ref}>
        <div className="ad-dhead">
          <h2 id="ad-mt">{title}</h2>
          <button type="button" className="ad-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="ad-dbody">{children}</div>
        {footer && <div className="ad-dfoot">{footer}</div>}
      </div>
    </div>
  );
}

interface Secret {
  title: string;
  username: string;
  password: string;
}

interface AdminUi {
  toast: (msg: string, err?: boolean) => void;
  /** Asks first. `danger` (red) for things that cannot be undone; `tone` overrides it. */
  confirm: (title: string, text: string, label: string, danger?: boolean, tone?: Tone) => Promise<boolean>;
  showSecret: (title: string, username: string, password: string) => void;
}
const Ctx = createContext<AdminUi | null>(null);
export const useAdminUi = (): AdminUi => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAdminUi must be used inside <AdminUiProvider>');
  return v;
};

function CopyButton({ text }: { text: string }) {
  const [label, setLabel] = useState('Copy');
  return (
    <button
      type="button"
      className="ad-btn outline small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setLabel('Copied');
        } catch {
          setLabel('Select and copy');
        }
      }}
    >
      {label}
    </button>
  );
}

/** A shimmering placeholder block shown while data loads. */
export function Skeleton({ w, h = 14, r, className = '' }: { w?: number | string; h?: number | string; r?: number | string; className?: string }) {
  return <span className={`ad-sk ${className}`} aria-hidden="true" style={{ width: w, height: h, borderRadius: r }} />;
}

/** Table-shaped placeholder: `rows` rows of `cols` cells. */
export function TableSkeleton({ cols, rows = 6, label = 'Loading' }: { cols: number; rows?: number; label?: string }) {
  return (
    <div className="ad-scroll" role="status" aria-busy="true" aria-label={label}>
      <table className="ad-table ad-sk-table">
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }, (_, c) => (
                <td key={c}>
                  <Skeleton w={c === 0 ? '70%' : `${45 + ((r * 7 + c * 13) % 40)}%`} h={c === 0 ? 14 : 12} />
                  {c === 0 && <Skeleton w="40%" h={10} className="sub" />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Toast + confirm dialog + "show the temporary password once" dialog. */
export function AdminUiProvider({ children }: { children: ReactNode }) {
  const [toastState, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const [secret, setSecret] = useState<Secret | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const toast = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4500);
  }, []);
  const confirm = useCallback(
    (title: string, text: string, confirmLabel: string, danger = false, tone?: Tone) => askConfirm({ title, text, confirmLabel, tone: tone ?? (danger ? 'danger' : 'warn') }),
    [],
  );
  const showSecret = useCallback((title: string, username: string, password: string) => setSecret({ title, username, password }), []);
  const api = useMemo(() => ({ toast, confirm, showSecret }), [toast, confirm, showSecret]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {secret && (
        <Dialog
          title={secret.title}
          narrow
          onClose={() => setSecret(null)}
          footer={
            <button type="button" className="ad-btn primary" id="ad-secret-done" onClick={() => setSecret(null)}>
              I have noted it, close
            </button>
          }
        >
          <div className="ad-secret">
            <p>
              Give these to the person privately. The password is shown only now. They will be asked to set up two-step verification and choose their own
              password the first time they sign in.
            </p>
            <div className="row">
              <span>Username</span>
              <code id="ad-secret-user">{secret.username}</code>
              <CopyButton text={secret.username} />
            </div>
            <div className="row">
              <span>Temporary password</span>
              <code id="ad-secret-pass">{secret.password}</code>
              <CopyButton text={secret.password} />
            </div>
          </div>
        </Dialog>
      )}
      <div className={`ad-toast${toastState ? ' on' : ''}${toastState?.err ? ' err' : ''}`} id="ad-toast" role="status" aria-live="polite">
        {toastState?.msg}
      </div>
    </Ctx.Provider>
  );
}

/* ───────── small shared building blocks for the redesigned admin ───────── */
const ICONS = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  structure: 'M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  backup: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h3l8 5V5L7 10H4a1 1 0 0 0-1 1zM19 8a5 5 0 0 1 0 8',
  plus: 'M12 5v14M5 12h14',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  more: 'M12 12h.01M19 12h.01M5 12h.01',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  arrow: 'M5 12h14M13 5l7 7-7 7',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="ad-ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  );
}

/** The title block at the top of each admin page, with the page's main action on the right. */
export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <header className="ad-ph">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="ad-ph-acts">{children}</div>}
    </header>
  );
}

export function EmptyState({ icon = 'users', title, text, children }: { icon?: IconName; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="ad-emptys">
      <span className="ico">
        <Icon name={icon} size={22} />
      </span>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

/** Round initials, coloured from the name so the same person always looks the same. */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  const text = initials(name);
  return (
    <span className="ad-av" style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${h} 55% 92%)`, color: `hsl(${h} 55% 28%)` }} aria-hidden="true">
      {text}
    </span>
  );
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** A "⋯" button that opens a small list of actions. Esc or a click outside closes it. */
export function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  const shown = items.filter((i) => !i.hidden);
  return (
    <div className="ad-menu" ref={ref}>
      <button type="button" className="ad-iconbtn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="more" />
      </button>
      {open && (
        <div className="ad-menu-list" role="menu">
          {shown.map((i) => (
            <button
              key={i.label}
              type="button"
              role="menuitem"
              className={i.danger ? 'danger' : undefined}
              onClick={() => {
                setOpen(false);
                i.onSelect();
              }}
            >
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
