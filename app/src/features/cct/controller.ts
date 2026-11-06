import { drawEdges, mkDefs, rect, type Edge } from '../diagram/edges';

export const CCT_EDGES: Edge[] = [
  { a: 'o-org', as: 'b', b: 'o-ops', bs: 't', t: 'flow' },
  { a: 'o-org', as: 'b', b: 'o-nur', bs: 't', t: 'flow' },
  { a: 'o-org', as: 'b', b: 'o-doc', bs: 't', t: 'flow' },
  { a: 'o-org', as: 'b', b: 'o-adm', bs: 't', t: 'flow' },
  { a: 'o-ops', as: 'b', b: 'o-cct', bs: 't', t: 'flow' },
  { a: 'o-nur', as: 'b', b: 'o-cct', bs: 't', t: 'flow' },
  { a: 'o-doc', as: 'b', b: 'o-cct', bs: 't', t: 'flow' },
  { a: 'o-adm', as: 'b', b: 'o-cct', bs: 't', t: 'flow' },
  { a: 'o-cct', as: 'b', b: 'o-met', bs: 't', t: 'flow' },
  { a: 'o-cct', as: 'b', b: 'o-std', bs: 't', t: 'flow' },
  { a: 'o-met', as: 'b', b: 'o-j', bs: 't', t: 'out' },
  { a: 'o-std', as: 'b', b: 'o-j', bs: 't', t: 'out' },
  { a: 'o-j', as: 'b', b: 'o-exp', bs: 't', t: 'out' },
  { a: 'o-j', as: 'b', b: 'o-rev', bs: 't', t: 'out' },
  { a: 'u-a', as: 'r', b: 'u-hero', bs: 'l', t: 'flow' },
  { a: 'u-b', as: 'r', b: 'u-hero', bs: 'l', t: 'flow' },
  { a: 'u-c', as: 'r', b: 'u-hero', bs: 'l', t: 'flow' },
  { a: 'u-d', as: 'r', b: 'u-hero', bs: 'l', t: 'flow' },
];

/** Which edges apply: the unit lines only when the units sit beside the hero box; on phones the org -> CCT lines are dropped. */
export function visibleEdges(sideBySide: boolean, mobile: boolean): Edge[] {
  return CCT_EDGES.filter((e) => !(!sideBySide && e.a.startsWith('u-')) && !(mobile && (e.a === 'o-org' || e.b === 'o-cct')));
}

/** Units on the CCT page and the area each one reads from the Outcomes table. */
export const CCT_UNITS: Record<string, string> = { 'u-a': 'unit-a', 'u-b': 'unit-b', 'u-c': 'team-3', 'u-d': 'team-4' };
export const CCT_ORG: Record<string, string[]> = { 'o-ops': ['unit-a', 'unit-b'], 'o-nur': ['team-1'], 'o-doc': ['team-2'], 'o-adm': ['administration'] };
/** [outcomes pillar code, dimension key, letter, label, css class] */
export const CCT_PILLARS: Array<[string, string, string, string, string]> = [
  ['time', 'time', 'T', 'Time', 'd-time'],
  ['care', 'care', 'C', 'Care', 'd-care'],
  ['convenience', 'conv', 'C', 'Convenience', 'd-conv'],
];

export const countLabel = (n: number, what = 'outcome') => `${n} ${what}${n > 1 ? 's' : ''}`;

/** Fitted zoom so the board fills the window below its top edge (never above 100%, never below 50%). */
export function fitZoomFor(windowHeight: number, top: number, boardHeight: number): number {
  return Math.max(0.5, Math.min(1, (windowHeight - top - 12) / boardHeight));
}
export const clampZoom = (z: number) => Math.max(0.5, Math.min(2.2, z));

export interface OutcomeCounts {
  loaded: boolean;
  count: (area: string, pillar?: string) => number;
  /** Display name of a pillar added in Outcomes (not one of the three built-in CCT chips). */
  pillarName?: (code: string) => string | undefined;
  /** Outcome counts keyed `area__pillar`, to discover pillars beyond the built-in three. */
  codexKeys?: () => Record<string, number>;
}
export interface CctOptions {
  getCounts: () => OutcomeCounts;
  onZoomLabel: (label: string) => void;
  openOutcomes: (area: string, pillar: string | null) => void;
}
export interface Cct {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  refresh: () => void;
  destroy: () => void;
}

/** Behaviour of the CCT Framework page: connectors, fit-to-window zoom, highlighting and outcome chips. Ported from the legacy page. */
export function createCct(root: HTMLElement, opts: CctOptions): Cct {
  const q = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  const board = q<HTMLElement>('#cctBoard');
  const svg = q<SVGSVGElement>('#cctEdges');
  const defs = q<SVGDefsElement>('#cctDefs');
  const target = q<HTMLElement>('#cct');
  mkDefs(defs);

  let zoom = 1;
  let manual = false;
  let printing = false;
  const cleanups: Array<() => void> = [];
  const on = (el: EventTarget, ev: string, fn: (e: Event) => void) => {
    el.addEventListener(ev, fn);
    cleanups.push(() => el.removeEventListener(ev, fn));
  };
  const scale = () => (printing ? 1 : zoom);
  const R = (id: string) => rect(q(`#${id}`), board, scale());

  function draw() {
    const hero = R('u-hero');
    const unit = R('u-a');
    const edges = visibleEdges(hero.l > unit.r, window.matchMedia('(max-width:760px)').matches).map((e) => ({ ...e }));
    const org = R('o-org');
    const ops = R('o-ops');
    const cct = R('o-cct');
    const met = R('o-met');
    const j = R('o-j');
    const exp = R('o-exp');
    const busTop = (org.b + ops.t) / 2;
    const busMid = (ops.b + cct.t) / 2;
    const bus2 = (cct.b + met.t) / 2;
    const bus3 = (met.b + j.t) / 2;
    const bus4 = (j.b + exp.t) / 2;
    const busU = (unit.r + hero.l) / 2;
    for (const e of edges) {
      if (e.a === 'o-org') e.mid = busTop;
      else if (e.b === 'o-cct') e.mid = busMid;
      else if (e.a === 'o-cct') e.mid = bus2;
      else if (e.b === 'o-j') e.mid = bus3;
      else if (e.a === 'o-j') e.mid = bus4;
      else if (e.a.startsWith('u-')) e.mid = busU;
      // Spread the converging lines so their arrowheads don't overlap.
      if (e.b === 'o-cct') e.bo = (['o-ops', 'o-nur', 'o-doc', 'o-adm'].indexOf(e.a) - 1.5) * 76;
      if (e.b === 'u-hero') e.bo = (['u-a', 'u-b', 'u-c', 'u-d'].indexOf(e.a) - 1.5) * 34;
      if (e.a === 'o-cct') e.ao = e.b === 'o-met' ? -40 : 40;
      if (e.a === 'o-j') e.ao = 0;
      if (e.b === 'o-j') e.bo = 0;
    }
    drawEdges(board, svg, defs, edges, scale());
  }

  function applyZoom(z: number) {
    zoom = Math.round(z * 1000) / 1000;
    target.style.zoom = zoom === 1 ? '' : String(zoom);
    opts.onZoomLabel(`${Math.round(zoom * 100)}%`);
    draw();
  }
  function fitView() {
    if (manual || printing) return;
    target.style.zoom = '';
    const r = target.getBoundingClientRect();
    applyZoom(fitZoomFor(window.innerHeight, r.top + window.scrollY, r.height));
  }
  const refit = () => {
    if (!manual) requestAnimationFrame(fitView);
  };

  /* Hovering Operations lights up its units, and the other way round. */
  const hosp = q<HTMLElement>('#o-ops');
  const hgroup = q<HTMLElement>('#hgroup');
  for (const n of [hosp, hgroup]) {
    on(n, 'mouseenter', () => {
      hosp.classList.add('hot');
      root.querySelectorAll('.hgroup .unit').forEach((u) => u.classList.add('hot'));
    });
    on(n, 'mouseleave', () => {
      hosp.classList.remove('hot');
      root.querySelectorAll('.hgroup .unit').forEach((u) => u.classList.remove('hot'));
    });
  }

  /* Care / Convenience / Time highlight. */
  let curD: string | null = null;
  on(q('#dLegend'), 'click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.chip');
    if (!b) return;
    curD = curD === b.dataset.d ? null : b.dataset.d!;
    root.querySelectorAll<HTMLElement>('#dLegend .chip').forEach((c) => c.classList.toggle('on', c.dataset.d === curD));
    board.classList.toggle('dimming', !!curD);
    root.querySelectorAll<HTMLElement>('.dim-chip').forEach((c) => c.classList.toggle('sel', c.dataset.d === curD));
  });

  /* Outcome chips and counts (only once the database has loaded; otherwise the static chips stay). */
  const labels = new Map<string, Record<string, string>>();
  function renderOutcomes() {
    const st = opts.getCounts();
    if (!st.loaded) return;
    for (const [uid, area] of Object.entries(CCT_UNITS)) {
      const cc = root.querySelector<HTMLElement>(`#${uid} .cc`);
      if (!cc) continue;
      if (!labels.has(uid)) {
        const l: Record<string, string> = {};
        cc.querySelectorAll<HTMLElement>('.dim-chip').forEach((ch) => (l[ch.dataset.d!] = ch.innerHTML.replace(/^<b>.*?<\/b>/, '')));
        labels.set(uid, l);
      }
      const lbl = labels.get(uid)!;
      cc.textContent = '';
      for (const [pid, d, letter, label, cls] of CCT_PILLARS) {
        const n = st.count(area, pid);
        if (!n && !(d in lbl)) continue; // default chips always stay; extra pillars appear once they have outcomes
        const chip = document.createElement('span');
        chip.className = `dim-chip oc-open ${cls}`;
        chip.dataset.d = d;
        chip.dataset.area = area;
        chip.dataset.pillar = pid;
        chip.tabIndex = 0;
        chip.setAttribute('role', 'button');
        chip.title = `${n ? countLabel(n) : 'No outcomes yet'} — open in Performance Outcomes`;
        const b = document.createElement('b');
        b.textContent = letter;
        chip.append(b);
        // `lbl[d]` is the page's own static markup (e.g. "Care <small>(accuracy)</small>"), not user data.
        chip.insertAdjacentHTML('beforeend', lbl[d] || label);
        if (n) {
          chip.append(' ');
          const em = document.createElement('em');
          em.className = 'oc';
          em.textContent = String(n);
          chip.append(em);
        }
        cc.appendChild(chip);
      }
      // Pillars added from the admin side: show a tag once this unit has outcomes under them.
      const known = new Set(CCT_PILLARS.map((x) => x[0]));
      const extra = new Set<string>();
      for (const key of Object.keys(st.codexKeys?.() ?? {})) {
        const [a, p] = key.split('__');
        if (a === area && p && !known.has(p) && st.count(area, p)) extra.add(p);
      }
      for (const p of extra) {
        const chip = document.createElement('span');
        chip.className = 'dim-chip oc-open d-extra';
        chip.dataset.d = p;
        chip.dataset.area = area;
        chip.dataset.pillar = p;
        chip.tabIndex = 0;
        chip.setAttribute('role', 'button');
        const n = st.count(area, p);
        const name = st.pillarName?.(p) ?? p;
        chip.title = `${countLabel(n)} — open in Performance Outcomes`;
        const b = document.createElement('b');
        b.textContent = name.charAt(0).toUpperCase();
        chip.append(b, name, ' ');
        const em = document.createElement('em');
        em.className = 'oc';
        em.textContent = String(n);
        chip.append(em);
        cc.appendChild(chip);
      }
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'oc-add oc-open';
      add.dataset.area = area;
      add.textContent = '+ Add / edit';
      cc.appendChild(add);
    }
    for (const [nid, areas] of Object.entries(CCT_ORG)) {
      const node = root.querySelector<HTMLElement>(`#${nid}`);
      if (!node) continue;
      node.querySelectorAll('.ocbadge').forEach((b) => b.remove());
      const n = areas.reduce((t, a) => t + st.count(a), 0);
      if (!n) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ocbadge oc-open';
      b.dataset.area = areas[0];
      b.title = `${countLabel(n)} — open in Performance Outcomes`;
      b.textContent = countLabel(n);
      node.appendChild(b);
    }
  }
  on(root, 'click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('.oc-open');
    if (t) opts.openOutcomes(t.dataset.area!, t.dataset.pillar ?? null);
  });
  on(root, 'keydown', (e) => {
    const k = e as KeyboardEvent;
    if ((k.key === 'Enter' || k.key === ' ') && (k.target as HTMLElement).matches?.('.dim-chip.oc-open')) {
      k.preventDefault();
      (k.target as HTMLElement).click();
    }
  });

  let rz: ReturnType<typeof setTimeout> | undefined;
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    if (printing) return;
    clearTimeout(rz);
    rz = setTimeout(draw, 60);
  });
  ro?.observe(document.body);
  on(window, 'resize', refit);
  on(window, 'cb-print', (e) => {
    printing = !!(e as CustomEvent<{ on: boolean }>).detail.on;
    if (printing) target.style.zoom = '';
    else target.style.zoom = zoom === 1 ? '' : String(zoom);
    draw();
  });
  // Chips and tabs change the board's height, so fit again after they act.
  on(root, 'click', () => setTimeout(refit, 80));

  const settle = () => {
    renderOutcomes();
    fitView();
    draw();
  };
  const raf = requestAnimationFrame(settle);
  const later = setTimeout(fitView, 350);

  return {
    zoomIn: () => {
      manual = true;
      applyZoom(clampZoom(zoom * 1.15));
    },
    zoomOut: () => {
      manual = true;
      applyZoom(clampZoom(zoom / 1.15));
    },
    fit: () => {
      manual = false;
      fitView();
    },
    refresh: () => {
      renderOutcomes();
      draw();
      refit();
    },
    destroy: () => {
      cancelAnimationFrame(raf);
      clearTimeout(later);
      clearTimeout(rz);
      ro?.disconnect();
      cleanups.forEach((f) => f());
    },
  };
}
