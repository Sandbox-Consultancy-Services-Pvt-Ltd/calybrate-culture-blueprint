import { useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '../features/auth/AuthProvider';
import { UserMenu } from '../features/auth/UserMenu';
import { logAccess } from '../lib/accessLog';
import { AnnouncementBanner } from './AnnouncementBanner';
import { Watermark } from './Watermark';
import { ErrorBoundary } from './ErrorBoundary';
import { bindPrintEvents, setPrint } from './print';
import { VIEWS, type ViewKey } from './routes';
import { useHashRoute } from './useHashRoute';
import { ZoomProvider, useZoom } from './zoom';
import './shell.css';
import '../styles/footer.css';
import '../styles/print.css';

export type ViewMap = Record<ViewKey, ReactNode>;

function ZoomControls() {
  const { label, handlers } = useZoom();
  return (
    <div className="zoom">
      <button type="button" id="zOut" aria-label="Zoom out" onClick={() => handlers?.zoomOut()}>
        −
      </button>
      <output id="zVal">{label}</output>
      <button type="button" id="zIn" aria-label="Zoom in" onClick={() => handlers?.zoomIn()}>
        +
      </button>
      <button type="button" id="zFit" onClick={() => handlers?.fit()}>
        Fit
      </button>
    </div>
  );
}

function ShellInner({ views }: { views: ViewMap }) {
  const { isAdmin, canExport } = useAuth();
  const current = useHashRoute(isAdmin);
  const meta = VIEWS.find((v) => v.key === current)!;
  const barRef = useRef<HTMLElement>(null);

  // Sticky headers inside views offset themselves by the top bar's height (--bar-h).
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const set = () => document.documentElement.style.setProperty('--bar-h', bar.offsetHeight + 'px');
    set();
    window.addEventListener('resize', set);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(set);
    ro?.observe(bar);
    return () => {
      window.removeEventListener('resize', set);
      ro?.disconnect();
    };
  }, []);

  useEffect(() => bindPrintEvents(), []);

  // Viewers cannot print or save as PDF (also blocks Ctrl+P): the print stylesheet hides the page when this flag is set.
  useEffect(() => {
    if (canExport) delete document.documentElement.dataset.noPrint;
    else document.documentElement.dataset.noPrint = '1';
    return () => {
      delete document.documentElement.dataset.noPrint;
    };
  }, [canExport]);

  useEffect(() => {
    document.title = meta.title;
    document.documentElement.dataset.view = current;
    window.scrollTo(0, 0);
  }, [current, meta.title]);

  return (
    <>
      <header className="topbar" ref={barRef}>
        <div className="topbar-in">
          <span className="brand-mark">
            <img src="/Calybrate_LOGO.png" alt="Calybrate" />
          </span>
          <div className="brand-t">
            <b>
              Calybrate Blueprint<sup className="copy-mark" aria-label="Copyright">©</sup>
            </b>
            <span>Culture Management System</span>
          </div>
          <nav className="nav" aria-label="Sections">
            {VIEWS.filter((v) => v.key !== 'admin').map((v) => (
              <a key={v.key} href={`#${v.hash}`} className={v.key === current ? 'on' : undefined} aria-current={v.key === current ? 'page' : undefined}>
                {v.nav}
              </a>
            ))}
            {isAdmin && (
              <>
                <span className="nav-sep" aria-hidden="true" />
                <a href="#admin" className={`nav-admin${current === 'admin' ? ' on' : ''}`} aria-current={current === 'admin' ? 'page' : undefined}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  Admin
                </a>
              </>
            )}
          </nav>
          <ZoomControls />
          <span className="logo-slot has-logo">
            <img src="/logo.svg" alt="Your Organisation" />
          </span>
          <UserMenu
            onPrint={
              canExport
                ? () => {
                    logAccess('print', current);
                    setPrint(true);
                    window.print();
                  }
                : undefined
            }
          />
        </div>
      </header>
      <Watermark />
      <AnnouncementBanner />
      <div id="printHead">
        <span id="phLogo" style={{ margin: 0 }} />
        <b>Calybrate Blueprint</b>
        <b id="phTitle" style={{ fontWeight: 600, color: 'var(--ink-2)' }} />
        <span id="phDate" />
      </div>
      <main key={current}>
        <ErrorBoundary name={current}>{views[current]}</ErrorBoundary>
      </main>
      <footer>
        <div className="ft-l">
          <img className="ft-logo" src="/Calybrate_LOGO.png" alt="" />
          <div className="ft-text">
            <div className="ft-brand">
              <b>Calybrate Blueprint</b>
            </div>
            <div className="ft-sys">Culture Management System</div>
          </div>
        </div>
        <div className="copy">
          <span className="copy-line">© Calybrate Blueprint 2026</span>
          <span className="copy-co">SANDBOX CONSULTANCY SERVICES (PVT) LTD</span>
        </div>
      </footer>
    </>
  );
}

/** Top bar + the current view. Views are supplied by the caller so each can be ported independently. */
export function Shell({ views }: { views: ViewMap }) {
  return (
    <ZoomProvider>
      <ShellInner views={views} />
    </ZoomProvider>
  );
}
