import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { env } from '../../lib/env';
import { supabase } from '../../lib/supabase';
import { canEdit as canEditRole, canExport as canExportRole, clearLocalData, isAdmin as isAdminRole, LOCK_MS, MAX_FAILS, toEmail } from './policy';
import type { Profile, Role, Stage } from './types';

export interface AuthApi {
  stage: Stage;
  role: Role | null;
  profile: Profile | null;
  canEdit: boolean;
  /** CSV export and print / PDF. Viewers read on screen only. */
  canExport: boolean;
  isAdmin: boolean;
  /** Returns an error message, or null when the password step passed. */
  signIn: (username: string, password: string) => Promise<string | null>;
  verify: (factorId: string, code: string) => Promise<boolean>;
  /** Returns an error message, or null on success. */
  saveNewPassword: (password: string) => Promise<string | null>;
  openChangePassword: () => void;
  closeChangePassword: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function useAuth(): AuthApi {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}

const IDLE_KEY = 'cb-idle';
const IDLE_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const;

interface ProfileRow {
  username: string;
  display_name: string;
  is_active: boolean;
  must_change_password: boolean;
  roles: { code: Role; name: string } | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const db = supabase;
  // No database configured: only development, tests and the e2e build may run offline (no sign-in, everything editable).
  // A production build without settings fails closed: nothing of the app is shown.
  const offline = !db && env.offlineAllowed;
  const [stage, setStage] = useState<Stage>(db ? { kind: 'loading' } : offline ? { kind: 'ready' } : { kind: 'unconfigured' });
  const [role, setRole] = useState<Role | null>(offline ? 'admin' : null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const fails = useRef(0);
  const lockUntil = useRef(0);
  const booted = useRef(false);

  const enter = useCallback(async () => {
    if (!db) return;
    const me = await db.auth.getUser();
    let p: ProfileRow | null = null;
    if (me.data.user) {
      const r = await db
        .schema('app')
        .from('profiles')
        .select('username,display_name,is_active,must_change_password,roles(code,name)')
        .eq('user_id', me.data.user.id)
        .maybeSingle();
      p = r.error ? null : (r.data as unknown as ProfileRow | null);
    }
    if (!p || !p.is_active || !p.roles) return setStage({ kind: 'noaccess' });
    setProfile({ username: p.username, display_name: p.display_name, role_name: p.roles.name });
    setRole(p.roles.code);
    if (p.must_change_password) return setStage({ kind: 'change', forced: true });
    setStage({ kind: 'ready' });
  }, [db]);

  const afterPassword = useCallback(async () => {
    if (!db) return;
    const lvl = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (lvl.data?.currentLevel === 'aal2') return enter();
    // An admin may have turned two-step off for this person. The database only returns the row to an exempt, active person at this level.
    const uid = (await db.auth.getUser()).data.user?.id;
    if (uid) {
      const ex = await db.schema('app').from('profiles').select('mfa_required').eq('user_id', uid).maybeSingle();
      if (!ex.error && ex.data && ex.data.mfa_required === false) return enter();
    }
    const f = await db.auth.mfa.listFactors();
    const verified = f.data?.totp.find((x) => x.status === 'verified');
    if (verified) return setStage({ kind: 'verify', factorId: verified.id });
    // Remove half-finished enrolments, then start a fresh one.
    for (const stale of f.data?.all.filter((x) => x.status !== 'verified') ?? []) {
      await db.auth.mfa.unenroll({ factorId: stale.id });
    }
    const r = await db.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Culture Blueprint ${Date.now().toString(36)}`,
      issuer: 'Culture Blueprint',
    });
    if (r.error || !r.data) return setStage({ kind: 'enroll-error' });
    setStage({ kind: 'enroll', factorId: r.data.id, qr: r.data.totp.qr_code, secret: r.data.totp.secret });
  }, [db, enter]);

  // Boot once: an existing session goes straight on to 2-step; otherwise show the sign-in screen.
  useEffect(() => {
    if (!db || booted.current) return;
    booted.current = true;
    (async () => {
      const s = await db.auth.getSession();
      if (s.data.session) return afterPassword();
      let idle = false;
      try {
        idle = sessionStorage.getItem(IDLE_KEY) === '1';
        sessionStorage.removeItem(IDLE_KEY);
      } catch {
        /* storage unavailable */
      }
      setStage({ kind: 'login', message: idle ? 'You were signed out because of inactivity.' : undefined });
    })();
  }, [db, afterPassword]);

  const signOut = useCallback(async () => {
    try {
      sessionStorage.removeItem(IDLE_KEY);
    } catch {
      /* ignore */
    }
    await db?.auth.signOut();
    if (db) clearLocalData();
    setProfile(null);
    setRole(null);
    location.hash = '';
    setStage({ kind: 'login' });
  }, [db]);

  // Signed out elsewhere (another tab, expired token): show the sign-in screen.
  useEffect(() => {
    if (!db) return;
    const { data } = db.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearLocalData();
        setProfile(null);
        setRole(null);
        setStage((s) => (s.kind === 'login' ? s : { kind: 'login' }));
      }
    });
    return () => data.subscription.unsubscribe();
  }, [db]);

  // The idle time can be changed by an admin (Administration > Settings); until that loads, or if it fails, the built-in value applies.
  const [idleMinutes, setIdleMinutes] = useState(env.idleMinutes);
  useEffect(() => {
    if (!db || stage.kind !== 'ready') return;
    let live = true;
    void db
      .schema('app')
      .rpc('get_settings')
      .then(({ data, error }) => {
        const n = (data as { idle_minutes?: unknown } | null)?.idle_minutes;
        if (live && !error && typeof n === 'number' && Number.isInteger(n) && n >= 5 && n <= 240) setIdleMinutes(n);
      });
    return () => {
      live = false;
    };
  }, [db, stage.kind]);

  // Sign out after N minutes without activity.
  useEffect(() => {
    if (!db || stage.kind !== 'ready') return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          sessionStorage.setItem(IDLE_KEY, '1');
        } catch {
          /* ignore */
        }
        await db.auth.signOut();
        clearLocalData();
        location.hash = '';
        setStage({ kind: 'login', message: 'You were signed out because of inactivity.' });
      }, idleMinutes * 60_000);
    };
    IDLE_EVENTS.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      IDLE_EVENTS.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [db, stage.kind, idleMinutes]);

  const signIn = useCallback(
    async (username: string, password: string): Promise<string | null> => {
      if (!db) return null;
      if (Date.now() < lockUntil.current) {
        return `Too many attempts. Wait ${Math.ceil((lockUntil.current - Date.now()) / 1000)} seconds and try again.`;
      }
      const r = await db.auth.signInWithPassword({ email: toEmail(username, env.userDomain), password });
      if (r.error || !r.data.session) {
        fails.current++;
        if (fails.current >= MAX_FAILS) {
          lockUntil.current = Date.now() + LOCK_MS;
          fails.current = 0;
        }
        return 'Wrong username or password.';
      }
      fails.current = 0;
      await afterPassword();
      return null;
    },
    [db, afterPassword],
  );

  const verify = useCallback(
    async (factorId: string, code: string) => {
      if (!db) return false;
      const r = await db.auth.mfa.challengeAndVerify({ factorId, code });
      if (r.error) return false;
      await enter();
      return true;
    },
    [db, enter],
  );

  const saveNewPassword = useCallback(
    async (password: string): Promise<string | null> => {
      if (!db) return null;
      const r = await db.auth.updateUser({ password });
      if (r.error) {
        return /different|same/i.test(r.error.message ?? '')
          ? 'Choose a password you have not used before.'
          : 'Could not change the password. Try a different one.';
      }
      await db.schema('app').rpc('mark_password_changed');
      setStage({ kind: 'ready' });
      return null;
    },
    [db],
  );

  const value = useMemo<AuthApi>(
    () => ({
      stage,
      role,
      profile,
      canEdit: canEditRole(role),
      canExport: canExportRole(role),
      isAdmin: isAdminRole(role),
      signIn,
      verify,
      saveNewPassword,
      openChangePassword: () => setStage({ kind: 'change', forced: false }),
      closeChangePassword: () => setStage({ kind: 'ready' }),
      signOut,
    }),
    [stage, role, profile, signIn, verify, saveNewPassword, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
