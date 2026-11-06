import { render, screen, act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '../features/auth/AuthProvider';
import { Shell, type ViewMap } from './Shell';

const views: ViewMap = {
  dash: <div>DASH VIEW</div>,
  cct: <div>CCT VIEW</div>,
  map: <div>MAP VIEW</div>,
  outcomes: <div>OUTCOMES VIEW</div>,
  admin: <div>ADMIN VIEW</div>,
};

const go = (hash: string) =>
  act(() => {
    location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

const renderShell = () =>
  render(
    <AuthProvider>
      <Shell views={views} />
    </AuthProvider>,
  );

describe('Shell (no database => admin, like the legacy offline copy)', () => {
  beforeEach(() => {
    location.hash = '';
  });

  it('opens on the Life Cycle and navigates by the legacy #hash links', () => {
    renderShell();
    expect(screen.getByText('DASH VIEW')).toBeInTheDocument();
    go('#cct');
    expect(screen.getByText('CCT VIEW')).toBeInTheDocument();
    go('#map');
    expect(screen.getByText('MAP VIEW')).toBeInTheDocument();
    go('#outcomes');
    expect(screen.getByText('OUTCOMES VIEW')).toBeInTheDocument();
  });

  it('falls back to the Life Cycle for unknown hashes', () => {
    renderShell();
    go('#whatever');
    expect(screen.getByText('DASH VIEW')).toBeInTheDocument();
  });

  it('marks the active tab and updates the title', () => {
    renderShell();
    go('#cct');
    expect(screen.getByRole('link', { name: 'Framework' })).toHaveAttribute('aria-current', 'page');
    expect(document.title).toBe('Blueprint · Performance Framework');
  });

  it('keeps working when one view crashes', () => {
    const Bad = () => {
      throw new Error('boom');
    };
    const boom: ViewMap = { ...views, cct: <Bad /> };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <AuthProvider>
        <Shell views={boom} />
      </AuthProvider>,
    );
    go('#cct');
    expect(screen.getByRole('alert')).toHaveTextContent('could not be shown');
    expect(screen.getByRole('link', { name: 'Practice' })).toBeInTheDocument();
    spy.mockRestore();
  });
});
