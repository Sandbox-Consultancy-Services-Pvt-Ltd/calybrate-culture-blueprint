import { askConfirm, askPrompt } from '../../lib/dialog';
import type { SupabaseClient } from '@supabase/supabase-js';
import { connectionsSVG, type ConnMode } from './connections';
import { AREA_CODES, canDelete, CONNKEY, DOCKKEY, KEY, MIGRATED_KEY, PMAP, PRACTICES, VALUE_CODE, VKEY, VMAP, defaultSops, type Layout, type Sop } from './data';
import {
  addSop,
  applyDrop,
  clone,
  coverage,
  defaultLayout,
  fromDbLayout,
  isSel,
  layoutFromRows,
  dropFromLayout,
  normalize,
  placedIn,
  practicesOf,
  prune,
  okTarget,
  rmSop,
  rmVal,
  sameLayout,
  toDbLayout,
  valid,
  type Sel,
} from './model';
import { VALUES } from './data';
import { applyContent, applySopTitles, loadContent, registerPractice, registerValue, unregisterPractice, unregisterValue } from '../codex/content';
import { docKey, loadDocs, openDoc, removeDoc, uploadDoc, type DocInfo, type DocKind } from './documents';
import { EDIT_FIELDS, esc, coverageHTML, editHtml, editInitial, infoHtml, keyParts, pillarsHTML, practiceTray, ringsSVG, trayChip, type Ctx, type EditKind } from './render';

export interface MapOptions {
  /** Shared database, or null for the offline copy (this browser only). */
  db: SupabaseClient | null;
  canEdit: () => boolean;
  /** Administrators can change the wording of values, practices and SOPs and add new ones. */
  isAdmin: () => boolean;
  /** Called after a successful save so other views reread the SOP data. */
  onSaved: () => void;
}
export interface MapController {
  destroy: () => void;
}

type View = 'rings' | 'links' | 'pillars';
interface DragState {
  el: HTMLElement;
  kind: 'sop' | 'prac';
  id: string | number;
  from: string;
  sx: number;
  sy: number;
  active: boolean;
  ghost: HTMLElement | null;
  over: HTMLElement | null;
}

/**
 * Behaviour of the Safeguard Map: rings and pillars views, library dock, details drawer with tick-box editing,
 * pointer-based drag and drop, save / reset and saved versions.
 * Ported from the legacy page; the HTML it draws comes from render.ts.
 */
export function createMap(root: HTMLElement, opts: MapOptions): MapController {
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => Array.from(root.querySelectorAll<T>(sel));
  const { db } = opts;

  const sops: Sop[] = defaultSops();
  const sopOf = (n: number) => sops.find((s) => s.n === n)!;
  let st: Layout = defaultLayout();
  let dirty = false;
  let sel: Sel | null = null;
  let curInfo: Sel | null = null;
  let view: View = 'rings';
  let connMode: ConnMode = 'repeat'; // Connections view: every place an item belongs, or each item once
  let connBusy = false; // true while the layout switch animation plays
  let connTimer: ReturnType<typeof setTimeout> | undefined;
  const dock = { tab: 'sops', q: '', gaps: false };
  let suppress = false;
  let drag: DragState | null = null;
  let scrollTimer: ReturnType<typeof setInterval> | undefined;
  let lastY = 0;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const VER_PAGE = 8;
  let verRows: Array<{ id: string; name: string; created_at: string }> = [];
  let verTotal = 0;
  let verQuery = '';
  let verSeq = 0;
  let alive = true;
  const cleanups: Array<() => void> = [];
  let docs: Record<string, DocInfo> = {};
  let docTarget: { kind: DocKind; ref: string } | null = null;
  const ctx = (): Ctx => ({ st, sel, sops, docs, docsOn: !!db, canEdit: opts.canEdit() });
  const on = (el: EventTarget, ev: string, fn: (e: never) => void, o?: AddEventListenerOptions) => {
    el.addEventListener(ev, fn as EventListener, o);
    cleanups.push(() => el.removeEventListener(ev, fn as EventListener, o));
  };

  const readLocal = (): Layout | null => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (valid(o, sops)) return normalize(o);
      }
    } catch {
      /* ignore */
    }
    return null;
  };

  /* ---------- small UI helpers ---------- */
  function toast(m: string, ms = 2200) {
    const t = $('#toast');
    t.textContent = m;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }
  function setSave() {
    const s = $('#saveState');
    s.textContent = dirty ? 'Unsaved changes' : 'Saved';
    s.classList.toggle('dirty', dirty);
  }
  const setDirty = () => {
    dirty = true;
    setSave();
  };

  /* ---------- render ---------- */
  function render(o: { keepDrawer?: boolean } = {}) {
    const c = ctx();
    $('#ringbox').innerHTML = ringsSVG(c);
    const kp = keyParts(c);
    $('#keyV').innerHTML = kp[0];
    $('#keyP').innerHTML = kp[1];
    $('#keyS').innerHTML = kp[2];
    $('#keyVp').innerHTML = kp[0];
    $('#linkbox').innerHTML = connectionsSVG(c, connMode);
    $('#viewPillars').innerHTML = pillarsHTML(c);
    $('#trayChips').innerHTML = sops.map((s) => trayChip(c, s.n)).join('');
    $('#ptrayChips').innerHTML = practiceTray(c);
    const cov = coverage(st, sops);
    $('#cov').innerHTML = coverageHTML(cov);
    $('#gapN').textContent = String(cov.gaps);
    $('#gapBtn').className = `btn gapbtn ${cov.gaps ? 'bad' : 'ok'}`;
    $('#nVals').textContent = String(VALUES.length);
    $('#nPrac').textContent = String(PRACTICES.length);
    $('#nSops').textContent = String(sops.length);
    $$('.dock-add').forEach((b) => (b.hidden = !opts.isAdmin()));
    applyDockFilter();
    setSave();
    if (!o.keepDrawer) refreshDrawer();
  }
  /** Replays the centre-outward grow animation (also runs once when the map first opens). */
  let growTimer: ReturnType<typeof setTimeout> | undefined;
  function replay(id = 'ringbox') {
    const box = $('#' + id);
    box.classList.remove('grow');
    void box.offsetWidth;
    box.classList.add('grow');
    clearTimeout(growTimer);
    growTimer = setTimeout(() => box.classList.remove('grow'), 3200);
  }
  function markConnMode() {
    $('#cmRepeat').classList.toggle('on', connMode === 'repeat');
    $('#cmUnique').classList.toggle('on', connMode === 'unique');
    $('#cmRepeat').setAttribute('aria-pressed', String(connMode === 'repeat'));
    $('#cmUnique').setAttribute('aria-pressed', String(connMode === 'unique'));
  }
  /** Switches the Connections layout: the branches pull back toward Purpose, then the new ones grow out ring by ring. */
  function setConnMode(m: ConnMode) {
    if (connBusy || m === connMode) return;
    try {
      localStorage.setItem(CONNKEY, m);
    } catch {
      /* ignore */
    }
    const box = $('#linkbox');
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (calm) {
      connMode = m;
      markConnMode();
      box.innerHTML = connectionsSVG(ctx(), connMode);
      return;
    }
    connBusy = true;
    box.innerHTML = connectionsSVG(ctx(), connMode, 'leave');
    connMode = m;
    markConnMode();
    connTimer = setTimeout(() => {
      box.innerHTML = connectionsSVG(ctx(), connMode, 'grow');
      connTimer = setTimeout(() => {
        box.innerHTML = connectionsSVG(ctx(), connMode);
        connBusy = false;
      }, 1500);
    }, 520);
  }
  function setView(v: View) {
    view = v;
    $('#viewRings').hidden = v !== 'rings';
    $('#viewLinks').hidden = v !== 'links';
    $('#viewPillars').hidden = v !== 'pillars';
    $('#vRings').classList.toggle('on', v === 'rings');
    $('#vLinks').classList.toggle('on', v === 'links');
    $('#vPillars').classList.toggle('on', v === 'pillars');
    try {
      localStorage.setItem(VKEY, v);
    } catch {
      /* ignore */
    }
  }

  /* ---------- library dock ---------- */
  function setDockTab(t: string) {
    dock.tab = t;
    $$('.dock-tabs button').forEach((b) => {
      const on = b.dataset.tab === t;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    $$('.dock-pane').forEach((p) => (p.hidden = p.dataset.pane !== t));
  }
  function applyDockFilter() {
    const q = dock.q.trim().toLowerCase();
    const groups: Record<string, [string, string]> = { sops: ['#trayChips .sopchip', 'cSops'], practices: ['#ptrayChips .pchip', 'cPrac'], values: ['#keyV .ki.v', 'cVals'] };
    for (const [tab, [selector, cid]] of Object.entries(groups)) {
      let shown = 0;
      const els = $$(selector);
      for (const el of els) {
        const gap = tab === 'sops' ? el.classList.contains('un') : el.dataset.gap === '1';
        const hide = (q && !(el.textContent ?? '').toLowerCase().includes(q)) || (dock.gaps && !gap);
        el.hidden = !!hide;
        if (!hide) shown++;
      }
      $(`#${cid}`).textContent = shown + (shown !== els.length ? `/${els.length}` : '');
      const pane = $(`.dock-pane[data-pane="${tab}"]`);
      let em = pane.querySelector<HTMLElement>('.dock-empty');
      if (!shown && els.length) {
        if (!em) {
          em = document.createElement('div');
          em.className = 'dock-empty';
          pane.appendChild(em);
        }
        em.textContent = 'Nothing matches. Clear the search or untick “Only gaps”.';
      } else em?.remove();
    }
  }
  function setDock(onOff: boolean) {
    $('#mapbody').classList.toggle('dock-off', !onOff);
    $('#dockBtn').setAttribute('aria-pressed', String(onOff));
    try {
      localStorage.setItem(DOCKKEY, onOff ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }
  on($('#dockBtn'), 'click', () => setDock($('#mapbody').classList.contains('dock-off')));
  on($('#dockClose'), 'click', () => setDock(false));
  $$('.dock-tabs button').forEach((b) => on(b, 'click', () => setDockTab(b.dataset.tab!)));
  on($('#dockSearch'), 'input', (e: Event) => {
    dock.q = (e.target as HTMLInputElement).value;
    applyDockFilter();
  });
  on($('#dockGaps'), 'change', (e: Event) => {
    dock.gaps = (e.target as HTMLInputElement).checked;
    applyDockFilter();
  });

  /* ---------- pop-over menus ---------- */
  const POPS: Array<[string, string]> = [['gapBtn', 'gapPop'], ['howBtn', 'howPop'], ['mmBtn', 'mmPop']];
  function closePops(except?: string) {
    for (const [b, p] of POPS) {
      if (p !== except) {
        $(`#${p}`).hidden = true;
        $(`#${b}`).setAttribute('aria-expanded', 'false');
      }
    }
  }
  for (const [b, p] of POPS) {
    on($(`#${b}`), 'click', (e: Event) => {
      e.stopPropagation();
      const el = $(`#${p}`);
      const open = el.hidden;
      closePops(p);
      el.hidden = !open;
      $(`#${b}`).setAttribute('aria-expanded', String(open));
    });
  }
  on(document, 'click', (e: Event) => {
    if (!(e.target as HTMLElement).closest('.pop-wrap')) closePops();
  });
  on($('#mmPop'), 'click', (e: Event) => {
    if ((e.target as HTMLElement).closest('button')) setTimeout(() => closePops(), 0);
  });
  on($('#cov'), 'click', (e: Event) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-gapf]');
    if (!b || b.classList.contains('ok')) return;
    e.stopPropagation();
    closePops();
    dock.gaps = true;
    $<HTMLInputElement>('#dockGaps').checked = true;
    dock.q = '';
    $<HTMLInputElement>('#dockSearch').value = '';
    setDock(true);
    setDockTab(b.dataset.gapf!);
    applyDockFilter();
  });
  on($('#vRings'), 'click', () => setView('rings'));
  on($('#vLinks'), 'click', () => {
    setView('links');
    replay('linkbox');
  });
  on($('#vPillars'), 'click', () => setView('pillars'));
  on($('#cmRepeat'), 'click', () => setConnMode('repeat'));
  on($('#cmUnique'), 'click', () => setConnMode('unique'));
  cleanups.push(() => clearTimeout(connTimer));
  on($('#bReplay'), 'click', () => {
    setView('rings');
    replay();
  });

  /* ---------- details drawer (also the tick-box editor) ---------- */
  const drawer = $('#sgDrawer');
  let editing: { kind: EditKind; id: string | null } | null = null;
  let editInit: Record<string, string> = {};
  function openInfo(type: string, id: string) {
    curInfo = { type, id };
    const { k, t, h } = infoHtml(ctx(), type, id);
    $('#sgDrK').textContent = k;
    $('#sgDrT').textContent = t;
    $('#sgDrB').innerHTML = h;
    drawer.classList.remove('editing');
    $('#sgDrE').hidden = !(opts.isAdmin() && (type === 'value' || type === 'practice' || type === 'sop'));
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('drawer-open');
  }
  function closeInfo() {
    editing = null;
    drawer.classList.remove('open', 'editing');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('drawer-open');
    curInfo = null;
  }
  function refreshDrawer() {
    if (editing) return; // never replace a form somebody is typing in
    if (curInfo && drawer.classList.contains('open')) openInfo(curInfo.type, curInfo.id);
  }
  function clearSel() {
    sel = null;
    closeInfo();
    render();
  }
  on($('#sgDrX'), 'click', clearSel);

  /* ---------- admin editing: the details panel turns into a form; the Library gets "+ Add" buttons ---------- */
  const formEl = () => $('#sgDrB').querySelector<HTMLFormElement>('form.ed');
  const formValues = () => {
    const o: Record<string, string> = {};
    formEl()?.querySelectorAll<HTMLInputElement>('[data-f]').forEach((el) => (o[el.dataset.f!] = el.value));
    return o;
  };
  const editDirty = () => {
    const v = formValues();
    return Object.keys(editInit).some((k) => v[k] !== editInit[k]);
  };
  const editBlank = () => {
    if (!editing) return true;
    const v = formValues();
    return EDIT_FIELDS[editing.kind].some((f) => !(v[f.key] ?? '').trim());
  };
  function syncEdit() {
    if (!editing) return;
    const v = formValues();
    for (const f of EDIT_FIELDS[editing.kind]) {
      $(`[data-cc="${f.key}"]`).textContent = `${(v[f.key] ?? '').length} / ${f.max}`;
    }
    const dirty = editDirty();
    const blank = editBlank();
    const state = $('[data-ed-state]');
    state.textContent = !dirty ? 'No changes yet' : blank ? 'Every box needs some text' : 'Unsaved changes';
    state.classList.toggle('dirty', dirty);
    $<HTMLButtonElement>('[data-ed-save]').disabled = !dirty || blank;
  }
  function openEditor(kind: EditKind, id: string | null) {
    if (!opts.isAdmin()) return;
    editing = { kind, id };
    editInit = editInitial(ctx(), kind, id);
    const { k, t, h } = editHtml(ctx(), kind, id);
    $('#sgDrK').textContent = k;
    $('#sgDrT').textContent = t;
    $('#sgDrB').innerHTML = h;
    $('#sgDrE').hidden = true;
    drawer.classList.add('open', 'editing');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('drawer-open');
    syncEdit();
    $<HTMLElement>('#sgDrB [data-f]').focus();
  }
  /** Leaves the form; asks first when something typed would be lost. */
  async function cancelEdit() {
    const was = editing;
    if (!was) return;
    if (editDirty()) {
      const yes = await askConfirm({ title: 'Discard your changes?', text: 'What you typed has not been saved.', confirmLabel: 'Discard', tone: 'warn' });
      if (!yes || !alive) return;
    }
    editing = null;
    drawer.classList.remove('editing');
    if (was.id !== null) openInfo(was.kind, was.id);
    else clearSel();
  }
  /** Same rules as the database functions, so the page shows the same result when there is no database. */
  function addLocally(kind: EditKind, v: Record<string, string>): string {
    if (kind === 'sop') {
      const n = sops.reduce((m, s) => Math.max(m, s.n), 0) + 1;
      sops.push({ n, t: v.t.trim(), done: 0 });
      return String(n);
    }
    if (kind === 'practice') {
      const id = `P${PRACTICES.reduce((m, p) => Math.max(m, parseInt(p.id.slice(1), 10) || 0), 0) + 1}`;
      registerPractice({ id, n: v.n.trim(), st: '', d: v.d.trim() });
      return id;
    }
    const base = v.n.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'value';
    let code = base;
    for (let i = 2; VMAP[code]; i++) code = `${base}-${i}`;
    registerValue({ id: code, n: v.n.trim(), o2: v.o2.trim(), area: +v.area || 0, desc: v.desc.trim() }, code);
    VALUES.sort((a, b) => a.area - b.area); // stable: each area stays one piece of the ring
    return code;
  }
  function editLocally(kind: EditKind, id: string, v: Record<string, string>) {
    if (kind === 'sop') sopOf(+id).t = v.t.trim();
    else if (kind === 'practice') Object.assign(PMAP[id], { n: v.n.trim(), d: v.d.trim() });
    else Object.assign(VMAP[id], { n: v.n.trim(), o2: v.o2.trim(), desc: v.desc.trim() });
  }
  async function saveEdit() {
    const ed = editing;
    if (!ed || !opts.isAdmin() || !editDirty() || editBlank()) return;
    const v = formValues();
    const btn = $<HTMLButtonElement>('[data-ed-save]');
    btn.disabled = true;
    let id = ed.id;
    if (db) {
      const c = db.schema('codex');
      const call =
        ed.id === null
          ? ed.kind === 'sop'
            ? c.rpc('admin_add_sop', { p_title: v.t })
            : ed.kind === 'practice'
              ? c.rpc('admin_add_practice', { p_name: v.n, p_summary: v.d })
              : c.rpc('admin_add_value', { p_name: v.n, p_statement: v.o2, p_description: v.desc, p_group_code: AREA_CODES[+v.area] })
          : ed.kind === 'sop'
            ? c.rpc('admin_update_sop', { p_sop_number: +ed.id, p_title: v.t })
            : ed.kind === 'practice'
              ? c.rpc('admin_update_practice', { p_code: ed.id, p_name: v.n, p_summary: v.d })
              : c.rpc('admin_update_value', { p_code: VALUE_CODE[ed.id], p_name: v.n, p_statement: v.o2, p_description: v.desc });
      const r = await call;
      if (!alive) return;
      if (r.error) {
        btn.disabled = false;
        return toast(r.error.code === '42501' ? 'Only an administrator can change this.' : 'Could not save that change — nothing was changed.');
      }
      if (ed.id === null) id = String(r.data);
      try {
        const w = await loadContent(db);
        applyContent(w);
        applySopTitles(sops, w.sops);
      } catch {
        if (ed.id === null) id = addLocally(ed.kind, v);
        else editLocally(ed.kind, ed.id, v);
      }
      opts.onSaved();
    } else {
      id = ed.id === null ? addLocally(ed.kind, v) : (editLocally(ed.kind, ed.id, v), ed.id);
    }
    if (!alive) return;
    normalize(st);
    editing = null;
    drawer.classList.remove('editing');
    sel = { type: ed.kind, id: id! };
    render({ keepDrawer: true });
    openInfo(ed.kind, id!);
    toast(db ? (ed.id === null ? 'Added for everyone' : 'Saved for everyone') : 'Changed in this copy only (no database)');
  }
  /** Deletes an item an administrator added. Asks first, saying what goes with it. */
  async function deleteItem() {
    const ed = editing;
    if (!ed || ed.id === null || !opts.isAdmin() || !canDelete(ed.kind, ed.id)) return;
    const id = ed.id;
    const kind = ed.kind;
    const name = kind === 'sop' ? `SOP ${id} · ${sopOf(+id).t}` : kind === 'practice' ? `${id} · ${PMAP[id].n}` : VMAP[id].n;
    const points: string[] = [];
    if (kind === 'sop') {
      const n = placedIn(st, +id).length;
      if (n) points.push(`It is removed from ${n} ${n === 1 ? 'practice' : 'practices'}.`);
      if (docs[docKey('sop', id)]) points.push('Its PDF is deleted too.');
    } else if (kind === 'practice') {
      const sc = st.ps[id]?.length ?? 0;
      const vc = st.pv[id]?.length ?? 0;
      if (sc || vc) points.push(`Its links to ${sc} ${sc === 1 ? 'SOP' : 'SOPs'} and ${vc} ${vc === 1 ? 'value' : 'values'} are removed (the SOPs and values stay).`);
      if (docs[docKey('practice', id)]) points.push('Its PDF is deleted too.');
    } else {
      const pc = practicesOf(st, id).length;
      if (pc) points.push(`It is removed from ${pc} ${pc === 1 ? 'practice' : 'practices'} (the practices stay).`);
    }
    points.push('This cannot be undone.');
    const yes = await askConfirm({ title: `Delete “${name}”?`, text: 'It disappears for everyone.', points, confirmLabel: 'Delete', tone: 'warn' });
    if (!yes || !alive) return;
    const btn = $<HTMLButtonElement>('[data-ed-delete]');
    btn.disabled = true;
    if (db) {
      if (kind !== 'value' && docs[docKey(kind, id)]) await removeDoc(db, kind, id); // the file lives in Storage, so remove it first
      const c = db.schema('codex');
      const r = await (kind === 'sop'
        ? c.rpc('admin_delete_sop', { p_sop_number: +id })
        : kind === 'practice'
          ? c.rpc('admin_delete_practice', { p_code: id })
          : c.rpc('admin_delete_value', { p_code: VALUE_CODE[id] }));
      if (!alive) return;
      if (r.error) {
        btn.disabled = false;
        return toast(r.error.code === '42501' ? 'Only an administrator can delete this.' : 'Could not delete it — nothing was changed.');
      }
      opts.onSaved();
    }
    if (kind === 'sop') sops.splice(sops.findIndex((s) => s.n === +id), 1);
    else if (kind === 'practice') unregisterPractice(id);
    else unregisterValue(id);
    delete docs[docKey(kind === 'value' ? 'practice' : kind, id)];
    dropFromLayout(st, kind, id);
    editing = null;
    sel = null;
    closeInfo();
    render();
    toast(db ? 'Deleted for everyone' : 'Deleted in this copy only (no database)');
  }
  on($('#sgDrE'), 'click', () => curInfo && openEditor(curInfo.type as EditKind, curInfo.id));
  on($('#sgDrB'), 'input', syncEdit);
  on($('#sgDrB'), 'change', syncEdit);
  on($('#sgDrB'), 'submit', (e: Event) => e.preventDefault());
  on($('#sgDrB'), 'click', (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-ed-save]')) void saveEdit();
    else if (t.closest('[data-ed-delete]')) void deleteItem();
    else if (t.closest('[data-ed-cancel]')) void cancelEdit();
  });
  $$('.dock-add').forEach((b) =>
    on(b, 'click', (e: Event) => {
      e.stopPropagation(); // the page-level click handler would close the panel we are about to open
      if (editing) return toast('Save or cancel your edit first');
      sel = null;
      render({ keepDrawer: true });
      openEditor(b.dataset.add as EditKind, null);
    }),
  );

  /* ---------- save / load ---------- */
  /** Saves the layout. Resolves true when it was kept (shared database, or this browser when there is no database). */
  async function save(revertsOnFailure = false): Promise<boolean> {
    if (!opts.canEdit()) {
      toast('You have view-only access.');
      return false;
    }
    // With a shared database the layout lives there only: nothing is cached in this browser (shared-computer safety).
    let local = !db;
    if (!db) {
      try {
        localStorage.setItem(KEY, JSON.stringify(st));
      } catch {
        local = false;
      }
    }
    if (db) {
      const { error } = await db.schema('codex').rpc('apply_layout', { p_layout: toDbLayout(st), p_done_sops: sops.filter((s) => s.done).map((s) => s.n) });
      if (!error) {
        dirty = false;
        setSave();
        toast('Saved to the shared database');
        opts.onSaved();
        return true;
      }
      const why = error.code === '42501' ? 'your role may not change the layout' : (error.message ?? '').slice(0, 90);
      console.error('apply_layout failed', error);
      toast(`Could not save to the shared database${why ? ` (${why})` : ''}${revertsOnFailure ? ' — nothing was changed' : local ? ' — kept in this browser only' : ''}`, 7000);
      return false;
    }
    if (local) {
      dirty = false;
      setSave();
      toast('Saved in this browser');
      return true;
    }
    toast('This browser blocked saving');
    return false;
  }
  /** Puts back the layout from before a Reset / Load that could not be saved, so the screen never shows something the database does not have. */
  function putBack(prev: Layout, wasDirty: boolean) {
    st = prev;
    dirty = wasDirty;
    if (!db) {
      try {
        localStorage.setItem(KEY, JSON.stringify(prev));
      } catch {
        /* ignore */
      }
    }
    render();
  }
  async function dbLoad(): Promise<Layout | null> {
    const c = db!.schema('codex');
    const [a, b, s] = await Promise.all([
      c.from('practice_sops').select('practices(code),sops(sop_number)'),
      c.from('practice_values').select('practices(code),core_values(code)'),
      c.from('sops').select('sop_number,sop_statuses(code)'),
    ]);
    if (a.error || b.error || s.error) throw new Error('load failed');
    // Wording an administrator changed (SOP titles, practice and value text). Failing to read it keeps the built-in wording.
    try {
      const w = await loadContent(db!);
      applyContent(w);
      applySopTitles(sops, w.sops);
      normalize(st);
    } catch {
      /* keep the built-in wording */
    }
    for (const r of s.data as unknown as Array<{ sop_number: number; sop_statuses: { code: string } | null }>) {
      const x = sops.find((q) => q.n === r.sop_number);
      if (x) x.done = r.sop_statuses?.code === 'done' ? 1 : 0;
    }
    const n = layoutFromRows(a.data as never, b.data as never);
    return n && valid(n, sops) ? n : null;
  }
  /** Reads one page of saved versions (newest first), filtered by name. `more` adds the next page to what is shown. */
  async function loadVersions(more = false) {
    if (!db) return;
    const seq = ++verSeq;
    const from = more ? verRows.length : 0;
    let q = db.schema('codex').from('layout_snapshots').select('id,name,created_at', { count: 'exact' });
    const term = verQuery.trim().replace(/[%_,()\\]/g, ' ');
    if (term) q = q.ilike('name', `%${term}%`);
    const r = await q.order('created_at', { ascending: false }).range(from, from + VER_PAGE - 1);
    if (!alive || seq !== verSeq) return;
    if (r.error) {
      toast('Could not load the saved versions');
      return;
    }
    const rows = r.data as unknown as typeof verRows;
    verRows = more ? [...verRows, ...rows] : rows;
    verTotal = r.count ?? verRows.length;
    renderVersions();
  }
  function renderVersions() {
    const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    const bin =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
    $('#verList').innerHTML = verRows.length
      ? verRows
          .map(
            (v) =>
              `<div class="verrow"><button type="button" class="verload" data-ver="${esc(v.id)}" title="Load this version"><b>${esc(v.name)}</b><small>${esc(when(v.created_at))}</small></button><button type="button" class="verdel" data-verdel="${esc(v.id)}" aria-label="Delete the version ${esc(v.name)}" title="Delete this version">${bin}</button></div>`,
          )
          .join('')
      : `<div class="vernone">${verQuery.trim() ? 'No saved version matches that name.' : 'None yet. Use “Save version” to keep this layout.'}</div>`;
    $('#verCount').textContent = verTotal ? `Showing ${verRows.length} of ${verTotal}` : '';
    $('#verMore').hidden = verRows.length >= verTotal;
  }
  function openVersions() {
    verQuery = '';
    $<HTMLInputElement>('#verSearch').value = '';
    $('#verDlg').hidden = false;
    document.body.classList.add('cb-dlg-open');
    void loadVersions();
    $<HTMLInputElement>('#verSearch').focus();
  }
  function closeVersions() {
    $('#verDlg').hidden = true;
    document.body.classList.remove('cb-dlg-open');
  }
  async function deleteVersion(id: string) {
    const v = verRows.find((x) => x.id === id);
    if (!v || !db) return;
    if (!opts.canEdit()) return toast('You have view-only access.');
    const yes = await askConfirm({
      title: `Delete “${v.name}”?`,
      text: 'This saved version is removed for everyone. The layout you are using now is not changed.',
      points: ['This cannot be undone.'],
      confirmLabel: 'Delete version',
      tone: 'danger',
    });
    if (!yes || !alive) return;
    // .select() returns the rows that were really deleted: the database silently skips rows you are not allowed to remove.
    const r = await db.schema('codex').from('layout_snapshots').delete().eq('id', id).select('id');
    if (r.error || !r.data?.length) return toast('Could not delete the version.');
    toast('Version deleted');
    void loadVersions();
  }

  /* ---------- documents (one PDF per SOP / practice) ---------- */
  on($('#sgDrB'), 'click', (e: Event) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-doc]');
    if (!b || !db) return;
    const kind = b.dataset.kind as DocKind;
    const ref = b.dataset.ref!;
    const action = b.dataset.doc;
    if (action === 'open') {
      void openDoc(db, kind, ref, docs[docKey(kind, ref)]?.name).then((ok) => ok || toast('Could not open the document'));
    } else if (!opts.canEdit()) {
      toast('You have view-only access.');
    } else if (action === 'upload') {
      docTarget = { kind, ref };
      $('#fDoc').click();
    } else if (action === 'remove') {
      void askConfirm({
        title: 'Remove this document?',
        text: 'The file is deleted for everyone and cannot be recovered. You can upload a new one afterwards.',
        confirmLabel: 'Remove document',
        tone: 'danger',
      }).then((yes) => {
        if (!yes || !alive) return;
        return removeDoc(db, kind, ref).then((ok) => {
          if (!alive) return;
          if (ok) delete docs[docKey(kind, ref)];
          toast(ok ? 'Document removed' : 'Could not remove the document');
          refreshDrawer();
        });
      });
    }
  });
  on($('#fDoc'), 'change', (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    const t = docTarget;
    input.value = '';
    docTarget = null;
    if (!file || !t || !db) return;
    toast('Uploading…');
    void uploadDoc(db, t.kind, t.ref, file, !!docs[docKey(t.kind, t.ref)]).then((r) => {
      if (!alive) return;
      if (typeof r === 'string') return toast(r);
      docs[docKey(t.kind, t.ref)] = r;
      toast('Document saved');
      refreshDrawer();
    });
  });

  /* ---------- tick-box editing in the drawer ---------- */
  on($('#sgDrB'), 'change', (e: Event) => {
    const c = e.target as HTMLInputElement;
    if (!opts.canEdit()) {
      c.checked = !c.checked;
      return;
    }
    const tog = (a: string[], x: string) => {
      const i = a.indexOf(x);
      if (c.checked && i < 0) a.push(x);
      if (!c.checked && i > -1) a.splice(i, 1);
    };
    if (c.dataset.pv) {
      const [p, v] = c.dataset.pv.split('|');
      tog(st.pv[p], v);
    } else if (c.dataset.vp) {
      const [v, p] = c.dataset.vp.split('|');
      tog(st.pv[p], v);
    } else if (c.dataset.ps) {
      const [p, n] = c.dataset.ps.split('|');
      if (c.checked) addSop(st, p, +n);
      else rmSop(st, p, +n);
    } else if (c.dataset.done) {
      sopOf(+c.dataset.done).done = c.checked ? 1 : 0;
    } else return;
    setDirty();
    render({ keepDrawer: true });
  });

  /* ---------- clicks: select + open the drawer ---------- */
  on(document, 'click', (e: Event) => {
    if (suppress) return;
    const target = e.target as HTMLElement;
    if (!root.contains(target)) return;
    if (editing) {
      if (!target.closest('#sgDrawer, .mapbar, .dock-h, .dock-tabs, .dock-tools')) toast('Save or cancel your edit first');
      return;
    }
    const rm = target.closest<HTMLElement>('.rm');
    if (rm) {
      if (!opts.canEdit()) return;
      let changed = false;
      if (rm.dataset.rm) {
        const [p, n] = rm.dataset.rm.split('|');
        changed = rmSop(st, p, +n);
      } else if (rm.dataset.unp) {
        const [v, p] = rm.dataset.unp.split('|');
        changed = rmVal(st, p, v);
      }
      if (changed) setDirty();
      render();
      return;
    }
    const nav = target.closest<HTMLElement>('[data-slice]');
    if (nav) {
      const dir = nav.dataset.slice;
      if (dir === 'close' || !sel || sel.type !== 'value') return clearSel();
      const i = VALUES.findIndex((v) => v.id === sel!.id);
      const next = VALUES[(i + (dir === 'next' ? 1 : VALUES.length - 1)) % VALUES.length];
      sel = { type: 'value', id: next.id };
      render({ keepDrawer: true });
      openInfo('value', next.id);
      return;
    }
    const t = target.closest<HTMLElement>('[data-open]');
    if (t) {
      const [type, id] = t.dataset.open!.split(':');
      if (['value', 'practice', 'sop', 'zero'].includes(type)) {
        if (isSel(sel, type, id)) return clearSel();
        sel = { type, id };
      } else sel = null;
      render({ keepDrawer: true });
      openInfo(type, id);
      return;
    }
    if (target.closest('#sgDrawer') || target.closest('.mapbar') || target.closest('.dock-h,.dock-tabs,.dock-tools')) return;
    if (drawer.classList.contains('open') || sel) clearSel();
  });
  on(document, 'keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closePops();
      if (editing) void cancelEdit();
      else clearSel();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (editing) void saveEdit();
      else void save();
    }
  });

  /* ---------- drag and drop (pointer based: mouse and touch) ---------- */
  on(document, 'pointerdown', (e: PointerEvent) => {
    const t = e.target as HTMLElement;
    if (!root.contains(t)) return;
    if (t.closest('.rm') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const el = t.closest<HTMLElement>('[data-dragsop],[data-dragprac]');
    if (!el) return;
    const kind = el.dataset.dragsop ? 'sop' : 'prac';
    drag = { el, kind, id: kind === 'sop' ? +el.dataset.dragsop! : el.dataset.dragprac!, from: el.dataset.from!, sx: e.clientX, sy: e.clientY, active: false, ghost: null, over: null };
  });
  on(document, 'pointermove', (e: PointerEvent) => {
    const d = drag;
    if (!d) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
      d.active = true;
      const g = document.createElement('div');
      g.className = 'ghost';
      g.textContent = d.kind === 'sop' ? `SOP ${d.id} · ${sopOf(+d.id).t}` : `${d.id} · ${PMAP[String(d.id)].n}`;
      document.body.appendChild(g);
      d.ghost = g;
      d.el.classList.add('lifting');
      document.body.classList.add('dragging');
      scrollTimer = setInterval(() => {
        if (lastY < 70) window.scrollBy(0, -16);
        else if (lastY > innerHeight - 60) window.scrollBy(0, 16);
      }, 16);
    }
    lastY = e.clientY;
    d.ghost!.style.left = `${e.clientX + 12}px`;
    d.ghost!.style.top = `${e.clientY - 14}px`;
    const z = document.elementFromPoint(e.clientX, e.clientY);
    let tgt = z?.closest<HTMLElement>('[data-drop]') ?? null;
    if (tgt && !okTarget(d.kind, tgt.dataset.drop)) {
      const up = tgt.parentElement?.closest<HTMLElement>('[data-drop]') ?? null;
      tgt = up && okTarget(d.kind, up.dataset.drop) ? up : null;
    }
    if (d.over && d.over !== tgt) d.over.classList.remove('over');
    tgt?.classList.add('over');
    d.over = tgt;
  });
  function endDrag(apply: boolean) {
    const d = drag;
    drag = null;
    if (!d || !d.active) return;
    clearInterval(scrollTimer);
    d.ghost?.remove();
    document.body.classList.remove('dragging');
    d.over?.classList.remove('over');
    suppress = true;
    setTimeout(() => (suppress = false), 0);
    if (apply && d.over) {
      const r = applyDrop(st, d.kind, d.id, d.from, d.over.dataset.drop!);
      if (r.changed) setDirty();
      if (r.toast) toast(r.toast);
    }
    render();
  }
  on(document, 'pointerup', () => endDrag(true));
  on(document, 'pointercancel', () => endDrag(false));

  /* ---------- save / reset ---------- */
  on($('#bSave'), 'click', () => void save());
  on($('#bReset'), 'click', async () => {
    if (!opts.canEdit()) return toast('You have view-only access.');
    const yes = await askConfirm({
      title: 'Reset the layout?',
      text: `Every SOP placement and value link goes back to the default layout${db ? ', for everyone' : ''}.`,
      points: [
        ...(dirty ? ['You have changes that are not saved yet. They will be lost.'] : []),
        'It is saved straight away.',
        'To get today’s layout back later, save it as a version first (More → Save version).',
      ],
      confirmLabel: 'Reset layout',
      tone: 'warn',
    });
    if (!yes || !alive) return;
    const prev = clone(st);
    const wasDirty = dirty;
    st = defaultLayout();
    sel = null;
    closeInfo();
    setDirty();
    render();
    if (!(await save(true))) return putBack(prev, wasDirty); // save() has already said why
    toast(`Reset to the default layout${db ? ' for everyone' : ''}`);
  });

  /* ---------- start ---------- */
  const local = readLocal();
  if (local) st = local;
  try {
    const sv = localStorage.getItem(VKEY);
    if (sv === 'pillars' || sv === 'links') view = sv;
    if (localStorage.getItem(CONNKEY) === 'unique') connMode = 'unique';
  } catch {
    /* ignore */
  }
  {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(DOCKKEY);
    } catch {
      /* ignore */
    }
    setDock(saved === 'on'); // an overlay now, so it starts closed and never covers the diagram unasked
  }
  render();
  markConnMode();
  setView(view);
  if (view === 'rings') replay();
  else if (view === 'links') replay('linkbox');
  if (local) toast('Loaded your saved layout');

  if (db) {
    void loadDocs(db)
      .then((d) => {
        if (!alive) return;
        docs = d;
        refreshDrawer();
      })
      .catch(() => alive && toast('Could not load the documents'));
    // Saved versions are switched off for now; set SHOW_VERSIONS to true to bring the two menu buttons back.
    const SHOW_VERSIONS = false;
    $('#bVer').hidden = !SHOW_VERSIONS;
    $('#bVerOpen').hidden = !SHOW_VERSIONS;
    on($('#bVerOpen'), 'click', openVersions);
    on($('#verClose'), 'click', closeVersions);
    on($('#verDlg'), 'mousedown', (e: Event) => {
      if (e.target === $('#verDlg')) closeVersions();
    });
    on($('#verDlg'), 'keydown', (e: Event) => {
      if ((e as KeyboardEvent).key === 'Escape') closeVersions();
    });
    on($('#verMore'), 'click', () => void loadVersions(true));
    let searchTimer: ReturnType<typeof setTimeout> | undefined;
    cleanups.push(() => clearTimeout(searchTimer));
    on($('#verSearch'), 'input', (e: Event) => {
      verQuery = (e.target as HTMLInputElement).value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => void loadVersions(), 250);
    });
    on($('#verList'), 'click', (e: Event) => {
      const t = e.target as HTMLElement;
      const del = t.closest<HTMLElement>('[data-verdel]');
      if (del) return void deleteVersion(del.dataset.verdel!);
      const load = t.closest<HTMLElement>('[data-ver]');
      if (load) void loadVersion(load.dataset.ver!);
    });
    on($('#bVer'), 'click', async () => {
      const name = await askPrompt({
        title: 'Save this layout as a version',
        text: 'A saved version lets you go back to this layout later. It does not change the shared layout.',
        label: 'Version name',
        initial: new Date().toLocaleString(),
        confirmLabel: 'Save version',
        maxLength: 80,
      });
      if (!name || !alive) return;
      const { error } = await db.schema('codex').from('layout_snapshots').insert({ name, layout: toDbLayout(st) });
      if (error) return toast(`Could not save the version${error.code === '42501' ? ' (your role may not save versions)' : ''}`);
      toast('Version saved');
      if (!$('#verDlg').hidden) void loadVersions();
    });
    async function loadVersion(id: string) {
      const v = verRows.find((x) => x.id === id);
      if (!v) return;
      if (!opts.canEdit()) return toast('You have view-only access.');
      const r = await db!.schema('codex').from('layout_snapshots').select('layout').eq('id', id).maybeSingle();
      if (!alive) return;
      if (r.error || !r.data) return toast('Could not read that version');
      const state = fromDbLayout(r.data.layout as never);
      if (!valid(prune(clone(state), sops), sops)) return toast('That version is not valid');
      const next = normalize(prune(clone(state), sops));
      const yes = await askConfirm({
        title: `Load “${v.name}”?`,
        text: 'It replaces the shared layout for everyone.',
        points: [
          ...(dirty ? ['You have changes that are not saved yet. They will be lost.'] : []),
          sameLayout(st, next) ? 'It is the same as the layout you are looking at now, so nothing will change.' : 'It is saved straight away.',
          'To get today’s layout back later, save it as a version first (More → Save version).',
        ],
        confirmLabel: 'Load version',
        tone: 'warn',
      });
      if (!yes || !alive) return;
      closeVersions();
      const prev = clone(st);
      const wasDirty = dirty;
      st = next;
      sel = null;
      closeInfo();
      setDirty();
      render();
      if (!(await save(true))) return putBack(prev, wasDirty);
      toast(`Loaded “${v.name}”${db ? ' for everyone' : ''}`);
    }
    void (async () => {
      try {
        const remote = await dbLoad();
        if (!alive) return;
        if (!remote) {
          render();
          return toast('Shared database is empty — run supabase/seed.sql');
        }
        let migrated = false;
        try {
          migrated = !!localStorage.getItem(MIGRATED_KEY);
        } catch {
          /* ignore */
        }
        if (local && !migrated && !sameLayout(st, remote)) {
          try {
            localStorage.setItem(MIGRATED_KEY, '1');
          } catch {
            /* ignore */
          }
          const upload = await askConfirm({
            title: 'Two different layouts found',
            text: "This browser has a layout saved from before that is different from the shared one everyone else sees.",
            points: ["Upload mine: your browser's layout replaces the shared layout for everyone.", 'Use shared: your old browser copy is set aside and you see the shared layout.'],
            confirmLabel: 'Upload mine',
            cancelLabel: 'Use shared layout',
            tone: 'warn',
          });
          if (!alive) return;
          if (upload) {
            await save();
            return;
          }
        }
        if (!dirty) {
          st = remote;
          render();
          toast('Loaded the shared layout');
        }
      } catch {
        if (alive) toast("Could not reach the shared database — using this browser's copy");
      }
    })();
  }

  return {
    destroy: () => {
      alive = false;
      clearTimeout(toastTimer);
      clearTimeout(growTimer);
      clearInterval(scrollTimer);
      drag?.ghost?.remove();
      drag = null;
      document.body.classList.remove('drawer-open', 'dragging', 'cb-dlg-open');
      cleanups.forEach((f) => f());
    },
  };
}

