/**
 * FRONT-END-ONLY test login. It checks a fixed email and password in the browser, so it is a convenience for demos and
 * testing, NOT security: anyone can read these values from the page source. Real sign-in is the Supabase flow in
 * AuthProvider / AuthGate; this gate is only active while no database is configured (see env.testLogin).
 */
export const TEST_EMAIL = 'angelo@sandbox.lk';
const TEST_PASSWORD = 'Sandbox@123';
export const TEST_NAME = 'Angelo';

const KEY = 'cb-test-login';

const read = () => {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

let signedIn = read();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

/** True when the email and password match the test account (email ignores case and surrounding spaces). */
export const checkTestLogin = (email: string, password: string) => email.trim().toLowerCase() === TEST_EMAIL && password === TEST_PASSWORD;

export const isTestSignedIn = () => signedIn;
export const subscribeTestLogin = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** Returns true and signs in when the details match. The sign-in lasts until the tab is closed. */
export function testSignIn(email: string, password: string): boolean {
  if (!checkTestLogin(email, password)) return false;
  signedIn = true;
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    /* storage unavailable: the sign-in just will not survive a reload */
  }
  emit();
  return true;
}

export function testSignOut() {
  signedIn = false;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
  emit();
}
