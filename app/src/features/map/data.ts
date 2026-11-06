export interface Value {
  id: string;
  n: string;
  o2: string;
  area: number;
  desc: string;
}
export interface Practice {
  id: string;
  n: string;
  st: string;
  d: string;
}
export interface Sop {
  n: number;
  t: string;
  done: 0 | 1;
}
/** SOP placements per practice, and values per practice. */
export interface Layout {
  ps: Record<string, number[]>;
  pv: Record<string, string[]>;
}

export const AREAS = ['Core Sacrifice', 'How we build trust', 'How we make decisions', 'Our voice to the outside world'];
/** codex.value_groups.code for each area above, in the same order. */
export const AREA_CODES = ['core-sacrifice', 'how-we-build-trust', 'how-we-make-decisions', 'our-voice-to-the-outside-world'];

export const VALUES: Value[] = [
  { id: 'avail', n: 'Availability', o2: 'We are always available', area: 0, desc: "We are a always-on organisation, and the job comes with that. When we're needed, we're there. We don't clock-watch or resent the call, because we know the frontline never stops. We put ourselves in the shoes of the person who needs us, and we're there." },
  { id: 'resp', n: 'Mutual respect', o2: 'We give the respect we expect.', area: 1, desc: "Respect isn't about rank. The senior leader, the cleaner, the new hire, the customer — everyone here is owed the same courtesy. We listen before we judge, and we treat people the way we'd want to be treated ourselves. We give respect first, because that's how trust begins." },
  { id: 'cons', n: 'Consistency', o2: 'Consistent standards every time.', area: 1, desc: "People trust what they can count on. So we hold the same standard every time — every shift, every customer, every site. We don't cut corners when it's busy or coast when it's quiet. We think of the person counting on us to be as good today as we were yesterday, and we don't let them down." },
  { id: 'cust', n: 'Customer first', o2: 'We always put the customer first.', area: 2, desc: 'Every decision starts with the customer and works back from there. We picture them in the room for every call we make, and we choose what\'s right for them. Get the customer right, and the rest follows.' },
  { id: 'qual', n: 'Quality', o2: 'We deliver quality every time.', area: 3, desc: "Quality is what we're known for, so we guard it in everything we touch. We do it right the first time, and we don't pass on work we wouldn't trust ourselves. There's always a person on the other end — a customer, a colleague, a family — and they deserve our best. Good enough never is." },
];

export const PRACTICES: Practice[] = [
  { id: 'P1', n: 'OPS Skills Developing Center', st: 'Life-cycle stages 01–04', d: 'Level-based (01–05) skills centre for all hires; sets the standard for the organisation.' },
  { id: 'P2', n: 'Competitive Self Development', st: 'Stage 06 · 6.1.1', d: 'Self-directed learning: self accountability, organisational support and incentive towards advancement.' },
  { id: 'P3', n: 'Metric Driven', st: 'Stage 05', d: 'Outcome-driven reviews: technical review and by-annual review.' },
  { id: 'P4', n: 'Advancement', st: 'Stage 06 · 6.2', d: 'Outcome-based advancement: positions or scope enhancements and recommendations.' },
  { id: 'P5', n: 'Incentive', st: 'Stage 06', d: 'Incentive awarded as a review outcome; linked to development and advancement.' },
  { id: 'P6', n: 'Development', st: 'Stage 06 · 6.1.1', d: 'Development outcome that feeds incentive and, ultimately, exit.' },
  { id: 'P7', n: 'Feedback Practice', st: 'Stage 05', d: 'Monday Stand-In Meetings: review matrix, team feedback and individual feedback.' },
  { id: 'P8', n: 'Engagement (based on CCT)', st: 'Stage 06 → 07', d: 'Performance engagement (celebrate · correct · combat) and team engagement.' },
  { id: 'P9', n: 'Exit', st: 'Stage 07', d: 'Voluntary and non-voluntary exit; triggers tested against CCT, then review → exit.' },
];

/** Fresh copy each time: `done` is mutated when a person ticks "Done" or the database is read. */
export const defaultSops = (): Sop[] => [
  { n: 1, t: 'Talent Acquisition & Selection', done: 1 },
  { n: 2, t: 'Employee Life Cycle (ELC)', done: 1 },
  { n: 3, t: 'Employee Experience', done: 1 },
  { n: 4, t: 'Employee Career Path Management', done: 1 },
  { n: 5, t: 'Learning & Development', done: 0 },
  { n: 6, t: 'Performance Management', done: 0 },
  { n: 7, t: 'Time & Attendance, Leave, Payroll', done: 0 },
  { n: 8, t: 'Employee Farewell', done: 1 },
  { n: 9, t: 'Loan Schemes and Salary Advances', done: 1 },
  { n: 10, t: 'Employee Assistance Scheme', done: 0 },
  { n: 11, t: 'Grievance Handling & Whistle Blowing', done: 0 },
  { n: 12, t: 'New Employee Orientation, Early Career Management', done: 0 },
];

/** SOP placements are the ones already stated in the earlier blueprint; practice -> value links are a DRAFT to confirm. */
export const DEFAULT_LAYOUT: Layout = {
  ps: { P1: [1, 5, 12], P2: [5], P3: [6], P4: [6], P5: [], P6: [], P7: [], P8: [], P9: [8] },
  pv: {
    P1: ['qual', 'cons'],
    P2: ['qual', 'avail'],
    P3: ['cons', 'qual'],
    P4: ['qual', 'cons'],
    P5: ['cust', 'avail'],
    P6: ['qual'],
    P7: ['resp', 'cons'],
    P8: ['resp', 'cust'],
    P9: ['avail', 'resp', 'cons', 'cust', 'qual'],
  },
};

export const KEY = 'blueprint-codex-rings-v1';
export const VKEY = 'blueprint-codex-view';

/** The original content is wired into the Life Cycle and the zero-tolerance logic: it can be reworded but not deleted. */
export const BUILTIN_VALUE_IDS = ['avail', 'resp', 'cons', 'cust', 'qual'];
export const canDelete = (kind: 'value' | 'practice' | 'sop', id: string | number): boolean =>
  kind === 'value' ? !BUILTIN_VALUE_IDS.includes(String(id)) : kind === 'practice' ? !/^P[1-9]$/.test(String(id)) : +id > 12;
export const CONNKEY = 'blueprint-map-connections-layout';
export const DOCKKEY = 'blueprint-map-dock';
export const MIGRATED_KEY = 'blueprint-codex-migrated';

/** Page ids -> database codes (codex.core_values.code); practices use the same codes in both (P1..P9). */
export const VALUE_CODE: Record<string, string> = { avail: 'availability', resp: 'mutual-respect', cons: 'consistency', cust: 'customer-first', qual: 'quality' };
export const VALUE_ID: Record<string, string> = Object.fromEntries(Object.entries(VALUE_CODE).map(([k, v]) => [v, k]));

export const VMAP: Record<string, Value> = Object.fromEntries(VALUES.map((v) => [v.id, v]));
export const PMAP: Record<string, Practice> = Object.fromEntries(PRACTICES.map((p) => [p.id, p]));
