import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAuth } from './AuthProvider';
import { initialsOf } from './policy';
import { isTestSignedIn, subscribeTestLogin, testSignOut, TEST_EMAIL, TEST_NAME } from './testLogin';

/** Round initials button with a small menu (print, change password, sign out). With no signed-in profile (offline copy) it shows a plain ⋯ menu with Print only. */
export function UserMenu({ onPrint }: { onPrint?: () => void }) {
  const { profile, role, openChangePassword, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  // Signed in with the front-end test account (no database profile).
  const testIn = useSyncExternalStore(subscribeTestLogin, isTestSignedIn, isTestSignedIn) && !profile;

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!profile && !testIn && !onPrint) return null;
  const name = profile?.display_name ?? (testIn ? TEST_NAME : '');
  const who = profile || testIn;

  return (
    <div className="ag-chip">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={who ? `Account menu for ${name}` : 'Menu'}
        title={profile ? `${name} · ${role}` : testIn ? `${name} · ${TEST_EMAIL}` : 'Menu'}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {who ? initialsOf(name) : '⋯'}
      </button>
      {open && (
        <div className="ag-menu">
          {who && (
            <div className="who">
              <b>{name}</b>
              <span>{profile ? role : TEST_EMAIL}</span>
            </div>
          )}
          {onPrint && (
            <button type="button" className="print-item" onClick={onPrint}>
              Print / save as PDF
            </button>
          )}
          {testIn && (
            <button type="button" onClick={testSignOut}>
              Sign out
            </button>
          )}
          {profile && (
            <>
              <button type="button" onClick={openChangePassword}>
                Change password
              </button>
              <button type="button" onClick={signOut}>
                Sign out
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
