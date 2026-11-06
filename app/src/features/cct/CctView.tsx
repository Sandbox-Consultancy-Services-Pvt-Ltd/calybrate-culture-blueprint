import { useEffect, useMemo, useRef } from 'react';
import { useCodex } from '../codex/CodexProvider';
import { outcomeCount } from '../codex/model';
import { requestOutcomesFocus } from '../outcomes/focus';
import { useRegisterZoom, useZoom } from '../../app/zoom';
import { createCct, type Cct } from './controller';
import markup from './cct.html?raw';
import './cct.css';

/**
 * CCT Framework page. Static diagram markup (cct.html) plus the typed controller (controller.ts):
 * connectors, fit-to-window zoom, highlighting, and outcome chips that open the matching box in CCT Outcomes.
 */
export function CctView() {
  const ref = useRef<HTMLDivElement>(null);
  const cct = useRef<Cct | null>(null);
  const { codex, loaded } = useCodex();
  const { setLabel } = useZoom();
  const counts = useMemo(() => ({ loaded, count: (a: string, p?: string) => outcomeCount(codex, a, p), pillarName: (code: string) => codex.pillarNames[code], codexKeys: () => codex.outcomes }), [codex, loaded]);
  const countsRef = useRef(counts);
  countsRef.current = counts;
  const html = useMemo(() => ({ __html: markup }), []);

  const handlers = useMemo(() => ({ zoomIn: () => cct.current?.zoomIn(), zoomOut: () => cct.current?.zoomOut(), fit: () => cct.current?.fit() }), []);
  useRegisterZoom(handlers);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const c = createCct(root, { getCounts: () => countsRef.current, onZoomLabel: setLabel, openOutcomes: requestOutcomesFocus });
    cct.current = c;
    return () => {
      c.destroy();
      cct.current = null;
    };
  }, [setLabel]);

  useEffect(() => {
    cct.current?.refresh();
  }, [counts]);

  return <div id="viewCCT" className="view-in" data-print-root="landscape" ref={ref} dangerouslySetInnerHTML={html} />;
}
