import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';

export interface ZoomHandlers {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}
interface ZoomApi {
  label: string;
  setLabel: (s: string) => void;
  handlers: ZoomHandlers | null;
  register: (h: ZoomHandlers | null) => void;
}
const Ctx = createContext<ZoomApi | null>(null);

/** Holds the Zoom / Fit controls in the top bar. The open view registers what the buttons do. */
export function ZoomProvider({ children }: { children: ReactNode }) {
  const [label, setLabel] = useState('100%');
  const [handlers, register] = useState<ZoomHandlers | null>(null);
  const api = useMemo(() => ({ label, setLabel, handlers, register }), [label, handlers]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
export const useZoom = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useZoom must be used inside <ZoomProvider>');
  return v;
};

/** Registers zoom handlers while the calling view is mounted. `h` must be stable (memoised). */
export function useRegisterZoom(h: ZoomHandlers | null, label?: string) {
  const { register, setLabel } = useZoom();
  useEffect(() => {
    register(h);
    return () => register(null);
  }, [h, register]);
  useEffect(() => {
    if (label) setLabel(label);
  }, [label, setLabel]);
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.2;
export const ZOOM_STEP = 1.15;
export const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 1000) / 1000));

/** Zoom for views that are plain page content (e.g. Outcomes): CSS `zoom` on the target element. */
export function useCssZoom(target: RefObject<HTMLElement | null>) {
  const [z, setZ] = useState(1);
  const zRef = useRef(1);
  const apply = (v: number) => {
    zRef.current = v;
    setZ(v);
    if (target.current) target.current.style.zoom = v === 1 ? '' : String(v);
  };
  const handlers = useMemo<ZoomHandlers>(
    () => ({
      zoomIn: () => apply(clampZoom(zRef.current * ZOOM_STEP)),
      zoomOut: () => apply(clampZoom(zRef.current / ZOOM_STEP)),
      fit: () => apply(1),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useRegisterZoom(handlers, `${Math.round(z * 100)}%`);
  // Printing manages the zoom itself.
  useEffect(() => {
    const on = (e: Event) => {
      const t = target.current;
      if (!t) return;
      const printing = (e as CustomEvent<{ on: boolean }>).detail.on;
      t.style.zoom = printing ? '1' : zRef.current === 1 ? '' : String(zRef.current);
    };
    window.addEventListener('cb-print', on);
    return () => window.removeEventListener('cb-print', on);
  }, [target]);
}
