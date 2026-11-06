import { SVG_NS, drawEdges, mkDefs, rect, rounded, type Edge } from '../diagram/edges';
import { drawerHtml, stripQualifier, type Store } from './info';

const CW = 1880;
const CH = 1212;
const MIN_FIT = 0.55; // Below this the Life Cycle stops shrinking and scrolls sideways instead.

export const LC_EDGES: Edge[] = [
  // stage sequence
  { a: 'c1', as: 'r', b: 'c2', bs: 'l', t: 'seq' },
  { a: 'c2', as: 'r', b: 'c3', bs: 'l', t: 'seq' },
  { a: 'c3', as: 'r', b: 'c4', bs: 'l', t: 'seq' },
  { a: 'c4', as: 'r', b: 'c5', bs: 'l', t: 'seq' },
  { a: 'c6', as: 'r', b: 'c7', bs: 'l', t: 'seq' },
  // review process
  { a: 'n-metric', as: 'l', b: 'n-fb', bs: 'l', t: 'flow', pad: 16 },
  // review outcomes (shared trunk)
  { a: 'n-mon', as: 'r', b: 'n-adv', bs: 'l', t: 'out', mid: 990 },
  { a: 'n-mon', as: 'r', b: 'n-inc', bs: 'l', t: 'out', mid: 990 },
  { a: 'n-mon', as: 'r', b: 'n-dev', bs: 'l', t: 'out', mid: 990 },
  { a: 'n-dev', as: 't', b: 'n-inc', bs: 'b', t: 'out' },
  { a: 'n-dev', as: 'b', b: 'n-exit', bs: 'b', t: 'out', custom: 'dev-exit' },
  // engagement
  { a: 'n-eng', as: 'r', b: 'e-perf', bs: 'l', t: 'flow', mid: 1442 },
  { a: 'n-eng', as: 'r', b: 'e-team', bs: 'l', t: 'flow', mid: 1442 },
  // exit triggers
  { a: 'x-trig', as: 'b', b: 'x-av', bs: 't', t: 'flow', mid: 406 },
  { a: 'x-trig', as: 'b', b: 'x-mr', bs: 't', t: 'flow', mid: 406 },
  { a: 'x-av', as: 'r', b: 'x-att', bs: 'l', t: 'flow' },
  { a: 'x-att', as: 'b', b: 'x-cct', bs: 't', t: 'flow' },
  { a: 'x-c1', as: 'r', b: 'x-cct', bs: 'l', t: 'flow', mid: 1572, bo: -10 },
  { a: 'x-c2', as: 'r', b: 'x-cct', bs: 'l', t: 'flow', mid: 1572 },
  { a: 'x-c3', as: 'r', b: 'x-cct', bs: 'l', t: 'flow', mid: 1572, bo: 10 },
  { a: 'x-cct', as: 'b', b: 'x-rev', bs: 't', t: 'flow' },
  { a: 'x-rev', as: 'b', b: 'x-exit', bs: 't', t: 'flow' },
  { a: 'x-mr', as: 'b', b: 'x-mis', bs: 't', t: 'flow' },
  { a: 'x-mis', as: 'b', b: 'x-te', bs: 't', t: 'flow' },
  { a: 'x-te', as: 'l', b: 'x-rev', bs: 'r', t: 'flow', mid: 1712 },
];

/** Ids that are the end of an edge: hovering one highlights its neighbours. */
export function relatedIds(id: string, edges: Edge[] = LC_EDGES): Set<string> {
  const s = new Set([id]);
  for (const e of edges) {
    if (e.a === id) s.add(e.b);
    if (e.b === id) s.add(e.a);
  }
  return s;
}

export interface LifecycleOptions {
  getStore: () => Store;
  onZoomLabel: (label: string) => void;
}
export interface Lifecycle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  /** Redraw after the view became visible or the SOP data changed. */
  refresh: () => void;
  destroy: () => void;
}

/**
 * Behaviour of the Life Cycle diagram: scaling, connector lines, hover highlighting, live SOP chips and the detail drawer.
 * `root` contains the markup from lifecycle.html. Ported from the legacy page without changing the geometry.
 */
export function createLifecycle(root: HTMLElement, opts: LifecycleOptions): Lifecycle {
  const q = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  const lc = q<HTMLElement>('#lc');
  const scaler = q<HTMLElement>('#lcScaler');
  const scroller = q<HTMLElement>('#lcScroll');
  const svg = q<SVGSVGElement>('#lcEdges');
  const defs = q<SVGDefsElement>('#lcDefs');
  const drawer = q<HTMLElement>('#drawer');
  mkDefs(defs);

  let scale = 1;
  let mul = 1;
  let printing = false;
  let openKey: string | null = null;
  const cleanups: Array<() => void> = [];
  const on = (el: HTMLElement | Document | Window, ev: string, fn: (e: Event) => void) => {
    el.addEventListener(ev, fn);
    cleanups.push(() => el.removeEventListener(ev, fn));
  };

  const edgePath = (d: string, cls: string, marker: string, a: string, b: string) => {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', `edge ${cls}`);
    p.setAttribute('marker-end', `url(#lcDefs-a-${marker})`);
    p.dataset.a = a;
    p.dataset.b = b;
    svg.appendChild(p);
  };
  function drawLoop() {
    const c5 = rect(q('#c5'), lc, scale);
    const c6 = rect(q('#c6'), lc, scale);
    const x1 = c5.r + 6;
    const x2 = c6.l - 6;
    const y = c5.cy;
    edgePath(`M${x1} ${y - 10} C ${x1 + 90} ${y - 38}, ${x2 - 90} ${y - 38}, ${x2} ${y - 10}`, 'loop', 'loop', 'c5', 'c6');
    edgePath(`M${x2} ${y + 10} C ${x2 - 90} ${y + 38}, ${x1 + 90} ${y + 38}, ${x1} ${y + 10}`, 'loop', 'loop', 'c5', 'c6');
  }
  function drawDevExit() {
    const a = rect(q('#n-dev'), lc, scale);
    const b = rect(q('#n-exit'), lc, scale);
    edgePath(rounded([[a.r, a.cy], [b.l, a.cy]], 0), 'out', 'out', 'n-dev', 'n-exit');
  }
  function draw() {
    drawEdges(lc, svg, defs, LC_EDGES.filter((e) => !e.custom), scale);
    drawLoop();
    drawDevExit();
  }
  function setScale() {
    // "Fit" = the diagram's full width fills the window.
    const fit = Math.max(MIN_FIT, (scroller.clientWidth - 2) / CW);
    scale = Math.max(0.3, Math.min(1.8, fit * mul));
    lc.style.transform = `scale(${scale})`;
    scaler.style.width = `${CW * scale}px`;
    scaler.style.height = `${CH * scale}px`;
    opts.onZoomLabel(`${Math.round(scale * 100)}%`);
    draw();
  }

  /* ---------- live SOP chips ---------- */
  function renderSops() {
    const st = opts.getStore();
    if (!st.loaded) return;
    root.querySelectorAll<HTMLElement>('[data-sops-for]').forEach((el) => {
      el.textContent = '';
      for (const n of st.sopsFor(el.dataset.sopsFor!)) {
        const done = st.isDone(n);
        const s = document.createElement('span');
        s.className = (el.dataset.sopCls ?? '') + (done ? ' done' : '');
        s.title = `SOP ${n} — ${st.sopTitle(n)}`;
        s.textContent = `SOP ${n}${done ? ' ✓' : ''}`;
        el.appendChild(s);
      }
    });
  }

  /* ---------- live practice names (edited in the Safeguard Map) ---------- */
  function renderNames() {
    const st = opts.getStore();
    root.querySelectorAll<HTMLElement>('[data-pname]').forEach((el) => {
      el.dataset.def ??= el.textContent ?? '';
      const live = st.loaded ? st.practiceName(el.dataset.pname!) : '';
      const sub = el.closest('.m-prac, .box')?.querySelector('.b-sub')?.textContent ?? '';
      const next = live ? (sub ? stripQualifier(live, sub) : live) : el.dataset.def;
      if (el.textContent !== next) el.textContent = next;
    });
  }

  /* ---------- drawer ---------- */
  function openInfo(key: string) {
    const d = drawerHtml(key, opts.getStore());
    if (!d) return;
    q('#drK').textContent = d.k;
    q('#drT').textContent = d.t;
    q('#drB').innerHTML = d.html; // static text + escaped SOP titles (see info.ts)
    openKey = key;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  }
  function closeInfo() {
    openKey = null;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }
  on(q('#drX'), 'click', closeInfo);
  on(document, 'keydown', (e) => (e as KeyboardEvent).key === 'Escape' && closeInfo());
  on(lc, 'click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-info]');
    if (t) openInfo(t.dataset.info!);
  });
  on(document, 'click', (e) => {
    if (!drawer.classList.contains('open')) return;
    const t = e.target as HTMLElement;
    if (t.closest('#drawer') || t.closest('[data-info]')) return;
    closeInfo();
  });
  on(drawer, 'click', (e) => {
    if ((e.target as HTMLElement).closest('[data-close-drawer]')) closeInfo();
  });

  /* ---------- hover highlighting ---------- */
  const nodeIds = new Set(LC_EDGES.flatMap((e) => [e.a, e.b]));
  lc.querySelectorAll<HTMLElement>('[id]').forEach((n) => {
    if (!nodeIds.has(n.id) || /^c\d$/.test(n.id)) return;
    on(n, 'mouseenter', () => {
      lc.classList.add('hovering');
      svg.querySelectorAll('path.edge').forEach((p) => p.classList.toggle('on', (p as SVGElement).dataset.a === n.id || (p as SVGElement).dataset.b === n.id));
      lc.querySelectorAll('[data-p]').forEach((x) => x.classList.remove('rel'));
      relatedIds(n.id).forEach((i) => lc.querySelector(`#${CSS.escape(i)}`)?.classList.add('rel'));
      n.querySelectorAll('.leaf').forEach((l) => l.classList.add('rel'));
      n.classList.add('rel');
      n.closest('.cluster')?.querySelectorAll('[data-p]').forEach((x) => x.classList.add('rel'));
    });
    on(n, 'mouseleave', () => {
      lc.classList.remove('hovering');
      svg.querySelectorAll('path.edge').forEach((p) => p.classList.remove('on'));
      lc.querySelectorAll('.rel').forEach((x) => x.classList.remove('rel'));
    });
  });

  /* ---------- resize and print ---------- */
  let rz: ReturnType<typeof setTimeout> | undefined;
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    if (printing) return;
    clearTimeout(rz);
    rz = setTimeout(setScale, 60);
  });
  ro?.observe(document.body);
  on(window, 'cb-print', (e) => {
    printing = !!(e as CustomEvent<{ on: boolean }>).detail.on;
    if (!printing) setScale();
  });

  setScale();
  renderSops();
  renderNames();

  return {
    zoomIn: () => {
      mul = Math.min(2.2, mul * 1.15);
      setScale();
    },
    zoomOut: () => {
      mul = Math.max(0.5, mul / 1.15);
      setScale();
    },
    fit: () => {
      mul = 1;
      setScale();
    },
    refresh: () => {
      renderSops();
      renderNames();
      setScale();
      if (openKey && drawer.classList.contains('open')) openInfo(openKey);
    },
    destroy: () => {
      clearTimeout(rz);
      ro?.disconnect();
      cleanups.forEach((f) => f());
    },
  };
}
