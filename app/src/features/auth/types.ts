export type Role = 'viewer' | 'editor' | 'admin';

export interface Profile {
  username: string;
  display_name: string;
  role_name: string;
}

export type Stage =
  | { kind: 'loading' }
  /** Production build without Supabase settings: show nothing of the app. */
  | { kind: 'unconfigured' }
  | { kind: 'login'; message?: string }
  | { kind: 'verify'; factorId: string }
  | { kind: 'enroll'; factorId: string; qr: string; secret: string }
  | { kind: 'enroll-error' }
  | { kind: 'change'; forced: boolean }
  | { kind: 'noaccess' }
  | { kind: 'ready' };
