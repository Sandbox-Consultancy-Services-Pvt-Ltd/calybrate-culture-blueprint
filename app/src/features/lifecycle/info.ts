import { isDone, practiceName, sopTitle, sopsFor, type Codex } from '../codex/model';

/** Read-only view of the SOP data. With no database `loaded` is false and the static text below is used. */
export interface Store {
  loaded: boolean;
  sopsFor: (practice: string) => number[];
  sopTitle: (n: number) => string;
  isDone: (n: number) => boolean;
  /** Practice name as edited in the Safeguard Map ('' when unknown). */
  practiceName: (code: string) => string;
}
export const offlineStore: Store = { loaded: false, sopsFor: () => [], sopTitle: () => '', isDone: () => false, practiceName: () => '' };
export const storeOf = (codex: Codex, loaded: boolean): Store => ({
  loaded,
  sopsFor: (p) => sopsFor(codex, p),
  sopTitle: (n) => sopTitle(codex, n),
  isDone: (n) => isDone(codex, n),
  practiceName: (code) => practiceName(codex, code),
});

export const esc = (t: unknown) =>
  String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Which practice's SOP placements each stage / practice drawer shows (stages 03-06 show none). */
export const SOP_OF: Record<string, string> = { s1: 'P1', s2: 'P1', s7: 'P9', exitend: 'P9', ops: 'P1', comp: 'P2', metric: 'P3', adv: 'P4', inc: 'P5', dev: 'P6', fb: 'P7', eng: 'P8' };

/** Static SOP names, used until the database has loaded. */
export const SOP_NAMES: Record<string, string> = {
  'SOP 1': 'Talent Acquisition & Selection',
  'SOP 5': 'Learning & Development',
  'SOP 6': 'Performance Management',
  'SOP 8': 'Employee Farewell',
  'SOP 12': 'New Employee Orientation, Early Career Management',
};

/**
 * A live practice name shown next to a fixed qualifier ("(Outcome driven)", "Based on CCT"): drops the qualifier from the
 * name when the name already ends with it, so it is not shown twice.
 */
export function stripQualifier(name: string, qualifier: string): string {
  const inner = qualifier.replace(/^\s*\(|\)\s*$/g, '').trim().toLowerCase();
  const m = name.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  return inner && m && m[1] && m[2].trim().toLowerCase() === inner ? m[1] : name;
}

/** Drawer heading for a practice: the live name, keeping the fixed qualifier the static heading carries. */
export function practiceTitle(staticTitle: string, staticName: string, live: string): string {
  if (!live || !staticTitle.startsWith(staticName)) return staticTitle;
  const qualifier = staticTitle.slice(staticName.length).trim();
  return qualifier ? `${stripQualifier(live, qualifier)} ${qualifier}` : live;
}

export const sopNumber = (s: string) => +String(s).replace(/\D/g, '');

function join(a: string[]) {
  return a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a[0] || '';
}

/** Text helpers that prefer live data and fall back to the static wording. */
export function text(st: Store) {
  const sopsOf = (key: string, fallback?: string[]) => (st.loaded && SOP_OF[key] ? st.sopsFor(SOP_OF[key]).map((n) => `SOP ${n}`) : fallback);
  const title = (s: string) => {
    const t = st.loaded ? st.sopTitle(sopNumber(s)) : '';
    return t ? esc(t) : SOP_NAMES[s] || '';
  };
  const tick = (s: string) => (st.loaded && st.isDone(sopNumber(s)) ? ' ✓' : '');
  const label = (x: number) => `SOP ${x} (${esc(st.sopTitle(x))})`;
  const coveredBy = (pid: string, fb: string): string | null => {
    if (!st.loaded) return fb;
    const n = st.sopsFor(pid);
    return n.length ? `Covered by ${join(n.map(label))}` : null;
  };
  const coveredIn = (pid: string, fb: string) => {
    if (!st.loaded) return fb;
    const n = st.sopsFor(pid).map(label);
    return `Covered in ${n.length ? `${n.join(', ')}, LOA and NDA` : 'LOA and NDA'}`;
  };
  const clause = (pid: string, fb: string) => {
    if (!st.loaded) return fb;
    const n = st.sopsFor(pid);
    return n.length ? ` (${n.map((x) => `SOP ${x} — ${esc(st.sopTitle(x))}`).join('; ')})` : '';
  };
  const clauseExit = () => (st.loaded ? ` (${[...st.sopsFor('P9').map((x) => `SOP ${x}`), 'LOA', 'NDA'].join(' / ')})` : ' (SOP 8 / LOA / NDA)');
  return { sopsOf, title, tick, coveredBy, coveredIn, clause, clauseExit };
}
export type Text = ReturnType<typeof text>;

export interface Info {
  k: string;
  t: string;
  status?: [string, string];
  sops?: string[];
  p?: string;
  /** Key points; a function is evaluated when the drawer opens (so it can use live SOP data). */
  pts?: Array<string | ((t: Text) => string | null)>;
  link?: [string, string];
}

const FUTURE_P2 = 'No process today — to be built through the OPS Skills Developing Center (Phase 02)';
const COVERED_P1 = (t: Text) =>
  t.coveredBy('P1', 'Covered by SOP 1 (Talent Acquisition &amp; Selection), SOP 5 (Learning &amp; Development) and SOP 12 (New Employee Orientation, Early Career Management)');

export const INFO: Record<string, Info> = {
  s1: { k: 'Stage 01 · Intake', t: 'Pipeline Building and Sourcing', status: ['new', FUTURE_P2], sops: ['SOP 1', 'SOP 5', 'SOP 12'], pts: [COVERED_P1, 'Future: OPS Skills Developing Center, Phase 02'] },
  s2: { k: 'Stage 02 · Intake', t: 'Recruitment', status: ['new', FUTURE_P2], sops: ['SOP 1', 'SOP 5', 'SOP 12'], pts: [COVERED_P1, 'Future: OPS Skills Developing Center, Phase 02'] },
  s3: { k: 'Stage 03 · Intake', t: 'Onboarding', status: ['new', 'No process today — to be built through the OPS Skills Developing Center (Phase 01)'], pts: ['3.1 Pre-Onboarding — induction / engagement', '3.2 Onboarding', 'OPS Skills Developing Center starts here as Phase 01'] },
  s4: { k: 'Stage 04 · Maintenance & Retention', t: 'Probation', status: ['new', 'New (future) — through the OPS Skills Developing Center'], pts: ['Level-based skills development applies to all hires', 'Phase 02 of the OPS Skills Developing Center'] },
  s5: { k: 'Stage 05 · Maintenance & Retention', t: 'Review', pts: ['5.1 Expectation — set through CCT metrics & standards', '5.2 Reviews — metric driven (Practice 3) and feedback (Practice 7)', 'Review outcomes: Advancement, Incentive, Development → Exit', 'Stages 05 and 06 run in a continuous loop'] },
  s6: { k: 'Stage 06 · Maintenance & Retention', t: 'Development & Advancement', pts: ['6.1 Development — competitive self development (6.1.1)', '6.2 Advancement — outcome based', 'Engagement (Practice 8) runs across this stage', 'Stages 05 and 06 run in a continuous loop'] },
  s7: { k: 'Stage 07 · Exit', t: 'Exit', sops: ['SOP 8'], pts: ['7.1 Voluntary exit — retirement, resignation', '7.2 Non-voluntary exit — driven by exit triggers (Practice 9)', (t) => t.coveredIn('P9', 'Covered in SOP 8 (Employee Farewell), LOA and NDA'), 'Handbook and acceptance'] },
  ops: { k: 'Practice 1 · Stages 01–04 (also 05–06)', t: 'OPS Skills Developing Center', status: ['new', 'New (future) build — no process in place today'], pts: ['Level based — Level 01 to Level 05', 'Applicable to all hires (FT / contracts / etc.)', 'Sets the standard for the organisation', 'Phase 02: pipeline building & sourcing, recruiting · Phase 01: onboarding · Phase 02: probation', 'Also affects stages 05 and 06'] },
  comp: { k: 'Practice 2 · Stage 06 (6.1.1)', t: 'Competitive Self Development', sops: ['SOP 5'], p: 'Self-directed learning — you are responsible and accountable for your own development.', pts: ['Self accountability', 'Org. support', 'Incentive wise towards advancement'] },
  metric: { k: 'Practice 3 · Stage 05', t: 'Metric Driven (Outcome driven)', sops: ['SOP 6'], pts: ['Technical review', 'By annual review (behavioural)', 'Feeds into the Feedback Practice'] },
  adv: { k: 'Practice 4 · Stage 06 (6.2)', t: 'Advancement (Outcome based)', sops: ['SOP 6'], pts: ['Positions or scope enhancements', 'Recommendations', 'Reached from the review outcome'] },
  inc: { k: 'Practice 5 · Stage 06', t: 'Incentive', pts: ['A review outcome alongside Advancement and Development', 'Development → Incentive', "Linked to 'incentive wise towards advancement' in Practice 2"] },
  dev: { k: 'Practice 6 · Stage 06 (6.1.1)', t: 'Development', pts: ['A review outcome alongside Advancement and Incentive', 'Development → Incentive → Exit'] },
  fb: { k: 'Practice 7 · Stage 05', t: 'Feedback Practice', p: 'Run through the Monday Stand-In Meetings.', pts: ['Review Matrix', 'Provide team feedback', 'Provide individual feedback', 'Outcome flows to Advancement, Incentive and Development'] },
  eng: { k: 'Practice 8 · Stage 06 → 07', t: 'Engagement (Based on CCT)', pts: ['Performance engagement — engage to celebrate, engage to correct, engage to combat', "Team engagement (management practices for engagement): performance engagement, Do and Don'ts, leadership management, employee care — how we treat", 'CCT towards employees: giving before expecting'] },
  cct: { k: 'Framework · used in Exit triggers', t: 'CCT — Care · Convenience · Time', p: 'Attendance and the availability criteria are reviewed against CCT before an exit decision.', pts: ['Care comes first, then Convenience — and we value your Time'], link: ['#cct', 'Open the CCT framework →'] },
  exitend: { k: 'Stage 07', t: 'Exit', sops: ['SOP 8'], pts: ['Reached from the review path: Development → Exit', (t) => t.coveredIn('P9', 'Covered in SOP 8 (Employee Farewell), LOA and NDA')] },
};

/** Practice names and one-line descriptions, shown by the practice filter. */
export const PRACTICES: Record<string, [string, string | ((t: Text) => string)]> = {
  '1': ['OPS Skills Developing Center', 'Level-based (01–05) skills centre for all hires; phased across stages 01–04 and shapes 05–06.'],
  '2': ['Competitive Self Development', 'Self-directed learning: self accountability, organisational support and incentive towards advancement.'],
  '3': ['Metric Driven', (t) => `Outcome-driven reviews — technical review and by-annual review${t.clause('P3', ' (SOP 6 — Performance Management)')}.`],
  '4': ['Advancement', (t) => `Outcome-based advancement: positions or scope enhancements and recommendations${t.clause('P4', ' (SOP 6 — Performance Management)')}.`],
  '5': ['Incentive', 'Incentive awarded as a review outcome; linked to development and advancement.'],
  '6': ['Development', 'Development stage 6.1.1 — feeds incentive and, ultimately, exit.'],
  '7': ['Feedback Practice', 'Monday Stand-In Meetings: review matrix, team feedback and individual feedback.'],
  '8': ['Engagement', 'Based on CCT: performance engagement (celebrate · correct · combat) and team engagement.'],
  '9': ['Exit', (t) => `Voluntary and non-voluntary exit; triggers tested against CCT, then review → exit${t.clauseExit()}.`],
};

/** Which practice (number) each practice drawer is about. */
const PRACTICE_OF: Record<string, string> = { ops: '1', comp: '2', metric: '3', adv: '4', inc: '5', dev: '6', fb: '7', eng: '8' };

/** HTML for the drawer body. `info` text is trusted static content; SOP titles from the database are escaped by `text()`. */
export function drawerHtml(key: string, st: Store): { k: string; t: string; html: string } | null {
  const i = INFO[key];
  if (!i) return null;
  const t = text(st);
  let h = '';
  if (i.status) h += `<span class="status ${i.status[0]}">${i.status[1]}</span>`;
  if (i.p) h += `<p>${i.p}</p>`;
  if (i.pts) {
    const pts = i.pts.map((x) => (typeof x === 'function' ? x(t) : x)).filter(Boolean);
    h += `<h4>Key points</h4><ul>${pts.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  }
  const sops = t.sopsOf(key, i.sops);
  if (sops?.length) {
    h += `<h4>SOPs</h4><div class="sops">${sops.map((s) => `<span class="sop" style="cursor:default" title="${t.title(s)}">${s}${t.tick(s)}</span>`).join('')}</div>`;
    h += `<ul style="margin-top:8px">${sops.map((s) => `<li><b>${s}</b> — ${t.title(s)}${t.tick(s)}</li>`).join('')}</ul>`;
  }
  if (i.link) h += `<a class="dr-link" href="${i.link[0]}" data-close-drawer>${i.link[1]}</a>`;
  const pn = PRACTICE_OF[key];
  const t0 = pn && st.loaded ? practiceTitle(i.t, PRACTICES[pn][0], st.practiceName(`P${pn}`)) : i.t;
  return { k: i.k, t: t0, html: h };
}
