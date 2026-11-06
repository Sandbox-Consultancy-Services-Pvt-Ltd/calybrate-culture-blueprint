/**
 * HTML for the Safeguard Map (rings, pillars, trays, key). Pure functions of the current layout and selection.
 * Value, practice and SOP wording can be changed by an administrator, so every piece of it is passed through esc() on its way into HTML.
 */
import { AREAS, PMAP, PRACTICES, VALUES, VMAP, canDelete, type Layout, type Sop } from './data';
import { docKey, formatSize, type DocInfo, type DocKind } from './documents';
import { crossCutting, isSel, placedIn, practicesOf, related, wedgeItems, wedgesOfPractice, wedgesOfSop, type Sel } from './model';

/** HTML-escapes text for element content and double-quoted attributes. */
export const esc = (t: unknown) =>
  String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export interface Ctx {
  st: Layout;
  sel: Sel | null;
  sops: Sop[];
  /** Uploaded documents by docKey(); only present when the shared database is in use. */
  docs?: Record<string, DocInfo>;
  /** False offline (no shared database), so documents cannot be stored. */
  docsOn?: boolean;
  canEdit?: boolean;
}

/** The Document section of the details panel for an SOP or a practice. */
export function docHtml(ctx: Ctx, kind: DocKind, ref: string): string {
  const what = kind === 'sop' ? 'SOP' : 'practice';
  const head = '<h4>Document</h4>';
  if (!ctx.docsOn) return `${head}<p class="note">Documents are kept in the shared database, so they are not available in offline mode.</p>`;
  const d = ctx.docs?.[docKey(kind, ref)];
  const at = (a: string) => `data-doc="${a}" data-kind="${kind}" data-ref="${ref}"`;
  if (!d) {
    const up = ctx.canEdit ? `<div class="doc-a"><button type="button" class="btn primary" ${at('upload')}>Upload PDF</button></div><p class="note">PDF only, up to 20 MB.</p>` : '<p class="note">Only editors and admins can upload.</p>';
    return `${head}<p class="note">No document uploaded for this ${what} yet.</p>${up}`;
  }
  const when = new Date(d.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const edit = ctx.canEdit ? `<button type="button" class="btn" ${at('upload')}>Replace</button><button type="button" class="btn" ${at('remove')}>Remove</button>` : '';
  return `${head}<div class="doc"><div class="doc-n" title="${esc(d.name)}">📄 ${esc(d.name)}</div><div class="doc-m">${formatSize(d.size)} · uploaded ${when}</div><div class="doc-a"><button type="button" class="btn primary" ${at('open')}>Open</button>${edit}</div></div>`;
}

const CX = 350;
const CY = 350;
const pol = (r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [+(CX + r * Math.cos(a)).toFixed(1), +(CY + r * Math.sin(a)).toFixed(1)];
};
/** Ring radii, centre outward: Purpose, Values, Practices, SOPs, Zero tolerance, then the coloured area ring. */
const R_PUR = 54;
const R_VAL = 160;
const R_PRA = 226;
const R_SOP = 288;
const R_ZER = 320;
const R_AR0 = 324;
const R_AR1 = 346;
const pt = (p: [number, number]) => `${p[0]} ${p[1]}`;
/** An annular sector between two radii and two angles. */
const sector = (r1: number, r2: number, a0: number, a1: number) =>
  `M${pt(pol(r2, a0))} A${r2} ${r2} 0 0 1 ${pt(pol(r2, a1))} L${pt(pol(r1, a1))} A${r1} ${r1} 0 0 0 ${pt(pol(r1, a0))} Z`;
/** Fraction of a wedge the items spread over, leaving a margin each side so the dotted dividers stay clear (60 of 72 degrees with 5 values). */
const FILL = 5 / 6;
const AREA_FILL = ['var(--green-700)', 'var(--blue-600)', 'var(--green-800)', 'var(--blue-700)'];

const badge = (x: number, y: number, nr: number, count: number, others: string) =>
  count > 1 ? `<g class="shb"><title>${others}</title><circle cx="${+(x + nr * 0.82).toFixed(1)}" cy="${+(y - nr * 0.82).toFixed(1)}" r="6.6" style="fill:#C27A00;stroke:#fff;stroke-width:1.3"/><text x="${+(x + nr * 0.8).toFixed(1)}" y="${+(y - nr * 0.8).toFixed(1)}" style="fill:#fff;font-size:7.4px;font-weight:800">×${count}</text></g>` : '';

export function ringsSVG({ st, sel, sops }: Ctx): string {
  const R = related(st, sel);
  // One wedge per value, so the ring adapts when an administrator adds one.
  const WEDGE = 360 / Math.max(1, VALUES.length);
  const SPAN = WEDGE * FILL;
  const centreOf = (i: number) => -90 + WEDGE * i;
  /** Angle of item k of n inside a wedge. */
  const spread = (centre: number, n: number, k: number) => centre - SPAN / 2 + (SPAN * (k + 0.5)) / n;
  /** Node radius that still fits n items across the wedge at radius r. */
  const nodeR = (r: number, n: number) => +Math.max(10.5, Math.min(16.5, (((SPAN / n) * Math.PI) / 180) * r * 0.46)).toFixed(1);
  const c = (base: string, inSet: boolean | null, t: string, id: string | number) => base + (R ? (inSet ? ' lit' : ' dim') : '') + (isSel(sel, t, id) ? ' sel' : '');
  const sopOf = (n: number) => sops.find((s) => s.n === n)!;
  let h = `<svg class="rsvg" viewBox="0 -14 700 714" role="img" aria-label="Culture wedge map: purpose in the centre, then values, practices, SOPs and zero tolerance. Each value is one wedge holding its own practices and SOPs.">`;

  // bands, drawn outside-in
  h += `<g data-open="zero:z" class="t-z${R && R.Z ? ' zon' : ''}"><title>Zero tolerance — exit triggers, CCT, review, exit</title><circle class="zband" cx="${CX}" cy="${CY}" r="${R_ZER}"/></g>`;
  h += `<g class="t-s"><circle class="sband" cx="${CX}" cy="${CY}" r="${R_SOP}"/></g><g class="t-p"><circle class="pband" cx="${CX}" cy="${CY}" r="${R_PRA}"/></g><g class="t-v"><circle class="vband" cx="${CX}" cy="${CY}" r="${R_VAL}"/></g>`;

  // area ring (outside): one coloured arc per area, spanning the wedges of its values
  AREAS.forEach((name, ai) => {
    const idx = VALUES.map((v, i) => (v.area === ai ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return;
    const a0 = centreOf(idx[0]) - WEDGE / 2;
    const a1 = centreOf(idx[idx.length - 1]) + WEDGE / 2;
    const mid = (a0 + a1) / 2;
    const flip = Math.sin((mid * Math.PI) / 180) > 0.15; // keep the lettering upright on the lower half
    const rm = (R_AR0 + R_AR1) / 2;
    const [s, e] = flip ? [a1 - 3, a0 + 3] : [a0 + 3, a1 - 3];
    const d = `M${pt(pol(rm, s))} A${rm} ${rm} 0 0 ${flip ? 0 : 1} ${pt(pol(rm, e))}`;
    h += `<g class="aring t-z"><title>${name}</title><path d="${sector(R_AR0, R_AR1, a0 + 0.8, a1 - 0.8)}" fill="${AREA_FILL[ai]}"/><path id="ar${ai}" d="${d}" fill="none"/><text class="atxt" dominant-baseline="central"><textPath href="#ar${ai}" startOffset="50%">${name}</textPath></text></g>`;
  });

  // dotted dividers run from the Purpose out through values, practices and SOPs, so each wedge is one complete piece; the zero-tolerance ring stays whole because it applies to every value
  for (let i = 0; i < VALUES.length; i++) {
    const a = centreOf(i) - WEDGE / 2;
    const p = pol(R_PUR, a);
    const q = pol(R_SOP, a);
    h += `<line class="divl" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}"/>`;
  }

  h += `<g class="pur t-pur${R ? ' lit' : ''}" data-open="purpose:p"><title>Purpose — To be the best care, brought closer to you</title><circle cx="${CX}" cy="${CY}" r="${R_PUR}"/><text x="${CX}" y="${CY - 13}" font-size="13.5">Purpose</text><text x="${CX}" y="${CY + 4}" font-size="10.5" font-weight="500">Best care,</text><text x="${CX}" y="${CY + 18}" font-size="10.5" font-weight="500">closer to you</text></g>`;

  // one wedge per value: its pill, its practices, their SOPs
  VALUES.forEach((v, i) => {
    const centre = centreOf(i);
    const { practices, sops: ws } = wedgeItems(st, v.id);
    const lit = R && R.V.has(v.id) ? ' wsel' : '';
    h += `<g class="wedge${lit}" data-drop="V:${v.id}"><path class="wsec" d="${sector(R_PUR, R_SOP, centre - WEDGE / 2, centre + WEDGE / 2)}" data-open="value:${v.id}"><title>${esc(v.n)} — ${AREAS[v.area]}: click to see this piece on its own</title></path>`;

    const w = Math.round(v.n.length * 5.9 + 16);
    const rad = (centre * Math.PI) / 180;
    // push the pill out far enough that its inner end clears the Purpose circle on the side wedges
    const [vx, vy] = pol(Math.max((R_PUR + R_VAL) / 2, R_PUR + 11 + (w / 2) * Math.abs(Math.cos(rad)) + 10 * Math.abs(Math.sin(rad))), centre);
    h += `<g class="${c('vnode t-v', R && R.V.has(v.id), 'value', v.id)}" data-open="value:${v.id}" data-drop="V:${v.id}"><title>${esc(v.n)} — ${AREAS[v.area]}</title><rect x="${+(vx - w / 2).toFixed(1)}" y="${+(vy - 10).toFixed(1)}" width="${w}" height="20" rx="10"/><text x="${vx}" y="${vy}">${esc(v.n)}</text></g>`;

    const pr = nodeR((R_VAL + R_PRA) / 2, practices.length || 1);
    practices.forEach((pid, k) => {
      const [x, y] = pol((R_VAL + R_PRA) / 2, spread(centre, practices.length, k));
      const also = wedgesOfPractice(st, pid).filter((x2) => x2 !== v.id);
      const note = also.length ? ` · also guards ${also.map((x2) => esc(VMAP[x2].n)).join(', ')}` : '';
      h += `<g class="${c('pnode t-p', R && R.P.has(pid), 'practice', pid)}" data-open="practice:${pid}" data-drop="${pid}" data-dragprac="${pid}" data-from="V:${v.id}"><title>${pid} — ${esc(PMAP[pid].n)}${note}</title><circle cx="${x}" cy="${y}" r="${pr}"/><text x="${x}" y="${y}" style="font-size:${+(pr * 0.78).toFixed(1)}px">${pid}</text>${badge(x, y, pr, also.length + 1, `Shared: also guards ${also.map((x2) => esc(VMAP[x2].n)).join(', ')}`)}</g>`;
    });

    const sr = nodeR((R_PRA + R_SOP) / 2, ws.length || 1);
    ws.forEach((n, k) => {
      const [x, y] = pol((R_PRA + R_SOP) / 2, spread(centre, ws.length, k));
      const s = sopOf(n);
      const also = wedgesOfSop(st, n).filter((x2) => x2 !== v.id);
      const note = also.length ? ` · also in ${also.map((x2) => esc(VMAP[x2].n)).join(', ')}` : '';
      h += `<g class="${c('snode t-s', R && R.S.has(n), 'sop', n)}${s.done ? ' done' : ''}" data-open="sop:${n}" data-dragsop="${n}" data-from="ring"><title>SOP ${n} — ${esc(s.t)}${s.done ? ' (Done)' : ''}${note}</title><circle cx="${x}" cy="${y}" r="${sr}"/><text x="${x}" y="${y}" style="font-size:${+(sr * 0.72).toFixed(1)}px">S${n}</text>${badge(x, y, sr, also.length + 1, `Shared: also in ${also.map((x2) => esc(VMAP[x2].n)).join(', ')}`)}</g>`;
    });
    h += `</g>`;
  });

  // zero-tolerance base: P9 (Exit) and its SOPs, shared by every value
  const base = PRACTICES.filter((p) => crossCutting(p.id));
  const zr = (R_SOP + R_ZER) / 2;
  base.forEach((p) => {
    const zs = st.ps[p.id];
    const [x, y] = pol(zr, 90);
    h += `<g class="${c('pnode t-z', R && R.P.has(p.id), 'practice', p.id)}" data-open="practice:${p.id}" data-drop="${p.id}" data-dragprac="${p.id}" data-from="ring"><title>${p.id} — ${esc(p.n)} (applies to every value)</title><circle cx="${x}" cy="${y}" r="13"/><text x="${x}" y="${y}" style="font-size:10.5px">${p.id}</text></g>`;
    zs.forEach((n, k) => {
      const [sx, sy] = pol(zr, 90 + 8 * (k % 2 ? -1 : 1) * Math.ceil((k + 1) / 2));
      const s = sopOf(n);
      h += `<g class="${c('snode t-z', R && R.S.has(n), 'sop', n)}${s.done ? ' done' : ''}" data-open="sop:${n}" data-dragsop="${n}" data-from="ring"><title>SOP ${n} — ${esc(s.t)}${s.done ? ' (Done)' : ''}</title><circle cx="${sx}" cy="${sy}" r="11"/><text x="${sx}" y="${sy}" style="font-size:8.5px">S${n}</text></g>`;
    });
  });
  const zl = `M${pt(pol(zr - 2, -90 - 20))} A${zr - 2} ${zr - 2} 0 0 1 ${pt(pol(zr - 2, -90 + 20))}`;
  h += `<path id="zl" d="${zl}" fill="none"/><text class="blab t-z" dominant-baseline="central"><textPath href="#zl" startOffset="50%">ZERO TOLERANCE</textPath></text>`;
  h += `</svg>`;
  h +=
    `<div class="rlegend" aria-hidden="true"><span><i class="lg lv"></i>Values</span><span><i class="lg lp"></i>Practices</span><span><i class="lg ls"></i>SOPs</span><span><i class="lg lz"></i>Zero tolerance</span>` +
    `<span><i class="lg lsh">×2</i>Shared with other values</span><span class="lgh">Click a wedge to see that value on its own</span></div>`;
  return h;
}

/** The three key lists: [values, practices, SOPs]. */
export function keyParts({ st, sel, sops }: Ctx): [string, string, string] {
  const R = related(st, sel);
  const d = (inSet: boolean | null) => (R && !inSet ? ' dim' : '');
  let v = '<h4>Values</h4>';
  AREAS.forEach((a, i) => {
    v +=
      `<div class="ga">${a}</div>` +
      VALUES.filter((x) => x.area === i)
        .map((x) => `<div class="ki v${d(R && R.V.has(x.id))}${isSel(sel, 'value', x.id) ? ' sel' : ''}" data-open="value:${x.id}" data-gap="${practicesOf(st, x.id).length ? 0 : 1}"><b>${VALUES.indexOf(x) + 1}</b>${esc(x.n)}</div>`)
        .join('');
  });
  const p = '<h4>Practices</h4>' + PRACTICES.map((x) => `<div class="ki p${d(R && R.P.has(x.id))}${isSel(sel, 'practice', x.id) ? ' sel' : ''}" data-open="practice:${x.id}"><b>${x.id}</b>${esc(x.n)}</div>`).join('');
  const s = '<h4>SOPs</h4>' + sops.map((x) => `<div class="ki s${d(R && R.S.has(x.n))}${isSel(sel, 'sop', x.n) ? ' sel' : ''}" data-open="sop:${esc(x.n)}"><b>${esc(x.n)}</b>${esc(x.t)}${x.done ? '<span class="ok">✓</span>' : ''}</div>`).join('');
  return [v, p, s];
}

function sopChip(ctx: Ctx, n: number, from: string, sm: boolean): string {
  const s = ctx.sops.find((x) => x.n === n)!;
  return `<span class="sopchip${sm ? ' sm' : ''}${s.done ? ' done' : ''}${isSel(ctx.sel, 'sop', n) ? ' sel' : ''}" data-open="sop:${n}" data-dragsop="${n}" data-from="${from}" title="SOP ${n} — ${esc(s.t)}"><b>SOP ${n}</b><button class="rm" data-rm="${from}|${n}" aria-label="Unlink SOP ${n}">×</button></span>`;
}
function ptag(ctx: Ctx, pid: string, vid: string): string {
  const R = related(ctx.st, ctx.sel);
  const p = PMAP[pid];
  const dm = R && !R.P.has(pid) ? ' dim' : '';
  const sops = ctx.st.ps[pid];
  return `<div class="ptag${dm}${isSel(ctx.sel, 'practice', pid) ? ' sel' : ''}" data-open="practice:${pid}" data-drop="${pid}" data-dragprac="${pid}" data-from="V:${vid}">
    <div class="pt-h"><span class="pid" title="Drag to another pillar">${pid}</span><span class="pt-n">${esc(p.n)}</span><button class="rm" data-unp="${vid}|${pid}" aria-label="Remove ${pid} from this value">×</button></div>
    <div class="pt-s">${sops.length ? sops.map((n) => sopChip(ctx, n, pid, true)).join('') : '<span class="hint">Drop an SOP here</span>'}</div></div>`;
}

export function pillarsHTML(ctx: Ctx): string {
  const { st, sel } = ctx;
  const R = related(st, sel);
  let h = `<div class="roof" data-open="purpose:p">Purpose: “To be the best care — brought closer to you.”</div><div class="pillars" style="--vn:${VALUES.length}">`;
  VALUES.forEach((v, i) => {
    const ps = practicesOf(st, v.id);
    const dm = R && !R.V.has(v.id) ? ' dim' : '';
    const su = [...new Set(ps.flatMap((p) => st.ps[p]))].sort((a, b) => a - b);
    h += `<div class="pillar${dm}" data-drop="V:${v.id}">
      <div class="pl-h${isSel(sel, 'value', v.id) ? ' sel' : ''}" data-open="value:${v.id}"><b>${i + 1}</b><div><div class="pl-n">${esc(v.n)}</div><div class="pl-a">${AREAS[v.area]}</div></div></div>
      <div class="pl-body">${ps.length ? ps.map((p) => ptag(ctx, p, v.id)).join('') : '<div class="hint">No practice guards this value yet.</div>'}</div>
      <div class="pl-drop">Drop a practice here</div>
      <div class="pl-sops">SOPs: ${su.length ? su.join(' · ') : 'none yet'}</div></div>`;
  });
  h += `</div><div class="found${R && R.Z ? ' on' : ''}" data-open="zero:z"><h4>Zero-tolerance foundation</h4><span class="fs">Exit triggers</span><span class="fa">→</span><span class="fs">CCT check</span><span class="fa">→</span><span class="fs">Review</span><span class="fa">→</span><span class="fs end">Exit</span><span class="fd">SOP 8</span><span class="fd">LOA</span><span class="fd">NDA</span><span class="fd">Handbook + Acceptance</span></div>`;
  return h;
}

export function trayChip({ st, sel, sops }: Ctx, n: number): string {
  const s = sops.find((x) => x.n === n)!;
  const cnt = placedIn(st, n).length;
  const R = related(st, sel);
  const dm = R && !R.S.has(n) ? ' dim' : '';
  return `<span class="sopchip${s.done ? ' done' : ''}${cnt ? '' : ' un'}${dm}${isSel(sel, 'sop', n) ? ' sel' : ''}" data-open="sop:${n}" data-dragsop="${n}" data-from="tray" title="SOP ${n} — ${esc(s.t)}${s.done ? ' (Done)' : ''}"><b>SOP ${n}</b><em>${esc(s.t)}</em>${cnt ? `<u>${cnt}</u>` : ''}</span>`;
}

export function practiceTray({ st, sel }: Ctx): string {
  const R = related(st, sel);
  return PRACTICES.map(
    (p) =>
      `<span class="pchip${R && !R.P.has(p.id) ? ' dim' : ''}${isSel(sel, 'practice', p.id) ? ' sel' : ''}" data-open="practice:${p.id}" data-dragprac="${p.id}" data-from="ptray" data-gap="${st.ps[p.id].length ? 0 : 1}" title="${esc(p.n)}"><span class="pid">${p.id}</span>${esc(p.n)}</span>`,
  ).join('');
}

export function coverageHTML(c: { noPrac: number; noSop: number; unplaced: number }): string {
  return (
    `<button type="button" class="${c.noPrac ? 'bad' : 'ok'}" data-gapf="values"><span>Values without a practice</span><b>${c.noPrac}</b></button>` +
    `<button type="button" class="${c.noSop ? 'bad' : 'ok'}" data-gapf="practices"><span>Practices without an SOP</span><b>${c.noSop}</b></button>` +
    `<button type="button" class="${c.unplaced ? 'bad' : 'ok'}" data-gapf="sops"><span>SOPs not placed</span><b>${c.unplaced}</b></button>`
  );
}

/** Drawer content for a selected item. Returns the small heading, the title and the body HTML. */
export function infoHtml(ctx: Ctx, type: string, id: string): { k: string; t: string; h: string } {
  const { st, sops } = ctx;
  let k = '';
  let t = '';
  let h = '';
  if (type === 'purpose') {
    k = 'Purpose';
    t = 'To be the best care — brought closer to you.';
    h = '<p>The expertise people once travelled for, now where you live. Because distance should never decide the care you receive.</p><h4>Vision</h4><p>To bring global standard healthcare within reach of every Sri Lankan.</p><h4>Service promise</h4><p>No surprises. The care you came for.</p>';
  } else if (type === 'value') {
    const v = VALUES.find((x) => x.id === id)!;
    k = `Value · ${AREAS[v.area]}`;
    t = v.n;
    const i = VALUES.indexOf(v);
    const n = VALUES.length;
    const w = wedgeItems(st, id);
    const link = (x: string) => `<a data-open="value:${x}">${esc(VMAP[x].n)}</a>`;
    const piece = w.practices.length
      ? w.practices
          .map((p) => {
            const also = wedgesOfPractice(st, p).filter((x) => x !== id);
            const ss = st.ps[p].map((s) => `<span class="dr-s" data-open="sop:${s}">SOP ${s}${wedgesOfSop(st, s).length > 1 ? ' ×' + wedgesOfSop(st, s).length : ''}</span>`).join('');
            return `<div class="dr-p"><div class="dr-ph" data-open="practice:${p}"><b>${p}</b>${esc(PMAP[p].n)}</div>${also.length ? `<div class="pt-sh">Shared — also guards ${also.map(link).join(', ')}</div>` : ''}<div class="dr-ss">${ss || '<span class="hint">No SOP yet</span>'}</div></div>`;
          })
          .join('')
      : '<p class="note">No practice guards this value yet. Tick one below, or drag one onto this wedge.</p>';
    const nav = `<div class="dr-nav"><button type="button" class="btn" data-slice="prev">‹ ${esc(VALUES[(i + n - 1) % n].n)}</button><span>Piece ${i + 1} of ${n}</span><button type="button" class="btn" data-slice="next">${esc(VALUES[(i + 1) % n].n)} ›</button></div>`;
    h = `${nav}<h4>Everything in this piece</h4>${piece}<p class="note"><b>SOPs here:</b> ${w.sops.length ? w.sops.map((x) => `SOP ${x}`).join(' · ') : 'none yet'}. A × number means the SOP is also in other pieces. <b>Applies to every value:</b> ${PRACTICES.filter((p) => crossCutting(p.id)).map((p) => `${p.id} ${esc(p.n)}`).join(', ')} (zero-tolerance path).</p><h4>Value</h4><p>${esc(v.o2)}</p><h4>Value descriptor</h4><p>${esc(v.desc)}</p><h4>Practices that safeguard it — tick to change</h4><div class="chk">${PRACTICES.map((p) => `<label><input type="checkbox" data-vp="${id}|${p.id}" ${st.pv[p.id].includes(id) ? 'checked' : ''}><span>${p.id} · ${esc(p.n)}</span></label>`).join('')}</div><p class="note">Practice links are a draft until confirmed.</p>`;
  } else if (type === 'practice') {
    const p = PMAP[id];
    k = p.st ? `Practice ${id} · ${p.st}` : `Practice ${id}`;
    t = p.n;
    h = `<p>${esc(p.d)}</p>${docHtml(ctx, 'practice', id)}<h4>Values it safeguards — tick to change</h4><div class="chk">${VALUES.map((v) => `<label><input type="checkbox" data-pv="${id}|${v.id}" ${st.pv[id].includes(v.id) ? 'checked' : ''}><span>${esc(v.n)}<small>${AREAS[v.area]}</small></span></label>`).join('')}</div><h4>SOPs behind it — tick to change</h4><div class="chk">${sops.map((s) => `<label><input type="checkbox" data-ps="${id}|${esc(s.n)}" ${st.ps[id].includes(s.n) ? 'checked' : ''}><span>SOP ${esc(s.n)} · ${esc(s.t)}${s.done ? ' ✓' : ''}</span></label>`).join('')}</div>`;
  } else if (type === 'sop') {
    const s = sops.find((x) => x.n === +id)!;
    k = `SOP ${id}`;
    t = s.t;
    h = `<span class="status ${s.done ? 'new' : 'sop'}">${s.done ? 'Done' : 'Not marked done yet'}</span>${docHtml(ctx, 'sop', id)}<h4>Practices using this SOP — tick to change</h4><div class="chk">${PRACTICES.map((p) => `<label><input type="checkbox" data-ps="${p.id}|${id}" ${st.ps[p.id].includes(+id) ? 'checked' : ''}><span>${p.id} · ${esc(p.n)}</span></label>`).join('')}</div><p class="note">Leave all unticked if you are not sure where it belongs.</p><h4>Status</h4><div class="chk"><label><input type="checkbox" data-done="${id}" ${s.done ? 'checked' : ''}><span>Mark this SOP as Done</span></label></div>`;
  } else if (type === 'zero') {
    k = 'Practice 9 · Exit';
    t = 'Zero-tolerance mechanism';
    h = '<p>If a value or practice is compromised, the exit triggers are tested against CCT (Care · Convenience · Time), then reviewed, then exit is executed. It applies to every value and practice.</p><h4>Exit triggers</h4><ul><li>Availability · Attendance · Mutual respect</li><li>Consistency · Customer first · Quality</li><li>Misconduct · Team engagement</li></ul><h4>Documents</h4><ul><li>SOP 8 — Employee Farewell</li><li>LOA</li><li>NDA</li><li>Handbook and acceptance</li></ul>';
  }
  return { k, t, h };
}

/* ---------- admin editing: the details panel as a form ---------- */
export type EditKind = 'value' | 'practice' | 'sop';
interface FieldDef {
  key: string;
  label: string;
  max: number;
  long?: boolean;
  hint?: string;
}
export const EDIT_FIELDS: Record<EditKind, FieldDef[]> = {
  value: [
    { key: 'n', label: 'Name', max: 60 },
    { key: 'o2', label: 'Value', max: 160, hint: 'The short statement shown first, e.g. “We deliver quality every time.”' },
    { key: 'desc', label: 'Value descriptor', max: 1200, long: true, hint: 'The longer explanation underneath.' },
  ],
  practice: [
    { key: 'n', label: 'Name', max: 80 },
    { key: 'd', label: 'Description', max: 600, long: true },
  ],
  sop: [{ key: 't', label: 'Title', max: 120 }],
};
const KIND_NAME: Record<EditKind, string> = { value: 'value', practice: 'practice', sop: 'SOP' };

/** Values currently in the item (for editing), or empty text (for a new one). */
export function editInitial(ctx: Ctx, kind: EditKind, id: string | null): Record<string, string> {
  if (id === null) return Object.fromEntries(EDIT_FIELDS[kind].map((f) => [f.key, '']));
  if (kind === 'value') {
    const v = VMAP[id];
    return { n: v.n, o2: v.o2, desc: v.desc };
  }
  if (kind === 'practice') {
    const p = PMAP[id];
    return { n: p.n, d: p.d };
  }
  return { t: ctx.sops.find((s) => s.n === +id)!.t };
}

/** The edit form for the drawer. `id` null means a new item. */
export function editHtml(ctx: Ctx, kind: EditKind, id: string | null): { k: string; t: string; h: string } {
  const init = editInitial(ctx, kind, id);
  const isNew = id === null;
  const fields = EDIT_FIELDS[kind]
    .map((f) => {
      const val = esc(init[f.key]);
      const input = f.long
        ? `<textarea data-f="${f.key}" rows="${f.key === 'desc' ? 7 : 5}" maxlength="${f.max}">${val}</textarea>`
        : `<input type="text" data-f="${f.key}" maxlength="${f.max}" value="${val}" autocomplete="off">`;
      return `<label class="ed-f"><span class="ed-l">${f.label}<em class="cc" data-cc="${f.key}"></em></span>${input}${f.hint ? `<small>${f.hint}</small>` : ''}</label>`;
    })
    .join('');
  let area = '';
  if (kind === 'value') {
    area = isNew
      ? `<label class="ed-f"><span class="ed-l">Area</span><select data-f="area">${AREAS.map((a, i) => `<option value="${i}">${esc(a)}</option>`).join('')}</select><small>Each area is one coloured arc of the ring. This cannot be changed later.</small></label>`
      : `<div class="ed-f"><span class="ed-l">Area</span><div class="ed-ro">${esc(AREAS[VMAP[id!].area])}</div></div>`;
  }
  const note = isNew
    ? kind === 'sop'
      ? 'It gets the next SOP number and starts as “not marked done”. Place it on practices afterwards by ticking or dragging.'
      : `It starts with no ${kind === 'value' ? 'practices' : 'SOPs or values'} linked: link them afterwards by ticking or dragging. The Life Cycle diagram is hand-drawn and does not show new ${kind === 'value' ? 'values' : 'practices'}.`
    : `Changes are saved for everyone as soon as you press Save changes.${canDelete(kind, id!) ? '' : ' This is original content: it can be reworded but not deleted.'}`;
  const h = `<form class="ed" data-ed="${kind}" novalidate><p class="ed-note">${note}</p>${fields}${area}<div class="ed-bar"><span class="ed-state" data-ed-state>No changes yet</span>${!isNew && canDelete(kind, id!) ? '<button type="button" class="btn danger" data-ed-delete>Delete</button>' : ''}<button type="button" class="btn" data-ed-cancel>Cancel</button><button type="button" class="btn primary" data-ed-save disabled>${isNew ? `Add ${KIND_NAME[kind]}` : 'Save changes'}</button></div></form>`;
  const title = isNew ? `New ${KIND_NAME[kind]}` : kind === 'sop' ? (init.t as string) : (init.n as string);
  const sub = isNew ? `Adding a ${KIND_NAME[kind]}` : kind === 'sop' ? `SOP ${id}` : kind === 'practice' ? `Practice ${id}` : `Value`;
  return { k: `Editing · ${sub}`, t: title, h };
}
