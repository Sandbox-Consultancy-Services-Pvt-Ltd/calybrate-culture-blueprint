import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useCodex } from '../codex/CodexProvider';
import { useRegisterZoom } from '../../app/zoom';
import { useZoom } from '../../app/zoom';
import { setTheme } from '../../app/theme';
import { createLifecycle, type Lifecycle } from './controller';
import { offlineStore, storeOf } from './info';
import { CATEGORIES, DEFAULT_CATEGORY, categoryOf } from './categories';
import { SpecLayout } from './SpecLayout';
import markup from './lifecycle.html?raw';
import './lifecycle.css';

const CAT_KEY = 'cb-lc-category';
const savedCategory = () => {
  try {
    return categoryOf(localStorage.getItem(CAT_KEY)).id;
  } catch {
    return DEFAULT_CATEGORY;
  }
};

/**
 * The original Calybrate diagram. The positioned markup is static content kept as-is (lifecycle.html); its behaviour
 * (scaling, connectors, hover, SOP chips, drawer) is the typed controller in controller.ts.
 */
function CalybrateDiagram({ tabs }: { tabs: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const lc = useRef<Lifecycle | null>(null);
  const { codex, loaded } = useCodex();
  const { setLabel } = useZoom();
  const store = useMemo(() => (loaded ? storeOf(codex, true) : offlineStore), [codex, loaded]);
  const storeRef = useRef(store);
  storeRef.current = store;

  // Static markup, set once (React never re-renders inside it).
  const html = useMemo(() => ({ __html: markup }), []);

  const handlers = useMemo(
    () => ({ zoomIn: () => lc.current?.zoomIn(), zoomOut: () => lc.current?.zoomOut(), fit: () => lc.current?.fit() }),
    [],
  );
  useRegisterZoom(handlers);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    setSlot(root.querySelector<HTMLElement>('#lcCats'));
    const c = createLifecycle(root, { getStore: () => storeRef.current, onZoomLabel: setLabel });
    lc.current = c;
    // The diagram measures itself, so redraw once the view is visible and fonts have settled.
    const raf = requestAnimationFrame(() => c.refresh());
    return () => {
      cancelAnimationFrame(raf);
      c.destroy();
      lc.current = null;
    };
  }, [setLabel]);

  useEffect(() => {
    lc.current?.refresh();
  }, [store]);

  return (
    <>
      <div id="viewDash" className="view-in" data-print-root="landscape" data-print-width="1880" ref={ref} dangerouslySetInnerHTML={html} />
      {slot ? createPortal(tabs, slot) : null}
    </>
  );
}

/** Practice Layout with a category switch: Calybrate (original diagram), Healthcare, Engineering, Banking. */
export function LifecycleView() {
  const [catId, setCatId] = useState(savedCategory);
  const cat = categoryOf(catId);

  const pick = (id: string) => {
    const next = categoryOf(id);
    setCatId(next.id);
    setTheme(next.theme);
    try {
      localStorage.setItem(CAT_KEY, next.id);
    } catch {
      /* private mode: the choice just will not persist */
    }
  };

  const tabs = (
    <div className="lc-cats" role="tablist" aria-label="Category">
      {CATEGORIES.map((c) => (
        <button key={c.id} type="button" role="tab" aria-selected={c.id === cat.id} className={c.id === cat.id ? 'on' : ''} onClick={() => pick(c.id)}>
          {c.label}
        </button>
      ))}
    </div>
  );

  return cat.layout ? <SpecLayout key={cat.id} spec={cat.layout} label={cat.label} tabs={tabs} /> : <CalybrateDiagram key={cat.id} tabs={tabs} />;
}
