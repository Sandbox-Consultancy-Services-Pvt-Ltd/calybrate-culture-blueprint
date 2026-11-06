import type { LayoutSpec } from './categories/types';

export interface Detail {
  k: string;
  t: string;
  p?: string;
  /** Bullet list heading and entries. */
  listTitle: string;
  points: string[];
  sops: Array<{ n: number; name: string }>;
}

const range = (from: number, to: number) => (from === to ? `Stage ${from + 1}` : `Stages ${from + 1}–${to + 1}`);

/** Which phase a stage belongs to ('' if none). */
export const phaseOf = (spec: LayoutSpec, stage: number) => spec.phases.find((p) => stage >= p.from && stage <= p.to)?.label ?? '';

/** Lanes (practices) active in a stage, as 0-based lane indexes. */
export const lanesIn = (spec: LayoutSpec, stage: number) => spec.lanes.flatMap((l, i) => (stage >= l.from && stage <= l.to ? [i] : []));

/** Drawer content for a stage: its sub-steps and the practices that apply there. */
export function stageDetail(spec: LayoutSpec, i: number): Detail {
  const s = spec.stages[i];
  const phase = phaseOf(spec, i);
  return {
    k: `Stage ${i + 1}${phase ? ` · ${phase}` : ''}`,
    t: s.name,
    p: s.note,
    listTitle: 'Key steps',
    points: [...(s.subs ?? []), ...lanesIn(spec, i).map((l) => `Practice ${l + 1} — ${spec.lanes[l].title}`)],
    sops: [...new Set(lanesIn(spec, i).flatMap((l) => spec.lanes[l].sops ?? []))].sort((a, b) => a - b).map((n) => ({ n, name: spec.sops[n] })),
  };
}

/** Drawer content for a lane: what the practice asks for and the stages it covers. */
export function laneDetail(spec: LayoutSpec, i: number): Detail {
  const l = spec.lanes[i];
  const names = spec.stages.slice(l.from, l.to + 1).map((s) => s.name);
  return {
    k: `Practice ${i + 1} · ${range(l.from, l.to)}`,
    t: l.title,
    p: l.note ?? `Applies across ${names.join(', ')}.`,
    listTitle: 'Key points',
    points: l.items,
    sops: (l.sops ?? []).map((n) => ({ n, name: spec.sops[n] })),
  };
}

/** Problems that would break the layout (empty when the spec is sound). Used by tests so a typo cannot ship. */
export function validateSpec(spec: LayoutSpec): string[] {
  const out: string[] = [];
  const n = spec.stages.length;
  const inRange = (x: number) => Number.isInteger(x) && x >= 0 && x < n;
  if (n < 2) out.push('needs at least two stages');
  const covered = new Set<number>();
  for (const p of spec.phases) {
    if (!inRange(p.from) || !inRange(p.to) || p.from > p.to) out.push(`phase "${p.label}" has a bad range`);
    for (let s = p.from; s <= p.to; s++) {
      if (covered.has(s)) out.push(`stage ${s + 1} is in two phases`);
      covered.add(s);
    }
  }
  for (let s = 0; s < n; s++) if (!covered.has(s)) out.push(`stage ${s + 1} is in no phase`);
  spec.lanes.forEach((l, i) => {
    if (!inRange(l.from) || !inRange(l.to) || l.from > l.to) out.push(`practice ${i + 1} (${l.title}) has a bad range`);
    if (!l.items.length) out.push(`practice ${i + 1} (${l.title}) has no items`);
    for (const s of l.sops ?? []) if (!spec.sops[s]) out.push(`practice ${i + 1} uses unknown SOP ${s}`);
  });
  for (const l of spec.loops ?? []) if (!inRange(l.from) || !inRange(l.to) || l.from >= l.to) out.push(`loop "${l.label}" has a bad range`);
  for (const c of spec.chains ?? []) if (c.steps.length < 2) out.push(`path "${c.label}" needs two or more steps`);
  const titles = spec.lanes.map((l) => l.title);
  if (new Set(titles).size !== titles.length) out.push('two practices share a title');
  return out;
}
