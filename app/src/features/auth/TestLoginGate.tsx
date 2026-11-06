import { useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { env } from '../../lib/env';
import { isTestSignedIn, subscribeTestLogin, testSignIn } from './testLogin';
import './auth.css';

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (testSignIn(email, password)) return;
    setError('Incorrect email or password. Please try again.');
    setPassword('');
    pwRef.current?.focus();
  }

  return (
    <div className="ag" role="dialog" aria-modal="true" aria-label="Sign in">
      <div className="ag-card">
        <img className="ag-logo" src="/Calybrate_LOGO.png" alt="Calybrate" />
        <h1>Welcome back</h1>
        <p>Sign in to Calybrate Blueprint to continue.</p>
        {error && (
          <div className="ag-err" role="alert">
            {error}
          </div>
        )}
        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              name="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              autoFocus
              placeholder="you@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
            />
          </label>
          <label>
            Password
            <span className="ag-pw">
              <input
                ref={pwRef}
                type={show ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
              />
              <button type="button" className="ag-eye" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow((s) => !s)}>
                {show ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>
          <button className="ag-btn" type="submit">
            Sign in
          </button>
        </form>
        <p className="ag-small">SANDBOX CONSULTANCY SERVICES (PVT) LTD</p>
      </div>
    </div>
  );
}

/**
 * Front-end test login in front of the whole app. Shown only when `enabled` (default: no database configured and not a
 * unit/e2e run). Once the test account has signed in it lets the app through; signing out is in the account menu.
 */
export function TestLoginGate({ children, enabled = env.testLogin }: { children: ReactNode; enabled?: boolean }) {
  const signedIn = useSyncExternalStore(subscribeTestLogin, isTestSignedIn, isTestSignedIn);
  if (!enabled || signedIn) return <>{children}</>;
  return <LoginPage />;
}
