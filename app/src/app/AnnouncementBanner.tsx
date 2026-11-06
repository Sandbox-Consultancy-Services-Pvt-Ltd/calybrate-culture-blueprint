import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { activeAnnouncements } from '../features/admin/api';
import type { Tone } from '../features/admin/model';

interface Item {
  id: string;
  message: string;
  tone: Tone;
}
const KEY = 'cb-annc-dismissed';

function dismissedIds(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/** Messages an administrator turned on in Administration > Announcements. Can be closed for the rest of the visit. */
export function AnnouncementBanner() {
  const [items, setItems] = useState<Item[]>([]);
  const [hidden, setHidden] = useState<string[]>(dismissedIds);

  useEffect(() => {
    const db = supabase;
    if (!db) return;
    let live = true;
    const load = () =>
      void activeAnnouncements(db).then((r) => {
        // A failure (including "migration not run yet") simply shows nothing.
        if (live && r.ok) setItems((r.data ?? []) as Item[]);
      });
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const shown = items.filter((i) => !hidden.includes(i.id));
  if (!shown.length) return null;
  return (
    <div className="annc-stack">
      {shown.map((i) => (
        <div key={i.id} className={`annc-bar ${i.tone}`} role="status">
          <span className="annc-msg">{i.message}</span>
          <button
            type="button"
            aria-label="Dismiss announcement"
            onClick={() => {
              const next = [...hidden, i.id];
              setHidden(next);
              try {
                sessionStorage.setItem(KEY, JSON.stringify(next));
              } catch {
                /* ignore */
              }
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
