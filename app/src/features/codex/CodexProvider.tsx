import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { buildCodex, emptyCodex, type Codex, type OutcomeRow, type PracticeNameRow, type PracticeSopRow, type SopRow } from './model';

interface CodexApi {
  /** True after the first successful load. Until then (or with no database) views keep their static content. */
  loaded: boolean;
  codex: Codex;
  refresh: () => Promise<void>;
}

const CodexContext = createContext<CodexApi | null>(null);

export function useCodex(): CodexApi {
  const v = useContext(CodexContext);
  if (!v) throw new Error('useCodex must be used inside <CodexProvider>');
  return v;
}

const WATCHED = [
  ['codex', 'sops'],
  ['codex', 'practice_sops'],
  ['codex', 'practices'],
  ['outcomes', 'outcomes'],
] as const;

/** Mount only after sign-in (inside <AuthGate>): nothing is read before the person is verified. */
export function CodexProvider({ children }: { children: ReactNode }) {
  const db = supabase;
  const [state, setState] = useState<{ loaded: boolean; codex: Codex }>({ loaded: false, codex: emptyCodex });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!db) return;
    try {
      const [s, l, o, pr] = await Promise.all([
        db.schema('codex').from('sops').select('sop_number,title,sop_statuses(code)'),
        db.schema('codex').from('practice_sops').select('practices(code),sops(sop_number)'),
        db.schema('outcomes').from('outcomes').select('areas(code,parent:areas!parent_area_id(code)),pillars(code,name)'),
        db.schema('codex').from('practices').select('code,name'),
      ]);
      if (s.error || l.error || o.error || pr.error) throw new Error('load failed');
      // An empty codex means the seed has not been run: stay on the static content.
      if (!s.data.length) return;
      setState({
        loaded: true,
        codex: buildCodex(s.data as unknown as SopRow[], l.data as unknown as PracticeSopRow[], o.data as unknown as OutcomeRow[], pr.data as unknown as PracticeNameRow[]),
      });
    } catch {
      /* keep whatever we had */
    }
  }, [db]);

  useEffect(() => {
    if (!db) return;
    void refresh();
    const later = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void refresh(), 400);
    };
    const channels = WATCHED.map(([schema, table]) =>
      db
        .channel(`store_${schema}_${table}`)
        .on('postgres_changes', { event: '*', schema, table }, later)
        .subscribe(),
    );
    return () => {
      clearTimeout(timer.current);
      channels.forEach((c) => void db.removeChannel(c));
    };
  }, [db, refresh]);

  const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);
  return <CodexContext.Provider value={value}>{children}</CodexContext.Provider>;
}
