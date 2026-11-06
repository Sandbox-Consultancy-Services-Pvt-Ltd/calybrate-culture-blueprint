/**
 * Print: whichever view is open is fitted onto ONE A4 page (landscape; the Outcomes table is portrait).
 * The view keeps its on-screen layout at a fixed width (so connector lines stay exact) and is uniformly zoomed.
 * Ported from the legacy setPrint(). Views redraw themselves by listening for the `cb-print` window event.
 */
let printing = false;
let printEl: HTMLElement | null = null;

const A4 = { landscape: { w: 1062, h: 733 }, portrait: { w: 733, h: 1062 } }; // A4 minus 8 mm margins, in CSS px

export function pageSize(portrait: boolean) {
  return portrait ? A4.portrait : A4.landscape;
}

/** Zoom that fits `width` x `height` content into the page below the fixed header/footer. Long portrait tables never go below 0.5. */
export function fitZoom(portrait: boolean, width: number, height: number, fixed: number): number {
  const { w, h } = pageSize(portrait);
  let z = Math.min(w / width, (h - fixed) / height, 1) * 0.98;
  if (portrait) z = Math.max(z, 0.5);
  return z;
}

export function setPrint(on: boolean) {
  if (printing === on) return;
  printing = on;
  const root = document.documentElement;
  if (!on) {
    root.classList.remove('printing');
    if (printEl) {
      printEl.style.cssText = '';
      printEl = null;
    }
    window.dispatchEvent(new CustomEvent('cb-print', { detail: { on: false } }));
    return;
  }
  const el = document.querySelector<HTMLElement>('[data-print-root]');
  if (!el) {
    printing = false;
    return;
  }
  printEl = el;
  const portrait = el.dataset.printRoot === 'portrait';
  let pg = document.getElementById('printPage');
  if (!pg) {
    pg = document.createElement('style');
    pg.id = 'printPage';
    document.head.appendChild(pg);
  }
  pg.textContent = `@page{size:A4 ${portrait ? 'portrait' : 'landscape'};margin:8mm}`;

  const logo = document.querySelector('.logo-slot img');
  const ph = document.getElementById('phLogo');
  if (ph) {
    ph.textContent = '';
    if (logo) ph.appendChild(logo.cloneNode());
  }
  const t = document.getElementById('phTitle');
  if (t) t.textContent = `· ${document.title.replace(/^Blueprint · /, '')}`;
  const d = document.getElementById('phDate');
  if (d) d.textContent = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  root.classList.add('printing');
  el.style.cssText = '';
  window.dispatchEvent(new CustomEvent('cb-print', { detail: { on: true } }));
  const fixedW = el.dataset.printWidth ? Number(el.dataset.printWidth) : 0;
  const W = fixedW || Math.min(1880, Math.max(portrait ? 1100 : 1280, el.getBoundingClientRect().width));
  el.style.width = `${W}px`;
  el.style.maxWidth = 'none';
  const H = el.getBoundingClientRect().height;
  const head = document.getElementById('printHead')?.offsetHeight ?? 0;
  const foot = Math.ceil((document.querySelector('footer')?.offsetHeight ?? 0) * 1.7);
  el.style.zoom = String(fitZoom(portrait, W, H, head + foot + 24));
}

export function bindPrintEvents() {
  const before = () => setPrint(true);
  const after = () => setPrint(false);
  window.addEventListener('beforeprint', before);
  window.addEventListener('afterprint', after);
  return () => {
    window.removeEventListener('beforeprint', before);
    window.removeEventListener('afterprint', after);
  };
}
