import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

/** Null when Supabase is not configured; callers must handle that (legacy behaviour). */
export const supabase: SupabaseClient | null =
  env.supabaseUrl && env.supabaseAnonKey
    ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
        auth: { storageKey: 'cb-auth', persistSession: true, autoRefreshToken: true },
      })
    : null;
