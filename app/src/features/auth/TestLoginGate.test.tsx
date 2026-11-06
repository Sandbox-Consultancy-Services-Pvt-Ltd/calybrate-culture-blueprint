import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { TestLoginGate } from './TestLoginGate';
import { checkTestLogin, isTestSignedIn, testSignIn, testSignOut } from './testLogin';

afterEach(() => act(() => testSignOut()));

const app = <p>the app</p>;
const fill = async (email: string, password: string) => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
};

describe('front-end test login', () => {
  it('accepts only the test account (email ignores case and spaces, password is exact)', () => {
    expect(checkTestLogin('angelo@sandbox.lk', 'Sandbox@123')).toBe(true);
    expect(checkTestLogin('  Angelo@Sandbox.LK ', 'Sandbox@123')).toBe(true);
    expect(checkTestLogin('angelo@sandbox.lk', 'sandbox@123')).toBe(false);
    expect(checkTestLogin('angelo@sandbox.lk', '')).toBe(false);
    expect(checkTestLogin('someone@sandbox.lk', 'Sandbox@123')).toBe(false);
  });

  it('shows the sign-in page and hides the app until the details are right', async () => {
    render(<TestLoginGate enabled>{app}</TestLoginGate>);
    expect(screen.getByRole('dialog', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText('the app')).not.toBeInTheDocument();

    await fill('angelo@sandbox.lk', 'wrong-password');
    expect(screen.getByRole('alert')).toHaveTextContent('Incorrect email or password');
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(isTestSignedIn()).toBe(false);

    await userEvent.setup().type(screen.getByLabelText('Password'), 'Sandbox@123{Enter}');
    expect(await screen.findByText('the app')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('can show and hide the typed password', async () => {
    const user = userEvent.setup();
    render(<TestLoginGate enabled>{app}</TestLoginGate>);
    const pw = screen.getByLabelText('Password');
    expect(pw).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(pw).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(pw).toHaveAttribute('type', 'password');
  });

  it('goes back to the sign-in page after signing out', () => {
    expect(testSignIn('angelo@sandbox.lk', 'Sandbox@123')).toBe(true);
    render(<TestLoginGate enabled>{app}</TestLoginGate>);
    expect(screen.getByText('the app')).toBeInTheDocument();
    act(() => testSignOut());
    expect(screen.getByRole('dialog', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('lets the app straight through when the test login is switched off', () => {
    render(<TestLoginGate enabled={false}>{app}</TestLoginGate>);
    expect(screen.getByText('the app')).toBeInTheDocument();
  });
});
