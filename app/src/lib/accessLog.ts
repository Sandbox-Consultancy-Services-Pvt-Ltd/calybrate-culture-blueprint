import { supabase } from './supabase';

export type AccessAction = 'export_csv' | 'print' | 'backup' | 'document_open' | 'activity_export';

/** Records that this person took data out of the app (migration 0018). Best effort: never blocks or throws. */
export function logAccess(action: AccessAction, detail?: string): void {
  if (!supabase) return;
  void Promise.resolve(supabase.schema('app').rpc('log_access', { p_action: action, p_detail: detail ?? null })).catch(() => {});
}
