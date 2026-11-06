export interface SopRow {
  sop_number: number;
  title: string;
  sop_statuses: { code: string } | null;
}
export interface PracticeSopRow {
  practices: { code: string } | null;
  sops: { sop_number: number } | null;
}
export interface OutcomeRow {
  /** `parent` is the parent area (e.g. Administration for Finance), so a parent's count includes its sub-areas. */
  areas: { code: string; parent?: { code: string } | null } | null;
  pillars: { code: string; name?: string } | null;
}

export interface PracticeNameRow {
  code: string;
  name: string;
}

export interface Codex {
  /** Practice name per code (P1..), as edited in the Safeguard Map. */
  practices: Record<string, string>;
  sops: Record<number, { title: string; done: boolean }>;
  links: Record<string, number[]>;
  outcomes: Record<string, number>;
  /** Display name per pillar code, for pillars seen in the outcomes. */
  pillarNames: Record<string, string>;
}

export const emptyCodex: Codex = { practices: {}, sops: {}, links: {}, outcomes: {}, pillarNames: {} };

/** Turns the three Supabase result sets into the lookup tables the views use. */
export function buildCodex(sopRows: SopRow[], linkRows: PracticeSopRow[], outcomeRows: OutcomeRow[], practiceRows: PracticeNameRow[] = []): Codex {
  const practices: Codex['practices'] = {};
  for (const x of practiceRows) if (x.name?.trim()) practices[x.code] = x.name.trim();

  const sops: Codex['sops'] = {};
  for (const x of sopRows) sops[x.sop_number] = { title: x.title, done: x.sop_statuses?.code === 'done' };

  const links: Codex['links'] = {};
  for (const x of linkRows) {
    if (!x.practices || !x.sops) continue;
    (links[x.practices.code] ??= []).push(x.sops.sop_number);
  }
  for (const k of Object.keys(links)) links[k].sort((a, b) => a - b);

  const outcomes: Codex['outcomes'] = {};
  const pillarNames: Codex['pillarNames'] = {};
  for (const x of outcomeRows) {
    if (!x.areas || !x.pillars) continue;
    if (x.pillars.name) pillarNames[x.pillars.code] = x.pillars.name;
    const k = `${x.areas.code}__${x.pillars.code}`;
    outcomes[k] = (outcomes[k] ?? 0) + 1;
    const parent = x.areas.parent?.code;
    if (parent) {
      const pk = `${parent}__${x.pillars.code}`;
      outcomes[pk] = (outcomes[pk] ?? 0) + 1;
    }
  }
  return { practices, sops, links, outcomes, pillarNames };
}

export const sopsFor = (c: Codex, practice: string): number[] => [...(c.links[practice] ?? [])];
export const sopTitle = (c: Codex, n: number): string => c.sops[n]?.title ?? '';
export const practiceName = (c: Codex, code: string): string => c.practices[code] ?? '';
export const isDone = (c: Codex, n: number): boolean => !!c.sops[n]?.done;

/** Outcomes in an area; pass a pillar code to narrow to one pillar. */
export function outcomeCount(c: Codex, area: string, pillar?: string): number {
  let total = 0;
  for (const [key, n] of Object.entries(c.outcomes)) {
    const [a, p] = key.split('__');
    if (a === area && (!pillar || p === pillar)) total += n;
  }
  return total;
}
