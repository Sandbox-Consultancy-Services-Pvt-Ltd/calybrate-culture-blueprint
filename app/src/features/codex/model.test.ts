import { buildCodex, isDone, outcomeCount, sopsFor, sopTitle } from './model';

const codex = buildCodex(
  [
    { sop_number: 6, title: 'Onboarding', sop_statuses: { code: 'done' } },
    { sop_number: 2, title: 'Rounds', sop_statuses: { code: 'draft' } },
    { sop_number: 9, title: 'No status', sop_statuses: null },
  ],
  [
    { practices: { code: 'P3' }, sops: { sop_number: 6 } },
    { practices: { code: 'P3' }, sops: { sop_number: 2 } },
    { practices: null, sops: { sop_number: 9 } },
  ],
  [
    { areas: { code: 'A1' }, pillars: { code: 'x' } },
    { areas: { code: 'A1' }, pillars: { code: 'x' } },
    { areas: { code: 'A1' }, pillars: { code: 'y' } },
    { areas: { code: 'A2' }, pillars: { code: 'x' } },
    { areas: { code: 'FIN', parent: { code: 'ADM' } }, pillars: { code: 'x' } },
    { areas: { code: 'HR', parent: { code: 'ADM' } }, pillars: { code: 'y' } },
    { areas: null, pillars: { code: 'x' } },
  ],
);

describe('codex model', () => {
  it('sorts SOP numbers per practice and skips incomplete links', () => {
    expect(sopsFor(codex, 'P3')).toEqual([2, 6]);
    expect(sopsFor(codex, 'nope')).toEqual([]);
  });
  it('returns a copy, not the internal array', () => {
    sopsFor(codex, 'P3').push(99);
    expect(sopsFor(codex, 'P3')).toEqual([2, 6]);
  });
  it('reads titles and done flags', () => {
    expect(sopTitle(codex, 6)).toBe('Onboarding');
    expect(sopTitle(codex, 1000)).toBe('');
    expect(isDone(codex, 6)).toBe(true);
    expect(isDone(codex, 2)).toBe(false);
    expect(isDone(codex, 9)).toBe(false);
  });
  it('counts outcomes per area and per pillar', () => {
    expect(outcomeCount(codex, 'A1')).toBe(3);
    expect(outcomeCount(codex, 'A1', 'x')).toBe(2);
    expect(outcomeCount(codex, 'A2', 'y')).toBe(0);
  });
  it("counts a parent area's outcomes from its sub-areas", () => {
    expect(outcomeCount(codex, 'ADM')).toBe(2);
    expect(outcomeCount(codex, 'ADM', 'x')).toBe(1);
    expect(outcomeCount(codex, 'FIN')).toBe(1);
  });
});
