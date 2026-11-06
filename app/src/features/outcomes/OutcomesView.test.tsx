import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { ZoomProvider } from '../../app/zoom';
import { LS_KEY } from './data';
import { OutcomesView } from './OutcomesView';

// No database in tests => "device" mode: outcomes live in this browser's localStorage, user acts as admin.
const renderView = () =>
  render(
    <AuthProvider>
      <ZoomProvider>
        <OutcomesView />
      </ZoomProvider>
    </AuthProvider>,
  );

const cellFor = (leaf: string, pillar: string) => document.querySelector(`.cell[data-leaf="${leaf}"][data-p="${pillar}"]`) as HTMLElement;

describe('OutcomesView (device mode)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows every area and the three pillars with an empty summary', () => {
    renderView();
    expect(screen.getByRole('heading', { name: 'Performance Outcomes' })).toBeInTheDocument();
    expect(screen.getByText('0 / 27')).toBeInTheDocument();
    for (const area of ['Operations', 'Team 1', 'Team 2', 'Administration', 'Team 3', 'Team 4']) {
      expect(screen.getByRole('heading', { name: area })).toBeInTheDocument();
    }
    expect(document.querySelectorAll('.cell')).toHaveLength(27);
  });

  it('shows the Administration sub-areas as their own rows', () => {
    renderView();
    for (const sub of ['Human Resources', 'Finance', 'IT']) {
      expect(cellFor(sub === 'IT' ? 'it' : sub === 'Finance' ? 'finance' : 'human-resources', 'care')).toBeInTheDocument();
    }
  });

  it('filters to empty boxes and by status', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        'team-1__care': { row: 'team-1', col: 'care', promise: '', updatedAt: null, standards: [{ id: 's', title: 'S', items: [{ id: '1', text: 'A', target: '', current: '', status: 'risk' }] }] },
      }),
    );
    renderView();
    const chips = () => within(document.querySelector('.ox-chips') as HTMLElement);
    await user.click(chips().getByRole('button', { name: /At risk/ }));
    expect(cellFor('team-1', 'care')).not.toHaveClass('dim');
    expect(cellFor('team-4', 'time')).toHaveClass('dim');

    await user.click(chips().getByRole('button', { name: /At risk/ })); // toggle off
    await user.click(screen.getByLabelText('Show only empty boxes'));
    expect(cellFor('team-1', 'care')).toHaveClass('dim');
    expect(cellFor('team-4', 'time')).not.toHaveClass('dim');
  });

  it('fills promise, standard and outcome in the dialog, saves, and warns before discarding changes', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(within(cellFor('team-4', 'time')).getByRole('button', { name: /Open Team 4, Time/ }));

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Promise'), 'Results when you need them');
    await user.type(within(dialog).getByLabelText('Standard'), 'Turnaround time');
    await user.type(within(dialog).getByLabelText('Outcome'), 'Reports in 2 hours');
    await user.type(within(dialog).getByLabelText('Current level'), '70%');
    await user.click(within(dialog).getByLabelText('On track'));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const box = JSON.parse(localStorage.getItem(LS_KEY)!)['team-4__time'];
    expect(box.promise).toBe('Results when you need them');
    expect(box.standards[0].title).toBe('Turnaround time');
    expect(box.standards[0].items[0]).toMatchObject({ text: 'Reports in 2 hours', current: '70%', status: 'track' });
    expect(within(cellFor('team-4', 'time')).getByText('Results when you need them')).toBeInTheDocument();

    // Re-open, change something, try to leave: asked to confirm first.
    await user.click(within(cellFor('team-4', 'time')).getByRole('button', { name: /Open Team 4, Time/ }));
    const d2 = screen.getByRole('dialog');
    await user.type(within(d2).getByLabelText('Current level'), '5');
    await user.click(within(d2).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('You have unsaved changes in this box.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(LS_KEY)!)['team-4__time'].standards[0].items[0].current).toBe('70%');
  });

  it('adds several standards, each with its own outcomes', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(within(cellFor('finance', 'care')).getByRole('button', { name: /Set up|Open/ }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '+ Add standard' }));
    const titles = within(dialog).getAllByLabelText('Standard');
    await user.type(titles[0], 'Invoices');
    await user.type(titles[1], 'Payroll');
    const outs = within(dialog).getAllByLabelText('Outcome');
    await user.type(outs[0], 'Paid in 30 days');
    await user.type(outs[1], 'Paid on the 25th');
    await user.click(within(dialog).getAllByRole('button', { name: '+ Add outcome' })[1]);
    expect(within(dialog).getAllByLabelText('Outcome')).toHaveLength(3);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    const box = JSON.parse(localStorage.getItem(LS_KEY)!)['finance__care'];
    expect(box.standards.map((s: { title: string; items: unknown[] }) => [s.title, s.items.length])).toEqual([['Invoices', 1], ['Payroll', 1]]);
  });

  it('migrates a v1 device copy (flat outcomes) into a General standard', () => {
    localStorage.setItem('blueprint-cct-outcomes-v1', JSON.stringify({ 'team-2__care': { row: 'team-2', col: 'care', updatedAt: null, items: [{ id: '1', text: 'Old', target: '', current: '', status: 'draft' }] } }));
    renderView();
    expect(within(cellFor('team-2', 'care')).getByText('Old')).toBeInTheDocument();
    expect(within(cellFor('team-2', 'care')).getByText(/1 standard · 1 outcome/)).toBeInTheDocument();
  });

  it('removing a standard and saving an empty box clears it (both ask first)', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ 'team-2__care': { row: 'team-2', col: 'care', promise: '', updatedAt: null, standards: [{ id: 's1', title: 'Rounds', items: [{ id: '1', text: 'X', target: '', current: '', status: 'draft' }] }] } }),
    );
    renderView();
    await user.click(within(cellFor('team-2', 'care')).getByRole('button', { name: /Open Team 2, Care/ }));
    const ask = () => within(document.querySelector<HTMLElement>('.cb-dlg')!);
    await user.click(screen.getByRole('button', { name: 'Remove standard 1' }));
    // Removing a standard that holds outcomes asks first; Cancel keeps it.
    await user.click(ask().getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Outcome')).toHaveValue('X');
    await user.click(screen.getByRole('button', { name: 'Remove standard 1' }));
    await user.click(ask().getByRole('button', { name: 'Remove' }));
    // Saving an empty box deletes it for everyone, so that asks too.
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(ask().getByText('Clear this box?')).toBeInTheDocument();
    await user.click(ask().getByRole('button', { name: 'Clear box' }));
    expect(JSON.parse(localStorage.getItem(LS_KEY)!)['team-2__care']).toBeUndefined();
    expect(screen.getByText('0 / 27')).toBeInTheDocument();
  });

  it('collapses and expands areas', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: 'Collapse Team 1' }));
    expect(screen.getByRole('button', { name: 'Expand Team 1' })).toHaveAttribute('aria-expanded', 'false');
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Expand all' }));
    expect(screen.getByRole('button', { name: 'Collapse Team 1' })).toBeInTheDocument();
  });
});
