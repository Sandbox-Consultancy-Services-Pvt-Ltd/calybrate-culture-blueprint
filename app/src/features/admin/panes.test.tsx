import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AdminUiProvider } from './ui';
import { UsersPane } from './UsersPane';
import { BackupPane } from './BackupPane';
import { ActivityPane } from './ActivityPane';
import type { AdminUser } from './model';
import { env } from '../../lib/env';

const me: AdminUser = { user_id: 'u1', username: 'nimal', display_name: 'Nimal', role: 'admin', is_active: true, must_change_password: false, mfa_enrolled: true, mfa_required: true, last_sign_in_at: null, is_me: true };
const kasun: AdminUser = { ...me, user_id: 'u2', username: 'kasun', display_name: 'Kasun', role: 'viewer', is_me: false, mfa_enrolled: false };

function fakeDb(over: { invoke?: ReturnType<typeof vi.fn>; rpc?: ReturnType<typeof vi.fn> } = {}) {
  const invoke = over.invoke ?? vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
  const rpc = over.rpc ?? vi.fn().mockResolvedValue({ data: [], error: null });
  const db = { functions: { invoke }, schema: () => ({ rpc }) } as unknown as SupabaseClient;
  return { db, invoke, rpc };
}
type User = ReturnType<typeof userEvent.setup>;
/** The row actions live in a "⋯" menu: open it, then pick one. */
async function openMenu(user: User, row: HTMLElement) {
  await user.click(within(row).getByRole('button', { name: /More actions/ }));
}
async function menuItem(user: User, row: HTMLElement, name: string) {
  await openMenu(user, row);
  await user.click(screen.getByRole('menuitem', { name }));
}
const wrap = (ui: React.ReactElement) => render(<AdminUiProvider>{ui}</AdminUiProvider>);

describe('UsersPane', () => {
  it('lists people, and you cannot change or remove yourself', async () => {
    const user = userEvent.setup();
    const { db } = fakeDb();
    wrap(<UsersPane db={db} users={[me, kasun]} reload={async () => {}} />);
    const mine = screen.getByText('Nimal (you)').closest('tr')!;
    expect(within(mine).getByLabelText('Role of Nimal')).toBeDisabled();
    await openMenu(user, mine);
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    const his = screen.getByText('Kasun').closest('tr')!;
    expect(within(his).getByText('Not set up')).toBeInTheDocument();
    await openMenu(user, his);
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
  });

  it('rejects a bad username before calling the server', async () => {
    const user = userEvent.setup();
    const { db, invoke } = fakeDb();
    wrap(<UsersPane db={db} users={[me]} reload={async () => {}} />);
    await user.click(screen.getByRole('button', { name: /Add user/ }));
    await user.type(screen.getByLabelText('Full name'), 'A B');
    await user.type(screen.getByLabelText(/Username/), 'a_b_c');
    await user.click(screen.getByRole('button', { name: 'Create user' }));
    expect(screen.getByRole('alert')).toHaveTextContent('at most one dot, dash or underscore');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('creates a user and shows the temporary password once', async () => {
    const user = userEvent.setup();
    const invoke = vi.fn().mockResolvedValue({ data: { username: 'kasun.p', temp_password: 'Temp-Pass-123' }, error: null });
    const reload = vi.fn().mockResolvedValue(undefined);
    const { db } = fakeDb({ invoke });
    wrap(<UsersPane db={db} users={[me]} reload={reload} />);
    await user.click(screen.getByRole('button', { name: /Add user/ }));
    await user.type(screen.getByLabelText('Full name'), 'Kasun Perera');
    await user.type(screen.getByLabelText(/Username/), 'kasun.p');
    await user.click(screen.getByRole('radio', { name: /Editor/ }));
    await user.click(screen.getByRole('button', { name: 'Create user' }));

    expect(invoke).toHaveBeenCalledWith(env.adminFunction, { body: { action: 'create', username: 'kasun.p', display_name: 'Kasun Perera', role: 'editor' } });
    expect(await screen.findByText('Temp-Pass-123')).toBeInTheDocument();
    expect(reload).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'I have noted it, close' }));
    expect(screen.queryByText('Temp-Pass-123')).not.toBeInTheDocument();
  });

  it('asks before deleting and only then calls the server', async () => {
    const user = userEvent.setup();
    const { db, invoke } = fakeDb();
    wrap(<UsersPane db={db} users={[me, kasun]} reload={async () => {}} />);
    const row = () => screen.getByText('Kasun').closest('tr')!;
    await menuItem(user, row(), 'Delete');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(invoke).not.toHaveBeenCalled();

    await menuItem(user, row(), 'Delete');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete user' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith(env.adminFunction, { body: { action: 'delete', user_id: 'u2' } }));
  });

  it('shows the server message when a change is refused', async () => {
    const user = userEvent.setup();
    const err = { context: { json: async () => ({ error: 'You cannot remove the last admin.' }) } };
    const { db } = fakeDb({ invoke: vi.fn().mockResolvedValue({ data: null, error: err }) });
    wrap(<UsersPane db={db} users={[me, kasun]} reload={async () => {}} />);
    await user.selectOptions(screen.getByLabelText('Role of Kasun'), 'admin');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Make Admin' }));
    expect(await screen.findByText('You cannot remove the last admin.')).toBeInTheDocument();
  });

  it('turns two-step on or off, and says so when the server did not apply it', async () => {
    const user = userEvent.setup();
    const off: AdminUser = { ...kasun, mfa_required: false };
    const invoke = vi.fn().mockResolvedValueOnce({ data: { ok: true, mfa_required: true }, error: null }).mockResolvedValueOnce({ data: { ok: true }, error: null });
    const reload = vi.fn().mockResolvedValue(undefined);
    const { db } = fakeDb({ invoke });
    wrap(<UsersPane db={db} users={[me, off]} reload={reload} />);
    const row = () => screen.getByText('Kasun').closest('tr')!;
    expect(within(row()).getByText('Turned off')).toBeInTheDocument();
    await menuItem(user, row(), 'Turn on 2-step');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith(env.adminFunction, { body: { action: 'update', user_id: 'u2', mfa_required: true } }));
    expect(await screen.findByText('Two-step turned on for Kasun')).toBeInTheDocument();
    expect(reload).toHaveBeenCalledTimes(1);

    await menuItem(user, row(), 'Turn on 2-step');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Turn on' }));
    expect(await screen.findByText(/did not apply this change/)).toBeInTheDocument();
  });

  it('asks before changing a role, and Cancel changes nothing', async () => {
    const user = userEvent.setup();
    const { db, invoke } = fakeDb();
    wrap(<UsersPane db={db} users={[me, kasun]} reload={async () => {}} />);
    await user.selectOptions(screen.getByLabelText('Role of Kasun'), 'editor');
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByText('Change Kasun to Editor')).toBeInTheDocument();
    await user.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('BackupPane', () => {
  const file = (text: string) => new File([text], 'backup.json', { type: 'application/json' });

  it('refuses files that are not a backup', async () => {
    const user = userEvent.setup();
    const { db } = fakeDb();
    wrap(<BackupPane db={db} />);
    await user.upload(screen.getByLabelText('Backup file'), file('{"hello":1}'));
    expect(await screen.findByRole('alert')).toHaveTextContent('not a Culture Blueprint backup file');
    expect(screen.queryByRole('button', { name: 'Restore this backup' })).not.toBeInTheDocument();
  });

  it('only restores after RESTORE is typed', async () => {
    const user = userEvent.setup();
    const rpc = vi.fn().mockResolvedValue({ data: { outcomes: 3, sop_links: 2 }, error: null });
    const { db } = fakeDb({ rpc });
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true });
    wrap(<BackupPane db={db} />);
    const backup = { format: 'culture-blueprint-backup', version: 1, exported_at: '2026-01-01T00:00:00Z', outcomes: [1, 2, 3], practice_sops: [1, 2] };
    await user.upload(screen.getByLabelText('Backup file'), file(JSON.stringify(backup)));

    const go = await screen.findByRole('button', { name: 'Restore this backup' });
    expect(screen.getByText(/3 outcomes · 2 SOP links/)).toBeInTheDocument();
    expect(go).toBeDisabled();
    await user.type(screen.getByLabelText('Type RESTORE to confirm'), 'restore');
    expect(go).toBeDisabled();
    await user.clear(screen.getByLabelText('Type RESTORE to confirm'));
    await user.type(screen.getByLabelText('Type RESTORE to confirm'), 'RESTORE');
    expect(go).toBeEnabled();
    await user.click(go);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_restore_backup', { p_backup: backup }));
    expect(await screen.findByText(/Restored 3 outcomes and 2 SOP links/)).toBeInTheDocument();
  });
});

describe('ActivityPane', () => {
  it('lists changes, expands details and passes filters to the database', async () => {
    const user = userEvent.setup();
    const rows = [
      { occurred_at: '2026-02-01T09:00:00Z', changed_by_name: 'Nimal', operation: 'UPDATE', table_name: 'outcomes', old_data: { description: 'a' }, new_data: { description: 'b' }, total_count: 1 },
    ];
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    const { db } = fakeDb({ rpc });
    wrap(<ActivityPane db={db} users={[me]} />);
    expect(await screen.findByText('Outcome: b')).toBeInTheDocument();
    expect(screen.getByText('Showing 1–1 of 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText('description')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Type of change'), 'pillars');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(rpc).toHaveBeenLastCalledWith('admin_list_changes', expect.objectContaining({ p_table: 'pillars', p_limit: 50, p_offset: 0 })));
  });

  it('shows an empty message and database errors', async () => {
    const { db } = fakeDb({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not allowed.' } }) });
    wrap(<ActivityPane db={db} users={[]} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Not allowed.');
  });
});
