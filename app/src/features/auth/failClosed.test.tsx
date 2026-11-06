import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// A production build: no database settings and offline mode NOT allowed.
vi.mock('../../lib/supabase', () => ({ supabase: null }));
vi.mock('../../lib/env', () => ({
  env: { offlineAllowed: false, supabaseUrl: undefined, supabaseAnonKey: undefined, adminFunction: 'admin-users', userDomain: 'users.example.app', idleMinutes: 30 },
}));

import { AuthProvider, useAuth } from './AuthProvider';
import { AuthGate } from './AuthGate';

function Probe() {
  const a = useAuth();
  return <p>{`role=${a.role} admin=${a.isAdmin} edit=${a.canEdit}`}</p>;
}

describe('production build without Supabase settings', () => {
  it('shows a "not set up" screen and never the app', () => {
    render(
      <AuthProvider>
        <AuthGate>
          <div>SECRET APP</div>
        </AuthGate>
      </AuthProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Not set up yet' })).toBeInTheDocument();
    expect(screen.queryByText('SECRET APP')).not.toBeInTheDocument();
  });

  it('grants no role at all', () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText('role=null admin=false edit=false')).toBeInTheDocument();
  });
});
