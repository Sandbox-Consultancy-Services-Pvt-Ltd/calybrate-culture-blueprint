import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ZoomProvider } from '../../app/zoom';
import { CATEGORIES, DEFAULT_CATEGORY, categoryOf } from './categories';
import { SpecLayout } from './SpecLayout';
import { laneDetail, lanesIn, stageDetail, validateSpec } from './spec-model';

/** Accessible name of a stage button starts with its number and name, e.g. "02 Triage & Assessment …". */
const stageBtn = (name: string, i: number) => (accName: string) => accName.startsWith(`${String(i + 1).padStart(2, '0')} ${name}`);
const specs = CATEGORIES.flatMap((c) => (c.layout ? [{ id: c.id, label: c.label, spec: c.layout }] : []));

describe('practice layout categories', () => {
  it('offers Calybrate (the original diagram) first, then Healthcare, Engineering and Banking, each with a theme', () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual(['calybrate', 'healthcare', 'engineering', 'banking']);
    expect(DEFAULT_CATEGORY).toBe('calybrate');
    expect(categoryOf('nope').id).toBe('calybrate');
    expect(categoryOf('calybrate').layout).toBeNull();
    for (const c of CATEGORIES) expect(c.theme).toBe(c.id);
  });

  it('gives every industry its own layout, not a relabelled copy', () => {
    const shape = (s: (typeof specs)[number]['spec']) => JSON.stringify([s.stages.length, s.lanes.length, s.phases.map((p) => [p.from, p.to]), s.lanes.map((l) => [l.from, l.to])]);
    expect(new Set(specs.map((s) => shape(s.spec))).size).toBe(specs.length);
    expect(new Set(specs.map((s) => s.spec.stages.map((x) => x.name).join('|'))).size).toBe(specs.length);
    expect(new Set(specs.map((s) => s.spec.stages.length)).size).toBeGreaterThan(1);
  });

  for (const { id, spec } of specs) {
    describe(id, () => {
      it('is a sound layout', () => expect(validateSpec(spec)).toEqual([]));

      it('has detail for every stage and practice, and every stage has a practice', () => {
        spec.stages.forEach((_, i) => {
          expect(stageDetail(spec, i).t.length).toBeGreaterThan(0);
          expect(lanesIn(spec, i).length, `stage ${i + 1}`).toBeGreaterThan(0);
        });
        spec.lanes.forEach((_, i) => expect(laneDetail(spec, i).points.length).toBeGreaterThan(0));
      });
    });
  }

  it('catches a broken spec', () => {
    const bad = { ...specs[0].spec, lanes: [{ ...specs[0].spec.lanes[0], to: 99, sops: [999] }] };
    expect(validateSpec(bad).join(' ')).toMatch(/bad range/);
    expect(validateSpec(bad).join(' ')).toMatch(/unknown SOP 999/);
  });
});

describe('SpecLayout', () => {
  const { spec } = specs[0];
  const view = () =>
    render(
      <ZoomProvider>
        <SpecLayout spec={spec} label="Test" tabs={<span>tabs</span>} />
      </ZoomProvider>,
    );

  it('shows the stages, the practices and the counts', () => {
    view();
    spec.stages.forEach((s, i) => expect(screen.getByRole('button', { name: stageBtn(s.name, i) })).toBeInTheDocument());
    for (const l of spec.lanes) expect(screen.getAllByText(l.title).length).toBeGreaterThan(0);
    expect(screen.getByText('Life-cycle stages').previousSibling).toHaveTextContent(String(spec.stages.length));
  });

  it('opens a drawer for a stage and for a practice, and closes it', async () => {
    const user = userEvent.setup();
    view();
    await user.click(screen.getByRole('button', { name: stageBtn(spec.stages[1].name, 1) }));
    const drawer = screen.getByRole('complementary');
    expect(within(drawer).getByRole('heading', { name: spec.stages[1].name })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: new RegExp(spec.lanes[0].items[0]) }));
    expect(within(drawer).getByRole('heading', { name: spec.lanes[0].title })).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: 'Close' }));
    expect(drawer).toHaveAttribute('aria-hidden', 'true');
  });
});
