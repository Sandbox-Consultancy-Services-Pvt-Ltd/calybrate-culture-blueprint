import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AnnouncementsPane } from './AnnouncementsPane';
import { SettingsPane } from './SettingsPane';
import { UsersPane } from './UsersPane';
import { AdminUiProvider } from './ui';
import {
  NO_FILTER,
  activityPhrase,
  activitySentence,
  announcementState,
  attentionItems,
  deltaPct,
  filterUsers,
  initials,
  sortUsers,
  usersToCsv,
  validIdle,
  type AdminUser,
} from './model';

const base: AdminUser = { user_id: 'u1', username: 'nimal', display_name: 'Nimal Perera', role: 'admin', is_active: true, must_change_password: false, mfa_enrolled: true, mfa_required: true, last_sign_in_at: '2026-11-04T10:00:00Z', is_me: true };
const kasun: AdminUser = { ...base, user_id: 'u2', username: 'kasun', display_name: 'Kasun Silva', role: 'viewer', is_me: false, mfa_enrolled: false, last_sign_in_at: null };
const amali: AdminUser = { ...base, user_id: 'u3', username: 'amali', display_name: 'Amali Fernando', role: 'editor', is_me: false, is_active: false, must_change_password: true, last_sign_in_at: '2026-11-01T10:00:00Z' };

describe('user helpers', () => {
  const all = [base, kasun, amali];
  it('filters by search, role and status', () => {
    expect(filterUsers(all, { ...NO_FILTER, q: 'sil' }).map((u) => u.username)).toEqual(['kasun']);
    expect(filterUsers(all, { ...NO_FILTER, role: 'editor' }).map((u) => u.username)).toEqual(['amali']);
    expect(filterUsers(all, { ...NO_FILTER, status: 'inactive' }).map((u) => u.username)).toEqual(['amali']);
    expect(filterUsers(all, { ...NO_FILTER, status: 'no2step' }).map((u) => u.username)).toEqual(['kasun']);
    expect(filterUsers(all, { ...NO_FILTER, status: 'never' }).map((u) => u.username)).toEqual(['kasun']);
    expect(filterUsers(all, { ...NO_FILTER, status: 'mustchange' })).toEqual([]); // the only one is deactivated
  });

  it('sorts without changing the original list', () => {
    const copy = [...all];
    expect(sortUsers(all, 'name').map((u) => u.username)).toEqual(['amali', 'kasun', 'nimal']);
    expect(sortUsers(all, 'role').map((u) => u.username)).toEqual(['nimal', 'amali', 'kasun']);
    expect(sortUsers(all, 'recent')[0].username).toBe('nimal');
    expect(all).toEqual(copy);
  });

  it('makes initials', () => {
    expect(initials('Nimal Perera')).toBe('NP');
    expect(initials('kasun')).toBe('KA');
    expect(initials('A B C')).toBe('AC');
    expect(initials('  ')).toBe('?');
  });

  it('exports a CSV with quoting', () => {
    const csv = usersToCsv([{ ...kasun, display_name: 'Silva, Kasun' }]);
    expect(csv).toContain('"Silva, Kasun",kasun,Viewer,Active,Not set up,');
    expect(csv.split('\r\n')[0]).toContain('Name,Username,Role');
  });

  it('lists what needs attention', () => {
    const items = attentionItems(all);
    expect(items.map((i) => i.key)).toEqual(['no2step', 'never']);
    expect(attentionItems([base])).toEqual([]);
  });
});

describe('activity wording', () => {
  const row = { changed_by_name: 'Nimal', operation: 'INSERT' as const, table_name: 'outcomes', new_data: { description: 'Customers rate care' }, old_data: null };
  it('reads like a sentence', () => {
    expect(activityPhrase(row)).toBe('added an outcome: Customers rate care');
    expect(activitySentence(row)).toBe('Nimal added an outcome: Customers rate care');
    expect(activityPhrase({ ...row, operation: 'DELETE', table_name: 'pillars', old_data: { name: 'Cost' }, new_data: null })).toBe('removed a pillar: Cost');
  });
  it('compares periods', () => {
    expect(deltaPct(15, 10)).toBe(50);
    expect(deltaPct(5, 10)).toBe(-50);
    expect(deltaPct(5, 0)).toBeNull();
  });
});

describe('announcements and settings rules', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  it('says whether an announcement is showing', () => {
    expect(announcementState({ is_active: true, starts_at: null, ends_at: null }, now)).toBe('live');
    expect(announcementState({ is_active: false, starts_at: null, ends_at: null }, now)).toBe('off');
    expect(announcementState({ is_active: true, starts_at: '2026-11-07T00:00:00Z', ends_at: null }, now)).toBe('scheduled');
    expect(announcementState({ is_active: true, starts_at: null, ends_at: '2026-11-05T00:00:00Z' }, now)).toBe('ended');
  });
  it('accepts only whole minutes from 5 to 240', () => {
    expect([4, 5, 30, 240, 241, 7.5].map(validIdle)).toEqual([false, true, true, true, false, false]);
  });
});

function fakeDb(rpc: ReturnType<typeof vi.fn>) {
  const invoke = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
  return { db: { functions: { invoke }, schema: () => ({ rpc }) } as unknown as SupabaseClient, invoke, rpc };
}
const wrap = (ui: React.ReactElement) => render(<AdminUiProvider>{ui}</AdminUiProvider>);
const missing = { data: null, error: { message: 'Could not find the function app.get_settings in the schema cache' } };

describe('before migration 0017 is run', () => {
  it('Settings explains what to do instead of failing', async () => {
    const { db } = fakeDb(vi.fn().mockResolvedValue(missing));
    wrap(<SettingsPane db={db} />);
    expect(await screen.findByText(/Settings is not switched on yet/)).toBeInTheDocument();
    expect(screen.getByText(/0017_admin_settings\.sql/)).toBeInTheDocument();
  });
  it('Announcements explains it too, and offers no New button', async () => {
    const { db } = fakeDb(vi.fn().mockResolvedValue({ data: null, error: { message: 'function app.admin_list_announcements() does not exist' } }));
    wrap(<AnnouncementsPane db={db} />);
    expect(await screen.findByText(/Announcements is not switched on yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New announcement/ })).not.toBeInTheDocument();
  });
});

describe('Settings', () => {
  it('rejects a bad number and saves a good one', async () => {
    const user = userEvent.setup();
    const rpc = vi.fn().mockImplementation(async (name: string) => (name === 'get_settings' ? { data: { idle_minutes: 30 }, error: null } : { data: null, error: null }));
    const { db } = fakeDb(rpc);
    wrap(<SettingsPane db={db} />);
    const input = await screen.findByLabelText(/Minutes of inactivity/);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await user.clear(input);
    await user.type(input, '2');
    await user.click(save);
    expect(screen.getByRole('alert')).toHaveTextContent('from 5 to 240');
    expect(rpc).not.toHaveBeenCalledWith('admin_set_setting', expect.anything());
    await user.clear(input);
    await user.type(input, '45');
    await user.click(save);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_set_setting', { p_key: 'idle_minutes', p_value: 45 }));
  });
});

describe('Announcements', () => {
  it('creates one', async () => {
    const user = userEvent.setup();
    const rpc = vi.fn().mockImplementation(async (name: string) => (name === 'admin_list_announcements' ? { data: [], error: null } : { data: 'new-id', error: null }));
    const { db } = fakeDb(rpc);
    wrap(<AnnouncementsPane db={db} />);
    await user.click((await screen.findAllByRole('button', { name: /New announcement|Write the first one/ }))[0]);
    await user.type(screen.getByLabelText(/Message/), 'Offline Sunday');
    await user.click(screen.getByRole('radio', { name: 'Important' }));
    await user.click(screen.getByRole('button', { name: 'Create announcement' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_save_announcement', { p_id: null, p_message: 'Offline Sunday', p_tone: 'warning', p_is_active: true, p_starts_at: null, p_ends_at: null }),
    );
  });
});

describe('Users: filters, bulk and details', () => {
  const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
  it('filters with chips and opens the detail panel', async () => {
    const user = userEvent.setup();
    const { db } = fakeDb(rpc);
    wrap(<UsersPane db={db} users={[base, kasun, amali]} reload={async () => {}} />);
    await user.click(screen.getByRole('button', { name: 'Viewers' }));
    expect(screen.queryByText('Nimal Perera (you)')).not.toBeInTheDocument();
    expect(screen.getByText('Kasun Silva')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open details for Kasun Silva' }));
    const panel = screen.getByRole('dialog', { name: /Details for Kasun Silva/ });
    expect(within(panel).getByText('Not set up yet')).toBeInTheDocument();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_list_changes', expect.objectContaining({ p_user: 'u2' })));
  });

  it('bulk change runs one call per person and never includes you', async () => {
    const user = userEvent.setup();
    const { db, invoke } = fakeDb(rpc);
    const reload = vi.fn().mockResolvedValue(undefined);
    wrap(<UsersPane db={db} users={[base, kasun, { ...kasun, user_id: 'u4', username: 'ruwan', display_name: 'Ruwan' }]} reload={reload} />);
    expect(screen.getByLabelText('Select Nimal Perera')).toBeDisabled();
    await user.click(screen.getByLabelText('Select everyone shown'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(invoke.mock.calls.map((c) => (c[1] as { body: { user_id: string } }).body.user_id).sort()).toEqual(['u2', 'u4']);
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });
});
