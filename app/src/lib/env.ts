const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const env = {
  /**
   * The offline mode (no database: no sign-in, everything editable) is only for development, tests and the e2e build.
   * A production build with missing Supabase settings must NOT open the app, so it fails closed instead.
   */
  offlineAllowed: import.meta.env.MODE !== 'production',
  /**
   * Front-end test login (see features/auth/testLogin.ts): on while no database is configured, except in unit tests and the
   * e2e build. Set VITE_TEST_LOGIN=0 to turn it off.
   */
  testLogin:
    import.meta.env.VITE_TEST_LOGIN !== '0' &&
    !import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.MODE !== 'test' &&
    import.meta.env.MODE !== 'e2e',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  adminFunction: (import.meta.env.VITE_ADMIN_FUNCTION as string | undefined) || 'admin-users',
  userDomain: (import.meta.env.VITE_USER_DOMAIN as string | undefined) || 'users.example.com',
  idleMinutes: num(import.meta.env.VITE_IDLE_MINUTES as string | undefined, 30),
};
