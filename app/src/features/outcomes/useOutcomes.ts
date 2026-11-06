import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { SaveError, loadDocs, loadMeta, lsRead, lsWrite, saveBox } from './data';
import { FALLBACK_META, cleanStandards, docId, type Docs, type Item, type Leaf, type Meta, type Pillar } from './model';

export interface Toast {
  msg: string;
  err: boolean;
}
export interface PersistResult {
  ok: boolean;
  device: boolean;
  cleared: boolean;
}

/** Outcomes data: shared Supabase tables, or this browser's storage when there is no database. */
export function useOutcomes() {
  const db = supabase;
  const { canEdit, canExport, isAdmin } = useAuth();
  const [meta, setMeta] = useState<Meta>(FALLBACK_META);
  const [docs, setDocs] = useState<Docs>({});
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [mode, setMode] = useState<'shared' | 'device' | null>(null);
  const [writeBlocked, setWriteBlocked] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const busy = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const canWrite = canEdit && !writeBlocked;

  const say = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  const reload = useCallback(async () => {
    if (!db) return;
    const m = await loadMeta(db, isAdmin);
    if (m) setMeta(m);
    setDocs(await loadDocs(db));
    setLoaded(true);
    setTimedOut(false);
  }, [db, isAdmin]);

  useEffect(() => {
    let alive = true;
    if (!db) {
      setMode('device');
      setDocs(lsRead());
      setLoaded(true);
      return;
    }
    setMode('shared');
    const slow = setTimeout(() => alive && setTimedOut(true), 10_000);
    (async () => {
      try {
        await reload();
        clearTimeout(slow);
      } catch {
        clearTimeout(slow);
        if (!alive) return;
        setMode('device');
        setDocs(lsRead());
        setLoaded(true);
        setTimedOut(false);
        say('Could not reach the shared database. Showing entries saved on this device.', true);
      }
    })();

    let debounce: ReturnType<typeof setTimeout> | undefined;
    const later = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (!busy.current) void reload().catch(() => {});
      }, 400);
    };
    const channels = ['outcomes', 'promises', 'standards', 'pillars'].map((table) =>
      db.channel(`outcomes_${table}`).on('postgres_changes', { event: '*', schema: 'outcomes', table }, later).subscribe(),
    );
    const poll = setInterval(() => {
      if (!document.hidden && !busy.current) void loadDocs(db).then(setDocs).catch(() => {});
    }, 60_000);

    return () => {
      alive = false;
      clearTimeout(slow);
      clearTimeout(debounce);
      clearInterval(poll);
      channels.forEach((c) => void db.removeChannel(c));
    };
  }, [db, reload, say]);

  const persist = useCallback(
    async (
      leaf: Leaf,
      p: Pillar,
      promise: string,
      standards: Array<{ id?: string; title?: string; items?: Array<Partial<Item> & { status?: string }> }>,
    ): Promise<PersistResult> => {
      const key = docId(leaf.code, p.code);
      const clean = cleanStandards(standards);
      const text = promise.trim();
      const cleared = !text && !clean.length;
      if (mode === 'device' || !db) {
        const next = { ...docs };
        if (!cleared) next[key] = { row: leaf.code, col: p.code, promise: text, standards: clean, updatedAt: new Date().toISOString() };
        else delete next[key];
        const ok = lsWrite(next);
        setDocs(next);
        return { ok, device: true, cleared };
      }
      await saveBox(db, leaf.code, p.code, text, clean);
      setDocs(await loadDocs(db));
      return { ok: true, device: false, cleared };
    },
    [db, docs, mode],
  );

  const handleSaveError = useCallback(
    (e: unknown) => {
      if (e instanceof SaveError && (e.code === 401 || e.code === 403)) {
        setWriteBlocked(true);
        say('This account has view-only access, so the change was not saved.', true);
      } else {
        say('Could not save. Your entries are still here. Try again.', true);
      }
    },
    [say],
  );

  return { meta, docs, loaded, timedOut, mode, canWrite, canExport, toast, say, persist, handleSaveError, setBusy: (b: boolean) => (busy.current = b) };
}

export type OutcomesApi = ReturnType<typeof useOutcomes>;
