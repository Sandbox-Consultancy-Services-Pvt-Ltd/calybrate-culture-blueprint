import { useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { passwordProblem } from './policy';
import './auth.css';

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="ag" role="dialog" aria-modal="true" aria-label="Sign in">
      <div className="ag-card">
        <img className="ag-logo" src="/logo.svg" alt="Your Organisation" />
        {children}
      </div>
    </div>
  );
}

/** Shown to a new user on their first sign-in, with a tick-box they must accept before choosing a password. */
function PrivacyNotice() {
  return (
    <div className="ag-policy" tabIndex={0} role="region" aria-label="Privacy policy">
      <h2>Privacy Policy</h2>
      <p>
        Calybrate Blueprint is a private culture-management system operated by SANDBOX Consultancy Services (Pvt) Ltd for your
        organisation. It is for authorised staff only. By using it you agree to the following.
      </p>
      <h3>What we collect</h3>
      <ul>
        <li>Your username, display name, role and account status.</li>
        <li>Sign-in and two-step verification activity (never your password or authenticator codes in readable form).</li>
        <li>An access log of sensitive actions: exports, prints and the opening of SOP and practice documents, with the time and your username.</li>
        <li>The content you add or change in the system (for example SOP documents, links and wording), and who changed it.</li>
      </ul>
      <h3>How it is used</h3>
      <ul>
        <li>To let you sign in and to show only what your role permits.</li>
        <li>To keep the system secure and to investigate misuse or suspected leaks of confidential material.</li>
        <li>We do not sell your data or use it for advertising.</li>
      </ul>
      <h3>Your responsibilities</h3>
      <ul>
        <li>Keep your password and authenticator private; do not share your account.</li>
        <li>Treat SOPs and other documents as confidential. Do not copy, forward or publish them outside the organisation without permission.</li>
      </ul>
      <h3>Sharing and storage</h3>
      <p>
        Data is stored in a protected database and private file storage. It is visible only to authorised administrators and
        editors, and to our hosting providers who process it on our behalf. It is disclosed otherwise only if the law requires.
      </p>
      <h3>Retention and your rights</h3>
      <p>
        Data is kept while your account is active and for as long as needed for security and legal purposes. You may ask an
        administrator to see, correct or delete your personal details, subject to those needs.
      </p>
    </div>
  );
}

const Err = ({ msg }: { msg: string | null }) =>
  msg ? (
    <div className="ag-err" role="alert">
      {msg}
    </div>
  ) : null;

function LoginScreen({ message }: { message?: string }) {
  const { signIn } = useAuth();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const msg = await signIn(user, pass);
    if (msg) {
      setError(msg);
      setPass('');
      setBusy(false);
    }
  }

  return (
    <Card>
      <h1>Culture Blueprint</h1>
      <p>Sign in with the username and password your administrator gave you.</p>
      {message && <div className="ag-info">{message}</div>}
      <Err msg={error} />
      <form onSubmit={submit}>
        <label>
          Username
          <input
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            value={user}
            onChange={(e) => setUser(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
        </label>
        <button className="ag-btn" type="submit" disabled={busy}>
          Sign in
        </button>
      </form>
    </Card>
  );
}

function CodeForm({ label, onCode }: { label: string; onCode: (code: string) => Promise<boolean> }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const ok = await onCode(code.trim());
    if (!ok) {
      setError('That code did not work. Check the code in your app and try again.');
      setCode('');
      setBusy(false);
    }
  }

  return (
    <>
      <Err msg={error} />
      <form onSubmit={submit}>
        <input
          type="text"
          className="ag-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]{6}"
          aria-label="Six-digit code"
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
        <button className="ag-btn" type="submit" disabled={busy}>
          {label}
        </button>
      </form>
    </>
  );
}

function VerifyScreen({ factorId }: { factorId: string }) {
  const { verify, signOut } = useAuth();
  return (
    <Card>
      <h1>Two-step verification</h1>
      <p>Open your authenticator app and enter the 6-digit code for Culture Blueprint.</p>
      <CodeForm label="Verify" onCode={(c) => verify(factorId, c)} />
      <button className="ag-link" type="button" onClick={signOut}>
        Use a different account
      </button>
      <p className="ag-small">Lost your phone? Ask an administrator to reset your two-step verification.</p>
    </Card>
  );
}

function EnrollScreen({ factorId, qr, secret }: { factorId: string; qr: string; secret: string }) {
  const { verify, signOut } = useAuth();
  return (
    <Card>
      <h1>Set up two-step verification</h1>
      <p>
        1. Install an authenticator app (Google Authenticator, Microsoft Authenticator or similar). 2. Scan this code
        (or type the key). 3. Enter the 6-digit code it shows.
      </p>
      <div className="ag-qr">
        <img alt="QR code for your authenticator app" src={qr} />
      </div>
      <code>{secret}</code>
      <CodeForm label="Turn on and continue" onCode={(c) => verify(factorId, c)} />
      <button className="ag-link" type="button" onClick={signOut}>
        Cancel and sign out
      </button>
    </Card>
  );
}

function ChangeScreen({ forced }: { forced: boolean }) {
  const { saveNewPassword, closeChangePassword } = useAuth();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (forced && !agreed) return setError('Please read and accept the privacy policy to continue.');
    const problem = passwordProblem(a, b);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const msg = await saveNewPassword(a);
    if (msg) {
      setError(msg);
      setBusy(false);
    }
  }

  return (
    <Card>
      <h1>{forced ? 'Choose your own password' : 'Change password'}</h1>
      <p>{forced ? 'The password you were given is temporary. Choose one only you know.' : 'Choose a new password.'}</p>
      <ul>
        <li>At least 12 characters</li>
        <li>A lower-case letter, an upper-case letter and a number</li>
      </ul>
      <Err msg={error} />
      <form onSubmit={submit}>
        {forced && (
          <>
            <PrivacyNotice />
            <label className="ag-agree">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>I have read and accept the privacy policy.</span>
            </label>
          </>
        )}
        <label>
          New password
          <input type="password" autoComplete="new-password" required minLength={12} autoFocus value={a} onChange={(e) => setA(e.target.value)} />
        </label>
        <label>
          Repeat the new password
          <input type="password" autoComplete="new-password" required minLength={12} value={b} onChange={(e) => setB(e.target.value)} />
        </label>
        <button className="ag-btn" type="submit" disabled={busy}>
          Save password
        </button>
      </form>
      {!forced && (
        <button className="ag-link" type="button" onClick={closeChangePassword}>
          Cancel
        </button>
      )}
    </Card>
  );
}

/** Shows the app only after sign-in, 2-step verification and (if needed) a forced password change. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { stage, signOut } = useAuth();

  const showApp = stage.kind === 'ready' || (stage.kind === 'change' && !stage.forced);
  let overlay: ReactNode = null;
  switch (stage.kind) {
    case 'loading':
      overlay = (
        <Card>
          <p role="status">Loading…</p>
        </Card>
      );
      break;
    case 'unconfigured':
      overlay = (
        <Card>
          <h1>Not set up yet</h1>
          <p>This site is missing its database settings, so it cannot sign anyone in. Ask an administrator to add the Supabase settings and redeploy.</p>
        </Card>
      );
      break;
    case 'login':
      overlay = <LoginScreen message={stage.message} />;
      break;
    case 'verify':
      overlay = <VerifyScreen factorId={stage.factorId} />;
      break;
    case 'enroll':
      overlay = <EnrollScreen factorId={stage.factorId} qr={stage.qr} secret={stage.secret} />;
      break;
    case 'enroll-error':
      overlay = (
        <Card>
          <h1>Set up two-step verification</h1>
          <Err msg="Could not start the setup. Reload the page and try again." />
        </Card>
      );
      break;
    case 'change':
      overlay = <ChangeScreen forced={stage.forced} />;
      break;
    case 'noaccess':
      overlay = (
        <Card>
          <h1>No access</h1>
          <p>This account is not active. Ask an administrator for help.</p>
          <button className="ag-btn" type="button" onClick={signOut}>
            Sign out
          </button>
        </Card>
      );
      break;
    case 'ready':
      break;
  }

  return (
    <>
      {showApp && children}
      {overlay}
    </>
  );
}
