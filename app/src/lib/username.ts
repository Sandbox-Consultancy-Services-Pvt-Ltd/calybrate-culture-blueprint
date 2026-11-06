/** Must match the SQL check (supabase/migrations/0011_security.sql) and the admin-users Edge Function. */
export const USERNAME_RE = /^(?=.{3,16}$)[a-z0-9]+[._-]?[a-z0-9]+$/;
export const USERNAME_HINT =
  '3 to 16 characters: lower-case letters and numbers, plus at most one dot, dash or underscore.';

export const isValidUsername = (v: string) => USERNAME_RE.test(v);
