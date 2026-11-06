import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: null as unknown,
}));

vi.mock('../../lib/supabase', () => ({
  get supabase() {
    return mocks.db;
  },
}));

import { AuthProvider } from './AuthProvider';
import { AuthGate } from './AuthGate';

const tree = (
  <AuthProvider>
    <AuthGate>
      <div>SECRET APP</div>
    </AuthGate>
  </AuthProvider>
);

describe('AuthGate', () => {
  beforeEach(() => {
    mocks.db = null;
  });

  it('shows the app straight away when no database is configured (offline copy)', () => {
    render(tree);
    expect(screen.getByText('SECRET APP')).toBeInTheDocument();
  });

  it('hides the app and shows the sign-in form when there is no session', async () => {
    mocks.db = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
    };
    render(tree);
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText('SECRET APP')).not.toBeInTheDocument();
  });

  it('shows an error and keeps the app hidden after a wrong password', async () => {
    mocks.db = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
        signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: { message: 'bad' } }),
      },
    };
    render(tree);
    await userEvent.type(await screen.findByLabelText('Username'), 'kasun');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Wrong username or password.'));
    expect(screen.queryByText('SECRET APP')).not.toBeInTheDocument();
  });
});
