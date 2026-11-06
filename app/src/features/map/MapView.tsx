import { useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useCssZoom } from '../../app/zoom';
import { useAuth } from '../auth/AuthProvider';
import { useCodex } from '../codex/CodexProvider';
import { createMap } from './controller';
import markup from './map.html?raw';
import './map.css';

/**
 * Safeguard Map. Static page markup (map.html) plus the typed controller (controller.ts) and the HTML builders (render.ts).
 * Only mounted after sign-in; saving needs the Editor or Admin role (the database checks it again).
 */
export function MapView() {
  const ref = useRef<HTMLDivElement>(null);
  const zoomTarget = useRef<HTMLElement | null>(null);
  const { canEdit, isAdmin } = useAuth();
  const { refresh } = useCodex();
  const html = useMemo(() => ({ __html: markup }), []);
  const live = useRef({ canEdit, isAdmin, refresh });
  live.current = { canEdit, isAdmin, refresh };

  useCssZoom(zoomTarget);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    zoomTarget.current = root.querySelector<HTMLElement>('#map');
    const c = createMap(root, { db: supabase, canEdit: () => live.current.canEdit, isAdmin: () => live.current.isAdmin, onSaved: () => void live.current.refresh() });
    return () => c.destroy();
  }, []);

  return <div id="viewMap" className="view-in" data-print-root="landscape" ref={ref} dangerouslySetInnerHTML={html} />;
}
