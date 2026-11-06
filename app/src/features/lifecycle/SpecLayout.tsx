import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { clampZoom, useRegisterZoom, useZoom, ZOOM_STEP } from '../../app/zoom';
import type { LayoutSpec } from './categories/types';
import { laneDetail, phaseOf, stageDetail, type Detail } from './spec-model';
import './spec-layout.css';

type Open = { kind: 'stage' | 'lane'; index: number } | null;

/**
 * A swimlane Practice Layout drawn from a LayoutSpec: stages across the top, one row per practice below, a card that spans
 * the stages the practice applies to. Every category supplies its own spec, so each has its own stages, grouping and paths.
 */
export function SpecLayout({ spec, label, tabs }: { spec: LayoutSpec; label: string; tabs: ReactNode }) {
  const { setLabel } = useZoom();
  const [zoom, setZoom] = useState(1);
  const [open, setOpen] = useState<Open>(null);
  const [hl, setHl] = useState<{ from: number; to: number } | null>(null);
  const n = spec.stages.length;

  const handlers = useMemo(
    () => ({
      zoomIn: () => setZoom((z) => clampZoom(z * ZOOM_STEP)),
      zoomOut: () => setZoom((z) => clampZoom(z / ZOOM_STEP)),
      fit: () => setZoom(1),
    }),
    [],
  );
  useRegisterZoom(handlers, `${Math.round(zoom * 100)}%`);
  useEffect(() => setLabel(`${Math.round(zoom * 100)}%`), [zoom, setLabel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const detail: Detail | null = open ? (open.kind === 'stage' ? stageDetail(spec, open.index) : laneDetail(spec, open.index)) : null;
  const inHl = (i: number) => !!hl && i >= hl.from && i <= hl.to;
  const col = (from: number, to: number): CSSProperties => ({ gridColumn: `${from + 2} / ${to + 3}` });
  const vars = { '--n': n, zoom } as CSSProperties;

  return (
    <div id="viewDash" className="view-in" data-print-root="landscape" data-print-width="1500">
      <section className="hero">
        <div className="hero-in">
          <div>
            <div className="eyebrow">Calybrate Blueprint</div>
            <h1>Practice Layout</h1>
          </div>
          <div className="stats" aria-label="Summary">
            <div className="stat">
              <b>{n}</b>
              <span>Life-cycle stages</span>
            </div>
            <div className="stat">
              <b>{spec.lanes.length}</b>
              <span>Defined practices</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="lifecycle" onClick={(e) => !(e.target as HTMLElement).closest('.sl-hit, .drawer') && setOpen(null)}>
        <div className="sec-head">
          <div>
            <h2>Practice Layout · {label}</h2>
            <p>
              <b>{spec.name}.</b> {spec.tagline}
            </p>
          </div>
          <div className="lc-cats-slot">{tabs}</div>
        </div>

        <div className="sl-scroll">
          <div className="sl" style={vars}>
            {/* phases */}
            <div className="sl-row sl-phases">
              <div className="sl-corner" />
              {spec.phases.map((p, i) => (
                <div key={p.label} className={`sl-phase p${i % 3}`} style={col(p.from, p.to)}>
                  <i />
                  <span>{p.label}</span>
                  <i />
                </div>
              ))}
            </div>

            {/* stages */}
            <div className="sl-row sl-stages">
              <div className="sl-corner">
                <span>Stages</span>
              </div>
              {spec.stages.map((s, i) => (
                <button
                  key={s.name}
                  type="button"
                  className={`sl-stage sl-hit${i > 0 ? ' has-prev' : ''}${i < n - 1 ? ' has-next' : ''}${inHl(i) ? ' hl' : ''}${open?.kind === 'stage' && open.index === i ? ' sel' : ''} g${'abc'[Math.max(0, spec.phases.findIndex((p) => p.label === phaseOf(spec, i))) % 3]}`}
                  style={{ gridColumn: i + 2 }}
                  onClick={() => setOpen({ kind: 'stage', index: i })}
                >
                  <span className="sl-num">{String(i + 1).padStart(2, '0')}</span>
                  <b>{s.name}</b>
                  {s.subs?.length ? (
                    <ul>
                      {s.subs.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  ) : null}
                </button>
              ))}
            </div>

            {/* feedback loops */}
            {(spec.loops ?? []).map((l) => {
              const span = l.to - l.from + 1;
              return (
                <div key={l.label} className="sl-row sl-loop-row">
                  <div className="sl-corner" />
                  <div className="sl-loop" style={{ ...col(l.from, l.to), marginInline: `${50 / span}%` }}>
                    <span>↻ {l.label}</span>
                  </div>
                </div>
              );
            })}

            {/* practices */}
            {spec.lanes.map((lane, i) => {
              const newGroup = lane.group && lane.group !== spec.lanes[i - 1]?.group;
              return (
                <div key={lane.title} className="sl-block">
                  {newGroup ? <div className="sl-group">{lane.group}</div> : null}
                  <div className="sl-row sl-lane">
                    <div className="sl-label">
                      <span className="sl-badge">Practice {i + 1}</span>
                      <b>{lane.title}</b>
                    </div>
                    {spec.stages.map((s, c) => (
                      <div key={s.name} className={`sl-cell${inHl(c) ? ' hl' : ''}`} style={{ gridColumn: c + 2, gridRow: 1 }} />
                    ))}
                    <button
                      type="button"
                      className={`sl-card sl-hit${open?.kind === 'lane' && open.index === i ? ' sel' : ''}`}
                      style={{ ...col(lane.from, lane.to), gridRow: 1 }}
                      onMouseEnter={() => setHl({ from: lane.from, to: lane.to })}
                      onMouseLeave={() => setHl(null)}
                      onFocus={() => setHl({ from: lane.from, to: lane.to })}
                      onBlur={() => setHl(null)}
                      onClick={() => setOpen({ kind: 'lane', index: i })}
                    >
                      <span className="sl-items">
                        {lane.items.map((x) => (
                          <span key={x} className="sl-item">
                            {x}
                          </span>
                        ))}
                      </span>
                      {lane.sops?.length ? (
                        <span className="sl-sops">
                          {lane.sops.map((s) => (
                            <span key={s} className="sop" title={`SOP ${s} — ${spec.sops[s]}`}>
                              SOP {s}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* named paths */}
            {(spec.chains ?? []).map((c) => (
              <div key={c.label} className="sl-row sl-chain">
                <div className="sl-label sl-chain-label">
                  <b>{c.label}</b>
                </div>
                <div className="sl-steps" style={{ gridColumn: `2 / ${n + 2}` }}>
                  {c.steps.map((s, i) => (
                    <span key={s} className="sl-step">
                      {i > 0 ? <i aria-hidden="true">→</i> : null}
                      <em>{s}</em>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <aside className={`drawer${detail ? ' open' : ''}`} aria-live="polite" aria-hidden={!detail}>
        <div className="dr-h">
          <div className="k">{detail?.k}</div>
          <h3>{detail?.t}</h3>
          <button type="button" className="dr-x" aria-label="Close" onClick={() => setOpen(null)}>
            ×
          </button>
        </div>
        <div className="dr-b">
          {detail?.p ? <p>{detail.p}</p> : null}
          {detail?.points.length ? (
            <>
              <h4>{detail.listTitle}</h4>
              <ul>
                {detail.points.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </>
          ) : null}
          {detail?.sops.length ? (
            <>
              <h4>SOPs</h4>
              <div className="sops">
                {detail.sops.map((s) => (
                  <span key={s.n} className="sop" style={{ cursor: 'default' }} title={s.name}>
                    SOP {s.n}
                  </span>
                ))}
              </div>
              <ul style={{ marginTop: 8 }}>
                {detail.sops.map((s) => (
                  <li key={s.n}>
                    <b>SOP {s.n}</b> — {s.name}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
